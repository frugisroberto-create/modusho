import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string; noteId: string }> };

const IN_LAVORAZIONE_STATUSES = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"] as const;

function canManageNote(role: string, isAuthor: boolean, contentStatus: string): boolean {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (!isAuthor) return false;
  return (IN_LAVORAZIONE_STATUSES as readonly string[]).includes(contentStatus);
}

const updateSchema = z.object({ body: z.string().min(1) });

/**
 * PUT: Modifica una nota.
 * - L'autore puo' modificare solo se la SOP e' in lavorazione.
 * - ADMIN/SUPER_ADMIN possono modificare qualsiasi nota in qualsiasi stato.
 * - Non modificabile se la nota e' gia' eliminata.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: workflowId, noteId } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const reqBody = await request.json();
  const parsed = updateSchema.safeParse(reqBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id: workflowId },
    select: { contentId: true, content: { select: { status: true } } },
  });
  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const note = await prisma.contentNote.findUnique({
    where: { id: noteId },
    select: { id: true, contentId: true, authorId: true, isDeleted: true },
  });
  if (!note || note.contentId !== wf.contentId) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }
  if (note.isDeleted) {
    return NextResponse.json({ error: "Nota eliminata" }, { status: 409 });
  }

  if (!canManageNote(role, note.authorId === userId, wf.content.status)) {
    return NextResponse.json({ error: "Non puoi modificare questa nota" }, { status: 403 });
  }

  const updated = await prisma.contentNote.update({
    where: { id: noteId },
    data: { body: parsed.data.body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true, role: true } },
    },
  });

  return NextResponse.json({ data: updated });
}

/**
 * DELETE: Soft delete di una nota.
 * - L'autore puo' eliminare solo se la SOP e' in lavorazione.
 * - ADMIN/SUPER_ADMIN possono eliminare qualsiasi nota in qualsiasi stato.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: workflowId, noteId } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id: workflowId },
    select: { contentId: true, content: { select: { status: true } } },
  });
  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const note = await prisma.contentNote.findUnique({
    where: { id: noteId },
    select: { id: true, contentId: true, authorId: true, isDeleted: true },
  });
  if (!note || note.contentId !== wf.contentId) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }
  if (note.isDeleted) {
    return NextResponse.json({ error: "Nota gia' eliminata" }, { status: 409 });
  }

  if (!canManageNote(role, note.authorId === userId, wf.content.status)) {
    return NextResponse.json({ error: "Non puoi eliminare questa nota" }, { status: 403 });
  }

  await prisma.contentNote.update({
    where: { id: noteId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return NextResponse.json({ data: { success: true } });
}
