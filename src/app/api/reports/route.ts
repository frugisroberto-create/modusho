import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  propertyId: z.string(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const role = session.user.role;
  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi (propertyId obbligatorio)" }, { status: 400 });

  const { propertyId } = parsed.data;
  const periodFrom = parsed.data.from ? new Date(parsed.data.from) : new Date(Date.now() - 30 * 86400000);
  const periodTo = parsed.data.to ? new Date(parsed.data.to) : new Date();

  // RBAC
  const accessibleIds = await getAccessiblePropertyIds(session.user.id);
  if (!accessibleIds.includes(propertyId)) {
    return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, code: true },
  });
  if (!!property === false) {
    return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 });
  }

  const pFilter = { propertyId, isDeleted: false, type: "SOP" as const };

  // ── SEZIONE 1: Stato attuale per reparto ──

  const departments = await prisma.department.findMany({
    where: { propertyId },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const deptStats = await Promise.all(
    departments.map(async (dept) => {
      const published = await prisma.content.count({
        where: { ...pFilter, status: "PUBLISHED", departmentId: dept.id },
      });
      return { id: dept.id, name: dept.name, code: dept.code, publishedCount: published };
    })
  );

  const totalPublished = deptStats.reduce((sum, d) => sum + d.publishedCount, 0);
  const deptsWithoutSop = deptStats.filter(d => d.publishedCount === 0);

  // ── SEZIONE 2: SOP approvate nel periodo ──

  const approvedHistory = await prisma.contentStatusHistory.findMany({
    where: {
      toStatus: "PUBLISHED",
      changedAt: { gte: periodFrom, lte: periodTo },
      content: { ...pFilter },
    },
    select: {
      changedAt: true,
      content: {
        select: {
          id: true, code: true, title: true,
          department: { select: { id: true, name: true, code: true } },
          sopWorkflow: {
            select: {
              responsible: { select: { name: true, role: true } },
            },
          },
        },
      },
    },
    orderBy: { changedAt: "desc" },
  });

  // Deduplica per contentId (prendi solo l'ultima approvazione per ogni SOP)
  const seenIds = new Set<string>();
  const uniqueHistory = approvedHistory.filter((h) => {
    if (seenIds.has(h.content.id)) return false;
    seenIds.add(h.content.id);
    return true;
  });

  const approvedSops = uniqueHistory.map((h) => ({
    id: h.content.id,
    code: h.content.code,
    title: h.content.title,
    department: h.content.department,
    author: h.content.sopWorkflow?.responsible?.name || "—",
    approvedAt: h.changedAt.toISOString(),
  }));

  // Raggruppa per reparto
  const approvedByDept: Record<string, typeof approvedSops> = {};
  for (const sop of approvedSops) {
    const deptName = sop.department?.name || "Trasversale";
    if (!approvedByDept[deptName]) approvedByDept[deptName] = [];
    approvedByDept[deptName].push(sop);
  }

  return NextResponse.json({
    data: {
      property: property!,
      period: { from: periodFrom.toISOString(), to: periodTo.toISOString() },
      currentState: {
        totalPublished,
        byDepartment: deptStats,
        deptsWithoutSop,
      },
      approvedInPeriod: {
        total: approvedSops.length,
        byDepartment: approvedByDept,
        list: approvedSops,
      },
      generatedAt: new Date().toISOString(),
    },
  });
}
