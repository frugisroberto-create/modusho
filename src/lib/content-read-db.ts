/**
 * La lettura di un contenuto (SOP, documento, memo): chi è destinatario ai fini
 * della lettura, e lo scrittore unico della presa visione dei non-SOP.
 *
 * Operatori e capi reparto registrano una lettura solo sui contenuti che sono
 * rivolti a loro: un reparto soltanto visibile dà la consultazione, non
 * l'obbligo né la registrazione. La regola è quella della home e della pagina
 * Memo (`isContentRecipient`, sui reparti operativi). Gli altri ruoli restano
 * come erano.
 */

import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getOperativeDepartmentIds, isContentRecipient, type ContentVisibilityInput } from "./rbac";
import { readingRequiresRecipient } from "./sop-read";

export async function isReadingRecipient(
  user: { id: string; role: Role },
  content: { propertyId: string; targetAudience: ContentVisibilityInput["targetAudience"] }
): Promise<boolean> {
  if (!readingRequiresRecipient(user.role)) return true;
  const operative = await getOperativeDepartmentIds(user.id, content.propertyId);
  return isContentRecipient(user, operative, content.targetAudience);
}

/**
 * Registra la lettura di un documento o memo. Idempotente: la prima lettura
 * resta quella registrata. Forma identica a quella che scriveva la rotta.
 */
export async function recordContentRead({ contentId, userId }: { contentId: string; userId: string }) {
  return prisma.contentAcknowledgment.upsert({
    where: { contentId_userId: { contentId, userId } },
    update: {},
    create: { contentId, userId, required: true },
  });
}
