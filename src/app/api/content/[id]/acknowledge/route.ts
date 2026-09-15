import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { isReadingRecipient, recordContentRead } from "@/lib/content-read-db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;

  // Verifica che il contenuto esista e sia PUBLISHED
  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true,
      status: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  if (content.status !== "PUBLISHED") {
    return NextResponse.json(
      { error: "Il contenuto non è pubblicato" },
      { status: 400 }
    );
  }

  const canAccess = await canUserAccessContent(userId, session.user.role, content);
  if (!canAccess) {
    return NextResponse.json({ error: "Non sei tra i destinatari di questo contenuto" }, { status: 403 });
  }

  // Chi lo consulta soltanto (reparto visibile) lo legge, ma la lettura non si registra
  const isRecipient = await isReadingRecipient({ id: userId, role: session.user.role }, content);
  if (!isRecipient) {
    return NextResponse.json({ error: "Stai consultando questo contenuto: non sei tra i destinatari, la lettura non si registra" }, { status: 403 });
  }

  // Idempotente: se già confermato, ritorna il record esistente
  const existing = await prisma.contentAcknowledgment.findUnique({
    where: { contentId_userId: { contentId, userId } },
  });

  if (existing) {
    return NextResponse.json({
      data: {
        contentId: existing.contentId,
        acknowledgedAt: existing.acknowledgedAt,
        alreadyAcknowledged: true,
      },
    });
  }

  const acknowledgment = await recordContentRead({ contentId, userId });

  return NextResponse.json({
    data: {
      contentId: acknowledgment.contentId,
      acknowledgedAt: acknowledgment.acknowledgedAt,
      alreadyAcknowledged: false,
    },
  });
}
