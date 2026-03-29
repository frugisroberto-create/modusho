import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { z } from "zod/v4";

const archiveSchema = z.object({
  note: z.string().min(5, "La nota deve avere almeno 5 caratteri"),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { role } = session.user;
  const userId = session.user.id;

  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nota obbligatoria (min 5 caratteri)" }, { status: 400 });

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, propertyId: true },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  if (content.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Solo i contenuti pubblicati possono essere archiviati" }, { status: 400 });
  }

  if (role === "HOTEL_MANAGER") {
    const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", content.propertyId);
    if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  await changeContentStatus({
    contentId: id,
    fromStatus: "PUBLISHED",
    toStatus: "ARCHIVED",
    changedById: userId,
    note: parsed.data.note,
  });

  return NextResponse.json({ data: { success: true } });
}
