/**
 * CHI PUÒ VEDERE UN ALLEGATO — in un posto solo.
 *
 * Gli allegati non hanno permessi propri: ereditano quelli del contenuto a cui
 * appartengono. La regola stava dentro la rotta che genera l'indirizzo firmato;
 * con l'arrivo della vista a schermo le rotte diventano due, e una regola
 * scritta due volte è una regola che prima o poi diverge.
 *
 * Questo file non decide niente di nuovo: carica l'allegato, applica le stesse
 * verifiche di sempre e restituisce un esito che la rotta traduce in risposta.
 */

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";

export interface AccessibleAttachment {
  id: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  kind: string;
  contentId: string;
}

export type AttachmentAccess =
  | { ok: true; attachment: AccessibleAttachment }
  | { ok: false; status: number; error: string };

/** Un allegato che non si può vedere non esiste: 404, non 403. */
const NOT_FOUND = { ok: false as const, status: 404, error: "Allegato non trovato" };

export async function loadAccessibleAttachment(
  attachmentId: string,
  user: { id: string; role: Role }
): Promise<AttachmentAccess> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      storageKey: true,
      originalFileName: true,
      mimeType: true,
      kind: true,
      contentId: true,
      content: {
        select: {
          id: true,
          status: true,
          propertyId: true,
          departmentId: true,
          createdById: true,
          isDeleted: true,
          targetAudience: {
            select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
          },
        },
      },
    },
  });

  if (!attachment) return NOT_FOUND;

  const content = attachment.content;
  if (content.isDeleted) {
    return { ok: false, status: 404, error: "Contenuto non disponibile" };
  }

  // Un contenuto non ancora pubblicato non esiste per gli operatori. Per i
  // ruoli che lavorano alla bozza decide il perimetro, qui sotto.
  if (content.status !== "PUBLISHED" && user.role === "OPERATOR") return NOT_FOUND;

  const hasAccess = await canUserAccessContent(user.id, user.role, {
    propertyId: content.propertyId,
    createdById: content.createdById,
    targetAudience: content.targetAudience,
  });
  if (!hasAccess) return NOT_FOUND;

  const { content: _content, ...rest } = attachment;
  return { ok: true, attachment: rest };
}
