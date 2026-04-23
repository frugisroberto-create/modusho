import webpush from "web-push";
import { prisma } from "./prisma";
import { createNotifications } from "./notifications";

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

// ─── Funzione generale: push + notifica per contenuto pubblicato ────

/**
 * Invia push notification E crea notifica in-app per un contenuto appena pubblicato.
 * Best-effort: errori non bloccano il flusso.
 */
export async function sendContentPublishedPush(params: {
  contentId: string;
  contentTitle: string;
  contentType: string;
  actorId: string;
  isRepublication?: boolean;
}) {
  const { contentId, contentTitle, contentType, actorId, isRepublication } = params;

  try {
    const targetUserIds = await resolveTargetUserIds(contentId, actorId);
    if (targetUserIds.length === 0) return;

    const config = CONTENT_TYPE_CONFIG[contentType];
    const route = config?.route || "/sop";
    const url = contentType === "MEMO" ? "/comunicazioni" : `${route}/${contentId}`;

    const body = isRepublication
      ? `Aggiornamento ${config?.label || "contenuto"}: ${contentTitle}`
      : contentType === "BRAND_BOOK" || contentType === "STANDARD_BOOK"
        ? `Aggiornamento ${config?.label}: ${contentTitle}`
        : `Nuovo ${config?.label || "contenuto"}: ${contentTitle}`;

    // Notifica in-app per tutti i destinatari + chi pubblica (come conferma)
    const notifRecipients = targetUserIds.includes(actorId)
      ? targetUserIds
      : [...targetUserIds, actorId];

    await createNotifications(
      notifRecipients.map((uid) => ({
        userId: uid,
        type: "CONTENT_PUBLISHED" as const,
        title: "ModusHO",
        body,
        url,
      }))
    );

    // Push notification (escluso chi pubblica — ha appena fatto l'azione)
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: targetUserIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return;

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

// ─── Push + notifica per attività workflow RACI ─────────────────────

const ROLE_LABEL: Record<string, string> = {
  OPERATOR: "Operatore",
  HOD: "Resp. reparto",
  HOTEL_MANAGER: "Hotel Manager",
  ADMIN: "HOO",
  SUPER_ADMIN: "HOO",
};

const EVENT_TO_NOTIF_TYPE = {
  TEXT_SAVED: "TEXT_SAVED",
  NOTE_ADDED: "NOTE_ADDED",
  SUBMITTED: "SUBMITTED",
} as const;

export async function sendWorkflowActivityPush(params: {
  workflowId: string;
  contentCode: string | null;
  contentTitle: string;
  actorName: string;
  actorRole: string;
  actorId: string;
  eventType: "TEXT_SAVED" | "NOTE_ADDED" | "SUBMITTED";
}) {
  const { workflowId, contentCode, contentTitle, actorName, actorRole, actorId, eventType } = params;

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

    const roleTag = ROLE_LABEL[actorRole] || actorRole;
    const who = `${roleTag} ${actorName}`;
    const label = contentCode ? `${contentCode} — ${contentTitle}` : contentTitle;
    const body = eventType === "TEXT_SAVED"
      ? `${who} ha aggiornato la bozza della procedura ${label}`
      : eventType === "SUBMITTED"
      ? `${who} ha inviato per revisione la procedura ${label}`
      : `${who} ha aggiunto una nota sulla procedura ${label}`;

    const url = `/sop-workflow/${workflowId}`;

    // Notifica in-app (indipendente dalla push subscription)
    await createNotifications(
      recipientIds.map((uid) => ({
        userId: uid,
        type: EVENT_TO_NOTIF_TYPE[eventType],
        title: "ModusHO",
        body,
        url,
      }))
    );

    // Push notification (solo se VAPID configurato e subscription presente)
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipientIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true },
    });
    if (subscriptions.length === 0) {
      console.warn(`[push] workflow ${eventType}: ${recipientIds.length} recipients but 0 push subscriptions`);
      return;
    }

    const payload = JSON.stringify({
      title: "ModusHO",
      body,
      data: { workflowId, url },
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

// ─── Wrapper SOP (mantiene compatibilita' Fase 1) ───────────────────

export async function sendSopPublishedPush(params: {
  contentId: string;
  contentTitle: string;
  actorId: string;
  isRepublication: boolean;
  requiresNewAcknowledgment: boolean;
}) {
  if (params.isRepublication && !params.requiresNewAcknowledgment) return;

  return sendContentPublishedPush({
    contentId: params.contentId,
    contentTitle: params.contentTitle,
    contentType: "SOP",
    actorId: params.actorId,
    isRepublication: params.isRepublication,
  });
}

// ─── Risoluzione destinatari (basata su ContentTarget) ──────────────

async function resolveTargetUserIds(contentId: string, excludeUserId: string): Promise<string[]> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: {
      propertyId: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) return [];

  const targets = content.targetAudience;

  // Se non ci sono target definiti, fallback a tutti gli utenti della property
  if (targets.length === 0) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: excludeUserId },
        propertyAssignments: { some: { propertyId: content.propertyId } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // Espandi i target in user IDs
  const userIds = new Set<string>();

  for (const t of targets) {
    if (t.targetType === "USER" && t.targetUserId) {
      const user = await prisma.user.findUnique({
        where: { id: t.targetUserId },
        select: { id: true, isActive: true },
      });
      if (user?.isActive) userIds.add(user.id);
    } else if (t.targetType === "ROLE" && t.targetRole) {
      const users = await prisma.user.findMany({
        where: {
          role: t.targetRole as "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "ADMIN" | "SUPER_ADMIN",
          isActive: true,
          propertyAssignments: { some: { propertyId: content.propertyId } },
        },
        select: { id: true },
      });
      users.forEach((u) => userIds.add(u.id));
    } else if (t.targetType === "DEPARTMENT" && t.targetDepartmentId) {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          propertyAssignments: { some: { departmentId: t.targetDepartmentId } },
        },
        select: { id: true },
      });
      users.forEach((u) => userIds.add(u.id));
    }
  }

  // Escludi chi ha pubblicato
  userIds.delete(excludeUserId);
  return [...userIds];
}
