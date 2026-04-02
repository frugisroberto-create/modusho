import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInvolved } from "@/lib/sop-workflow";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Storico versioni del testo della bozza SOP.
 * Visibile solo a R/C/A (i lettori finali non vedono lo storico bozze).
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

  // R/C/A oppure ADMIN/SUPER_ADMIN possono vedere lo storico versioni
  const userRole = session.user.role;
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !isInvolved(userId, wfInfo)) {
    return NextResponse.json({ error: "Non hai accesso allo storico di questa bozza" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

  const [versions, total] = await Promise.all([
    prisma.sopTextVersion.findMany({
      where: { sopWorkflowId: wf.id },
      select: {
        id: true,
        versionNumber: true,
        title: true,
        body: true,
        createdAt: true,
        savedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { versionNumber: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sopTextVersion.count({ where: { sopWorkflowId: wf.id } }),
  ]);

  return NextResponse.json({ data: versions, meta: { page, pageSize, total } });
}
