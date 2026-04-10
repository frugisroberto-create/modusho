import { NextResponse } from "next/server";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:tech@hocollection.it";

// Soglia: contenuti pubblicati da più di 24 ore senza ack completo
const REMINDER_THRESHOLD_HOURS = 24;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * GET /api/cron/ack-reminder
 *
 * Cron job giornaliero (Vercel Cron). Per ogni utente che ha contenuti
 * PUBLISHED da >24h nel proprio perimetro non ancora confermati,
 * invia una push notification aggregata:
 *   "Hai N contenuti da prendere visione che attendono la tua conferma
 *    da più di 24 ore."
 *
 * Sicurezza: protetto da CRON_SECRET per evitare invocazioni esterne.
 */
export async function GET(request: Request) {
  // Verifica CRON_SECRET (Vercel lo inietta automaticamente per i cron)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }

  const threshold = new Date(Date.now() - REMINDER_THRESHOLD_HOURS * 60 * 60 * 1000);

  try {
    // 1. Trova tutti i contenuti PUBLISHED (SOP, DOCUMENT, MEMO) pubblicati
    //    da più di 24h, non eliminati, con almeno un ContentTarget.
    const contents = await prisma.content.findMany({
      where: {
        isDeleted: false,
        status: "PUBLISHED",
        type: { in: ["SOP", "DOCUMENT", "MEMO"] },
        publishedAt: { lt: threshold },
        targetAudience: { some: {} },
      },
      select: {
        id: true,
        propertyId: true,
        targetAudience: {
          select: {
            targetType: true,
            targetRole: true,
            targetDepartmentId: true,
            targetUserId: true,
          },
        },
        acknowledgments: {
          select: { userId: true },
        },
      },
    });

    // 2. Per ogni contenuto, espandi i target a utenti reali e trova chi non ha ack'd.
    //    Accumula per userId: quanti contenuti sono in ritardo.
    const userPendingCount = new Map<string, number>();

    for (const content of contents) {
      const ackedUserIds = new Set(content.acknowledgments.map(a => a.userId));
      const targetUserIds = await expandTargets(content.targetAudience, content.propertyId);

      for (const userId of targetUserIds) {
        if (!ackedUserIds.has(userId)) {
          userPendingCount.set(userId, (userPendingCount.get(userId) ?? 0) + 1);
        }
      }
    }

    if (userPendingCount.size === 0) {
      return NextResponse.json({ sent: 0, message: "Nessun utente in ritardo" });
    }

    // 3. Per ogni utente con pendenze, trova le PushSubscription e invia.
    const userIds = [...userPendingCount.keys()];
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });

    let sent = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const count = userPendingCount.get(sub.userId) ?? 0;
        if (count === 0) return;

        const body = count === 1
          ? "Hai 1 contenuto da prendere visione che attende la tua conferma da più di 24 ore."
          : `Hai ${count} contenuti da prendere visione che attendono la tua conferma da più di 24 ore.`;

        const payload = JSON.stringify({
          title: "ModusHO",
          body,
          data: { url: "/" },
        });

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

    sent = results.filter(r => r.status === "fulfilled").length;
    failed = results.filter(r => r.status === "rejected").length;

    console.log(`[ack-reminder] ${sent} push sent, ${failed} failed, ${userPendingCount.size} users with pending acks`);

    return NextResponse.json({ sent, failed, usersWithPending: userPendingCount.size });
  } catch (err) {
    console.error("[ack-reminder] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── Target expansion (same logic as /api/compliance) ────────────────

interface TargetInput {
  targetType: string;
  targetRole: string | null;
  targetDepartmentId: string | null;
  targetUserId: string | null;
}

const propertyUserCache = new Map<string, string[]>();
const deptUserCache = new Map<string, string[]>();

async function expandTargets(targets: TargetInput[], propertyId: string): Promise<Set<string>> {
  const userIds = new Set<string>();

  for (const t of targets) {
    if (t.targetType === "USER" && t.targetUserId) {
      const user = await prisma.user.findUnique({
        where: { id: t.targetUserId },
        select: { isActive: true },
      });
      if (user?.isActive) userIds.add(t.targetUserId);
    } else if (t.targetType === "ROLE" && t.targetRole) {
      const cacheKey = `${propertyId}:${t.targetRole}`;
      if (!propertyUserCache.has(cacheKey)) {
        const users = await prisma.user.findMany({
          where: {
            role: t.targetRole as "OPERATOR" | "HOD",
            isActive: true,
            propertyAssignments: { some: { propertyId } },
          },
          select: { id: true },
        });
        propertyUserCache.set(cacheKey, users.map(u => u.id));
      }
      for (const id of propertyUserCache.get(cacheKey)!) userIds.add(id);
    } else if (t.targetType === "DEPARTMENT" && t.targetDepartmentId) {
      if (!deptUserCache.has(t.targetDepartmentId)) {
        const users = await prisma.user.findMany({
          where: {
            role: { in: ["OPERATOR", "HOD"] },
            isActive: true,
            propertyAssignments: { some: { departmentId: t.targetDepartmentId } },
          },
          select: { id: true },
        });
        deptUserCache.set(t.targetDepartmentId, users.map(u => u.id));
      }
      for (const id of deptUserCache.get(t.targetDepartmentId)!) userIds.add(id);
    }
  }

  return userIds;
}
