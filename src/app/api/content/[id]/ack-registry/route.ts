import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Registro presa visione per contenuti non-SOP (Document, Memo, ecc.)
 * Mostra tutti gli utenti della property con il loro stato di acknowledgment.
 * Accessibile solo a HM+.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole === "OPERATOR") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id: contentId } = await params;
  const filterDepartmentId = request.nextUrl.searchParams.get("departmentId") || undefined;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: { id: true, propertyId: true, departmentId: true, status: true },
  });

  if (!content || content.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // HOD: must filter by their department
  if (userRole === "HOD" && !filterDepartmentId) {
    return NextResponse.json({ error: "HOD deve specificare il reparto" }, { status: 400 });
  }

  // Find all users assigned to this property, filtered by department if specified
  // Exclude the current user from the registry
  const deptFilter = filterDepartmentId || content.departmentId;
  const userWhere: Record<string, unknown> = {
    isActive: true,
    id: { not: session.user.id },
    role: { in: ["OPERATOR", "HOD"] },
    propertyAssignments: {
      some: {
        propertyId: content.propertyId,
        ...(deptFilter
          ? { OR: [{ departmentId: deptFilter }, { departmentId: null }] }
          : {}),
      },
    },
  };

  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Get all acknowledgments for this content
  const acks = await prisma.contentAcknowledgment.findMany({
    where: { contentId },
    select: { userId: true, acknowledgedAt: true },
  });

  const ackMap = new Map(acks.map((a) => [a.userId, a.acknowledgedAt]));

  const registry = users.map((u) => ({
    userId: u.id,
    userName: u.name,
    userRole: u.role,
    acknowledged: ackMap.has(u.id),
    acknowledgedAt: ackMap.get(u.id)?.toISOString() ?? null,
  }));

  const total = registry.length;
  const acknowledgedCount = registry.filter((r) => r.acknowledged).length;

  return NextResponse.json({
    data: {
      registry,
      totals: { total, acknowledged: acknowledgedCount, pending: total - acknowledgedCount },
    },
  });
}
