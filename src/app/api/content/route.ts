import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds, checkAccess, canUserManageContentType } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { z } from "zod/v4";

const contentQuerySchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO"]).optional(),
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED", "RETURNED", "ARCHIVED"]).optional(),
  acknowledged: z.enum(["true", "false"]).optional(),
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

  const { type, propertyId, departmentId, status, acknowledged, page, pageSize } = parsed.data;
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
  if (status) where.status = status;

  // Filter by acknowledgment status
  if (acknowledged === "true") {
    where.acknowledgments = { some: { userId } };
  } else if (acknowledged === "false") {
    where.acknowledgments = { none: { userId } };
  }

  const [contents, total] = await Promise.all([
    prisma.content.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        version: true,
        publishedAt: true,
        createdAt: true,
        propertyId: true,
        department: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, name: true, code: true } },
        acknowledgments: {
          where: { userId },
          select: { acknowledgedAt: true },
          take: 1,
        },
      },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.content.count({ where }),
  ]);

  return NextResponse.json({
    data: contents.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      status: c.status,
      version: c.version,
      publishedAt: c.publishedAt,
      createdAt: c.createdAt,
      propertyId: c.propertyId,
      department: c.department,
      property: c.property,
      acknowledged: c.acknowledgments.length > 0,
      acknowledgedAt: c.acknowledgments[0]?.acknowledgedAt ?? null,
    })),
    meta: { page, pageSize, total },
  });
}

// --- POST: Crea nuovo contenuto ---
const createContentSchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
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

  const { type, title, body: contentBody, propertyId, departmentId, sendToReview } = parsed.data;
  const userId = session.user.id;

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

  const initialStatus = sendToReview ? "REVIEW_HM" : "DRAFT";

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
    },
  });

  // ContentStatusHistory: creazione iniziale → DRAFT
  await prisma.contentStatusHistory.create({
    data: {
      contentId: content.id,
      fromStatus: null,
      toStatus: "DRAFT",
      changedById: userId,
    },
  });

  // Se invio diretto a REVIEW_HM
  if (sendToReview) {
    await prisma.contentStatusHistory.create({
      data: {
        contentId: content.id,
        fromStatus: "DRAFT",
        toStatus: "REVIEW_HM",
        changedById: userId,
        note: "Inviata direttamente a review HM",
      },
    });
  }

  return NextResponse.json({ data: { id: content.id, status: content.status } }, { status: 201 });
}
