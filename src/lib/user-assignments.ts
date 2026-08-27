/**
 * Costruzione delle assegnazioni nella veste semplificata del form utente
 * (HM e HOD in creazione: una struttura, uno o più reparti — mai "tutti i
 * reparti", quella scelta esiste solo nella veste admin).
 *
 * Funzione PURA, senza React né Prisma: il progetto non ha un ambiente di
 * test del DOM (vitest gira con `environment: "node"`), quindi il
 * comportamento del form va reso verificabile qui, fuori dal componente —
 * lo stesso schema di `shouldExpireSession` (session-expiry.ts) e di
 * `showSendLinkCommand` (user-form.tsx).
 */

export interface SimpleAssignment {
  propertyId: string;
  departmentId: string;
}

export type SimpleAssignmentValidation =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Un reparto scelto → un'assegnazione. La struttura è sempre la stessa, per
 * costruzione: la veste semplificata non permette di sceglierne più di una.
 */
export function buildSimpleAssignments(params: {
  propertyId: string;
  departmentIds: string[];
}): SimpleAssignment[] {
  return params.departmentIds.map((departmentId) => ({
    propertyId: params.propertyId,
    departmentId,
  }));
}

/**
 * Serve una struttura e almeno un reparto. Un'assegnazione senza reparto non
 * è ammessa nella veste semplificata (a differenza della veste admin, dove
 * "tutti i reparti" è una scelta esplicita) — un reparto assegnato in
 * silenzio è peggio di un errore che chiede di scegliere.
 */
export function validateSimpleAssignments(params: {
  propertyId: string;
  departmentIds: string[];
}): SimpleAssignmentValidation {
  if (!params.propertyId) return { valid: false, reason: "Scegli la struttura" };
  if (params.departmentIds.length === 0) return { valid: false, reason: "Scegli almeno un reparto" };
  return { valid: true };
}
