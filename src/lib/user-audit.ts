/**
 * Registro-utenti della governance.
 *
 * Ogni azione su un account (creazione, cambio ruolo, flag, email, attivazione,
 * inviti) lascia un evento. Serve all'Head of Operations per sapere chi ha fatto
 * cosa: è il contraltare del potere distribuito a HM e HOD.
 *
 * La scrittura non deve MAI far fallire l'azione principale: se il registro non
 * riesce a scrivere, l'errore viene loggato ma l'operazione va a buon fine.
 */

import type { Prisma, UserAuditAction } from "@prisma/client";
import { prisma } from "./prisma";

export interface UserAuditInput {
  /** Utente su cui è avvenuta l'azione. */
  userId: string;
  /** Chi l'ha compiuta (null = sistema). */
  actorId?: string | null;
  action: UserAuditAction;
  note?: string | null;
  meta?: Prisma.InputJsonValue;
}

export async function recordUserAudit(input: UserAuditInput): Promise<void> {
  try {
    await prisma.userAuditEvent.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        action: input.action,
        note: input.note?.trim() || null,
        meta: input.meta,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[user-audit] scrittura fallita action=${input.action} userId=${input.userId} — ${detail}`
    );
  }
}

/** Più eventi per la stessa operazione (es. CREATED + INVITE_SENT). */
export async function recordUserAuditMany(inputs: UserAuditInput[]): Promise<void> {
  await Promise.all(inputs.map(recordUserAudit));
}
