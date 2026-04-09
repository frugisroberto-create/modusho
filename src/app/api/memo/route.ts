import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds, checkAccess, canUserManageContentType } from "@/lib/rbac";
import { sendContentPublishedPush } from "@/lib/push-notification";
import { z } from "zod/v4";

const memoQuerySchema = z.object({
  propertyId: z.string(),
  includeExpired: z.enum(["true", "false"]).optional(),
  status: z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = memoQuerySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { propertyId, includeExpired, status, page, pageSize } = parsed.data;
  const userId = session.user.id;
  const userRole = session.user.role;

  // RBAC
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (!accessiblePropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const now = new Date();
  const contentWhere: Record<string, unknown> = {
    isDeleted: false,
    status: (status || "PUBLISHED") as "PUBLISHED" | "ARCHIVED",
  };

  // Visibilità per OPERATOR/HOD basata su targetAudience (ContentTarget)
  // Allinea il filtro alla logica di /api/content GET
  if (userRole === "OPERATOR" || userRole === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(userId, propertyId);
    contentWhere.targetAudience = {
      some: {
        OR: [
          { targetType: "ROLE", targetRole: "OPERATOR" },
          { targetType: "ROLE", targetRole: userRole },
          { targetType: "USER", targetUserId: userId },
          ...(accessibleDepts.length > 0
            ? [{ targetType: "DEPARTMENT", targetDepartmentId: { in: accessibleDepts } }]
            : []),
        ],
      },
    };
  }

  const where: Record<string, unknown> = {
    propertyId,
    content: contentWhere,
  };

  // Admin può vedere anche i memo scaduti
  if (includeExpired !== "true") {
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  }

  const [memos, total] = await Promise.all([
    prisma.memo.findMany({
      where,
      include: {
        content: {
          select: {
            id: true,
            title: true,
            body: true,
            publishedAt: true,
            createdBy: { select: { id: true, name: true } },
            acknowledgments: {
              where: { userId },
              select: { acknowledgedAt: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { content: { publishedAt: "desc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.memo.count({ where }),
  ]);

  return NextResponse.json({
    data: memos.map((m) => ({
      id: m.id,
      contentId: m.contentId,
      title: m.content.title,
      body: m.content.body,
      publishedAt: m.content.publishedAt,
      author: m.content.createdBy.name,
      createdById: m.content.createdBy.id,
      isPinned: m.isPinned,
      expiresAt: m.expiresAt,
      acknowledged: m.content.acknowledgments.length > 0,
      acknowledgedAt: m.content.acknowledgments[0]?.acknowledgedAt ?? null,
    })),
    meta: { page, pageSize, total },
  });
}

// --- POST: Crea memo ---
const createMemoSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  expiresAt: z.string().nullable().optional(),
  // Destinatari (ContentTarget) — più tipi possono coesistere
  targetDepartmentIds: z.array(z.string()).optional().default([]),
  targetAllDepartments: z.boolean().optional().default(false),
  targetRoles: z.array(z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER"])).optional().default([]),
  targetUserIds: z.array(z.string()).optional().default([]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createMemoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });

  const { title, body: memoBody, propertyId, expiresAt, targetAllDepartments, targetDepartmentIds, targetRoles, targetUserIds } = parsed.data;

  // Verifica permesso sul tipo MEMO
  const canManageMemo = await canUserManageContentType(session.user.id, "MEMO");
  if (!canManageMemo) {
    return NextResponse.json({ error: "Non hai permesso di creare memo" }, { status: 403 });
  }
  const userId = session.user.id;
  const role = session.user.role;

  // OPERATOR non può creare memo
  if (role === "OPERATOR") {
    return NextResponse.json({ error: "Operatore non può creare memo" }, { status: 403 });
  }

  // Accesso minimo HOD alla property
  const hasAccess = await checkAccess(userId, "HOD", propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  // Restrizione HOD: può targettare solo i propri reparti, niente ruoli/utenti/all
  if (role === "HOD") {
    if (targetAllDepartments || targetRoles.length > 0 || targetUserIds.length > 0) {
      return NextResponse.json({
        error: "Come HOD puoi targettare solo i tuoi reparti — non sono ammessi ruoli trasversali, utenti specifici o 'tutti gli operatori'",
      }, { status: 403 });
    }
    const { getAccessibleDepartmentIds } = await import("@/lib/rbac");
    const accessibleDepts = await getAccessibleDepartmentIds(userId, propertyId);
    const outOfPerimeter = targetDepartmentIds.filter(d => !accessibleDepts.includes(d));
    if (outOfPerimeter.length > 0) {
      return NextResponse.json({
        error: "Alcuni reparti destinatari non rientrano nel tuo perimetro",
      }, { status: 403 });
    }
  }

  // Crea Content + Memo + StatusHistory in transazione
  const now = new Date();
  const content = await prisma.content.create({
    data: {
      type: "MEMO",
      title,
      body: memoBody,
      status: "PUBLISHED",
      propertyId,
      createdById: userId,
      updatedById: userId,
      publishedAt: now,
    },
  });

  await prisma.memo.create({
    data: {
      contentId: content.id,
      propertyId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  // ContentTarget: destinatari (più tipi possono coesistere)
  const targetsToCreate: { contentId: string; targetType: "ROLE" | "DEPARTMENT" | "USER"; targetRole?: "OPERATOR" | "HOD" | "HOTEL_MANAGER"; targetDepartmentId?: string; targetUserId?: string }[] = [];
  if (targetAllDepartments) {
    targetsToCreate.push({ contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" });
  }
  for (const r of targetRoles) {
    if (r === "OPERATOR" && targetAllDepartments) continue;
    targetsToCreate.push({ contentId: content.id, targetType: "ROLE", targetRole: r });
  }
  for (const deptId of targetDepartmentIds) {
    targetsToCreate.push({ contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: deptId });
  }
  for (const uid of targetUserIds) {
    targetsToCreate.push({ contentId: content.id, targetType: "USER", targetUserId: uid });
  }
  // Fallback legacy: nessun target esplicito → tutti gli operatori
  if (targetsToCreate.length === 0) {
    targetsToCreate.push({ contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" });
  }
  await prisma.contentTarget.createMany({ data: targetsToCreate });

  await prisma.contentStatusHistory.create({
    data: {
      contentId: content.id,
      fromStatus: null,
      toStatus: "PUBLISHED",
      changedById: userId,
    },
  });

  // Push notification best-effort (await per Vercel serverless)
  await sendContentPublishedPush({
    contentId: content.id,
    contentTitle: title,
    contentType: "MEMO",
    actorId: userId,
  }).catch(() => {});

  return NextResponse.json({ data: { id: content.id } }, { status: 201 });
}
