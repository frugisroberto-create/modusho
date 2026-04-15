import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSubmit, isInvolved } from "@/lib/sop-workflow";
import { sendWorkflowActivityPush } from "@/lib/push-notification";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const submitSchema = z.object({
  target: z.enum(["C", "A", "C_AND_A"]),
});

/**
 * POST: Sottoponi la bozza a C e/o A.
 * Solo R puo' sottoporre.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { target } = parsed.data;

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
      contentId: true,
      content: { select: { id: true, status: true, code: true, title: true } },
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

  if (!canSubmit(userId, wfInfo)) {
    return NextResponse.json({ error: "Solo il responsabile (R) puo' sottoporre la bozza" }, { status: 403 });
  }

  // Se target include C ma non esiste C nel workflow
  if ((target === "C" || target === "C_AND_A") && !wf.consultedId) {
    return NextResponse.json({ error: "Nessun soggetto C nel workflow" }, { status: 400 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};
  let eventType: "SUBMITTED_TO_C" | "SUBMITTED_TO_A" | "SUBMITTED_TO_C_AND_A";

  // Determine the new Content.status based on submit target
  // C = HM (REVIEW_HM), A = HOO (REVIEW_ADMIN), C_AND_A = first step is HM (REVIEW_HM)
  let newContentStatus: "REVIEW_HM" | "REVIEW_ADMIN";

  if (target === "C") {
    updateData.submittedToC = true;
    updateData.submittedToCAt = now;
    updateData.submittedToCById = userId;
    eventType = "SUBMITTED_TO_C";
    newContentStatus = "REVIEW_HM";
  } else if (target === "A") {
    updateData.submittedToA = true;
    updateData.submittedToAAt = now;
    updateData.submittedToAById = userId;
    eventType = "SUBMITTED_TO_A";
    newContentStatus = "REVIEW_ADMIN";
  } else {
    updateData.submittedToC = true;
    updateData.submittedToCAt = now;
    updateData.submittedToCById = userId;
    updateData.submittedToA = true;
    updateData.submittedToAAt = now;
    updateData.submittedToAById = userId;
    eventType = "SUBMITTED_TO_C_AND_A";
    newContentStatus = "REVIEW_HM";
  }

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: updateData,
    }),
    // Update Content.status to reflect the review state
    prisma.content.update({
      where: { id: wf.content.id },
      data: { status: newContentStatus },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType,
        actorId: userId,
      },
    }),
    // ContentStatusHistory: track the real transition
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.content.id,
        fromStatus: wf.content.status,
        toStatus: newContentStatus,
        changedById: userId,
        note: target === "C" ? "Sottoposta a Hotel Manager" :
              target === "A" ? "Sottoposta per approvazione finale" :
              "Sottoposta a Hotel Manager e HOO",
      },
    }),
  ]);

  // Push notification ai soggetti C/A (escluso R che invia) — best-effort
  await sendWorkflowActivityPush({
    workflowId: wf.id,
    contentCode: wf.content.code ?? null,
    contentTitle: wf.content.title,
    actorName: session.user.name,
    actorId: userId,
    eventType: "SUBMITTED",
  }).catch((err) => { console.error("[push] SUBMITTED error:", err); });

  return NextResponse.json({
    data: { submitted: target, at: now, contentStatus: newContentStatus },
  });
}
