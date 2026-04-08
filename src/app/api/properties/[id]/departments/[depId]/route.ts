import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

const updateDeptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(10).transform(s => s.toUpperCase()).optional(),
});

// Verify the department belongs to the property in the URL AND that the user
// has ADMIN-level access to that property. Returns the propertyId on success
// or a NextResponse on failure.
async function authorizeDeptScope(userId: string, propertyId: string, depId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: depId },
    select: { propertyId: true },
  });
  if (!dept || dept.propertyId !== propertyId) {
    return NextResponse.json({ error: "Reparto non trovato" }, { status: 404 });
  }
  const hasAccess = await checkAccess(userId, "ADMIN", propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id: propertyId, depId } = await params;
  const denied = await authorizeDeptScope(session.user.id, propertyId, depId);
  if (denied) return denied;

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

  const { id: propertyId, depId } = await params;
  const denied = await authorizeDeptScope(session.user.id, propertyId, depId);
  if (denied) return denied;

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
