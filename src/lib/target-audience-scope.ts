/**
 * Perimetro dei destinatari — l'unica definizione.
 *
 * A chi può essere rivolto un contenuto non lo decide il modulo che l'utente
 * ha davanti: lo decide questo file. Le pagine lo chiamano per costruire gli
 * elenchi, le rotte lo chiamano per giudicare ciò che arriva. Nessuna delle
 * due riscrive la regola.
 *
 * Funzioni PURE (nessun accesso al database) perché un perimetro di potere si
 * verifica caso per caso, compresi i casi negati. Il ponte con il database sta
 * in `target-audience-scope-db.ts`.
 *
 * ── La regola ──────────────────────────────────────────────────────────
 *
 * Il CORPORATE (il referente di funzione: Head of F&B, Head of Housekeeping…)
 * lavora su una materia, non su una struttura. Può destinare i contenuti solo
 * ai reparti di quella materia:
 *
 *   perimetro = User.targetDepartmentIds, ristretti alla struttura scelta
 *   se targetDepartmentIds è VUOTO → i reparti ASSEGNATI (PropertyAssignment)
 *   MAI tutti i reparti della struttura
 *
 * Da qui discende che il CORPORATE non dispone di «Tutti gli operatori» né dei
 * ruoli trasversali, e che gli utenti destinabili sono quelli assegnati ai
 * reparti del perimetro, sé stesso escluso.
 *
 * Se il perimetro risulta VUOTO — nessun reparto di competenza in quella
 * struttura — non si destina nulla. Il ripiego chiude, non apre: è proprio il
 * caso in cui aprire sarebbe l'errore.
 *
 * ── Chi NON è toccato ──────────────────────────────────────────────────
 *
 * HOD, HOTEL_MANAGER, ADMIN e SUPER_ADMIN non hanno qui alcuna restrizione:
 * `hasRestrictedAudience` risponde di no e ogni giudizio è concesso. Le regole
 * che li riguardano (per esempio quella dell'HOD sui memo) vivono dove sono
 * sempre vissute e questo modulo non le tocca né le sostituisce.
 */

import type { Role } from "@prisma/client";

// ─── Tipi ────────────────────────────────────────────────────────────

/** Chi sta destinando il contenuto. */
export interface AudienceActor {
  id: string;
  role: Role;
  /** `User.targetDepartmentIds`: i reparti destinabili decisi dall'HOO. */
  targetDepartmentIds: string[];
  /** Reparti su cui l'attore è assegnato (`PropertyAssignment.departmentId`). */
  assignedDepartmentIds: string[];
}

/** I destinatari proposti, nella forma in cui arrivano dal modulo. */
export interface AudienceProposal {
  allDepartments: boolean;
  roles: string[];
  departmentIds: string[];
  userIds: string[];
}

/** Un utente proposto come destinatario, con i reparti su cui è assegnato. */
export interface AudienceCandidate {
  id: string;
  departmentIds: string[];
}

/** Il contesto in cui la proposta va giudicata. */
export interface AudienceContext {
  /** Tutti i reparti della struttura del contenuto. */
  propertyDepartmentIds: string[];
  /** I soli utenti nominati in `proposal.userIds`, con i loro reparti. */
  candidates: AudienceCandidate[];
}

export type AudienceVerdict = { allowed: true } | { allowed: false; reason: string };

const ALLOW: AudienceVerdict = { allowed: true };
const deny = (reason: string): AudienceVerdict => ({ allowed: false, reason });

// ─── Messaggi ────────────────────────────────────────────────────────

/**
 * Devono essere leggibili da un direttore d'albergo: dicono che cosa non si
 * può fare e che cosa fare invece, senza nominare campi o tabelle.
 */
export const AUDIENCE_MESSAGES = {
  everyone:
    "Come referente corporate puoi rivolgerti soltanto ai reparti di tua competenza: «Tutti gli operatori» non è una scelta disponibile.",
  roles:
    "Come referente corporate non puoi rivolgerti a interi ruoli aziendali: scegli i reparti di tua competenza, o le singole persone che vi lavorano.",
  departments:
    "Uno o più reparti destinatari non rientrano fra i reparti di tua competenza.",
  users:
    "Uno o più destinatari non lavorano nei reparti di tua competenza.",
  self:
    "Non puoi indicare te stesso fra i destinatari del contenuto.",
  empty:
    "In questa struttura non hai reparti di competenza: chiedi all'amministratore di assegnarteli prima di destinare un contenuto.",
} as const;

// ─── Utilità ─────────────────────────────────────────────────────────

const unique = (values: string[]): string[] => [...new Set(values)];

// ─── Il perimetro ────────────────────────────────────────────────────

/**
 * Chi ha un perimetro destinatari ristretto.
 *
 * Solo il CORPORATE. È deliberato che sia una sola riga: se un domani un altro
 * ruolo dovrà essere ristretto, si cambia qui e le quattro rotte seguono.
 */
export function hasRestrictedAudience(role: Role): boolean {
  return role === "CORPORATE";
}

/**
 * I reparti destinabili, prima di restringerli a una struttura.
 *
 * `null` = nessuna restrizione. Array vuoto = restrizione che non lascia
 * passare nulla (l'attore non ha reparti di competenza).
 */
export function getTargetableDepartmentIds(actor: AudienceActor): string[] | null {
  if (!hasRestrictedAudience(actor.role)) return null;
  // I reparti destinabili hanno la precedenza; senza di essi vale
  // l'assegnazione. In nessun caso «tutti».
  const base = actor.targetDepartmentIds.length > 0
    ? actor.targetDepartmentIds
    : actor.assignedDepartmentIds;
  return unique(base);
}

/**
 * I reparti destinabili nella struttura scelta.
 *
 * `null` = nessuna restrizione. Array vuoto = nulla è destinabile in questa
 * struttura: il modulo non deve ripiegare su tutti i reparti, deve fermarsi.
 */
export function getTargetableDepartmentIdsInProperty(
  actor: AudienceActor,
  propertyDepartmentIds: string[]
): string[] | null {
  const perimeter = getTargetableDepartmentIds(actor);
  if (perimeter === null) return null;
  return perimeter.filter((id) => propertyDepartmentIds.includes(id));
}

/** Può usare «Tutti gli operatori»? */
export function canTargetEveryone(role: Role): boolean {
  return !hasRestrictedAudience(role);
}

/** Può usare i ruoli trasversali (tutti gli HOD, gli Hotel Manager…)? */
export function canTargetRoles(role: Role): boolean {
  return !hasRestrictedAudience(role);
}

// ─── Gli utenti destinabili ──────────────────────────────────────────

/**
 * Un utente è destinabile?
 *
 * Chi scrive non è mai destinabile: destinare a sé stessi una procedura di cui
 * si è autori non significa nulla, e sporca il calcolo della presa visione.
 * Vale per tutti i ruoli — è l'unica regola di questo modulo che non riguarda
 * il solo CORPORATE.
 *
 * `perimeter` è il valore di `getTargetableDepartmentIdsInProperty`: `null`
 * lascia passare chiunque, un elenco chiede almeno un reparto in comune.
 */
export function isTargetableUser(
  actorId: string,
  candidate: AudienceCandidate,
  perimeter: string[] | null
): boolean {
  if (candidate.id === actorId) return false;
  if (perimeter === null) return true;
  return candidate.departmentIds.some((id) => perimeter.includes(id));
}

/** L'elenco degli utenti che il modulo può mostrare come destinatari. */
export function filterTargetableUsers<T extends AudienceCandidate>(
  actorId: string,
  candidates: T[],
  perimeter: string[] | null
): T[] {
  return candidates.filter((candidate) => isTargetableUser(actorId, candidate, perimeter));
}

// ─── Il giudizio ─────────────────────────────────────────────────────

/**
 * La proposta di destinatari sta dentro il perimetro?
 *
 * È la sola funzione che le rotte devono chiamare. Per chi non ha un perimetro
 * ristretto risponde subito di sì, senza guardare nulla: nessun ruolo esistente
 * viene giudicato con un metro nuovo.
 */
export function checkAudienceProposal(
  actor: AudienceActor,
  proposal: AudienceProposal,
  context: AudienceContext
): AudienceVerdict {
  if (!hasRestrictedAudience(actor.role)) return ALLOW;

  const perimeter = getTargetableDepartmentIdsInProperty(actor, context.propertyDepartmentIds);
  // Il ruolo è ristretto: il perimetro non è mai null. La guardia è per il
  // compilatore e per chi un giorno cambierà `hasRestrictedAudience`.
  if (perimeter === null) return ALLOW;

  if (proposal.allDepartments) return deny(AUDIENCE_MESSAGES.everyone);
  if (proposal.roles.length > 0) return deny(AUDIENCE_MESSAGES.roles);

  const wantsSomething = proposal.departmentIds.length > 0 || proposal.userIds.length > 0;
  if (perimeter.length === 0 && wantsSomething) return deny(AUDIENCE_MESSAGES.empty);

  const outOfPerimeter = proposal.departmentIds.filter((id) => !perimeter.includes(id));
  if (outOfPerimeter.length > 0) return deny(AUDIENCE_MESSAGES.departments);

  if (proposal.userIds.includes(actor.id)) return deny(AUDIENCE_MESSAGES.self);

  const byId = new Map(context.candidates.map((c) => [c.id, c]));
  for (const userId of proposal.userIds) {
    const candidate = byId.get(userId);
    // Un utente che il ponte non ha trovato è fuori dalla struttura o non
    // esiste: in nessuno dei due casi è destinabile.
    if (!candidate) return deny(AUDIENCE_MESSAGES.users);
    if (!isTargetableUser(actor.id, candidate, perimeter)) return deny(AUDIENCE_MESSAGES.users);
  }

  return ALLOW;
}
