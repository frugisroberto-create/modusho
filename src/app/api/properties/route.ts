import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
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

  // Enrich with KPI
  const data = await Promise.all(
    properties.map(async (p) => {
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
        address: p.address, description: p.description, website: p.website, logoUrl: p.logoUrl,
        departments: p.departments,
        sopTotal, sopPublished,
        ackRate: expectedAcks > 0 ? Math.round((ackCount / expectedAcks) * 100) : null,
      };
    })
  );

  return NextResponse.json({ data });
}

const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(5).transform(s => s.toUpperCase()),
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

  const { name, code, tagline, city, address, description, website, departmentCodes } = parsed.data;

  const existing = await prisma.property.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: "Codice già in uso" }, { status: 409 });

  const property = await prisma.property.create({
    data: { name, code, tagline, city, address, description, website },
  });

  // Create departments
  const depts = departmentCodes ?? [
    { name: "Front Office", code: "FO" }, { name: "Housekeeping", code: "HK" },
    { name: "F&B", code: "FB" }, { name: "Maintenance", code: "MNT" },
    { name: "Spa/Wellness", code: "SPA" }, { name: "Administration", code: "ADM" },
  ];
  for (const d of depts) {
    await prisma.department.create({ data: { name: d.name, code: d.code, propertyId: property.id } });
  }

  return NextResponse.json({ data: { id: property.id } }, { status: 201 });
}
