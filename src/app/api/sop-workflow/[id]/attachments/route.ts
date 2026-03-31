import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageAttachments, canViewAttachments, isInvolved } from "@/lib/sop-workflow";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Lista allegati della bozza SOP.
 * Visibili solo a R/C/A durante IN_LAVORAZIONE.
 * Dopo PUBBLICATA, gli allegati sono pubblici (esposti dalla route Content standard).
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

  // Durante IN_LAVORAZIONE, R/C/A oppure ADMIN/SUPER_ADMIN vedono gli allegati
  const userRole = session.user.role;
  if (wf.sopStatus === "IN_LAVORAZIONE") {
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !canViewAttachments(userId, wf)) {
      return NextResponse.json({ error: "Non hai accesso agli allegati di questa bozza" }, { status: 403 });
    }
  }

  const attachments = await prisma.attachment.findMany({
    where: { contentId: wf.contentId },
    select: {
      id: true,
      kind: true,
      originalFileName: true,
      mimeType: true,
      fileSize: true,
      storageKey: true,
      storageBucket: true,
      sortOrder: true,
      isInline: true,
      caption: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ data: attachments });
}

/**
 * POST: Aggiungi allegato alla bozza SOP.
 * Solo R puo' gestire gli allegati durante IN_LAVORAZIONE.
 */
const addAttachmentSchema = z.object({
  kind: z.enum(["IMAGE", "DOCUMENT"]),
  originalFileName: z.string().min(1),
  storedFileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  storageKey: z.string().min(1),
  storageBucket: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isInline: z.boolean().default(false),
  caption: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = addAttachmentSchema.safeParse(body);
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

  const postUserRole = session.user.role;
  if (postUserRole !== "SUPER_ADMIN" && postUserRole !== "ADMIN" && !canManageAttachments(userId, wf)) {
    return NextResponse.json({ error: "Solo il responsabile (R) puo' gestire gli allegati" }, { status: 403 });
  }

  const [attachment] = await prisma.$transaction([
    prisma.attachment.create({
      data: {
        contentId: wf.contentId,
        contentType: "SOP",
        kind: parsed.data.kind,
        originalFileName: parsed.data.originalFileName,
        storedFileName: parsed.data.storedFileName,
        mimeType: parsed.data.mimeType,
        fileSize: parsed.data.fileSize,
        storageKey: parsed.data.storageKey,
        storageBucket: parsed.data.storageBucket,
        sortOrder: parsed.data.sortOrder,
        isInline: parsed.data.isInline,
        caption: parsed.data.caption ?? null,
        uploadedById: userId,
      },
      select: {
        id: true,
        kind: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        storageKey: true,
        sortOrder: true,
        createdAt: true,
      },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "ATTACHMENT_ADDED",
        actorId: userId,
        metadata: { fileName: parsed.data.originalFileName },
      },
    }),
  ]);

  return NextResponse.json({ data: attachment }, { status: 201 });
}

/**
 * DELETE: Rimuovi allegato dalla bozza SOP.
 * Solo R puo' rimuovere allegati durante IN_LAVORAZIONE.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const { attachmentId } = await request.json();
  if (!attachmentId || typeof attachmentId !== "string") {
    return NextResponse.json({ error: "attachmentId richiesto" }, { status: 400 });
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

  const delUserRole = session.user.role;
  if (delUserRole !== "SUPER_ADMIN" && delUserRole !== "ADMIN" && !canManageAttachments(userId, wf)) {
    return NextResponse.json({ error: "Solo il responsabile (R) puo' gestire gli allegati" }, { status: 403 });
  }

  // Verifica che l'allegato appartenga a questa SOP
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, contentId: wf.contentId },
    select: { id: true, originalFileName: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: attachmentId } }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "ATTACHMENT_REMOVED",
        actorId: userId,
        metadata: { fileName: attachment.originalFileName },
      },
    }),
  ]);

  return NextResponse.json({ data: { deleted: true } });
}
