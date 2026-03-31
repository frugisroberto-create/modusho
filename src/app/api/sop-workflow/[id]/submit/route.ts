import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSubmit, isInvolved } from "@/lib/sop-workflow";
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
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  if (!canSubmit(userId, wf)) {
    return NextResponse.json({ error: "Solo il responsabile (R) puo' sottoporre la bozza" }, { status: 403 });
  }

  // Se target include C ma non esiste C nel workflow
  if ((target === "C" || target === "C_AND_A") && !wf.consultedId) {
    return NextResponse.json({ error: "Nessun soggetto C nel workflow" }, { status: 400 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};
  let eventType: "SUBMITTED_TO_C" | "SUBMITTED_TO_A" | "SUBMITTED_TO_C_AND_A";

  if (target === "C") {
    updateData.submittedToC = true;
    updateData.submittedToCAt = now;
    updateData.submittedToCById = userId;
    eventType = "SUBMITTED_TO_C";
  } else if (target === "A") {
    updateData.submittedToA = true;
    updateData.submittedToAAt = now;
    updateData.submittedToAById = userId;
    eventType = "SUBMITTED_TO_A";
  } else {
    updateData.submittedToC = true;
    updateData.submittedToCAt = now;
    updateData.submittedToCById = userId;
    updateData.submittedToA = true;
    updateData.submittedToAAt = now;
    updateData.submittedToAById = userId;
    eventType = "SUBMITTED_TO_C_AND_A";
  }

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: updateData,
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType,
        actorId: userId,
      },
    }),
  ]);

  return NextResponse.json({
    data: { submitted: target, at: now },
  });
}
