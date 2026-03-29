import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;
  const depts = await prisma.department.findMany({
    where: { propertyId: id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: depts });
}

const createDeptSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(10).transform(s => s.toUpperCase()).optional(),
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

  const { id: propertyId } = await params;
  const body = await request.json();
  const parsed = createDeptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { name, code } = parsed.data;
  const deptCode = code ?? name.substring(0, 3).toUpperCase();

  const existing = await prisma.department.findFirst({ where: { propertyId, name } });
  if (existing) return NextResponse.json({ error: "Reparto già esistente per questa struttura" }, { status: 409 });

  const dept = await prisma.department.create({
    data: { name, code: deptCode, propertyId },
  });

  return NextResponse.json({ data: dept }, { status: 201 });
}
