import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds, checkAccess, canUserManageContentType } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { getSubmitTargetStatus } from "@/lib/content-workflow";
import { sendContentPublishedPush } from "@/lib/push-notification";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { z } from "zod/v4";

const contentQuerySchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "BRAND_BOOK", "STANDARD_BOOK"]).optional(),
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED", "RETURNED", "ARCHIVED"]).optional(),
  acknowledged: z.enum(["true", "false"]).optional(),
  featured: z.enum(["true"]).optional(),
  excludeUpdatedBy: z.string().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = contentQuerySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { type, propertyId, departmentId, status, acknowledged, featured, excludeUpdatedBy, search, page, pageSize } = parsed.data;
  const userId = session.user.id;

  // RBAC: determina property accessibili
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (accessiblePropertyIds.length === 0) {
    return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
  }

  let filteredPropertyIds = accessiblePropertyIds;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredPropertyIds = [propertyId];
  }

  // RBAC: determina department accessibili
  const allAccessibleDeptIds: string[] = [];
  for (const pid of filteredPropertyIds) {
    const depts = await getAccessibleDepartmentIds(userId, pid);
    allAccessibleDeptIds.push(...depts);
  }

  let filteredDeptIds = allAccessibleDeptIds;
  if (departmentId) {
    if (!allAccessibleDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredDeptIds = [departmentId];
  }

  // Build where clause
  const where: Record<string, unknown> = {
    isDeleted: false,
    propertyId: { in: filteredPropertyIds },
  };

  if (type) where.type = type;

  // Brand Book: solo HM+ (blocca OPERATOR e HOD)
  const userRole = session.user.role;
  if (type === "BRAND_BOOK" && (userRole === "OPERATOR" || userRole === "HOD")) {
    return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
  }

  // Visibilità per OPERATOR/HOD basata su targetAudience (ContentTarget)
  // Vale per SOP, DOCUMENT, MEMO, STANDARD_BOOK
  // Match su:
  //  - ROLE/OPERATOR (tutti gli operatori — visibile a OPERATOR e HOD)
  //  - ROLE/<userRole> (target rivolto al ruolo dell'utente — es. ROLE/HOD)
  //  - USER/<userId> (target rivolto specificamente all'utente)
  //  - DEPARTMENT/<deptId> (target su uno dei reparti accessibili dell'utente)
  if (userRole === "OPERATOR" || userRole === "HOD") {
    const orClauses: Record<string, unknown>[] = [
      { targetType: "ROLE", targetRole: "OPERATOR" },
      { targetType: "ROLE", targetRole: userRole },
      { targetType: "USER", targetUserId: userId },
    ];
    if (allAccessibleDeptIds.length > 0) {
      orClauses.push({ targetType: "DEPARTMENT", targetDepartmentId: { in: allAccessibleDeptIds } });
    }
    where.targetAudience = { some: { OR: orClauses } };
  } else {
    // HM/ADMIN/SUPER_ADMIN: vedono tutto in base alla property accessibile
    // (logica dipartimentale legacy mantenuta come fallback opzionale)
    where.OR = [
      { departmentId: null },
      { departmentId: { in: filteredDeptIds } },
    ];
  }

  // Status enforcement per ruolo
  if (userRole === "OPERATOR") {
    where.status = "PUBLISHED";
  } else if (userRole === "HOD") {
    if (status && status !== "PUBLISHED") {
      where.status = status;
      where.createdById = userId;
    } else {
      where.status = status || "PUBLISHED";
    }
  } else {
    if (status) where.status = status;
  }

  // Filter by acknowledgment status
  if (acknowledged === "true") {
    where.acknowledgments = { some: { userId } };
  } else if (acknowledged === "false") {
    where.acknowledgments = { none: { userId } };
  }

  // Filter by featured
  if (featured === "true") {
    where.isFeatured = true;
  }

  if (excludeUpdatedBy) {
    where.updatedById = { not: excludeUpdatedBy };
  }

  // Full-text search via PostgreSQL tsvector
  if (search) {
    const sanitized = search
      .replace(/[^\w\sàèéìòùÀÈÉÌÒÙ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(" & ");

    if (sanitized) {
      const matches = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM "Content" c
        WHERE c."isDeleted" = false
          AND (
            to_tsvector('italian', c.title || ' ' || c.body) @@ to_tsquery('italian', ${sanitized})
            OR c.title ILIKE '%' || ${search} || '%'
          )
      `;
      const matchingIds = matches.map((m) => m.id);
      if (matchingIds.length === 0) {
        return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
      }
      where.id = { in: matchingIds };
    } else {
      return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
    }
  }

  const orderBy = featured === "true"
    ? { featuredAt: "desc" as const }
    : { publishedAt: "desc" as const };

  const [contents, total] = await Promise.all([
    prisma.content.findMany({
      where,
      select: {
        id: true,
        code: true,
        type: true,
        title: true,
        status: true,
        version: true,
        isFeatured: true,
        publishedAt: true,
        createdAt: true,
        propertyId: true,
        department: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, name: true, code: true } },
        targetAudience: {
          select: { id: true, targetType: true, targetRole: true, targetDepartmentId: true, targetDepartment: { select: { id: true, name: true, code: true } } },
        },
        updatedBy: { select: { id: true, name: true } },
        acknowledgments: {
          where: { userId },
          select: { acknowledgedAt: true },
          take: 1,
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.content.count({ where }),
  ]);

  return NextResponse.json(
    {
      data: contents.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        title: c.title,
        status: c.status,
        version: c.version,
        isFeatured: c.isFeatured,
        publishedAt: c.publishedAt,
        createdAt: c.createdAt,
        propertyId: c.propertyId,
        department: c.department,
        property: c.property,
        acknowledged: c.acknowledgments.length > 0,
        acknowledgedAt: c.acknowledgments[0]?.acknowledgedAt ?? null,
        updatedBy: c.updatedBy,
        targetAudience: c.targetAudience,
      })),
      meta: { page, pageSize, total },
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
  );
}

// --- POST: Crea nuovo contenuto ---
const createContentSchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "BRAND_BOOK", "STANDARD_BOOK"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
  // Destinatari (ContentTarget) — uno o più tipi possono essere combinati
  targetDepartmentIds: z.array(z.string()).optional().default([]),
  targetAllDepartments: z.boolean().optional().default(false),
  targetRoles: z.array(z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER"])).optional().default([]),
  targetUserIds: z.array(z.string()).optional().default([]),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Verifica canEdit
  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { type, title, body: rawContentBody, propertyId, departmentId, sendToReview, publishDirectly } = parsed.data;
  // SEC: sanitizza HTML lato server prima di qualsiasi persistenza
  const contentBody = sanitizeHtml(rawContentBody);
  const userId = session.user.id;
  const role = session.user.role;

  // Brand Book: solo ADMIN/SUPER_ADMIN possono creare
  if (type === "BRAND_BOOK" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN può creare Brand Book" }, { status: 403 });
  }

  // Standard Book: solo ADMIN/SUPER_ADMIN possono creare
  if (type === "STANDARD_BOOK" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN può creare Standard Book" }, { status: 403 });
  }

  // Verifica permesso sul tipo di contenuto (Brand Book e Standard Book sono già protetti dal check ruolo sopra)
  if (type !== "BRAND_BOOK" && type !== "STANDARD_BOOK") {
    const canManageType = await canUserManageContentType(userId, type);
    if (!canManageType) {
      return NextResponse.json({ error: `Non hai permesso di creare contenuti di tipo ${type}` }, { status: 403 });
    }
  }

  // RBAC: verifica accesso alla property e department
  const hasAccess = await checkAccess(userId, "HOD", propertyId, departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa property/reparto" }, { status: 403 });
  }

  // Validazione server-side: publishDirectly
  // SOP: solo ADMIN/SUPER_ADMIN
  // DOCUMENT/MEMO: HM/ADMIN/SUPER_ADMIN/HOD (HOD limitato al proprio perimetro — vedi sotto)
  // BRAND_BOOK/STANDARD_BOOK: solo ADMIN/SUPER_ADMIN
  if (publishDirectly) {
    if (type === "SOP" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono pubblicare SOP direttamente" }, { status: 403 });
    }
    if ((type === "BRAND_BOOK" || type === "STANDARD_BOOK") && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono pubblicare Brand/Standard Book direttamente" }, { status: 403 });
    }
    if ((type === "DOCUMENT" || type === "MEMO") && role === "OPERATOR") {
      return NextResponse.json({ error: "Operatore non può pubblicare contenuti" }, { status: 403 });
    }
  }

  // Restrizione HOD: se è HOD e pubblica direttamente DOCUMENT/MEMO, può solo
  // targettare il proprio reparto (no targetRoles, no targetUserIds, no allDepartments,
  // targetDepartmentIds limitati ai reparti accessibili).
  if (role === "HOD" && publishDirectly && (type === "DOCUMENT" || type === "MEMO")) {
    const { targetAllDepartments: tAll, targetRoles: tRoles, targetUserIds: tUsers, targetDepartmentIds: tDepts } = parsed.data;
    if (tAll || tRoles.length > 0 || tUsers.length > 0) {
      return NextResponse.json({
        error: "Come HOD puoi targettare solo i tuoi reparti — non sono ammessi ruoli trasversali, utenti specifici o 'tutti gli operatori'",
      }, { status: 403 });
    }
    // Verifica che ogni reparto target sia accessibile dall'HOD
    const { getAccessibleDepartmentIds } = await import("@/lib/rbac");
    const accessibleDepts = await getAccessibleDepartmentIds(userId, propertyId);
    const outOfPerimeter = tDepts.filter(d => !accessibleDepts.includes(d));
    if (outOfPerimeter.length > 0) {
      return NextResponse.json({
        error: "Alcuni reparti destinatari non rientrano nel tuo perimetro",
      }, { status: 403 });
    }
  }

  // Determina stato iniziale in base al ruolo + tipo
  const initialStatus = publishDirectly
    ? getSubmitTargetStatus(role, "publishDirectly", type)
    : sendToReview
      ? getSubmitTargetStatus(role, "sendToReview", type)
      : "DRAFT" as const;

  const isDirectPublish = initialStatus === "PUBLISHED";

  const content = await prisma.content.create({
    data: {
      type,
      title,
      body: contentBody,
      status: initialStatus,
      propertyId,
      departmentId: departmentId || null,
      createdById: userId,
      updatedById: userId,
      submittedById: (sendToReview || publishDirectly) ? userId : null,
      publishedAt: isDirectPublish ? new Date() : null,
    },
  });

  // ContentTarget: destinatari (più tipi possono coesistere)
  const { targetAllDepartments, targetDepartmentIds, targetRoles, targetUserIds } = parsed.data;
  const targetsToCreate: { contentId: string; targetType: "ROLE" | "DEPARTMENT" | "USER"; targetRole?: "OPERATOR" | "HOD" | "HOTEL_MANAGER"; targetDepartmentId?: string; targetUserId?: string }[] = [];

  if (targetAllDepartments) {
    targetsToCreate.push({ contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" });
  }
  for (const role of targetRoles) {
    // Evita duplicati con OPERATOR già aggiunto da targetAllDepartments
    if (role === "OPERATOR" && targetAllDepartments) continue;
    targetsToCreate.push({ contentId: content.id, targetType: "ROLE", targetRole: role });
  }
  for (const deptId of targetDepartmentIds) {
    targetsToCreate.push({ contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: deptId });
  }
  for (const uid of targetUserIds) {
    targetsToCreate.push({ contentId: content.id, targetType: "USER", targetUserId: uid });
  }

  // Fallback legacy: se nessun target esplicito ma c'è departmentId della SOP, usa quello
  if (targetsToCreate.length === 0 && departmentId) {
    targetsToCreate.push({ contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: departmentId });
  }

  if (targetsToCreate.length > 0) {
    await prisma.contentTarget.createMany({ data: targetsToCreate });
  }

  // ContentStatusHistory: creazione → DRAFT
  await prisma.contentStatusHistory.create({
    data: { contentId: content.id, fromStatus: null, toStatus: "DRAFT", changedById: userId },
  });

  // Se invio o pubblicazione diretta → secondo record history
  if (initialStatus !== "DRAFT") {
    const noteMap: Record<string, string> = {
      REVIEW_HM: "Inviata a Hotel Manager",
      REVIEW_ADMIN: "Inviata per approvazione finale",
      PUBLISHED: `Pubblicazione diretta da ${role}`,
    };
    await prisma.contentStatusHistory.create({
      data: {
        contentId: content.id,
        fromStatus: "DRAFT",
        toStatus: initialStatus,
        changedById: userId,
        note: noteMap[initialStatus] || `Inviata a ${initialStatus}`,
      },
    });
  }

  // Push notification best-effort per pubblicazione diretta
  if (isDirectPublish) {
    await sendContentPublishedPush({
      contentId: content.id,
      contentTitle: title,
      contentType: type,
      actorId: userId,
    }).catch(() => {});
  }

  return NextResponse.json({ data: { id: content.id, status: initialStatus } }, { status: 201 });
}
