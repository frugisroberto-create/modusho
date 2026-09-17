/**
 * CHI PUÒ STAMPARE UN CONTENUTO — e se la stampa è di una bozza.
 *
 * PERCHÉ ESISTE QUESTO MODULO
 * La stampa serviva solo i contenuti pubblicati. Ma nella dashboard le SOP si
 * aprono nel workflow, dove quasi sempre sono ancora in lavorazione: un tasto
 * «Stampa» che risponde «non trovato» non è un tasto. Chi rivede una bozza —
 * l'Hotel Manager consultato, l'Accountable che la approva — spesso la vuole
 * su carta.
 *
 * LA REGOLA
 *  - Pubblicato: stampa chi può vedere il contenuto (`canUserAccessContent`),
 *    come prima.
 *  - Bozza, in consultazione, in approvazione, restituita: stampa chi può
 *    vedere la bozza nel workflow — la stessa regola di GET
 *    /api/sop-workflow/[id]: accesso alla struttura, e poi Hotel Manager,
 *    Corporate, Admin, Super Admin, oppure R/C/A di quella SOP. Mai un
 *    operatore. Solo SOP con workflow: memo e documenti non hanno bozze da
 *    far circolare.
 *    La stampa di una bozza porta la scritta BOZZA su ogni pagina: una
 *    procedura non approvata che gira su carta deve dichiararlo da sola.
 *  - Archiviato: niente stampa, come prima. Una procedura sostituita su
 *    carta è il modo più semplice per farla applicare ancora.
 *
 * Funzione pura: i fatti (accesso, workflow) li carica la rotta.
 */

import type { ContentStatus, Role } from "@prisma/client";
import { canViewDraft, type SopWorkflowInfo } from "./sop-workflow";

export type PrintVerdict =
  | { allowed: false }
  | { allowed: true; draft: boolean };

const DRAFT_STATUSES: readonly ContentStatus[] = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];

/** I ruoli che nel workflow vedono ogni bozza della propria struttura. */
const DRAFT_GOVERNANCE_ROLES: readonly Role[] = ["HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"];

export interface PrintAccessInput {
  status: ContentStatus;
  userId: string;
  role: Role;
  /** Esito di `canUserAccessContent`: conta per i contenuti pubblicati. */
  canSeePublished: boolean;
  /** Accesso alla struttura del contenuto: conta per le bozze. */
  hasPropertyAccess: boolean;
  /** Il workflow RACI, se il contenuto è una SOP che ne ha uno. */
  workflow: SopWorkflowInfo | null;
}

export function decidePrintAccess(input: PrintAccessInput): PrintVerdict {
  if (input.status === "PUBLISHED") {
    return input.canSeePublished ? { allowed: true, draft: false } : { allowed: false };
  }

  if (!DRAFT_STATUSES.includes(input.status)) return { allowed: false };
  if (input.role === "OPERATOR") return { allowed: false };
  if (!input.workflow) return { allowed: false };
  if (!input.hasPropertyAccess) return { allowed: false };

  const sees =
    DRAFT_GOVERNANCE_ROLES.includes(input.role) || canViewDraft(input.userId, input.workflow);
  return sees ? { allowed: true, draft: true } : { allowed: false };
}

/** Come si chiama lo stato sulla carta: la stessa lingua della dashboard. */
export const PRINT_STATUS_LABELS: Partial<Record<ContentStatus, string>> = {
  DRAFT: "Bozza",
  REVIEW_HM: "In attesa di consultazione",
  REVIEW_ADMIN: "In approvazione Accountable",
  RETURNED: "Restituita",
};
