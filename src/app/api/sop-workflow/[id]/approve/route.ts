import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApprove, calculateReviewDueDate } from "@/lib/sop-workflow";
import { checkAccess } from "@/lib/rbac";
import { sendSopPublishedPush } from "@/lib/push-notification";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const approveBodySchema = z.object({
  requiresNewAcknowledgment: z.boolean().optional(),
});

/**
 * POST: Approvazione finale / pubblicazione diretta.
 * - ADMIN/SUPER_ADMIN possono pubblicare in qualsiasi fase
 * - A puo' approvare quando submittedToA = true
 * - Se la SOP era gia' pubblicata in precedenza, accetta requiresNewAcknowledgment
 * - Imposta reviewDueDate
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const reqBody = await request.json().catch(() => ({}));
  const parsed = approveBodySchema.safeParse(reqBody);
  const requiresNewAcknowledgment = parsed.success ? parsed.data.requiresNewAcknowledgment : undefined;

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
      content: { select: { status: true, propertyId: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const userRole = session.user.role;

  // RBAC: l'utente deve avere accesso alla property della SOP
  // (anche ADMIN con assegnazioni specifiche, non solo SUPER_ADMIN)
  const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", wf.content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({
      error: "Non hai accesso a questa struttura",
    }, { status: 403 });
  }

  const wfInfo = {
    contentStatus: wf.content.status,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  // La SOP deve essere in uno stato di lavorazione (non già pubblicata/archiviata)
  const draftStatuses = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  if (!draftStatuses.includes(wf.content.status)) {
    return NextResponse.json({
      error: "La SOP non è in stato di lavorazione",
    }, { status: 400 });
  }

  // Pubblicazione finale: HM/ADMIN/SUPER_ADMIN con flag canApprove possono
  // pubblicare direttamente (bypass del workflow). In alternativa, l'utente
  // assegnato come A nel RACI può approvare quando submittedToA è true.
  // Nota: il check di property scope sopra (checkAccess HOTEL_MANAGER) garantisce
  // che HM non possa pubblicare SOP di property a cui non è assegnato.
  const userCanApprove = session.user.canApprove && (
    userRole === "HOTEL_MANAGER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN"
  );
  if (!userCanApprove && !canApprove(userId, wfInfo)) {
    return NextResponse.json({
      error: "Non hai permessi per approvare questa SOP",
    }, { status: 403 });
  }

  // Determina se e' una ripubblicazione (la SOP era gia' stata pubblicata in passato)
  const content = await prisma.content.findUnique({
    where: { id: wf.contentId },
    select: { publishedAt: true, version: true, title: true, status: true },
  });
  const isRepublication = content?.publishedAt !== null;

  const now = new Date();
  const reviewDueDate = calculateReviewDueDate(now, wf.reviewDueMonths);

  // Decidi il flag requiresNewAcknowledgment:
  // - prima pubblicazione: sempre true (gli operatori devono confermare)
  // - ripubblicazione: usa il valore fornito dal client, default true
  const newAckFlag = isRepublication
    ? (requiresNewAcknowledgment ?? true)
    : true;

  // Se ripubblicazione con requiresNewAck=true, incrementa version per invalidare i SopViewRecord precedenti
  // e pulisci i ContentAcknowledgment legacy per coerenza con "pending reads"
  const shouldIncrementVersion = isRepublication && newAckFlag;

  await prisma.$transaction(async (tx) => {
    // 1. SopWorkflow → PUBBLICATA
    await tx.sopWorkflow.update({
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
        requiresNewAcknowledgment: newAckFlag,
      },
    });
    // 2. Content → PUBLISHED (incrementa version se serve nuova conferma)
    await tx.content.update({
      where: { id: wf.contentId },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        updatedById: userId,
        ...(shouldIncrementVersion ? { version: { increment: 1 } } : {}),
      },
    });
    // 3. ContentStatusHistory
    await tx.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: content?.status ?? "DRAFT",
        toStatus: "PUBLISHED",
        changedById: userId,
        note: isRepublication
          ? `Nuova versione pubblicata — ${newAckFlag ? "richiede nuova conferma" : "conferma precedente mantenuta"}`
          : "Approvazione finale e pubblicazione",
      },
    });
    // 4. Evento APPROVED
    await tx.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "APPROVED",
        actorId: userId,
      },
    });
    // 5. Evento PUBLISHED
    await tx.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "PUBLISHED",
        actorId: userId,
        metadata: {
          reviewDueDate: reviewDueDate.toISOString(),
          isRepublication,
          requiresNewAcknowledgment: newAckFlag,
        },
      },
    });
    // 6. Se ripubblicazione con nuova conferma, pulisci acknowledgment e view record
    if (shouldIncrementVersion) {
      await tx.contentAcknowledgment.deleteMany({
        where: { contentId: wf.contentId },
      });
      // Reset anche i SopViewRecord delle versioni precedenti con acknowledgment
      // così gli operatori risultano correttamente "da confermare" nella nuova versione
      await tx.sopViewRecord.deleteMany({
        where: { contentId: wf.contentId },
      });
    }
  });

  // Push notification best-effort — dopo la transazione, non bloccante
  sendSopPublishedPush({
    contentId: wf.contentId,
    contentTitle: content?.title || "",
    actorId: userId,
    isRepublication,
    requiresNewAcknowledgment: newAckFlag,
  }).catch(() => {});

  return NextResponse.json({
    data: {
      approved: true,
      published: true,
      sopStatus: "PUBBLICATA",
      reviewDueDate,
      isRepublication,
      requiresNewAcknowledgment: newAckFlag,
    },
  });
}
