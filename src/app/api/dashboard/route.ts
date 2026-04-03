import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  if (session.user.role !== "HOTEL_MANAGER" && session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const { from, to, propertyId, departmentId } = parsed.data;

  const periodFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const periodTo = to ? new Date(to) : new Date();

  const accessiblePropertyIds = await getAccessiblePropertyIds(session.user.id);
  const filteredPropertyIds = propertyId
    ? accessiblePropertyIds.includes(propertyId) ? [propertyId] : []
    : accessiblePropertyIds;

  if (filteredPropertyIds.length === 0) {
    return NextResponse.json({ error: "Nessuna property accessibile" }, { status: 403 });
  }

  const pf: Record<string, unknown> = { propertyId: { in: filteredPropertyIds } };
  if (departmentId) pf.departmentId = departmentId;

  const deptCond = departmentId
    ? Prisma.sql`AND c."departmentId" = ${departmentId}`
    : Prisma.empty;

  // ══════════════════════════════════════════════════════════════
  // BATCH 1: Tutte le query indipendenti in parallelo
  // ══════════════════════════════════════════════════════════════
  const [
    properties,
    pendingApprovals,
    sopCounts,
    sopApprovedInPeriod,
    stalledAll,
    recentActivityProps,
    deptsWithPublished,
    allDepts,
    highReturnHotels,
    lowAckContents,
    avgWorkflowTime,
    avgTimePerStatus,
    ackStats,
  ] = await Promise.all([
    // Properties (sempre tutte le accessibili per il select)
    prisma.property.findMany({
      where: { id: { in: accessiblePropertyIds }, isActive: true },
      select: { id: true, name: true, code: true },
    }),

    // Coda approvazioni
    prisma.content.findMany({
      where: { ...pf, isDeleted: false, status: "REVIEW_ADMIN", type: "SOP" },
      include: {
        property: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        statusHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true, note: true, changedBy: { select: { name: true } } } },
        reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { action: true, note: true, reviewer: { select: { name: true } }, createdAt: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),

    // KPI: 5 contatori in una sola raw query
    prisma.$queryRaw<{ status: string; cnt: number }[]>`
      SELECT c.status, COUNT(*)::int as cnt
      FROM "Content" c
      WHERE c.type = 'SOP' AND c."isDeleted" = false
        AND c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
      GROUP BY c.status
    `,

    // SOP approvate nel periodo
    prisma.contentStatusHistory.count({
      where: { toStatus: "PUBLISHED", changedAt: { gte: periodFrom, lte: periodTo }, content: { ...pf, isDeleted: false, type: "SOP" } },
    }),

    // Alert: 3 query stalled unificate in una sola
    prisma.$queryRaw<{ id: string; title: string; propertyName: string; deptName: string | null; daysStalled: number; status: string }[]>`
      SELECT c.id, c.title, p.name as "propertyName", d.name as "deptName",
        EXTRACT(DAY FROM NOW() - h."changedAt")::int as "daysStalled", c.status
      FROM "Content" c
      JOIN "Property" p ON p.id = c."propertyId"
      LEFT JOIN "Department" d ON d.id = c."departmentId"
      JOIN "ContentStatusHistory" h ON h."contentId" = c.id
      WHERE c."isDeleted" = false AND c.type = 'SOP'
        AND c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
        AND h.id = (SELECT h2.id FROM "ContentStatusHistory" h2 WHERE h2."contentId" = c.id ORDER BY h2."changedAt" DESC LIMIT 1)
        AND (
          (c.status = 'REVIEW_HM' AND h."changedAt" < NOW() - INTERVAL '5 days')
          OR (c.status = 'REVIEW_ADMIN' AND h."changedAt" < NOW() - INTERVAL '3 days')
          OR (c.status = 'DRAFT' AND h."changedAt" < NOW() - INTERVAL '10 days')
        )
    `,

    // Hotel con attività recente
    prisma.$queryRaw<{ propertyId: string }[]>`
      SELECT DISTINCT c."propertyId"
      FROM "ContentStatusHistory" h
      JOIN "Content" c ON c.id = h."contentId"
      WHERE c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
        AND h."changedAt" > NOW() - INTERVAL '14 days'
    `,

    // Reparti con SOP pubblicate
    prisma.$queryRaw<{ departmentId: string }[]>`
      SELECT DISTINCT c."departmentId"
      FROM "Content" c
      WHERE c.type = 'SOP' AND c.status = 'PUBLISHED' AND c."isDeleted" = false
        AND c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
        AND c."departmentId" IS NOT NULL
    `,

    // Tutti i reparti
    prisma.department.findMany({
      where: { propertyId: { in: filteredPropertyIds } },
      include: { property: { select: { name: true, code: true } } },
    }),

    // Hotel con > 3 restituzioni
    prisma.$queryRaw<{ propertyId: string; propertyName: string; returnCount: number }[]>`
      SELECT c."propertyId", p.name as "propertyName", COUNT(*)::int as "returnCount"
      FROM "ContentStatusHistory" h
      JOIN "Content" c ON c.id = h."contentId"
      JOIN "Property" p ON p.id = c."propertyId"
      WHERE h."toStatus" = 'RETURNED'
        AND c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
        AND h."changedAt" BETWEEN ${periodFrom} AND ${periodTo}
      GROUP BY c."propertyId", p.name
      HAVING COUNT(*) > 3
    `,

    // Contenuti con presa visione < 50%
    prisma.$queryRaw<{ id: string; title: string; propertyName: string; ackRate: number }[]>`
      SELECT c.id, c.title, p.name as "propertyName",
        CASE WHEN total_ops.cnt = 0 THEN 0
             ELSE ROUND((ack.cnt::numeric / total_ops.cnt) * 100)
        END as "ackRate"
      FROM "Content" c
      JOIN "Property" p ON p.id = c."propertyId"
      LEFT JOIN LATERAL (SELECT COUNT(*)::int as cnt FROM "ContentAcknowledgment" ca WHERE ca."contentId" = c.id) ack ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT pa."userId")::int as cnt
        FROM "PropertyAssignment" pa JOIN "User" u ON u.id = pa."userId"
        WHERE pa."propertyId" = c."propertyId" AND u."role" = 'OPERATOR' AND u."isActive" = true
          AND (c."departmentId" IS NULL OR pa."departmentId" IS NULL OR pa."departmentId" = c."departmentId")
      ) total_ops ON true
      WHERE c.status = 'PUBLISHED' AND c."isDeleted" = false AND c.type IN ('SOP', 'DOCUMENT')
        AND c."propertyId" = ANY(${filteredPropertyIds})
        ${deptCond}
        AND total_ops.cnt > 0 AND (ack.cnt::numeric / total_ops.cnt) < 0.5
      ORDER BY "ackRate" ASC LIMIT 10
    `,

    // Tempo medio workflow
    prisma.$queryRaw<{ avg_days: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (pub."changedAt" - draft."changedAt")) / 86400)::numeric(10,1) as avg_days
      FROM "ContentStatusHistory" pub
      JOIN "ContentStatusHistory" draft ON draft."contentId" = pub."contentId" AND draft."toStatus" = 'DRAFT' AND draft."fromStatus" IS NULL
      JOIN "Content" c ON c.id = pub."contentId"
      WHERE pub."toStatus" = 'PUBLISHED' AND c."propertyId" = ANY(${filteredPropertyIds}) ${deptCond} AND c.type = 'SOP'
    `,

    // Tempo medio per stato
    prisma.$queryRaw<{ status: string; avg_days: number | null }[]>`
      SELECT h1."toStatus" as status,
        AVG(EXTRACT(EPOCH FROM (h2."changedAt" - h1."changedAt")) / 86400)::numeric(10,1) as avg_days
      FROM "ContentStatusHistory" h1
      JOIN "ContentStatusHistory" h2 ON h2."contentId" = h1."contentId" AND h2."fromStatus" = h1."toStatus" AND h2."changedAt" > h1."changedAt"
      JOIN "Content" c ON c.id = h1."contentId"
      WHERE c."propertyId" = ANY(${filteredPropertyIds}) ${deptCond} AND c.type = 'SOP'
        AND h1."toStatus" IN ('DRAFT', 'REVIEW_HM', 'REVIEW_ADMIN')
      GROUP BY h1."toStatus"
    `,

    // Tasso presa visione
    prisma.$queryRaw<{ total_required: number; total_acked: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "Content" c WHERE c.status = 'PUBLISHED' AND c."isDeleted" = false AND c.type IN ('SOP', 'DOCUMENT') AND c."propertyId" = ANY(${filteredPropertyIds}) ${deptCond}) as total_required,
        (SELECT COUNT(DISTINCT ca."contentId" || '-' || ca."userId")::int FROM "ContentAcknowledgment" ca JOIN "Content" c ON c.id = ca."contentId" WHERE c."isDeleted" = false AND c."propertyId" = ANY(${filteredPropertyIds}) ${deptCond}) as total_acked
    `,
  ]);

  // ══════════════════════════════════════════════════════════════
  // Post-processing (no DB calls)
  // ══════��═══════════════════════════════════════════════════════
  const now = new Date();

  // Approval queue
  const approvalQueue = pendingApprovals.map((c) => {
    const lastChange = c.statusHistory[0];
    return {
      id: c.id, title: c.title, property: c.property, department: c.department,
      author: c.createdBy.name, lastEditor: c.updatedBy.name,
      lastAdvancementDate: lastChange?.changedAt ?? c.updatedAt,
      daysWaiting: lastChange ? Math.floor((now.getTime() - lastChange.changedAt.getTime()) / 86400000) : null,
      previousReviewNote: c.reviews[0]?.note ?? null,
      previousReviewAction: c.reviews[0]?.action ?? null,
      previousReviewer: c.reviews[0]?.reviewer?.name ?? null,
    };
  });

  // SOP counts from grouped query
  const countMap = Object.fromEntries(sopCounts.map(r => [r.status, r.cnt]));
  const sopTotal = Object.values(countMap).reduce((a, b) => a + b, 0);

  // Alerts from unified stalled query
  const alerts = {
    stalledReviewHm: stalledAll.filter(r => r.status === "REVIEW_HM").map(r => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "warning" as const, message: `In REVIEW_HM da ${r.daysStalled} giorni`,
    })),
    stalledReviewAdmin: stalledAll.filter(r => r.status === "REVIEW_ADMIN").map(r => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "critical" as const, message: `In REVIEW_ADMIN da ${r.daysStalled} giorni`,
    })),
    stalledDraft: stalledAll.filter(r => r.status === "DRAFT").map(r => ({
      id: r.id, title: r.title, property: r.propertyName, department: r.deptName,
      days: r.daysStalled, severity: "info" as const, message: `In DRAFT da ${r.daysStalled} giorni`,
    })),
    inactiveHotels: (() => {
      const activeIds = new Set(recentActivityProps.map(p => p.propertyId));
      return properties.filter(p => !activeIds.has(p.id)).map(h => ({
        id: h.id, name: h.name, severity: "warning" as const, message: "Nessun avanzamento SOP negli ultimi 14 giorni",
      }));
    })(),
    emptyDepts: (() => {
      const pubIds = new Set(deptsWithPublished.map(d => d.departmentId));
      return allDepts.filter(d => !pubIds.has(d.id)).map(d => ({
        id: d.id, name: d.name, property: d.property.name, severity: "info" as const, message: "0 SOP pubblicate",
      }));
    })(),
    highReturnHotels: highReturnHotels.map(h => ({
      id: h.propertyId, name: h.propertyName, count: h.returnCount, severity: "warning" as const,
      message: `${h.returnCount} SOP restituite nel periodo`,
    })),
    lowAckContents: lowAckContents.map(c => ({
      id: c.id, title: c.title, property: c.propertyName, ackRate: Number(c.ackRate),
      severity: "critical" as const, message: `Presa visione al ${c.ackRate}%`,
    })),
  };

  const totalAlerts = Object.values(alerts).reduce((acc, arr) => acc + arr.length, 0);

  // KPI
  const kpi = {
    sopTotal,
    sopPublished: countMap["PUBLISHED"] || 0,
    sopReviewHm: countMap["REVIEW_HM"] || 0,
    sopReviewAdmin: countMap["REVIEW_ADMIN"] || 0,
    sopReturned: countMap["RETURNED"] || 0,
    sopApprovedInPeriod,
    avgWorkflowDays: avgWorkflowTime[0]?.avg_days != null ? Number(avgWorkflowTime[0].avg_days) : null,
    avgTimePerStatus: Object.fromEntries(avgTimePerStatus.map(r => [r.status, r.avg_days != null ? Number(r.avg_days) : null])),
    ackRate: ackStats[0]?.total_required ? Math.round((ackStats[0].total_acked / ackStats[0].total_required) * 100) : null,
  };

  // ══════════════════════════════════════════════════════════════
  // BATCH 2: Confronto hotel e reparti (query consolidate)
  // ══════════════════════════════════════════════════════════════
  const [propStats, deptStats, propLastAdv] = await Promise.all([
    // Contatori per property in una sola query
    prisma.$queryRaw<{ propertyId: string; status: string; cnt: number }[]>`
      SELECT c."propertyId", c.status, COUNT(*)::int as cnt
      FROM "Content" c
      WHERE c.type = 'SOP' AND c."isDeleted" = false AND c."propertyId" = ANY(${filteredPropertyIds})
      GROUP BY c."propertyId", c.status
    `,
    // Contatori per reparto in una sola query
    prisma.$queryRaw<{ propertyId: string; departmentId: string; status: string; cnt: number }[]>`
      SELECT c."propertyId", c."departmentId", c.status, COUNT(*)::int as cnt
      FROM "Content" c
      WHERE c.type = 'SOP' AND c."isDeleted" = false AND c."propertyId" = ANY(${filteredPropertyIds})
        AND c."departmentId" IS NOT NULL
      GROUP BY c."propertyId", c."departmentId", c.status
    `,
    // Ultimo avanzamento per property
    prisma.$queryRaw<{ propertyId: string; lastChange: Date }[]>`
      SELECT c."propertyId", MAX(h."changedAt") as "lastChange"
      FROM "ContentStatusHistory" h
      JOIN "Content" c ON c.id = h."contentId"
      WHERE c.type = 'SOP' AND c."propertyId" = ANY(${filteredPropertyIds})
      GROUP BY c."propertyId"
    `,
  ]);

  // Build property comparison
  const propStatsMap = new Map<string, Record<string, number>>();
  for (const r of propStats) {
    if (!propStatsMap.has(r.propertyId)) propStatsMap.set(r.propertyId, {});
    propStatsMap.get(r.propertyId)![r.status] = r.cnt;
  }
  const propLastAdvMap = new Map(propLastAdv.map(r => [r.propertyId, r.lastChange]));

  const propertyComparison = properties.map(prop => {
    const s = propStatsMap.get(prop.id) || {};
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const published = s["PUBLISHED"] || 0;
    return {
      id: prop.id, name: prop.name, code: prop.code, sopTotal: total, sopPublished: published,
      sopInReview: (s["REVIEW_HM"] || 0) + (s["REVIEW_ADMIN"] || 0),
      sopReturned: s["RETURNED"] || 0,
      advancementPct: total > 0 ? Math.round((published / total) * 100) : 0,
      lastAdvancement: propLastAdvMap.get(prop.id) ?? null,
    };
  });

  // Build department comparison
  const deptStatsMap = new Map<string, Record<string, number>>();
  for (const r of deptStats) {
    const key = `${r.propertyId}:${r.departmentId}`;
    if (!deptStatsMap.has(key)) deptStatsMap.set(key, {});
    deptStatsMap.get(key)![r.status] = r.cnt;
  }

  const departmentComparison = properties.map(prop => {
    const propDepts = allDepts.filter(d => d.propertyId === prop.id);
    return {
      propertyId: prop.id, propertyName: prop.name, propertyCode: prop.code,
      departments: propDepts.map(dept => {
        const s = deptStatsMap.get(`${prop.id}:${dept.id}`) || {};
        const total = Object.values(s).reduce((a, b) => a + b, 0);
        return {
          id: dept.id, name: dept.name, code: dept.code, sopTotal: total,
          sopPublished: s["PUBLISHED"] || 0,
          sopInReview: (s["REVIEW_HM"] || 0) + (s["REVIEW_ADMIN"] || 0),
          sopReturned: s["RETURNED"] || 0,
          avgAgingDays: null,
        };
      }),
    };
  });

  return NextResponse.json({
    data: {
      header: { properties, pendingApprovalCount: pendingApprovals.length, totalAlerts, periodFrom, periodTo },
      approvalQueue,
      alerts,
      kpi,
      propertyComparison,
      departmentComparison,
    },
  });
}
