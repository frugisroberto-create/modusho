import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: {
      id: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const hasAccess = await checkAccess(session.user.id, "HOD", content.propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  // HOD: deve essere autore o in target audience
  if (session.user.role === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(session.user.id, content.propertyId);
    const isInTarget = content.targetAudience.some((t) => {
      if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
      if (t.targetType === "ROLE" && t.targetRole === "HOD") return true;
      if (t.targetType === "USER" && t.targetUserId === session.user.id) return true;
      if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
      return false;
    });
    if (!isInTarget && content.createdById !== session.user.id) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  }

  const revisions = await prisma.contentRevision.findMany({
    where: { contentId: id },
    select: {
      id: true, previousTitle: true, previousBody: true,
      newTitle: true, newBody: true, note: true, status: true, createdAt: true,
      revisedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: revisions });
}
