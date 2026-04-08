import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, canUserManageContentType, getAccessibleDepartmentIds } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { getSubmitTargetStatus } from "@/lib/content-workflow";
import { sendContentPublishedPush } from "@/lib/push-notification";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
      acknowledgments: {
        where: { userId },
        select: { acknowledgedAt: true },
        take: 1,
      },
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true, targetDepartment: { select: { name: true } } },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // RBAC: verifica accesso alla property e al department
  const hasAccess = await checkAccess(
    userId,
    "OPERATOR",
    content.propertyId,
    content.departmentId ?? undefined
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // Brand Book: solo HM+
  const userRole = session.user.role;
  if (content.type === "BRAND_BOOK" && (userRole === "OPERATOR" || userRole === "HOD")) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // Visibilità basata su status + ruolo
  if (content.status !== "PUBLISHED") {
    if (userRole === "OPERATOR") {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }
    if (userRole === "HOD" && content.createdBy.id !== userId) {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }
  }

  // Filtro targetAudience per OPERATOR/HOD anche su accesso diretto per ID
  // (allinea il dettaglio singolo alla logica di visibilità della lista)
  if (userRole === "OPERATOR" || userRole === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(userId, content.propertyId);
    const isInTarget = content.targetAudience.some((t) => {
      if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
      if (t.targetType === "ROLE" && t.targetRole === userRole) return true;
      if (t.targetType === "USER" && t.targetUserId === userId) return true;
      if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
      return false;
    });
    // HOD può comunque vedere i propri contenuti (anche se non target)
    if (!isInTarget && !(userRole === "HOD" && content.createdBy.id === userId)) {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }
  }

  return NextResponse.json({
    data: {
      id: content.id,
      type: content.type,
      title: content.title,
      body: content.body,
      status: content.status,
      version: content.version,
      publishedAt: content.publishedAt,
      createdAt: content.createdAt,
      property: content.property,
      department: content.department,
      createdBy: content.createdBy.name,
      acknowledged: content.acknowledgments.length > 0,
      acknowledgedAt: content.acknowledgments[0]?.acknowledgedAt ?? null,
      targetAudience: content.targetAudience,
    },
  });
}

// --- PUT: Modifica contenuto ---
const updateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  // Destinatari (ContentTarget) — più tipi possono coesistere
  targetDepartmentIds: z.array(z.string()).optional(),
  targetAllDepartments: z.boolean().optional(),
  targetRoles: z.array(z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER"])).optional(),
  targetUserIds: z.array(z.string()).optional(),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),
  requireNewAcknowledgment: z.boolean().optional(),
  revisionNote: z.string().max(500).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const { role } = session.user;

  const rawBody = await request.json();
  const parsed = updateContentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, propertyId: true, departmentId: true, type: true, version: true, title: true, body: true, publishedAt: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // ARCHIVED: non modificabile
  if (content.status === "ARCHIVED") {
    return NextResponse.json({ error: "I contenuti archiviati non possono essere modificati" }, { status: 400 });
  }

  // PUBLISHED: solo HM, ADMIN, SUPER_ADMIN
  if (content.status === "PUBLISHED") {
    if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Non autorizzato a modificare contenuti pubblicati" }, { status: 403 });
    }
  } else if (content.status === "REVIEW_ADMIN") {
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo ADMIN può modificare contenuti in attesa di approvazione finale" }, { status: 403 });
    }
  } else if (content.status === "REVIEW_HM") {
    if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo l'Hotel Manager o superiore può modificare contenuti in review HM" }, { status: 403 });
    }
  } else {
    // DRAFT/RETURNED: canEdit required
    if (!session.user.canEdit) {
      return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
    }
  }

  // Verifica accesso property
  const hasAccess = await checkAccess(userId, "HOD", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { title, body, departmentId, sendToReview, publishDirectly, requireNewAcknowledgment, revisionNote } = parsed.data;

  // Blocca cambio departmentId non autorizzato
  if (departmentId !== undefined && departmentId !== content.departmentId) {
    if (departmentId !== null) {
      const newDept = await prisma.department.findFirst({
        where: { id: departmentId, propertyId: content.propertyId },
      });
      if (!newDept) {
        return NextResponse.json({ error: "Reparto non trovato nella property" }, { status: 400 });
      }
      const hasAccessToNewDept = await checkAccess(userId, "HOD", content.propertyId, departmentId);
      if (!hasAccessToNewDept) {
        return NextResponse.json({ error: "Non hai accesso al reparto selezionato" }, { status: 403 });
      }
    }
  }

  // Determina se title o body stanno cambiando
  const isTitleChanging = title !== undefined && title !== content.title;
  const isBodyChanging = body !== undefined && body !== content.body;
  const isContentChanging = isTitleChanging || isBodyChanging;
  const isReviewOrPublished = ["REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED"].includes(content.status);
  const shouldIncrementVersion = isReviewOrPublished && isContentChanging;

  // Se contenuto cambia e siamo in review/published → salva revisione (snapshot before/after)
  if (isContentChanging && isReviewOrPublished) {
    await prisma.contentRevision.create({
      data: {
        contentId: id,
        revisedById: userId,
        previousTitle: content.title,
        previousBody: content.body,
        newTitle: title ?? content.title,
        newBody: body ?? content.body,
        note: revisionNote || null,
        status: content.status,
      },
    });
  }

  const updated = await prisma.content.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(departmentId !== undefined && { departmentId }),
      updatedById: userId,
      ...(shouldIncrementVersion && { version: content.version + 1 }),
    },
  });

  // Modifica post-pubblicazione: traccia in status history
  if (content.status === "PUBLISHED" && isContentChanging) {
    await prisma.contentStatusHistory.create({
      data: {
        contentId: id,
        fromStatus: "PUBLISHED",
        toStatus: "PUBLISHED",
        changedById: userId,
        note: revisionNote ? `Modifica post-pubblicazione: ${revisionNote}` : "Modifica post-pubblicazione",
      },
    });

    if (requireNewAcknowledgment) {
      await prisma.contentAcknowledgment.deleteMany({ where: { contentId: id } });
    }
  }

  // Aggiornamento ContentTarget (solo se non ancora pubblicato)
  // Replace-all: se uno qualsiasi dei campi target è presente, riscrive tutti i target
  const hasTargetUpdate =
    parsed.data.targetDepartmentIds !== undefined ||
    parsed.data.targetAllDepartments !== undefined ||
    parsed.data.targetRoles !== undefined ||
    parsed.data.targetUserIds !== undefined;

  if ((content.status === "DRAFT" || content.status === "RETURNED") && hasTargetUpdate) {
    await prisma.contentTarget.deleteMany({ where: { contentId: id } });

    const targetsToCreate: { contentId: string; targetType: "ROLE" | "DEPARTMENT" | "USER"; targetRole?: "OPERATOR" | "HOD" | "HOTEL_MANAGER"; targetDepartmentId?: string; targetUserId?: string }[] = [];

    if (parsed.data.targetAllDepartments) {
      targetsToCreate.push({ contentId: id, targetType: "ROLE", targetRole: "OPERATOR" });
    }
    for (const r of (parsed.data.targetRoles ?? [])) {
      if (r === "OPERATOR" && parsed.data.targetAllDepartments) continue;
      targetsToCreate.push({ contentId: id, targetType: "ROLE", targetRole: r });
    }
    for (const deptId of (parsed.data.targetDepartmentIds ?? [])) {
      targetsToCreate.push({ contentId: id, targetType: "DEPARTMENT", targetDepartmentId: deptId });
    }
    for (const uid of (parsed.data.targetUserIds ?? [])) {
      targetsToCreate.push({ contentId: id, targetType: "USER", targetUserId: uid });
    }

    if (targetsToCreate.length > 0) {
      await prisma.contentTarget.createMany({ data: targetsToCreate });
    }
  }

  // Invio a review o pubblicazione diretta (per DRAFT/RETURNED)
  if ((sendToReview || publishDirectly) && (content.status === "DRAFT" || content.status === "RETURNED")) {
    // Validazione server-side: pubblicazione diretta
    if (publishDirectly) {
      if (content.type === "SOP" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono pubblicare SOP direttamente" }, { status: 403 });
      }
      if ((content.type === "BRAND_BOOK" || content.type === "STANDARD_BOOK") && role !== "ADMIN" && role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono pubblicare Brand/Standard Book direttamente" }, { status: 403 });
      }
      if ((content.type === "DOCUMENT" || content.type === "MEMO") && role === "OPERATOR") {
        return NextResponse.json({ error: "Operatore non può pubblicare contenuti" }, { status: 403 });
      }
    }
    const action = publishDirectly ? "publishDirectly" : "sendToReview";
    const targetStatus = getSubmitTargetStatus(role, action, content.type);
    const noteMap: Record<string, string> = {
      REVIEW_HM: "Inviata a Hotel Manager",
      REVIEW_ADMIN: "Inviata per approvazione finale",
      PUBLISHED: `Pubblicazione diretta da ${role}`,
    };
    await changeContentStatus({
      contentId: id,
      fromStatus: content.status,
      toStatus: targetStatus,
      changedById: userId,
      note: noteMap[targetStatus] || `Inviata a ${targetStatus}`,
    });

    // Push notification best-effort per pubblicazione diretta
    if (targetStatus === "PUBLISHED") {
      await sendContentPublishedPush({
        contentId: id,
        contentTitle: updated.title,
        contentType: content.type,
        actorId: userId,
        isRepublication: content.publishedAt !== null,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ data: { id: updated.id, status: updated.status, version: updated.version } });
}

// --- DELETE: Soft delete ---
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const { role } = session.user;
  const userId = session.user.id;

  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const content = await prisma.content.findUnique({
    where: { id },
    select: { id: true, status: true, propertyId: true, isDeleted: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }
  if (content.isDeleted) {
    return NextResponse.json({ error: "Contenuto già eliminato" }, { status: 409 });
  }

  // HM: solo sulla propria property
  if (role === "HOTEL_MANAGER") {
    const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", content.propertyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  }

  await prisma.content.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: userId },
  });

  await prisma.contentStatusHistory.create({
    data: {
      contentId: id,
      fromStatus: content.status,
      toStatus: "ARCHIVED",
      changedById: userId,
      note: "Eliminato (soft delete)",
    },
  });

  return NextResponse.json({ data: { success: true, message: "Contenuto eliminato" } });
}
