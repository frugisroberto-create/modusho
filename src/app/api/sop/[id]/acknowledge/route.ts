import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { recordSopRead } from "@/lib/sop-read-db";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Registra la lettura di una SOP (version-aware).
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

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true,
      type: true,
      status: true,
      version: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.type !== "SOP" || content.status !== "PUBLISHED") {
    return NextResponse.json({ error: "SOP non trovata o non pubblicata" }, { status: 404 });
  }

  const canAccess = await canUserAccessContent(userId, session.user.role, content);
  if (!canAccess) {
    return NextResponse.json({ error: "Non sei tra i destinatari di questa SOP" }, { status: 403 });
  }

  // Scrittore unico (SopViewRecord + ContentAcknowledgment): la stessa
  // funzione che usa la registrazione automatica di HM/ADMIN/SUPER_ADMIN.
  const record = await recordSopRead({
    contentId,
    userId,
    contentVersion: content.version,
    now: new Date(),
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
