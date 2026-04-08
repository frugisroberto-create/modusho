import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const raciSchema = z.object({
  responsibleId: z.string().min(1),
  consultedId: z.string().nullable().optional(),
  accountableId: z.string().min(1),
});

/**
 * PUT: Riassegna i ruoli RACI di una bozza in lavorazione.
 *
 * - Solo HM/ADMIN/SUPER_ADMIN possono riassegnare
 * - La SOP deve essere in lavorazione (DRAFT/REVIEW_HM/RETURNED)
 * - Non si può riassegnare se sottoposta a HOO (REVIEW_ADMIN)
 * - Cambiare R o C resetta i flag submittedToC e la conferma di consultazione
 * - Tutti gli utenti devono essere assegnati alla property della SOP
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo HM/HOO può riassegnare i ruoli RACI" }, { status: 403 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = raciSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { responsibleId, consultedId, accountableId } = parsed.data;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
      content: { select: { status: true, propertyId: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // RBAC: l'utente deve avere accesso alla property della SOP
  const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", wf.content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Non hai accesso a questa struttura" }, { status: 403 });
  }

  // Status check: solo bozze in lavorazione (escluso REVIEW_ADMIN)
  const allowedStatuses = ["DRAFT", "REVIEW_HM", "RETURNED"];
  if (!allowedStatuses.includes(wf.content.status)) {
    return NextResponse.json({
      error: "Riassegnazione consentita solo su bozze in lavorazione (non in revisione finale)",
    }, { status: 400 });
  }

  // Verifica che gli utenti esistano e siano assegnati alla property
  const userIds = [responsibleId, accountableId];
  if (consultedId) userIds.push(consultedId);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, role: true, name: true },
  });

  if (users.length !== userIds.length) {
    return NextResponse.json({ error: "Uno o più utenti non sono validi o attivi" }, { status: 400 });
  }

  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId: { in: userIds }, propertyId: wf.content.propertyId },
    select: { userId: true },
  });

  const assignedIds = new Set(assignments.map(a => a.userId));
  const notAssigned = userIds.filter(uid => !assignedIds.has(uid));
  if (notAssigned.length > 0) {
    return NextResponse.json({
      error: "Uno o più utenti non sono assegnati a questa struttura",
    }, { status: 400 });
  }

  // Determina se R o C sono cambiati (per resettare la consultazione)
  const responsibleChanged = wf.responsibleId !== responsibleId;
  const consultedChanged = wf.consultedId !== (consultedId ?? null);
  const shouldResetConsultation = responsibleChanged || consultedChanged;

  // Update + event
  const updateData: Record<string, unknown> = {
    responsibleId,
    consultedId: consultedId ?? null,
    accountableId,
  };

  if (shouldResetConsultation) {
    updateData.submittedToC = false;
    updateData.submittedToCAt = null;
    updateData.submittedToCById = null;
    updateData.consultedConfirmedAt = null;
    updateData.consultedConfirmedById = null;
    updateData.consultedConfirmedVersion = null;
    updateData.consultedConfirmedNote = null;
  }

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: updateData,
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "DRAFT_CREATED",
        actorId: userId,
        note: "Riassegnazione ruoli RACI",
        metadata: {
          action: "raci-reassign",
          previous: {
            responsibleId: wf.responsibleId,
            consultedId: wf.consultedId,
            accountableId: wf.accountableId,
          },
          new: { responsibleId, consultedId: consultedId ?? null, accountableId },
        },
      },
    }),
  ]);

  return NextResponse.json({ data: { reassigned: true } });
}
