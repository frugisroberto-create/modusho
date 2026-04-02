import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModifyReviewDueDate, calculateReviewDueDate } from "@/lib/sop-workflow";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const updateReviewDueDateSchema = z.object({
  reviewDueDate: z.string().datetime().optional(),
  reviewDueMonths: z.number().int().min(1).max(60).optional(),
});

/**
 * PUT: Modifica la review due date.
 * Solo A puo' modificarla.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = updateReviewDueDateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  if (!parsed.data.reviewDueDate && !parsed.data.reviewDueMonths) {
    return NextResponse.json({ error: "Specificare reviewDueDate o reviewDueMonths" }, { status: 400 });
  }

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
      reviewDueDate: true,
      reviewDueMonths: true,
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

  if (!canModifyReviewDueDate(userId, wfInfo)) {
    return NextResponse.json({ error: "Solo A puo' modificare la scadenza di revisione" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {
    reviewDueDateSetById: userId,
  };

  if (parsed.data.reviewDueDate) {
    updateData.reviewDueDate = new Date(parsed.data.reviewDueDate);
  }

  if (parsed.data.reviewDueMonths) {
    updateData.reviewDueMonths = parsed.data.reviewDueMonths;
    // Se la SOP e' gia' pubblicata, ricalcola la due date
    if (wf.content.status === "PUBLISHED" && !parsed.data.reviewDueDate) {
      const baseDate = wf.reviewDueDate
        ? new Date(new Date().getTime()) // da oggi
        : new Date();
      updateData.reviewDueDate = calculateReviewDueDate(baseDate, parsed.data.reviewDueMonths);
    }
  }

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: updateData,
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "REVIEW_DUE_DATE_CHANGED",
        actorId: userId,
        metadata: {
          previousDueDate: wf.reviewDueDate?.toISOString() ?? null,
          newDueDate: (updateData.reviewDueDate as Date)?.toISOString() ?? null,
          reviewDueMonths: parsed.data.reviewDueMonths ?? wf.reviewDueMonths,
        },
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      reviewDueDate: updateData.reviewDueDate ?? wf.reviewDueDate,
      reviewDueMonths: updateData.reviewDueMonths ?? wf.reviewDueMonths,
    },
  });
}
