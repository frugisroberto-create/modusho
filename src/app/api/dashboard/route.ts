import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  propertyId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const { from, to, propertyId } = parsed.data;
  const userId = session.user.id;

  // Period defaults
  const periodFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const periodTo = to ? new Date(to) : new Date();

  // RBAC: property accessibili
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  const filteredPropertyIds = propertyId
    ? accessiblePropertyIds.includes(propertyId) ? [propertyId] : []
    : accessiblePropertyIds;

  if (filteredPropertyIds.length === 0) {
    return NextResponse.json({ error: "Nessuna property accessibile" }, { status: 403 });
  }

  const propertyFilter = { propertyId: { in: filteredPropertyIds } };

  // --- SEZIONE 1: Header sintetico ---
  const [pendingApprovalCount, properties] = await Promise.all([
    prisma.content.count({
      where: { ...propertyFilter, status: "REVIEW_ADMIN", type: "SOP" },
    }),
    prisma.property.findMany({
      where: { id: { in: filteredPropertyIds }, isActive: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  // --- SEZIONE 2: Coda approvazioni ---
  const pendingApprovals = await prisma.content.findMany({
    where: { ...propertyFilter, status: "REVIEW_ADMIN", type: "SOP" },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        take: 1,
        select: { changedAt: true, note: true, changedBy: { select: { name: true } } },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { action: true, note: true, reviewer: { select: { name: true } }, createdAt: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const now = new Date();
  const approvalQueue = pendingApprovals.map((c) => {
    const lastChange = c.statusHistory[0];
    const daysWaiting = lastChange
      ? Math.floor((now.getTime() - lastChange.changedAt.getTime()) / 86400000)
      : null;
    return {
      id: c.id,
      title: c.title,
      property: c.property,
      department: c.department,
      author: c.createdBy.name,
      lastEditor: c.updatedBy.name,
      lastAdvancementDate: lastChange?.changedAt ?? c.updatedAt,
      daysWaiting,
      previousReviewNote: c.reviews[0]?.note ?? null,
      previousReviewAction: c.reviews[0]?.action ?? null,
      previousReviewer: c.reviews[0]?.reviewer?.name ?? null,
    };
  });

  // --- SEZIONE 3: Alert critici ---
  // SOP ferme in REVIEW_HM > 5 giorni
  const stalledReviewHm = await prisma.$queryRaw<
    { id: string; title: string; propertyName: string; deptName: string | null; daysStalled: number }[]
  >`
    SELECT c.id, c.title, p.name as "propertyName", d.name as "deptName",
      EXTRACT(DAY FROM NOW() - h."changedAt")::int as "daysStalled"
    FROM "Content" c
    JOIN "Property" p ON p.id = c."propertyId"
    LEFT JOIN "Department" d ON d.id = c."departmentId"
    JOIN "ContentStatusHistory" h ON h."contentId" = c.id
    WHERE c.status = 'REVIEW_HM' AND c.type = 'SOP'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND h.id = (SELECT h2.id FROM "ContentStatusHistory" h2 WHERE h2."contentId" = c.id ORDER BY h2."changedAt" DESC LIMIT 1)
      AND h."changedAt" < NOW() - INTERVAL '5 days'
  `;

  // SOP ferme in REVIEW_ADMIN > 3 giorni
  const stalledReviewAdmin = await prisma.$queryRaw<
    { id: string; title: string; propertyName: string; deptName: string | null; daysStalled: number }[]
  >`
    SELECT c.id, c.title, p.name as "propertyName", d.name as "deptName",
      EXTRACT(DAY FROM NOW() - h."changedAt")::int as "daysStalled"
    FROM "Content" c
    JOIN "Property" p ON p.id = c."propertyId"
    LEFT JOIN "Department" d ON d.id = c."departmentId"
    JOIN "ContentStatusHistory" h ON h."contentId" = c.id
    WHERE c.status = 'REVIEW_ADMIN' AND c.type = 'SOP'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND h.id = (SELECT h2.id FROM "ContentStatusHistory" h2 WHERE h2."contentId" = c.id ORDER BY h2."changedAt" DESC LIMIT 1)
      AND h."changedAt" < NOW() - INTERVAL '3 days'
  `;

  // SOP ferme in DRAFT > 10 giorni
  const stalledDraft = await prisma.$queryRaw<
    { id: string; title: string; propertyName: string; deptName: string | null; daysStalled: number }[]
  >`
    SELECT c.id, c.title, p.name as "propertyName", d.name as "deptName",
      EXTRACT(DAY FROM NOW() - h."changedAt")::int as "daysStalled"
    FROM "Content" c
    JOIN "Property" p ON p.id = c."propertyId"
    LEFT JOIN "Department" d ON d.id = c."departmentId"
    JOIN "ContentStatusHistory" h ON h."contentId" = c.id
    WHERE c.status = 'DRAFT' AND c.type = 'SOP'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND h.id = (SELECT h2.id FROM "ContentStatusHistory" h2 WHERE h2."contentId" = c.id ORDER BY h2."changedAt" DESC LIMIT 1)
      AND h."changedAt" < NOW() - INTERVAL '10 days'
  `;

  // Hotel senza avanzamento negli ultimi 14 giorni
  const propertiesWithRecentActivity = await prisma.$queryRaw<{ propertyId: string }[]>`
    SELECT DISTINCT c."propertyId"
    FROM "ContentStatusHistory" h
    JOIN "Content" c ON c.id = h."contentId"
    WHERE c."propertyId" = ANY(${filteredPropertyIds})
      AND h."changedAt" > NOW() - INTERVAL '14 days'
  `;
  const activePropertyIds = new Set(propertiesWithRecentActivity.map((p) => p.propertyId));
  const inactiveHotels = properties.filter((p) => !activePropertyIds.has(p.id));

  // Reparti con 0 SOP pubblicate
  const deptsWithPublished = await prisma.$queryRaw<{ departmentId: string }[]>`
    SELECT DISTINCT c."departmentId"
    FROM "Content" c
    WHERE c.type = 'SOP' AND c.status = 'PUBLISHED'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND c."departmentId" IS NOT NULL
  `;
  const publishedDeptIds = new Set(deptsWithPublished.map((d) => d.departmentId));
  const allDepts = await prisma.department.findMany({
    where: { propertyId: { in: filteredPropertyIds } },
    include: { property: { select: { name: true, code: true } } },
  });
  const emptyDepts = allDepts.filter((d) => !publishedDeptIds.has(d.id));

  // Hotel con > 3 SOP restituite nel periodo
  const highReturnHotels = await prisma.$queryRaw<
    { propertyId: string; propertyName: string; returnCount: number }[]
  >`
    SELECT c."propertyId", p.name as "propertyName", COUNT(*)::int as "returnCount"
    FROM "ContentStatusHistory" h
    JOIN "Content" c ON c.id = h."contentId"
    JOIN "Property" p ON p.id = c."propertyId"
    WHERE h."toStatus" = 'RETURNED'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND h."changedAt" BETWEEN ${periodFrom} AND ${periodTo}
    GROUP BY c."propertyId", p.name
    HAVING COUNT(*) > 3
  `;

  // Contenuti con presa visione < 50%
  const lowAckContents = await prisma.$queryRaw<
    { id: string; title: string; propertyName: string; ackRate: number }[]
  >`
    SELECT c.id, c.title, p.name as "propertyName",
      CASE WHEN total_ops.cnt = 0 THEN 0
           ELSE ROUND((ack.cnt::numeric / total_ops.cnt) * 100)
      END as "ackRate"
    FROM "Content" c
    JOIN "Property" p ON p.id = c."propertyId"
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int as cnt FROM "ContentAcknowledgment" ca WHERE ca."contentId" = c.id
    ) ack ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT pa."userId")::int as cnt
      FROM "PropertyAssignment" pa
      JOIN "User" u ON u.id = pa."userId"
      WHERE pa."propertyId" = c."propertyId"
        AND u."role" = 'OPERATOR'
        AND u."isActive" = true
        AND (c."departmentId" IS NULL OR pa."departmentId" IS NULL OR pa."departmentId" = c."departmentId")
    ) total_ops ON true
    WHERE c.status = 'PUBLISHED' AND c.type IN ('SOP', 'DOCUMENT')
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND total_ops.cnt > 0
      AND (ack.cnt::numeric / total_ops.cnt) < 0.5
    ORDER BY "ackRate" ASC
    LIMIT 10
  `;

  const alerts = {
    stalledReviewHm: stalledReviewHm.map((r) => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "warning" as const,
      message: `In REVIEW_HM da ${r.daysStalled} giorni`,
    })),
    stalledReviewAdmin: stalledReviewAdmin.map((r) => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "critical" as const,
      message: `In REVIEW_ADMIN da ${r.daysStalled} giorni`,
    })),
    stalledDraft: stalledDraft.map((r) => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "info" as const,
      message: `In DRAFT da ${r.daysStalled} giorni`,
    })),
    inactiveHotels: inactiveHotels.map((h) => ({
      id: h.id, name: h.name, severity: "warning" as const,
      message: `Nessun avanzamento SOP negli ultimi 14 giorni`,
    })),
    emptyDepts: emptyDepts.map((d) => ({
      id: d.id, name: d.name, property: d.property.name, severity: "info" as const,
      message: `0 SOP pubblicate`,
    })),
    highReturnHotels: highReturnHotels.map((h) => ({
      id: h.propertyId, name: h.propertyName, count: h.returnCount, severity: "warning" as const,
      message: `${h.returnCount} SOP restituite nel periodo`,
    })),
    lowAckContents: lowAckContents.map((c) => ({
      id: c.id, title: c.title, property: c.propertyName, ackRate: Number(c.ackRate),
      severity: "critical" as const,
      message: `Presa visione al ${c.ackRate}%`,
    })),
  };

  const totalAlerts = Object.values(alerts).reduce((acc, arr) => acc + arr.length, 0);

  // --- SEZIONE 4: KPI ---
  const [sopTotal, sopPublished, sopReviewHm, sopReviewAdmin, sopReturned] = await Promise.all([
    prisma.content.count({ where: { ...propertyFilter, type: "SOP" } }),
    prisma.content.count({ where: { ...propertyFilter, type: "SOP", status: "PUBLISHED" } }),
    prisma.content.count({ where: { ...propertyFilter, type: "SOP", status: "REVIEW_HM" } }),
    prisma.content.count({ where: { ...propertyFilter, type: "SOP", status: "REVIEW_ADMIN" } }),
    prisma.content.count({ where: { ...propertyFilter, type: "SOP", status: "RETURNED" } }),
  ]);

  const sopApprovedInPeriod = await prisma.contentStatusHistory.count({
    where: {
      toStatus: "PUBLISHED",
      changedAt: { gte: periodFrom, lte: periodTo },
      content: { ...propertyFilter, type: "SOP" },
    },
  });

  // Tempo medio workflow (DRAFT → PUBLISHED)
  const avgWorkflowTime = await prisma.$queryRaw<{ avg_days: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (pub."changedAt" - draft."changedAt")) / 86400)::numeric(10,1) as avg_days
    FROM "ContentStatusHistory" pub
    JOIN "ContentStatusHistory" draft ON draft."contentId" = pub."contentId" AND draft."toStatus" = 'DRAFT' AND draft."fromStatus" IS NULL
    JOIN "Content" c ON c.id = pub."contentId"
    WHERE pub."toStatus" = 'PUBLISHED'
      AND c."propertyId" = ANY(${filteredPropertyIds})
      AND c.type = 'SOP'
  `;

  // Tempo medio per stato
  const avgTimePerStatus = await prisma.$queryRaw<
    { status: string; avg_days: number | null }[]
  >`
    SELECT h1."toStatus" as status,
      AVG(EXTRACT(EPOCH FROM (h2."changedAt" - h1."changedAt")) / 86400)::numeric(10,1) as avg_days
    FROM "ContentStatusHistory" h1
    JOIN "ContentStatusHistory" h2 ON h2."contentId" = h1."contentId"
      AND h2."fromStatus" = h1."toStatus"
      AND h2."changedAt" > h1."changedAt"
    JOIN "Content" c ON c.id = h1."contentId"
    WHERE c."propertyId" = ANY(${filteredPropertyIds})
      AND c.type = 'SOP'
      AND h1."toStatus" IN ('DRAFT', 'REVIEW_HM', 'REVIEW_ADMIN')
    GROUP BY h1."toStatus"
  `;

  // Tasso presa visione globale
  const ackStats = await prisma.$queryRaw<{ total_required: number; total_acked: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "Content" c WHERE c.status = 'PUBLISHED' AND c.type IN ('SOP', 'DOCUMENT') AND c."propertyId" = ANY(${filteredPropertyIds})) as total_required,
      (SELECT COUNT(DISTINCT ca."contentId" || '-' || ca."userId")::int FROM "ContentAcknowledgment" ca JOIN "Content" c ON c.id = ca."contentId" WHERE c."propertyId" = ANY(${filteredPropertyIds})) as total_acked
  `;

  const kpi = {
    sopTotal,
    sopPublished,
    sopReviewHm,
    sopReviewAdmin,
    sopReturned,
    sopApprovedInPeriod,
    avgWorkflowDays: avgWorkflowTime[0]?.avg_days != null ? Number(avgWorkflowTime[0].avg_days) : null,
    avgTimePerStatus: Object.fromEntries(
      avgTimePerStatus.map((r) => [r.status, r.avg_days != null ? Number(r.avg_days) : null])
    ),
    ackRate: ackStats[0]?.total_required
      ? Math.round((ackStats[0].total_acked / ackStats[0].total_required) * 100)
      : null,
  };

  // --- SEZIONE 5: Confronto per hotel ---
  const propertyComparison = await Promise.all(
    properties.map(async (prop) => {
      const pFilter = { propertyId: prop.id, type: "SOP" as const };
      const [total, published, inReview, returned] = await Promise.all([
        prisma.content.count({ where: pFilter }),
        prisma.content.count({ where: { ...pFilter, status: "PUBLISHED" } }),
        prisma.content.count({ where: { ...pFilter, status: { in: ["REVIEW_HM", "REVIEW_ADMIN"] } } }),
        prisma.contentStatusHistory.count({
          where: { toStatus: "RETURNED", content: pFilter, changedAt: { gte: periodFrom, lte: periodTo } },
        }),
      ]);
      const lastAdvancement = await prisma.contentStatusHistory.findFirst({
        where: { content: { propertyId: prop.id, type: "SOP" } },
        orderBy: { changedAt: "desc" },
        select: { changedAt: true },
      });
      return {
        id: prop.id,
        name: prop.name,
        code: prop.code,
        sopTotal: total,
        sopPublished: published,
        sopInReview: inReview,
        sopReturned: returned,
        advancementPct: total > 0 ? Math.round((published / total) * 100) : 0,
        lastAdvancement: lastAdvancement?.changedAt ?? null,
      };
    })
  );

  // --- SEZIONE 6: Confronto per reparto ---
  const departmentComparison = await Promise.all(
    properties.map(async (prop) => {
      const depts = await prisma.department.findMany({
        where: { propertyId: prop.id },
        select: { id: true, name: true, code: true },
      });
      const deptStats = await Promise.all(
        depts.map(async (dept) => {
          const dFilter = { propertyId: prop.id, departmentId: dept.id, type: "SOP" as const };
          const [total, published, inReview, returned] = await Promise.all([
            prisma.content.count({ where: dFilter }),
            prisma.content.count({ where: { ...dFilter, status: "PUBLISHED" } }),
            prisma.content.count({ where: { ...dFilter, status: { in: ["REVIEW_HM", "REVIEW_ADMIN"] } } }),
            prisma.contentStatusHistory.count({
              where: { toStatus: "RETURNED", content: dFilter, changedAt: { gte: periodFrom, lte: periodTo } },
            }),
          ]);
          // Aging medio: media giorni nello stato corrente per SOP non pubblicate
          const aging = await prisma.$queryRaw<{ avg_days: number | null }[]>`
            SELECT AVG(EXTRACT(EPOCH FROM (NOW() - h."changedAt")) / 86400)::numeric(10,1) as avg_days
            FROM "Content" c
            JOIN "ContentStatusHistory" h ON h."contentId" = c.id
            WHERE c."propertyId" = ${prop.id}
              AND c."departmentId" = ${dept.id}
              AND c.type = 'SOP'
              AND c.status NOT IN ('PUBLISHED', 'ARCHIVED')
              AND h.id = (SELECT h2.id FROM "ContentStatusHistory" h2 WHERE h2."contentId" = c.id ORDER BY h2."changedAt" DESC LIMIT 1)
          `;
          return {
            id: dept.id,
            name: dept.name,
            code: dept.code,
            sopTotal: total,
            sopPublished: published,
            sopInReview: inReview,
            sopReturned: returned,
            avgAgingDays: aging[0]?.avg_days != null ? Number(aging[0].avg_days) : null,
          };
        })
      );
      return { propertyId: prop.id, propertyName: prop.name, propertyCode: prop.code, departments: deptStats };
    })
  );

  return NextResponse.json({
    data: {
      header: { properties, pendingApprovalCount, totalAlerts, periodFrom, periodTo },
      approvalQueue,
      alerts,
      kpi,
      propertyComparison,
      departmentComparison,
    },
  });
}
