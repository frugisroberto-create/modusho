import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds } from "@/lib/rbac";

/**
 * GET /api/home — Consolidated home page data
 * Returns all data needed by the operator home in a single request.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userId = session.user.id;
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
  }

  // RBAC
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (!accessiblePropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const deptIds = await getAccessibleDepartmentIds(userId, propertyId);
  const deptFilter = deptIds.length > 0
    ? { OR: [{ departmentId: { in: deptIds } }, { departmentId: null }] }
    : {};

  const contentWhere = { propertyId, isDeleted: false, status: "PUBLISHED" as const, ...deptFilter };

  // All queries in parallel
  const [pendingReads, latestSop, latestDocs, latestMemos, sopCount, docCount, memoCount] = await Promise.all([
    // Pending reads (unacknowledged published content)
    prisma.content.findMany({
      where: { ...contentWhere, acknowledgments: { none: { userId } } },
      select: {
        id: true, type: true, code: true, title: true, publishedAt: true,
        department: { select: { id: true, name: true } },
        property: { select: { id: true, name: true, code: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),

    // Latest 3 SOP
    prisma.content.findMany({
      where: { ...contentWhere, type: "SOP" },
      select: {
        id: true, code: true, title: true, publishedAt: true,
        department: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),

    // Latest 3 Documents
    prisma.content.findMany({
      where: { ...contentWhere, type: "DOCUMENT" },
      select: {
        id: true, title: true, publishedAt: true,
        department: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),

    // Latest 3 Memos
    prisma.memo.findMany({
      where: { propertyId, content: { status: "PUBLISHED" }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: {
        id: true, contentId: true, expiresAt: true,
        content: { select: { title: true, publishedAt: true, createdBy: { select: { name: true } } } },
      },
      orderBy: [{ isPinned: "desc" }, { content: { publishedAt: "desc" } }],
      take: 3,
    }),

    // Stat counts
    prisma.content.count({ where: { ...contentWhere, type: "SOP" } }),
    prisma.content.count({ where: { ...contentWhere, type: "DOCUMENT" } }),
    prisma.memo.count({ where: { propertyId, content: { status: "PUBLISHED" }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
  ]);

  // Filter pending reads: exclude BRAND_BOOK and STANDARD_BOOK
  const filteredPending = pendingReads.filter(c => c.type !== "BRAND_BOOK" && c.type !== "STANDARD_BOOK");

  return NextResponse.json({
    data: {
      pendingReads: filteredPending.map(c => ({
        id: c.id, type: c.type, code: c.code, title: c.title,
        publishedAt: c.publishedAt, department: c.department, property: c.property,
      })),
      latestSop: latestSop.map(s => ({
        id: s.id, code: s.code, title: s.title, publishedAt: s.publishedAt,
        department: s.department,
      })),
      latestDocs: latestDocs.map(d => ({
        id: d.id, title: d.title, publishedAt: d.publishedAt,
        department: d.department,
      })),
      latestMemos: latestMemos.map(m => ({
        id: m.contentId, title: m.content.title, publishedAt: m.content.publishedAt,
        author: m.content.createdBy.name,
      })),
      stats: { sopCount, docCount, memoCount },
    },
  });
}
