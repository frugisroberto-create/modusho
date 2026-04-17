import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Crea notifiche in-app in bulk. Best-effort: errori loggati ma mai propagati.
 */
export async function createNotifications(
  entries: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    url?: string;
  }>
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.notification.createMany({ data: entries });
  } catch (err) {
    console.error("[notifications] Error creating notifications:", err);
  }
}
