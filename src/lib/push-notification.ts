import webpush from "web-push";
import { prisma } from "./prisma";

// Configura VAPID
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:tech@hocollection.it";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * Invia push notification per una SOP appena pubblicata.
 * Best-effort: errori push non bloccano il flusso.
 */
export async function sendSopPublishedPush(params: {
  contentId: string;
  contentTitle: string;
  actorId: string;
  isRepublication: boolean;
  requiresNewAcknowledgment: boolean;
}) {
  const { contentId, contentTitle, actorId, isRepublication, requiresNewAcknowledgment } = params;

  // Solo prima pubblicazione o ripubblicazione con nuova conferma
  if (isRepublication && !requiresNewAcknowledgment) return;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured, skipping push");
    return;
  }

  try {
    // Risolvi destinatari dai ContentTarget
    const targetUserIds = await resolveTargetUserIds(contentId, actorId);

    if (targetUserIds.length === 0) return;

    // Recupera tutte le subscription valide
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: targetUserIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: "ModusHO",
      body: isRepublication
        ? `Aggiornamento procedura: ${contentTitle}`
        : `Nuova procedura: ${contentTitle}`,
      data: {
        contentId,
        type: "SOP",
        url: `/sop/${contentId}`,
      },
    });

    // Invio best-effort parallelo
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          // Cleanup subscription scadute
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
      console.log(`[push] SOP "${contentTitle}": ${sent} sent, ${failed} failed`);
    }
  } catch (err) {
    console.error("[push] Error sending SOP push:", err);
    // Best-effort: non propagare l'errore
  }
}

/**
 * Risolvi gli userId destinatari della SOP, escluso l'attore.
 */
async function resolveTargetUserIds(contentId: string, excludeUserId: string): Promise<string[]> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: {
      propertyId: true,
      departmentId: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) return [];

  const targets = content.targetAudience;
  const userIds = new Set<string>();

  if (targets.length === 0) {
    // Nessun ContentTarget definito → nessuna notifica push.
    // Una SOP senza destinatari espliciti è una configurazione incompleta.
    console.warn(`[push] SOP ${contentId}: nessun ContentTarget definito, push non inviata`);
    return [];
  } else {
    // Per target type
    for (const target of targets) {
      if (target.targetType === "USER" && target.targetUserId) {
        userIds.add(target.targetUserId);
      }

      if (target.targetType === "DEPARTMENT" && target.targetDepartmentId) {
        const users = await prisma.user.findMany({
          where: {
            isActive: true,
            propertyAssignments: {
              some: {
                propertyId: content.propertyId,
                OR: [{ departmentId: target.targetDepartmentId }, { departmentId: null }],
              },
            },
          },
          select: { id: true },
        });
        users.forEach((u) => userIds.add(u.id));
      }

      if (target.targetType === "ROLE" && target.targetRole) {
        const users = await prisma.user.findMany({
          where: {
            isActive: true,
            role: target.targetRole as never,
            propertyAssignments: { some: { propertyId: content.propertyId } },
          },
          select: { id: true },
        });
        users.forEach((u) => userIds.add(u.id));
      }
    }
  }

  // Escludi l'attore
  userIds.delete(excludeUserId);

  return Array.from(userIds);
}
