import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";

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
  const userRole = session.user.role;

  // Verifica che il contenuto esista e sia PUBLISHED
  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true,
      status: true,
      propertyId: true,
      departmentId: true,
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

  // RBAC coarse: l'utente deve poter accedere alla property (no departmentId
  // gate — la visibility fine è decisa da targetAudience, allineando questo
  // endpoint con /api/content list e le pagine di dettaglio).
  const hasAccess = await checkAccess(userId, "OPERATOR", content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // RBAC fine per OPERATOR/HOD: l'utente deve essere nel targetAudience
  // (oppure HOD che è autore del contenuto).
  if (userRole === "OPERATOR" || userRole === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(userId, content.propertyId);
    const isInTarget = content.targetAudience.some((t) => {
      if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
      if (t.targetType === "ROLE" && t.targetRole === userRole) return true;
      if (t.targetType === "USER" && t.targetUserId === userId) return true;
      if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
      return false;
    });
    if (!isInTarget && !(userRole === "HOD" && content.createdById === userId)) {
      return NextResponse.json({ error: "Non sei tra i destinatari di questo contenuto" }, { status: 403 });
    }
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

  const acknowledgment = await prisma.contentAcknowledgment.create({
    data: {
      contentId,
      userId,
      required: true,
    },
  });

  return NextResponse.json({
    data: {
      contentId: acknowledgment.contentId,
      acknowledgedAt: acknowledgment.acknowledgedAt,
      alreadyAcknowledged: false,
    },
  });
}
