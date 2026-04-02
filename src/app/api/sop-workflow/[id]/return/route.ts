import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReturn } from "@/lib/sop-workflow";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const returnSchema = z.object({
  note: z.string().min(1, "La nota e' obbligatoria per la restituzione"),
});

/**
 * POST: Restituzione della bozza da parte di A.
 * - Solo A puo' restituire
 * - Solo quando submittedToA = true
 * - Nota obbligatoria
 * - Spegne il flag verso A
 * - La bozza resta la stessa, R riprende il lavoro
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { note } = parsed.data;

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
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !canReturn(userId, wfInfo)) {
    return NextResponse.json({
      error: "Solo A (da REVIEW_ADMIN) o C/HM (da REVIEW_HM) possono restituire",
    }, { status: 403 });
  }

  const previousStatus = wf.content.status;

  // Determine which flags to clear based on who returns
  const isReturnFromHM = previousStatus === "REVIEW_HM";
  const flagUpdate: Record<string, unknown> = isReturnFromHM
    ? { submittedToC: false, submittedToCAt: null, submittedToCById: null,
        submittedToA: false, submittedToAAt: null, submittedToAById: null }
    : { submittedToA: false, submittedToAAt: null, submittedToAById: null };

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: flagUpdate,
    }),
    // Content.status → RETURNED (visivamente distinto da DRAFT)
    prisma.content.update({
      where: { id: wf.contentId },
      data: { status: "RETURNED", updatedById: userId },
    }),
    // Evento workflow con nota obbligatoria
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "RETURNED_BY_A",
        actorId: userId,
        note,
      },
    }),
    // ContentStatusHistory: track the real transition
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: previousStatus,
        toStatus: "RETURNED",
        changedById: userId,
        note: `Restituita: ${note}`,
      },
    }),
    // Nota nel contenuto (ContentNote) per tracciabilita' completa
    prisma.contentNote.create({
      data: {
        contentId: wf.contentId,
        authorId: userId,
        body: `[Restituzione] ${note}`,
      },
    }),
  ]);

  return NextResponse.json({
    data: { returned: true },
  });
}
