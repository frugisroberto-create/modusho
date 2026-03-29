import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può ripristinare contenuti" }, { status: 403 });
  }

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id },
    select: { id: true, isDeleted: true },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  if (!content.isDeleted) return NextResponse.json({ error: "Il contenuto non è eliminato" }, { status: 400 });

  // Trova lo stato precedente all'eliminazione
  const lastHistory = await prisma.contentStatusHistory.findFirst({
    where: { contentId: id, note: { not: "Eliminato (soft delete)" } },
    orderBy: { changedAt: "desc" },
  });

  const restoreStatus = lastHistory?.toStatus ?? "DRAFT";

  await prisma.content.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null, deletedById: null, status: restoreStatus },
  });

  await prisma.contentStatusHistory.create({
    data: {
      contentId: id,
      fromStatus: "ARCHIVED",
      toStatus: restoreStatus,
      changedById: session.user.id,
      note: "Ripristinato dal cestino",
    },
  });

  return NextResponse.json({ data: { success: true, restoredStatus: restoreStatus } });
}
