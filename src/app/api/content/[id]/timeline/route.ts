import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";

interface TimelineEvent {
  id: string;
  type: "STATUS_CHANGE" | "REVISION" | "NOTE";
  createdAt: Date;
  author: { id: string; name: string; role: string };
  data: Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { id } = await params;
  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: {
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

  const [statusHistory, revisions, notes] = await Promise.all([
    prisma.contentStatusHistory.findMany({
      where: { contentId: id },
      include: { changedBy: { select: { id: true, name: true, role: true } } },
    }),
    prisma.contentRevision.findMany({
      where: { contentId: id },
      include: { revisedBy: { select: { id: true, name: true, role: true } } },
    }),
    prisma.contentNote.findMany({
      where: { contentId: id },
      include: { author: { select: { id: true, name: true, role: true } } },
    }),
  ]);

  const timeline: TimelineEvent[] = [
    ...statusHistory.map((sh) => ({
      id: sh.id,
      type: "STATUS_CHANGE" as const,
      createdAt: sh.changedAt,
      author: sh.changedBy,
      data: { fromStatus: sh.fromStatus, toStatus: sh.toStatus, note: sh.note },
    })),
    ...revisions.map((rev) => ({
      id: rev.id,
      type: "REVISION" as const,
      createdAt: rev.createdAt,
      author: rev.revisedBy,
      data: { previousTitle: rev.previousTitle, newTitle: rev.newTitle, note: rev.note, status: rev.status },
    })),
    ...notes.map((n) => ({
      id: n.id,
      type: "NOTE" as const,
      createdAt: n.createdAt,
      author: n.author,
      data: { body: n.body },
    })),
  ];

  timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ data: timeline });
}
