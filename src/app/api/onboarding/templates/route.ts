import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessiblePropertyIds } from "@/lib/rbac";
import { z } from "zod/v4";

// ─── GET: lista template per property ────────────────────────────────

const querySchema = z.object({
  propertyId: z.string(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
  }

  const { propertyId } = parsed.data;

  // RBAC: HM+ con accesso alla property
  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const templates = await prisma.onboardingTemplate.findMany({
    where: { propertyId },
    include: {
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { sections: true } },
      updatedBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Also fetch all departments for this property (to show which ones don't have templates)
  const departments = await prisma.department.findMany({
    where: { propertyId },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: {
      templates: templates.map((t) => ({
        id: t.id,
        propertyId: t.propertyId,
        departmentId: t.departmentId,
        department: t.department,
        isActive: t.isActive,
        sectionCount: t._count.sections,
        updatedBy: t.updatedBy,
        updatedAt: t.updatedAt,
      })),
      departments,
    },
  });
}

// ─── POST: crea template ─────────────────────────────────────────────

const createSchema = z.object({
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { propertyId, departmentId } = parsed.data;

  // RBAC: HM+ con accesso alla property
  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Verifica unicita (findFirst because Prisma composite unique doesn't support null)
  const existing = await prisma.onboardingTemplate.findFirst({
    where: { propertyId, departmentId: departmentId ?? null },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Esiste gia un template per questo reparto", existingId: existing.id },
      { status: 409 }
    );
  }

  const template = await prisma.onboardingTemplate.create({
    data: {
      propertyId,
      departmentId: departmentId ?? null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  return NextResponse.json({ data: { id: template.id } }, { status: 201 });
}
