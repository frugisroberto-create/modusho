import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string; noteId: string }> };

const IN_LAVORAZIONE_STATUSES = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"] as const;

function canManageNote(role: string, isAuthor: boolean, contentStatus: string): boolean {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (!isAuthor) return false;
  return (IN_LAVORAZIONE_STATUSES as readonly string[]).includes(contentStatus);
}

const updateSchema = z.object({ body: z.string().min(1).max(5000) });

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { id: contentId, noteId } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const reqBody = await request.json();
  const parsed = updateSchema.safeParse(reqBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Testo obbligatorio (max 5000 caratteri)" }, { status: 400 });
  }

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      status: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const canAccess = await canUserAccessContent(userId, role, content);
  if (!canAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const note = await prisma.contentNote.findUnique({
    where: { id: noteId },
    select: { id: true, contentId: true, authorId: true, isDeleted: true },
  });
  if (!note || note.contentId !== contentId) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }
  if (note.isDeleted) {
    return NextResponse.json({ error: "Nota eliminata" }, { status: 409 });
  }

  if (!canManageNote(role, note.authorId === userId, content.status)) {
    return NextResponse.json({ error: "Non puoi modificare questa nota" }, { status: 403 });
  }

  const updated = await prisma.contentNote.update({
    where: { id: noteId },
    data: { body: parsed.data.body.trim() },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const { id: contentId, noteId } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      status: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });
  if (!content) return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });

  const canAccess = await canUserAccessContent(userId, role, content);
  if (!canAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const note = await prisma.contentNote.findUnique({
    where: { id: noteId },
    select: { id: true, contentId: true, authorId: true, isDeleted: true },
  });
  if (!note || note.contentId !== contentId) {
    return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
  }
  if (note.isDeleted) {
    return NextResponse.json({ error: "Nota gia' eliminata" }, { status: 409 });
  }

  if (!canManageNote(role, note.authorId === userId, content.status)) {
    return NextResponse.json({ error: "Non puoi eliminare questa nota" }, { status: 403 });
  }

  await prisma.contentNote.update({
    where: { id: noteId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return NextResponse.json({ data: { success: true } });
}
