/**
 * Chi compare in un registro presa visione (memo, documenti, SOP).
 *
 * Funzione pura: la rotta carica i candidati (utenti attivi della struttura,
 * con le assegnazioni in quella struttura) e questa decide chi sono i
 * destinatari, con la stessa regola di Presa visione, notifiche e sollecito
 * (`isInTargetAudience`).
 */

import type { Role } from "@prisma/client";
import { isInTargetAudience, type ContentVisibilityInput } from "./rbac";

export interface RegistryCandidate {
  id: string;
  name: string;
  role: Role;
  /** departmentId delle assegnazioni nella struttura del contenuto (null = tutti i reparti) */
  departmentIds: (string | null)[];
}

export function selectRegistryRecipients<T extends RegistryCandidate>(
  candidates: T[],
  content: {
    departmentId: string | null;
    targetAudience: ContentVisibilityInput["targetAudience"];
  },
  /** Vista HOD: solo le persone di questo reparto, fra i destinatari */
  filterDepartmentId?: string
): T[] {
  let recipients: T[];

  if (content.targetAudience.length === 0) {
    // Contenuti storici senza destinatari salvati: reparto del contenuto
    // (compresi gli assegnati a tutti i reparti), altrimenti l'intera struttura.
    recipients = content.departmentId
      ? candidates.filter((u) =>
          u.departmentIds.some((d) => d === content.departmentId || d === null)
        )
      : candidates;
  } else {
    recipients = candidates.filter((u) =>
      isInTargetAudience(
        {
          id: u.id,
          role: u.role,
          assignedDepartmentIds: u.departmentIds.filter((d): d is string => d !== null),
        },
        content.targetAudience
      )
    );
  }

  if (filterDepartmentId) {
    recipients = recipients.filter((u) => u.departmentIds.includes(filterDepartmentId));
  }

  return recipients;
}
