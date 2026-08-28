/**
 * Chi può essere l'Accountable di una SOP — l'unica definizione.
 *
 * Chi apre la SOP nomina l'Accountable: non è più un automatismo che cerca
 * un CORPORATE o si ripiega sul primo ADMIN trovato. Funzioni PURE (nessun
 * accesso al database): il ponte con il database sta in
 * `accountable-scope-db.ts`. La rotta chiama per validare ciò che arriva dal
 * modulo, il modulo chiama (attraverso il ponte) per costruire la tendina.
 * Nessuno dei due riscrive la regola.
 *
 * ── La regola ──────────────────────────────────────────────────────────
 *
 * La rosa dei candidati Accountable per una struttura + un reparto è:
 *
 *   tutti gli ADMIN e SUPER_ADMIN assegnati a quella struttura
 *   (sempre, qualunque sia il reparto)
 *
 *   più gli utenti che hanno canApprove, sono attivi, e sono assegnati
 *   a QUELLA struttura e a QUEL reparto
 *
 * La rosa non è mai vuota: gli ADMIN della struttura ci sono comunque (una
 * property senza ADMIN assegnato è una condizione che le rotte di creazione
 * SOP già rifiutano altrove, non un caso che questo modulo deve prevedere).
 *
 * ── Chi sceglie ────────────────────────────────────────────────────────
 *
 * Solo chi apre la SOP come HOD o HOTEL_MANAGER sceglie l'Accountable: il
 * selettore è obbligatorio, vuoto se i candidati sono due o più, preselezionato
 * se il candidato è uno solo. Il CORPORATE che apre è sempre l'Accountable di
 * sé stesso — nessuna scelta, nessuna rosa da calcolare — e ADMIN/SUPER_ADMIN
 * restano self-accountable per la regola già esistente altrove. Questo modulo
 * non decide chi deve vedere il selettore nella UI: `requiresAccountableSelection`
 * è l'unico punto da cui derivarlo.
 */

import type { Role } from "@prisma/client";

// ─── Tipi ────────────────────────────────────────────────────────────

/** Un'assegnazione struttura/reparto di un candidato. */
export interface AccountableAssignment {
  propertyId: string;
  departmentId: string | null;
}

/** Un utente candidabile come Accountable. */
export interface AccountableCandidate {
  id: string;
  role: Role;
  canApprove: boolean;
  isActive: boolean;
  assignments: AccountableAssignment[];
}

export type AccountableVerdict =
  | { allowed: true; accountableId: string }
  | { allowed: false; reason: string };

// ─── Messaggi ────────────────────────────────────────────────────────

/**
 * Devono essere leggibili da un direttore d'albergo: dicono che cosa non va
 * bene e perché, senza nominare campi o tabelle.
 */
export const ACCOUNTABLE_MESSAGES = {
  required: "Seleziona chi approverà la SOP: l'Accountable è obbligatorio.",
  notCandidate:
    "La persona indicata non può essere l'Accountable di questa SOP: deve essere un Amministratore della struttura, oppure una persona abilitata all'approvazione per questo reparto.",
} as const;

// ─── Chi sceglie ─────────────────────────────────────────────────────

/**
 * Chi apre la SOP deve scegliere l'Accountable?
 *
 * Solo HOD e HOTEL_MANAGER. Il CORPORATE è sempre l'Accountable di sé stesso
 * (comportamento esistente, non toccato da questo modulo): non ha nulla da
 * scegliere. ADMIN e SUPER_ADMIN restano self-accountable per la regola già
 * in vigore prima di questo lavoro.
 */
export function requiresAccountableSelection(initiatorRole: Role): boolean {
  return initiatorRole === "HOD" || initiatorRole === "HOTEL_MANAGER";
}

// ─── La rosa ─────────────────────────────────────────────────────────

function isPropertyAdmin(candidate: AccountableCandidate, propertyId: string): boolean {
  if (candidate.role !== "ADMIN" && candidate.role !== "SUPER_ADMIN") return false;
  return candidate.assignments.some((a) => a.propertyId === propertyId);
}

function isApprovingDepartmentUser(
  candidate: AccountableCandidate,
  propertyId: string,
  departmentId: string
): boolean {
  if (!candidate.canApprove) return false;
  return candidate.assignments.some(
    (a) => a.propertyId === propertyId && a.departmentId === departmentId
  );
}

/** Un candidato è legittimo per quella struttura e quel reparto? */
export function isAccountableCandidate(
  candidate: AccountableCandidate,
  propertyId: string,
  departmentId: string
): boolean {
  if (!candidate.isActive) return false;
  return (
    isPropertyAdmin(candidate, propertyId) ||
    isApprovingDepartmentUser(candidate, propertyId, departmentId)
  );
}

/** La rosa: filtra i candidati grezzi per struttura + reparto. */
export function getAccountableCandidates<T extends AccountableCandidate>(
  candidates: T[],
  propertyId: string,
  departmentId: string
): T[] {
  return candidates.filter((c) => isAccountableCandidate(c, propertyId, departmentId));
}

/**
 * La rosa ha un solo candidato?
 *
 * Serve a decidere se preselezionare: costringere a scegliere fra un'opzione
 * sola è attrito che non decide nulla.
 */
export function hasSingleCandidate(candidates: { id: string }[]): boolean {
  return candidates.length === 1;
}

// ─── Il giudizio ─────────────────────────────────────────────────────

/**
 * L'utente proposto come Accountable è un candidato legittimo?
 *
 * È la sola funzione che le rotte devono chiamare per validare l'accountableId
 * in arrivo dal client. `candidates` è la rosa grezza (non ancora filtrata):
 * il filtro lo applica questa funzione, non chi la chiama.
 */
export function checkAccountableProposal(
  proposedUserId: string | undefined | null,
  candidates: AccountableCandidate[],
  propertyId: string,
  departmentId: string
): AccountableVerdict {
  if (!proposedUserId) {
    return { allowed: false, reason: ACCOUNTABLE_MESSAGES.required };
  }
  const pool = getAccountableCandidates(candidates, propertyId, departmentId);
  const found = pool.find((c) => c.id === proposedUserId);
  if (!found) {
    return { allowed: false, reason: ACCOUNTABLE_MESSAGES.notCandidate };
  }
  return { allowed: true, accountableId: found.id };
}
