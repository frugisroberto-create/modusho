import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getMemoManagerKind, type MemoManagerKind } from "@/lib/rbac";
import { z } from "zod/v4";

const updateMemoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  expiresAt: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  archive: z.boolean().optional(),
});

type ManagedMemo = {
  id: string;
  contentId: string;
  expiresAt: Date | null;
  isPinned: boolean;
  content: { id: string; propertyId: string; status: string; title: string; body: string; createdById: string };
};

/**
 * Carica il memo e decide chi può gestirlo: HM/ADMIN/SUPER_ADMIN nel perimetro
 * della property, oppure l'HOD che l'ha creato. Cerca per memo.id o per
 * contentId (la UI naviga con content.id).
 */
async function loadManagedMemo(
  memoId: string
): Promise<{ memo: ManagedMemo; kind: Exclude<MemoManagerKind, null>; userId: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const include = {
    content: { select: { id: true, propertyId: true, status: true, title: true, body: true, createdById: true } },
  };
  const memo =
    (await prisma.memo.findUnique({ where: { id: memoId }, include })) ??
    (await prisma.memo.findUnique({ where: { contentId: memoId }, include }));

  if (!memo) return NextResponse.json({ error: "Memo non trovato" }, { status: 404 });

  const userId = session.user.id;
  const kind = getMemoManagerKind({ id: userId, role: session.user.role }, { createdById: memo.content.createdById });
  if (!kind) {
    return NextResponse.json({ error: "Puoi modificare solo i memo che hai creato tu" }, { status: 403 });
  }

  // Il perimetro sulla property vale per tutti, autore compreso
  const hasAccess = await checkAccess(userId, kind === "manager" ? "HOTEL_MANAGER" : "HOD", memo.content.propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  return { memo, kind, userId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const loaded = await loadManagedMemo(id);
  if (loaded instanceof NextResponse) return loaded;
  const { memo, kind } = loaded;

  return NextResponse.json({
    data: {
      id: memo.id,
      contentId: memo.contentId,
      title: memo.content.title,
      body: memo.content.body,
      expiresAt: memo.expiresAt,
      isPinned: memo.isPinned,
      status: memo.content.status,
    },
    // La UI mostra solo i comandi che il server accetterebbe
    permissions: { canPin: kind === "manager", canDelete: kind === "manager" },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rawBody = await request.json();
  const parsed = updateMemoSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const loaded = await loadManagedMemo(id);
  if (loaded instanceof NextResponse) return loaded;
  const { memo, kind, userId } = loaded;

  const { title, body, expiresAt, isPinned, archive } = parsed.data;

  // Mettere in evidenza resta all'Hotel Manager in su
  if (kind === "author" && isPinned !== undefined && isPinned !== memo.isPinned) {
    return NextResponse.json({ error: "Solo l'Hotel Manager può mettere in evidenza un memo" }, { status: 403 });
  }

  // Archivia
  if (archive) {
    await prisma.content.update({
      where: { id: memo.contentId },
      data: { status: "ARCHIVED", updatedById: userId },
    });
    await prisma.contentStatusHistory.create({
      data: {
        contentId: memo.contentId,
        fromStatus: "PUBLISHED",
        toStatus: "ARCHIVED",
        changedById: userId,
        note: "Memo archiviato",
      },
    });
    return NextResponse.json({ data: { success: true, archived: true } });
  }

  // Aggiorna contenuto
  if (title !== undefined || body !== undefined) {
    await prisma.content.update({
      where: { id: memo.contentId },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        updatedById: userId,
      },
    });
  }

  // Aggiorna memo
  const pinUpdate = kind === "manager" ? isPinned : undefined;
  if (expiresAt !== undefined || pinUpdate !== undefined) {
    await prisma.memo.update({
      where: { id: memo.id },
      data: {
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(pinUpdate !== undefined && { isPinned: pinUpdate }),
      },
    });
  }

  return NextResponse.json({ data: { success: true } });
}
