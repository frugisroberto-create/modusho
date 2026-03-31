import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Riapre una SOP pubblicata per modifica.
 *
 * - Solo HM, ADMIN, SUPER_ADMIN possono riaprire
 * - La SOP torna IN_LAVORAZIONE
 * - I flag di sottoposizione vengono resettati
 * - La conferma consultazione viene resettata
 * - Solo HOO potra' ri-approvare e ri-pubblicare
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non hai permessi per questa azione" }, { status: 403 });
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
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  if (wf.sopStatus !== "PUBBLICATA") {
    return NextResponse.json({ error: "Solo le SOP pubblicate possono essere riaperte" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction([
    // Riporta il workflow a IN_LAVORAZIONE
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: {
        sopStatus: "IN_LAVORAZIONE",
        submittedToC: false,
        submittedToCAt: null,
        submittedToCById: null,
        submittedToA: false,
        submittedToAAt: null,
        submittedToAById: null,
        consultedConfirmedAt: null,
        consultedConfirmedById: null,
        consultedConfirmedVersion: null,
        consultedConfirmedNote: null,
        lastSavedAt: now,
        lastSavedById: userId,
      },
    }),
    // Content torna a DRAFT
    prisma.content.update({
      where: { id: wf.contentId },
      data: {
        status: "DRAFT",
        updatedById: userId,
      },
    }),
    // Evento workflow
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "DRAFT_CREATED",
        actorId: userId,
        metadata: { reason: "Riaperta per modifica dopo pubblicazione" },
      },
    }),
    // Status history
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: "PUBLISHED",
        toStatus: "DRAFT",
        changedById: userId,
        note: "Riaperta per modifica",
      },
    }),
  ]);

  return NextResponse.json({ data: { reopened: true } });
}
