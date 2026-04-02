import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { assignmentId } = await params;

  const assignment = await prisma.propertyAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, propertyId: true },
  });
  if (!assignment) return NextResponse.json({ error: "Assegnazione non trovata" }, { status: 404 });

  // ADMIN: verifica che l'assignment appartenga a una property assegnata
  if (session.user.role === "ADMIN") {
    const hasAccess = await prisma.propertyAssignment.findFirst({
      where: { userId: session.user.id, propertyId: assignment.propertyId },
    });
    if (!hasAccess) {
      return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
    }
  }

  await prisma.propertyAssignment.delete({ where: { id: assignmentId } });

  return NextResponse.json({ data: { success: true } });
}
