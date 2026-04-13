import webpush from "web-push";
import { prisma } from "./prisma";

// Configura VAPID
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:tech@hocollection.it";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ─── Tipo contenuto → messaggio + route consultativa ─────────────────

const CONTENT_TYPE_CONFIG: Record<string, { label: string; route: string }> = {
  SOP: { label: "procedura", route: "/sop" },
  DOCUMENT: { label: "documento", route: "/documents" },
  MEMO: { label: "memo", route: "/comunicazioni" },
  BRAND_BOOK: { label: "Brand Book", route: "/brand-book" },
  STANDARD_BOOK: { label: "Standard Book", route: "/standard-book" },
};

// ─── Funzione generale: push per contenuto pubblicato ────────────────

/**
 * Invia push notification per un contenuto appena pubblicato.
 * Best-effort: errori push non bloccano il flusso.
 */
export async function sendContentPublishedPush(params: {
  contentId: string;
  contentTitle: string;
  contentType: string;
  actorId: string;
  isRepublication?: boolean;
}) {
  const { contentId, contentTitle, contentType, actorId, isRepublication } = params;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured, skipping push");
    return;
  }

  try {
    const targetUserIds = await resolveTargetUserIds(contentId, actorId);
    if (targetUserIds.length === 0) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: targetUserIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return;

    const config = CONTENT_TYPE_CONFIG[contentType];
    const route = config?.route || "/sop";
    // Per memo il deep link va alla lista (non c'è pagina singola operator separata)
    const url = contentType === "MEMO" ? "/comunicazioni" : `${route}/${contentId}`;

    const body = isRepublication
      ? `Aggiornamento ${config?.label || "contenuto"}: ${contentTitle}`
      : contentType === "BRAND_BOOK" || contentType === "STANDARD_BOOK"
        ? `Aggiornamento ${config?.label}: ${contentTitle}`
        : `Nuovo ${config?.label || "contenuto"}: ${contentTitle}`;

    const payload = JSON.stringify({
      title: "ModusHO",
      body,
      data: { contentId, type: contentType, url },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
          throw err;
        }
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (sent > 0 || failed > 0) {
      console.log(`[push] ${contentType} "${contentTitle}": ${sent} sent, ${failed} failed`);
    }
  } catch (err) {
    console.error(`[push] Error sending ${contentType} push:`, err);
  }
}

// ─── Push per attività workflow RACI (bozza salvata, nota aggiunta) ──

/**
 * Invia push ai soggetti R/C/A di un SopWorkflow quando qualcuno
 * salva una nuova versione della bozza, aggiunge una nota, o invia
 * la SOP per revisione/approvazione.
 *
 * Esclude l'autore dell'azione (actorId) — non ti notifico di quello
 * che hai fatto tu.
 */
export async function sendWorkflowActivityPush(params: {
  workflowId: string;
  contentCode: string | null;
  contentTitle: string;
  actorName: string;
  actorId: string;
  eventType: "TEXT_SAVED" | "NOTE_ADDED" | "SUBMITTED";
}) {
  const { workflowId, contentCode, contentTitle, actorName, actorId, eventType } = params;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const wf = await prisma.sopWorkflow.findUnique({
      where: { id: workflowId },
      select: { responsibleId: true, consultedId: true, accountableId: true },
    });
    if (!wf) {
      console.warn(`[push] workflow ${eventType}: workflow ${workflowId} not found`);
      return;
    }

    console.log(`[push] workflow ${eventType}: R=${wf.responsibleId}, C=${wf.consultedId}, A=${wf.accountableId}, actor=${actorId}`);

    // Destinatari: R + C + A, escluso chi ha fatto l'azione
    const recipientIds = [wf.responsibleId, wf.consultedId, wf.accountableId]
      .filter((id): id is string => id !== null && id !== actorId);

    if (recipientIds.length === 0) {
      console.warn(`[push] workflow ${eventType}: no recipients after filtering actor`);
      return;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipientIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true },
    });
    if (subscriptions.length === 0) {
      console.warn(`[push] workflow ${eventType}: ${recipientIds.length} recipients but 0 push subscriptions found for userIds: ${recipientIds.join(", ")}`);
      return;
    }

    const label = contentCode ? `${contentCode} — ${contentTitle}` : contentTitle;
    const body = eventType === "TEXT_SAVED"
      ? `${label}: nuova versione salvata da ${actorName}`
      : eventType === "SUBMITTED"
      ? `${label}: inviata per revisione da ${actorName}`
      : `${label}: nuova nota da ${actorName}`;

    const payload = JSON.stringify({
      title: "ModusHO",
      body,
      data: { url: `/sop-workflow/${workflowId}` },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
          throw err;
        }
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (sent > 0 || failed > 0) {
      console.log(`[push] workflow ${eventType} "${label}": ${sent} sent, ${failed} failed`);
    }
  } catch (err) {
    console.error(`[push] Error sending workflow ${eventType} push:`, err);
  }
}

// ─── Wrapper SOP (mantiene compatibilità Fase 1) ─────────────────────

/**
 * Invia push per SOP pubblicata.
 * Wrapper che gestisce la logica requiresNewAcknowledgment specifica delle SOP.
 */
export async function sendSopPublishedPush(params: {
  contentId: string;
  contentTitle: string;
  actorId: string;
  isRepublication: boolean;
  requiresNewAcknowledgment: boolean;
}) {
  // Ripubblicazione senza nuova conferma → nessuna push
  if (params.isRepublication && !params.requiresNewAcknowledgment) return;

  return sendContentPublishedPush({
    contentId: params.contentId,
    contentTitle: params.contentTitle,
    contentType: "SOP",
    actorId: params.actorId,
    isRepublication: params.isRepublication,
  });
}

// ─── Risoluzione destinatari ─────────────────────────────────────────

async function resolveTargetUserIds(contentId: string, excludeUserId: string): Promise<string[]> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: { propertyId: true, departmentId: true },
  });

  if (!content) return [];

  // Tutti gli utenti attivi della property (tutti i ruoli), escluso chi pubblica
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: excludeUserId },
      propertyAssignments: {
        some: {
          propertyId: content.propertyId,
          ...(content.departmentId
            ? { OR: [{ departmentId: content.departmentId }, { departmentId: null }] }
            : {}),
        },
      },
    },
    select: { id: true },
  });

  return users.map((u) => u.id);
}
