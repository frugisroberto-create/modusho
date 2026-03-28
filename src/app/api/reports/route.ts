import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const periodFrom = parsed.data.from ? new Date(parsed.data.from) : new Date(Date.now() - 30 * 86400000);
  const periodTo = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const propertyIds = await getAccessiblePropertyIds(session.user.id);
  const pFilter = { propertyId: { in: propertyIds } };

  // KPI globali
  const [sopTotal, sopPublished, sopDraft, sopReviewHm, sopReviewAdmin, sopReturned, sopArchived] = await Promise.all([
    prisma.content.count({ where: { ...pFilter, type: "SOP" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "PUBLISHED" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "DRAFT" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "REVIEW_HM" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "REVIEW_ADMIN" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "RETURNED" } }),
    prisma.content.count({ where: { ...pFilter, type: "SOP", status: "ARCHIVED" } }),
  ]);

  const sopApprovedInPeriod = await prisma.contentStatusHistory.count({
    where: { toStatus: "PUBLISHED", changedAt: { gte: periodFrom, lte: periodTo }, content: { ...pFilter, type: "SOP" } },
  });

  const sopReturnedInPeriod = await prisma.contentStatusHistory.count({
    where: { toStatus: "RETURNED", changedAt: { gte: periodFrom, lte: periodTo }, content: { ...pFilter, type: "SOP" } },
  });

  // Tempo medio workflow
  const avgWorkflow = await prisma.$queryRaw<{ avg_days: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (pub."changedAt" - draft."changedAt")) / 86400)::numeric(10,1) as avg_days
    FROM "ContentStatusHistory" pub
    JOIN "ContentStatusHistory" draft ON draft."contentId" = pub."contentId" AND draft."toStatus" = 'DRAFT' AND draft."fromStatus" IS NULL
    JOIN "Content" c ON c.id = pub."contentId"
    WHERE pub."toStatus" = 'PUBLISHED' AND c."propertyId" = ANY(${propertyIds}) AND c.type = 'SOP'
  `;

  // Presa visione
  const publishedContent = await prisma.content.count({ where: { ...pFilter, status: "PUBLISHED", type: { in: ["SOP", "DOCUMENT"] } } });
  const totalOperators = await prisma.user.count({ where: { role: "OPERATOR", isActive: true, propertyAssignments: { some: { propertyId: { in: propertyIds } } } } });
  const totalAcks = await prisma.contentAcknowledgment.count({ where: { content: { propertyId: { in: propertyIds } } } });
  const expectedAcks = publishedContent * totalOperators;
  const ackRate = expectedAcks > 0 ? Math.round((totalAcks / expectedAcks) * 100) : null;

  // Per hotel
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const hotelStats = await Promise.all(
    properties.map(async (p) => {
      const hFilter = { propertyId: p.id, type: "SOP" as const };
      const [total, published, inReview, returned, draft] = await Promise.all([
        prisma.content.count({ where: hFilter }),
        prisma.content.count({ where: { ...hFilter, status: "PUBLISHED" } }),
        prisma.content.count({ where: { ...hFilter, status: { in: ["REVIEW_HM", "REVIEW_ADMIN"] } } }),
        prisma.contentStatusHistory.count({ where: { toStatus: "RETURNED", changedAt: { gte: periodFrom, lte: periodTo }, content: hFilter } }),
        prisma.content.count({ where: { ...hFilter, status: "DRAFT" } }),
      ]);
      const approved = await prisma.contentStatusHistory.count({
        where: { toStatus: "PUBLISHED", changedAt: { gte: periodFrom, lte: periodTo }, content: hFilter },
      });
      return {
        name: p.name, code: p.code,
        sopTotal: total, sopPublished: published, sopDraft: draft,
        sopInReview: inReview, sopReturned: returned, sopApproved: approved,
        pct: total > 0 ? Math.round((published / total) * 100) : 0,
      };
    })
  );

  // Trend settimanale (ultime 4 settimane)
  const weeks: { label: string; approved: number; returned: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const wFrom = new Date(Date.now() - (i + 1) * 7 * 86400000);
    const wTo = new Date(Date.now() - i * 7 * 86400000);
    const [approved, returned] = await Promise.all([
      prisma.contentStatusHistory.count({ where: { toStatus: "PUBLISHED", changedAt: { gte: wFrom, lt: wTo }, content: { ...pFilter, type: "SOP" } } }),
      prisma.contentStatusHistory.count({ where: { toStatus: "RETURNED", changedAt: { gte: wFrom, lt: wTo }, content: { ...pFilter, type: "SOP" } } }),
    ]);
    weeks.push({
      label: `${wFrom.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} - ${wTo.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`,
      approved, returned,
    });
  }

  return NextResponse.json({
    data: {
      period: { from: periodFrom, to: periodTo },
      kpi: {
        sopTotal, sopPublished, sopDraft, sopReviewHm, sopReviewAdmin, sopReturned, sopArchived,
        sopApprovedInPeriod, sopReturnedInPeriod,
        avgWorkflowDays: avgWorkflow[0]?.avg_days != null ? Number(avgWorkflow[0].avg_days) : null,
        ackRate, totalOperators, publishedContent, totalAcks,
      },
      hotelStats,
      trend: weeks,
      generatedAt: new Date().toISOString(),
    },
  });
}
