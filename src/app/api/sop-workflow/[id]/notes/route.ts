import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAddNote, canViewDraft, isInvolved } from "@/lib/sop-workflow";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Lista note della bozza SOP.
 * Visibili solo a R/C/A.
 * Le note della bozza NON sono visibili ai lettori finali della SOP pubblicata.
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
      contentId: true,
      sopStatus: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // R/C/A oppure ADMIN/SUPER_ADMIN possono vedere le note della bozza
  const userRole = session.user.role;
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !isInvolved(userId, wf)) {
    return NextResponse.json({ error: "Non hai accesso alle note di questa bozza" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

  const [notes, total] = await Promise.all([
    prisma.contentNote.findMany({
      where: { contentId: wf.contentId },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentNote.count({ where: { contentId: wf.contentId } }),
  ]);

  return NextResponse.json({ data: notes, meta: { page, pageSize, total } });
}

/**
 * POST: Aggiungi nota alla bozza SOP.
 * Solo R/C/A possono aggiungere note, solo se IN_LAVORAZIONE.
 */
const createNoteSchema = z.object({
  body: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const reqBody = await request.json();
  const parsed = createNoteSchema.safeParse(reqBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      contentId: true,
      sopStatus: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const noteUserRole = session.user.role;
  if (noteUserRole !== "SUPER_ADMIN" && noteUserRole !== "ADMIN" && !canAddNote(userId, wf)) {
    return NextResponse.json({ error: "Non puoi aggiungere note a questa bozza" }, { status: 403 });
  }

  const [note] = await prisma.$transaction([
    prisma.contentNote.create({
      data: {
        contentId: wf.contentId,
        authorId: userId,
        body: parsed.data.body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "NOTE_ADDED",
        actorId: userId,
      },
    }),
  ]);

  return NextResponse.json({ data: note }, { status: 201 });
}
