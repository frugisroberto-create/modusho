import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

const ROLE_HIERARCHY: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4,
};

const complianceQuerySchema = z.object({
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  type: z.enum(["SOP", "DOCUMENT", "MEMO"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userRole = session.user.role;
  const userId = session.user.id;

  // Minimum role: HOD
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = complianceQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { propertyId, departmentId, type, page, pageSize } = parsed.data;

  // RBAC: get accessible property IDs
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

  // Build base where clause
  const where: Record<string, unknown> = {
    isDeleted: false,
    status: "PUBLISHED",
    propertyId: { in: filteredPropertyIds },
    targetAudience: { some: {} }, // must have at least one ContentTarget
  };

  // Brand Book e Standard Book sono documenti di consultazione, non soggetti
  // a presa visione obbligatoria — esclusi dalla compliance.
  if (type) {
    where.type = type;
  } else {
    where.type = { in: ["SOP", "DOCUMENT", "MEMO"] };
  }
  if (departmentId) where.departmentId = departmentId;

  // HOD: only their own content
  if (userRole === "HOD") {
    where.createdById = userId;
  }

  // Fetch all matching published contents with their targets and acknowledgments
  const contents = await prisma.content.findMany({
    where,
    select: {
      id: true,
      code: true,
      type: true,
      title: true,
      propertyId: true,
      department: { select: { id: true, name: true, code: true } },
      property: { select: { id: true, name: true, code: true } },
      targetAudience: {
        select: {
          id: true,
          targetType: true,
          targetRole: true,
          targetDepartmentId: true,
          targetUserId: true,
          targetUser: { select: { id: true, isActive: true } },
        },
      },
      acknowledgments: {
        select: { userId: true },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  // For each content, compute targetCount and ackedCount
  // We need to expand targets into user sets, then count unique users
  // Cache property users per property to avoid repeated queries
  const propertyUserCache: Record<string, {
    operators: string[];
    hods: string[];
    hms: string[];
  }> = {};

  const departmentUserCache: Record<string, string[]> = {};

  async function getUsersForProperty(pid: string) {
    if (!propertyUserCache[pid]) {
      const [operators, hods, hms] = await Promise.all([
        prisma.user.findMany({
          where: {
            role: "OPERATOR",
            isActive: true,
            propertyAssignments: { some: { propertyId: pid } },
          },
          select: { id: true },
        }),
        prisma.user.findMany({
          where: {
            role: "HOD",
            isActive: true,
            propertyAssignments: { some: { propertyId: pid } },
          },
          select: { id: true },
        }),
        prisma.user.findMany({
          where: {
            role: "HOTEL_MANAGER",
            isActive: true,
            propertyAssignments: { some: { propertyId: pid } },
          },
          select: { id: true },
        }),
      ]);
      propertyUserCache[pid] = {
        operators: operators.map((u) => u.id),
        hods: hods.map((u) => u.id),
        hms: hms.map((u) => u.id),
      };
    }
    return propertyUserCache[pid];
  }

  async function getUsersForDepartment(deptId: string): Promise<string[]> {
    if (!departmentUserCache[deptId]) {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["OPERATOR", "HOD"] },
          propertyAssignments: { some: { departmentId: deptId } },
        },
        select: { id: true },
      });
      departmentUserCache[deptId] = users.map((u) => u.id);
    }
    return departmentUserCache[deptId];
  }

  // Process each content item
  const results: {
    id: string;
    code: string | null;
    type: string;
    title: string;
    department: { id: string; name: string; code: string } | null;
    property: { id: string; name: string; code: string };
    targetCount: number;
    ackedCount: number;
  }[] = [];

  for (const content of contents) {
    const targetUserIds = new Set<string>();

    for (const target of content.targetAudience) {
      if (target.targetType === "ROLE") {
        const propertyUsers = await getUsersForProperty(content.propertyId);
        if (target.targetRole === "OPERATOR") {
          for (const uid of propertyUsers.operators) targetUserIds.add(uid);
        } else if (target.targetRole === "HOD") {
          for (const uid of propertyUsers.hods) targetUserIds.add(uid);
        } else if (target.targetRole === "HOTEL_MANAGER") {
          for (const uid of propertyUsers.hms) targetUserIds.add(uid);
        }
      } else if (target.targetType === "DEPARTMENT" && target.targetDepartmentId) {
        const deptUsers = await getUsersForDepartment(target.targetDepartmentId);
        for (const uid of deptUsers) targetUserIds.add(uid);
      } else if (target.targetType === "USER" && target.targetUserId) {
        if (target.targetUser?.isActive) {
          targetUserIds.add(target.targetUserId);
        }
      }
    }

    const targetCount = targetUserIds.size;
    if (targetCount === 0) continue; // skip content with no resolvable targets

    // Count acknowledgments among target users
    const ackedCount = content.acknowledgments.filter((ack) =>
      targetUserIds.has(ack.userId)
    ).length;

    // Only include content where not all targets have acknowledged
    if (ackedCount >= targetCount) continue;

    results.push({
      id: content.id,
      code: content.code,
      type: content.type,
      title: content.title,
      department: content.department,
      property: content.property,
      targetCount,
      ackedCount,
    });
  }

  // Paginate results
  const total = results.length;
  const paginated = results.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    data: paginated,
    meta: { page, pageSize, total },
  });
}
