/**
 * CHI DEVE PRENDERE VISIONE DI UN CONTENUTO — e quanti l'hanno fatto.
 *
 * PERCHÉ ESISTE QUESTO MODULO
 * La stessa domanda — «quante persone devono leggere questo contenuto?» —
 * aveva tre risposte diverse in tre punti del prodotto:
 *  - il tasso del cruscotto divideva il numero di LETTURE per il numero di
 *    CONTENUTI: unità diverse, e infatti mostrava percentuali a quattro cifre;
 *  - l'allarme «sotto il 50%» contava tutte le letture ricevute (capi reparto,
 *    hotel manager, admin, gente di altri reparti) sopra i soli operatori
 *    assegnati al reparto: numeratore e denominatore di popolazioni diverse,
 *    con il risultato che un contenuto molto letto da chi non era destinatario
 *    spariva dagli allarmi;
 *  - la pagina Presa visione espandeva i destinatari per conto suo.
 * Qui la regola è una sola, pura, e la usano tutti e tre.
 *
 * LA REGOLA
 * Un contenuto elenca i propri destinatari in `ContentTarget`. Ogni riga si
 * risolve in persone:
 *  - ROLE/X      → gli utenti attivi della struttura con i ruoli di
 *                  `getRolesForRoleTarget` (ROLE/OPERATOR comprende i capi
 *                  reparto: chi guida un reparto conosce le procedure che
 *                  vincolano i suoi operatori);
 *  - DEPARTMENT/d → operatori e capi reparto attivi ASSEGNATI a quel reparto.
 *                  Un reparto solo «visibile» permette di consultare, non rende
 *                  destinatari; hotel manager e corporate assegnati al reparto
 *                  non ne fanno parte;
 *  - USER/u      → quella persona, se attiva.
 * L'unione di queste persone è il denominatore. Il numeratore sono le letture
 * registrate DA QUELLE PERSONE: per questo il tasso non può superare il 100%.
 *
 * DIREZIONE UNICA
 * Le funzioni qui sono pure: le persone della struttura e dei reparti le carica
 * il chiamante (`recipient-set-db.ts`). Nessuna query, nessuna decisione altrove.
 */

import type { Role } from "@prisma/client";
import { getRolesForRoleTarget } from "./rbac";

/** Una riga `ContentTarget`, nella forma minima che serve a risolverla. */
export interface TargetRow {
  targetType: "ROLE" | "DEPARTMENT" | "USER";
  targetRole: Role | null;
  targetDepartmentId: string | null;
  targetUserId: string | null;
  /** Presente solo per le righe USER: una persona disattivata non è destinataria. */
  targetUser?: { isActive: boolean } | null;
}

/**
 * Le persone fra cui pescare, già caricate dal chiamante.
 * `byRole` sono gli utenti ATTIVI assegnati alla struttura del contenuto;
 * `byDepartment` gli operatori e capi reparto ATTIVI assegnati al reparto.
 */
export interface RecipientPools {
  byRole: Partial<Record<Role, string[]>>;
  byDepartment: Record<string, string[]>;
}

/** L'insieme delle persone che devono prendere visione del contenuto. */
export function resolveRecipientIds(
  targets: readonly TargetRow[],
  pools: RecipientPools
): Set<string> {
  const ids = new Set<string>();

  for (const target of targets) {
    if (target.targetType === "ROLE") {
      if (!target.targetRole) continue;
      for (const role of getRolesForRoleTarget(target.targetRole)) {
        for (const id of pools.byRole[role] ?? []) ids.add(id);
      }
    } else if (target.targetType === "DEPARTMENT") {
      if (!target.targetDepartmentId) continue;
      for (const id of pools.byDepartment[target.targetDepartmentId] ?? []) ids.add(id);
    } else if (target.targetType === "USER") {
      // `targetUser` assente = la riga non è stata caricata con la persona:
      // meglio non contarla che contare un utente disattivato.
      if (target.targetUserId && target.targetUser?.isActive) ids.add(target.targetUserId);
    }
  }

  return ids;
}

/** Quante persone devono leggere (`required`) e quante l'hanno fatto (`done`). */
export interface Coverage {
  required: number;
  done: number;
}

export const EMPTY_COVERAGE: Coverage = { required: 0, done: 0 };

/**
 * Le letture contano solo se vengono dai destinatari.
 * `ContentAcknowledgment` è unico per coppia contenuto-persona, ma l'insieme
 * qui rende la cosa vera anche se la riga arriva duplicata da una join.
 */
export function coverageOf(
  recipientIds: ReadonlySet<string>,
  acknowledgments: readonly { userId: string }[]
): Coverage {
  const readers = new Set<string>();
  for (const ack of acknowledgments) {
    if (recipientIds.has(ack.userId)) readers.add(ack.userId);
  }
  return { required: recipientIds.size, done: readers.size };
}

/**
 * Lo stato di una riga nella pagina Presa visione.
 *  - "senza-destinatari": le righe destinatario non risolvono nessuna persona
 *    (per esempio un reparto rimasto senza personale attivo). Non è una riga
 *    completata: è un contenuto che nessuno può nemmeno leggere, e va visto.
 *  - "completata": tutti i destinatari hanno letto.
 *  - "aperta": manca ancora qualcuno.
 */
export type CoverageState = "aperta" | "completata" | "senza-destinatari";

export function coverageState({ required, done }: Coverage): CoverageState {
  if (required === 0) return "senza-destinatari";
  return done >= required ? "completata" : "aperta";
}

/** Somma di più coperture: è così che si ottiene il totale di una struttura. */
export function sumCoverage(list: readonly Coverage[]): Coverage {
  return list.reduce(
    (acc, c) => ({ required: acc.required + c.required, done: acc.done + c.done }),
    EMPTY_COVERAGE
  );
}

/**
 * Il tasso di presa visione, in percentuale intera.
 * `null` quando non c'è nessun obbligo: zero destinatari non fa «zero per
 * cento», fa «non applicabile», e mostrarlo come 0% accuserebbe ingiustamente.
 * Il minimo con 100 è una cintura: `done` non può superare `required` per
 * costruzione, e se un giorno lo facesse sarebbe un difetto da correggere, non
 * un numero da mostrare.
 */
export function ackRate({ required, done }: Coverage): number | null {
  if (required === 0) return null;
  return Math.min(100, Math.round((done / required) * 100));
}
