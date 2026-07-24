import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessiblePropertyIds } from "@/lib/rbac";

/**
 * GET /api/onboarding/dashboard?propertyId=X
 * Returns onboarding stats for HOO monitoring.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER");
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const accessiblePropertyIds = await getAccessiblePropertyIds(session.user.id);

  let filteredPropertyIds = accessiblePropertyIds;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredPropertyIds = [propertyId];
  }

  const now = new Date();

  const [active, completed, overdue] = await Promise.all([
    prisma.onboardingAssignment.count({
      where: { propertyId: { in: filteredPropertyIds }, completedAt: null },
    }),
    prisma.onboardingAssignment.count({
      where: { propertyId: { in: filteredPropertyIds }, completedAt: { not: null } },
    }),
    prisma.onboardingAssignment.count({
      where: { propertyId: { in: filteredPropertyIds }, completedAt: null, dueDate: { lt: now } },
    }),
  ]);

  // Recent assignments with progress
  const recentAssignments = await prisma.onboardingAssignment.findMany({
    where: { propertyId: { in: filteredPropertyIds }, completedAt: null },
    include: {
      user: { select: { id: true, name: true, role: true } },
      property: { select: { id: true, name: true, code: true } },
      sections: {
        where: { requiresAck: true },
        select: { acknowledgedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const assignments = recentAssignments.map((a) => {
    const required = a.sections.length;
    const acknowledged = a.sections.filter((s) => s.acknowledgedAt !== null).length;
    return {
      id: a.id,
      user: a.user,
      property: a.property,
      percentage: required === 0 ? 100 : Math.round((acknowledged / required) * 100),
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      isOverdue: a.dueDate && a.dueDate < now,
    };
  });

  return NextResponse.json({
    data: {
      stats: { active, completed, overdue },
      assignments,
    },
  });
}
