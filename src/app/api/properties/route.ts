import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds } from "@/lib/rbac";
import { z } from "zod/v4";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const propertyIds = await getAccessiblePropertyIds(session.user.id);

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, isActive: true },
    include: {
      departments: { select: { id: true, name: true, code: true }, orderBy: { name: "asc" } },
      _count: { select: { contents: true } },
    },
    orderBy: { name: "asc" },
  });

  // Per HOD: filtra i department ai soli assegnati (perimetro).
  // HM/ADMIN/SUPER_ADMIN vedono tutti i department della property.
  const userRole = session.user.role;
  const needsDeptFilter = userRole === "HOD" || userRole === "OPERATOR";

  // Enrich with KPI
  const data = await Promise.all(
    properties.map(async (p) => {
      // Department filtering per perimetro utente
      let departments = p.departments;
      if (needsDeptFilter) {
        const accessibleDeptIds = await getAccessibleDepartmentIds(session.user.id, p.id);
        departments = p.departments.filter(d => accessibleDeptIds.includes(d.id));
      }

      const [sopTotal, sopPublished, ackCount, publishedCount] = await Promise.all([
        prisma.content.count({ where: { propertyId: p.id, type: "SOP" } }),
        prisma.content.count({ where: { propertyId: p.id, type: "SOP", status: "PUBLISHED" } }),
        prisma.contentAcknowledgment.count({ where: { content: { propertyId: p.id, status: "PUBLISHED" } } }),
        prisma.content.count({ where: { propertyId: p.id, status: "PUBLISHED" } }),
      ]);
      const operatorCount = await prisma.user.count({
        where: { role: "OPERATOR", isActive: true, propertyAssignments: { some: { propertyId: p.id } } },
      });
      const expectedAcks = publishedCount * operatorCount;
      return {
        id: p.id, name: p.name, code: p.code, tagline: p.tagline, city: p.city,
        address: p.address, description: p.description, website: p.website,
        departments,
        sopTotal, sopPublished,
        ackRate: expectedAcks > 0 ? Math.round((ackCount / expectedAcks) * 100) : null,
      };
    })
  );

  return NextResponse.json({ data });
}

const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  tagline: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  address: z.string().max(300).optional(),
  description: z.string().optional(),
  website: z.string().max(200).optional(),
  departmentCodes: z.array(z.object({ name: z.string(), code: z.string() })).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createPropertySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });

  const { name, tagline, city, address, description, website, departmentCodes } = parsed.data;

  // Auto-genera codice sequenziale HO{N}
  const allCodes = await prisma.property.findMany({
    select: { code: true },
    where: { code: { startsWith: "HO" } },
  });
  const maxNum = allCodes.reduce((max, p) => {
    const num = parseInt(p.code.replace("HO", ""), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const code = `HO${maxNum + 1}`;

  const property = await prisma.property.create({
    data: { name, code, tagline, city, address, description, website },
  });

  // Create departments
  const depts = departmentCodes ?? [
    { name: "Front Office", code: "FO" }, { name: "Room Division", code: "RM" },
    { name: "F&B", code: "FB" }, { name: "Maintenance", code: "MT" },
    { name: "Spa/Wellness", code: "SP" }, { name: "Back of House", code: "QA" },
  ];
  for (const d of depts) {
    await prisma.department.create({ data: { name: d.name, code: d.code, propertyId: property.id } });
  }

  // Auto-assign the new property to the creator (full access — no specific department)
  await prisma.propertyAssignment.create({
    data: { userId: session.user.id, propertyId: property.id, departmentId: null },
  });

  return NextResponse.json({ data: { id: property.id } }, { status: 201 });
}
