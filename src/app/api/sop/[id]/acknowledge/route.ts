import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Conferma formale visualizzazione SOP (version-aware).
 * Crea/aggiorna SopViewRecord con acknowledgedAt.
 * Mantiene compatibilità con ContentAcknowledgment esistente.
 *
 * RBAC:
 *  - L'utente deve essere autenticato
 *  - La SOP deve essere PUBLISHED
 *  - L'utente deve avere accesso alla property della SOP
 *  - L'utente deve essere effettivamente nel targetAudience della SOP
 *    (ROLE/OPERATOR, ROLE/<userRole>, USER/<userId>, o DEPARTMENT in perimetro)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;
  const userRole = session.user.role;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true,
      type: true,
      status: true,
      version: true,
      propertyId: true,
      departmentId: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.type !== "SOP" || content.status !== "PUBLISHED") {
    return NextResponse.json({ error: "SOP non trovata o non pubblicata" }, { status: 404 });
  }

  // RBAC: verifica accesso alla property
  const hasAccess = await checkAccess(userId, "OPERATOR", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Verifica che l'utente sia effettivamente nel target audience
  const accessibleDepts = await getAccessibleDepartmentIds(userId, content.propertyId);
  const isInTarget = content.targetAudience.some((t) => {
    if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
    if (t.targetType === "ROLE" && t.targetRole === userRole) return true;
    if (t.targetType === "USER" && t.targetUserId === userId) return true;
    if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
    return false;
  });
  if (!isInTarget) {
    return NextResponse.json({ error: "Non sei tra i destinatari di questa SOP" }, { status: 403 });
  }

  const now = new Date();

  // Upsert SopViewRecord con acknowledgedAt
  const record = await prisma.sopViewRecord.upsert({
    where: {
      contentId_userId_contentVersion: {
        contentId,
        userId,
        contentVersion: content.version,
      },
    },
    update: { acknowledgedAt: now, viewedAt: now },
    create: {
      contentId,
      userId,
      contentVersion: content.version,
      viewedAt: now,
      acknowledgedAt: now,
    },
  });

  // Compatibilità: mantieni aggiornato anche ContentAcknowledgment
  await prisma.contentAcknowledgment.upsert({
    where: { contentId_userId: { contentId, userId } },
    update: { acknowledgedAt: now },
    create: { contentId, userId, required: true },
  });

  return NextResponse.json({
    data: {
      contentId: record.contentId,
      contentVersion: record.contentVersion,
      viewedAt: record.viewedAt,
      acknowledgedAt: record.acknowledgedAt,
    },
  });
}
