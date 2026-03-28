import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const assignmentSchema = z.object({
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = await request.json();
  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { propertyId, departmentId } = parsed.data;

  // Verifica che utente e property esistano
  const [user, property] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.property.findUnique({ where: { id: propertyId } }),
  ]);

  if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  if (!property) return NextResponse.json({ error: "Property non trovata" }, { status: 404 });

  // Check duplicato
  const existing = await prisma.propertyAssignment.findFirst({
    where: { userId, propertyId, departmentId: departmentId || null },
  });
  if (existing) return NextResponse.json({ error: "Assegnazione già esistente" }, { status: 409 });

  const assignment = await prisma.propertyAssignment.create({
    data: { userId, propertyId, departmentId: departmentId || null },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ data: assignment }, { status: 201 });
}
