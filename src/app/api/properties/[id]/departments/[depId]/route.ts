import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const updateDeptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(10).transform(s => s.toUpperCase()).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { depId } = await params;
  const body = await request.json();
  const parsed = updateDeptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  await prisma.department.update({ where: { id: depId }, data: parsed.data });
  return NextResponse.json({ data: { success: true } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { depId } = await params;

  // Check if department has associated content
  const contentCount = await prisma.content.count({ where: { departmentId: depId } });
  if (contentCount > 0) {
    return NextResponse.json(
      { error: `Impossibile eliminare: ${contentCount} contenuti associati a questo reparto` },
      { status: 409 }
    );
  }

  await prisma.department.delete({ where: { id: depId } });
  return NextResponse.json({ data: { success: true } });
}
