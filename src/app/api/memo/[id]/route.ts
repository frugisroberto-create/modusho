import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

const updateMemoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  expiresAt: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  archive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const { id: memoId } = await params;
  const rawBody = await request.json();
  const parsed = updateMemoSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const memo = await prisma.memo.findUnique({
    where: { id: memoId },
    include: { content: { select: { id: true, propertyId: true, status: true } } },
  });

  if (!memo) return NextResponse.json({ error: "Memo non trovato" }, { status: 404 });

  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", memo.content.propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { title, body, expiresAt, isPinned, archive } = parsed.data;

  // Archivia
  if (archive) {
    await prisma.content.update({
      where: { id: memo.contentId },
      data: { status: "ARCHIVED", updatedById: session.user.id },
    });
    await prisma.contentStatusHistory.create({
      data: {
        contentId: memo.contentId,
        fromStatus: "PUBLISHED",
        toStatus: "ARCHIVED",
        changedById: session.user.id,
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
        updatedById: session.user.id,
      },
    });
  }

  // Aggiorna memo
  if (expiresAt !== undefined || isPinned !== undefined) {
    await prisma.memo.update({
      where: { id: memoId },
      data: {
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(isPinned !== undefined && { isPinned }),
      },
    });
  }

  return NextResponse.json({ data: { success: true } });
}
