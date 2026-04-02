import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInvolved } from "@/lib/sop-workflow";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Workflow event log per la SOP.
 * Visibile solo a R/C/A.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      sopStatus: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
      content: { select: { status: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const wfInfo = {
    contentStatus: wf.content.status,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  const userRole = session.user.role;
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !isInvolved(userId, wfInfo)) {
    return NextResponse.json({ error: "Non hai accesso agli eventi di questa SOP" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "30", 10)));

  const [events, total] = await Promise.all([
    prisma.sopWorkflowEvent.findMany({
      where: { sopWorkflowId: wf.id },
      select: {
        id: true,
        eventType: true,
        note: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sopWorkflowEvent.count({ where: { sopWorkflowId: wf.id } }),
  ]);

  return NextResponse.json({ data: events, meta: { page, pageSize, total } });
}
