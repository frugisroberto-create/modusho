/**
 * La lettura di una SOP: chi deve ancora aprirla, cosa si scrive quando la
 * apre, e come finisce il click.
 *
 * Tre regole che prima vivevano sparse — una dentro la pagina di dettaglio,
 * una dentro la rotta di conferma, la terza da nessuna parte — e che qui
 * stanno insieme perché parlano tutte dello stesso fatto: questa persona ha
 * letto questa versione di questa procedura.
 *
 * Il punto che conta: `buildSopReadWrites` è l'unica descrizione di cosa
 * finisce nel database. La registrazione automatica di HM/ADMIN/SUPER_ADMIN e
 * il pulsante di OPERATOR/HOD passano entrambi di qui, quindi non possono
 * divergere. Se divergessero, cruscotti e percentuali leggerebbero righe
 * scritte a metà e i numeri della presa visione crollerebbero senza motivo
 * apparente.
 */

import type { ContentStatus, Role } from "@prisma/client";
import { classifyReadResponse, type ReadOutcome } from "./read-outcome";

// ─── Chi vede il pannello di lettura ──────────────────────────────────

/**
 * Ruoli per cui aprire la SOP vale già come lettura: la registrazione avviene
 * da sola, senza chiedere niente a chi legge.
 */
const GOVERNANCE_ROLES: readonly Role[] = ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"];

export function isGovernanceRole(role: Role): boolean {
  return GOVERNANCE_ROLES.includes(role);
}

export interface ReadPanelInput {
  role: Role;
  contentStatus: ContentStatus;
  /** Lettura già registrata per la versione che conta. */
  alreadyRead: boolean;
}

/**
 * True se davanti al contenuto va mostrato il pannello con il pulsante.
 *
 * Lo stato PUBLISHED non è un dettaglio: un HOD può consultare le SOP in
 * qualsiasi stato, ma la lettura si registra solo su ciò che è pubblicato
 * (la rotta rifiuta il resto). Senza questa condizione, un HOD che apre una
 * bozza resta chiuso fuori dal testo da un pulsante che non può funzionare.
 */
export function showsReadPanel({ role, contentStatus, alreadyRead }: ReadPanelInput): boolean {
  if (alreadyRead) return false;
  if (isGovernanceRole(role)) return false;
  return contentStatus === "PUBLISHED";
}

// ─── Cosa si scrive ───────────────────────────────────────────────────

export interface SopReadWriteArgs {
  contentId: string;
  userId: string;
  /** Versione del Content al momento della lettura. */
  contentVersion: number;
  now: Date;
}

/**
 * Le due scritture di una lettura, con lo stesso istante su entrambe.
 *
 * Sono due perché due sono i registri, e servono tutti e due:
 *  - `SopViewRecord` è legato alla versione, e alimenta il registro per
 *    singola SOP (chi ha letto cosa, e quale versione);
 *  - `ContentAcknowledgment` è per sola coppia contenuto-persona, ed è quello
 *    che leggono home, elenchi, conformità, cruscotto e sollecito a 24 ore.
 *
 * In `create` di ContentAcknowledgment `acknowledgedAt` è omesso di
 * proposito: lo mette il default dello schema. È la forma già in uso — qui si
 * conserva identica, non si "migliora", perché un valore esplicito cambierebbe
 * di qualche millisecondo righe che oggi due percorsi scrivono allo stesso
 * modo.
 */
export function buildSopReadWrites({ contentId, userId, contentVersion, now }: SopReadWriteArgs) {
  return {
    viewRecord: {
      where: { contentId_userId_contentVersion: { contentId, userId, contentVersion } },
      update: { acknowledgedAt: now, viewedAt: now },
      create: { contentId, userId, contentVersion, viewedAt: now, acknowledgedAt: now },
    },
    acknowledgment: {
      where: { contentId_userId: { contentId, userId } },
      update: { acknowledgedAt: now },
      create: { contentId, userId, required: true },
    },
  };
}

// ─── Come finisce il click ────────────────────────────────────────────

/**
 * Il messaggio parla di registrazione, non di caricamento: il click non legge
 * un elenco, scrive una riga, e chi è davanti allo schermo deve capire che
 * cosa non è stato registrato.
 */
export const SOP_READ_ERROR_MESSAGE =
  "Non siamo riusciti a registrare la lettura. Controlla la connessione e riprova.";

export type SopReadClickOutcome =
  | { kind: "ok" }
  | { kind: "session-expired" }
  | { kind: "error"; message: string };

/**
 * Classifica la risposta del click riusando la stessa scala delle letture
 * (`classifyReadResponse`): il 401 resta un caso a sé, di cui si occupa il
 * guard di sessione, e non va confuso con un guasto da mostrare.
 */
export function classifySopReadClick(status: number): SopReadClickOutcome {
  const esito: ReadOutcome = classifyReadResponse(status);
  if (esito.kind === "error") return { kind: "error", message: SOP_READ_ERROR_MESSAGE };
  return esito;
}

/** Fetch che non è nemmeno partita (rete assente, DNS, timeout): è un guasto. */
export const SOP_READ_NETWORK_OUTCOME: SopReadClickOutcome = {
  kind: "error",
  message: SOP_READ_ERROR_MESSAGE,
};
