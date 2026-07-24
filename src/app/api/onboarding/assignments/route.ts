import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const querySchema = z.object({
  propertyId: z.string().optional(),
  status: z.enum(["active", "completed", "overdue"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/onboarding/assignments
 * List onboarding assignments for HOO monitoring.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // RBAC: HM+
  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER");
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const { propertyId, status, page, pageSize } = parsed.data;

  // Scope to accessible properties
  const accessiblePropertyIds = await getAccessiblePropertyIds(session.user.id);
  let filteredPropertyIds = accessiblePropertyIds;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredPropertyIds = [propertyId];
  }

  const now = new Date();

  const where: Record<string, unknown> = {
    propertyId: { in: filteredPropertyIds },
  };

  if (status === "active") {
    where.completedAt = null;
  } else if (status === "completed") {
    where.completedAt = { not: null };
  } else if (status === "overdue") {
    where.completedAt = null;
    where.dueDate = { lt: now };
  }

  const [assignments, total] = await Promise.all([
    prisma.onboardingAssignment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        property: { select: { id: true, name: true, code: true } },
        assignedBy: { select: { id: true, name: true } },
        _count: { select: { sections: true } },
        sections: {
          where: { requiresAck: true },
          select: { acknowledgedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.onboardingAssignment.count({ where }),
  ]);

  const data = assignments.map((a) => {
    const required = a.sections.length;
    const acknowledged = a.sections.filter((s) => s.acknowledgedAt !== null).length;
    return {
      id: a.id,
      user: a.user,
      property: a.property,
      assignedBy: a.assignedBy,
      totalSections: a._count.sections,
      requiredSections: required,
      acknowledgedSections: acknowledged,
      percentage: required === 0 ? 100 : Math.round((acknowledged / required) * 100),
      dueDate: a.dueDate,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
      isOverdue: a.dueDate && !a.completedAt && a.dueDate < now,
    };
  });

  return NextResponse.json({ data, meta: { page, pageSize, total } });
}
