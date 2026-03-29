import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;
  const hasAccess = await checkAccess(session.user.id, "OPERATOR", id);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      departments: { orderBy: { name: "asc" } },
    },
  });

  if (!property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 });

  // KPI
  const deptStats = await Promise.all(
    property.departments.map(async (d) => {
      const [sopTotal, sopPublished] = await Promise.all([
        prisma.content.count({ where: { propertyId: id, departmentId: d.id, type: "SOP" } }),
        prisma.content.count({ where: { propertyId: id, departmentId: d.id, type: "SOP", status: "PUBLISHED" } }),
      ]);
      return { ...d, sopTotal, sopPublished };
    })
  );

  const operators = await prisma.user.findMany({
    where: { isActive: true, propertyAssignments: { some: { propertyId: id } } },
    select: {
      id: true, name: true, email: true, role: true,
      propertyAssignments: {
        where: { propertyId: id },
        include: { department: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: {
      ...property,
      departments: deptStats,
      operators,
    },
  });
}

const updatePropertySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tagline: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100).optional(),
  address: z.string().max(300).nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updatePropertySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 });

  await prisma.property.update({ where: { id }, data: parsed.data });

  return NextResponse.json({ data: { id, success: true } });
}
