import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

interface RouteParams { params: Promise<{ id: string }> }

// GET /api/content/[id]/targets
// Restituisce i reparti assegnati a una sezione Standard Book
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, type: true, propertyId: true },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const targets = await prisma.contentTarget.findMany({
    where: { contentId: id },
    select: {
      id: true,
      targetType: true,
      targetRole: true,
      targetDepartmentId: true,
      targetDepartment: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const allDepartments = targets.some(t => t.targetType === "ROLE");
  const departments = targets
    .filter(t => t.targetType === "DEPARTMENT" && t.targetDepartment)
    .map(t => t.targetDepartment!);

  return NextResponse.json({ data: { allDepartments, departments } });
}

const putSchema = z.object({
  allDepartments: z.boolean(),
  departmentIds: z.array(z.string()).default([]),
});

// PUT /api/content/[id]/targets
// Sostituisce i target di reparto. Solo ADMIN e SUPER_ADMIN.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { role } = session.user;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, type: true, propertyId: true },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { allDepartments, departmentIds } = parsed.data;

  // Se allDepartments=true, verifica che i deptIds non vengano inviati insieme
  // (allDepartments ha precedenza)

  // Verifica che i departmentIds appartengano alla property del contenuto
  if (!allDepartments && departmentIds.length > 0) {
    const validDepts = await prisma.department.findMany({
      where: { id: { in: departmentIds }, propertyId: content.propertyId },
      select: { id: true },
    });
    const validIds = new Set(validDepts.map(d => d.id));
    const invalidIds = departmentIds.filter(id => !validIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Reparti non validi per questa struttura" }, { status: 400 });
    }
  }

  // Transazione: elimina tutti i target esistenti e ricrea
  await prisma.$transaction(async (tx) => {
    await tx.contentTarget.deleteMany({ where: { contentId: id } });

    if (allDepartments) {
      // Target "tutti i reparti": un record ROLE → OPERATOR
      await tx.contentTarget.create({
        data: {
          contentId: id,
          targetType: "ROLE",
          targetRole: "OPERATOR",
        },
      });
    } else if (departmentIds.length > 0) {
      // Target per reparti specifici
      await tx.contentTarget.createMany({
        data: departmentIds.map(deptId => ({
          contentId: id,
          targetType: "DEPARTMENT",
          targetDepartmentId: deptId,
        })),
      });
    }
    // Se departmentIds=[] e allDepartments=false → nessun target (sezione nascosta a tutti)
  });

  return NextResponse.json({ data: { ok: true } });
}
