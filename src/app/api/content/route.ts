import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds, checkAccess, canUserManageContentType } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { getSubmitTargetStatus } from "@/lib/content-workflow";
import { z } from "zod/v4";

const contentQuerySchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "BRAND_BOOK", "STANDARD_BOOK"]).optional(),
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED", "RETURNED", "ARCHIVED"]).optional(),
  acknowledged: z.enum(["true", "false"]).optional(),
  featured: z.enum(["true"]).optional(),
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

  const { type, propertyId, departmentId, status, acknowledged, featured, page, pageSize } = parsed.data;
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
    OR: [
      { departmentId: null },
      { departmentId: { in: filteredDeptIds } },
    ],
  };

  if (type) where.type = type;

  // Status enforcement per ruolo
  const userRole = session.user.role;
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
          select: { targetType: true, targetRole: true, targetDepartment: { select: { name: true } } },
        },
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

  return NextResponse.json({
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
      targetAudience: c.targetAudience,
    })),
    meta: { page, pageSize, total },
  });
}

// --- POST: Crea nuovo contenuto ---
const createContentSchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "BRAND_BOOK", "STANDARD_BOOK"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
  targetDepartmentIds: z.array(z.string()).optional().default([]),
  targetAllDepartments: z.boolean().optional().default(false),
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

  const { type, title, body: contentBody, propertyId, departmentId, sendToReview, publishDirectly } = parsed.data;
  const userId = session.user.id;
  const role = session.user.role;

  // Verifica permesso sul tipo di contenuto
  const canManageType = await canUserManageContentType(userId, type);
  if (!canManageType) {
    return NextResponse.json({ error: `Non hai permesso di creare contenuti di tipo ${type}` }, { status: 403 });
  }

  // RBAC: verifica accesso alla property e department
  const hasAccess = await checkAccess(userId, "HOD", propertyId, departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa property/reparto" }, { status: 403 });
  }

  // Validazione server-side: publishDirectly solo per ADMIN/SUPER_ADMIN
  if (publishDirectly && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono pubblicare direttamente" }, { status: 403 });
  }

  // Determina stato iniziale in base al ruolo
  const initialStatus = publishDirectly
    ? getSubmitTargetStatus(role, "publishDirectly")
    : sendToReview
      ? getSubmitTargetStatus(role, "sendToReview")
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

  // ContentTarget: destinatari
  if (parsed.data.targetAllDepartments) {
    await prisma.contentTarget.create({
      data: { contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" },
    });
  } else if (parsed.data.targetDepartmentIds.length > 0) {
    await prisma.contentTarget.createMany({
      data: parsed.data.targetDepartmentIds.map((deptId) => ({
        contentId: content.id,
        targetType: "DEPARTMENT" as const,
        targetDepartmentId: deptId,
      })),
    });
  } else if (departmentId) {
    await prisma.contentTarget.create({
      data: { contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: departmentId },
    });
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

  return NextResponse.json({ data: { id: content.id, status: initialStatus } }, { status: 201 });
}
