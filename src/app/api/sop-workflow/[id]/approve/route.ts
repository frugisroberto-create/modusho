import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApprove, calculateReviewDueDate } from "@/lib/sop-workflow";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Approvazione finale da A.
 * - Solo A puo' approvare
 * - Solo quando submittedToA = true
 * - Approvazione = pubblicazione (non esiste passaggio separato)
 * - Imposta reviewDueDate
 * - Il documento esce dal ciclo di lavorazione
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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
      reviewDueMonths: true,
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const userRole = session.user.role;
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !canApprove(userId, wf)) {
    return NextResponse.json({
      error: "Solo A puo' approvare, e solo quando la bozza e' sottoposta ad A",
    }, { status: 403 });
  }

  const now = new Date();
  const reviewDueDate = calculateReviewDueDate(now, wf.reviewDueMonths);

  await prisma.$transaction([
    // 1. SopWorkflow → PUBBLICATA
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: {
        sopStatus: "PUBBLICATA",
        submittedToC: false,
        submittedToCAt: null,
        submittedToCById: null,
        submittedToA: false,
        submittedToAAt: null,
        submittedToAById: null,
        reviewDueDate,
        reviewDueDateSetById: userId,
      },
    }),
    // 2. Content → PUBLISHED
    prisma.content.update({
      where: { id: wf.contentId },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        updatedById: userId,
      },
    }),
    // 3. ContentStatusHistory
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: "DRAFT",
        toStatus: "PUBLISHED",
        changedById: userId,
        note: "Approvazione finale e pubblicazione",
      },
    }),
    // 4. Evento APPROVED
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "APPROVED",
        actorId: userId,
      },
    }),
    // 5. Evento PUBLISHED
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "PUBLISHED",
        actorId: userId,
        metadata: { reviewDueDate: reviewDueDate.toISOString() },
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      approved: true,
      published: true,
      sopStatus: "PUBBLICATA",
      reviewDueDate,
    },
  });
}
