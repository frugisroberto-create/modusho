/**
 * Quali campi una richiesta di modifica utente TOCCA davvero.
 *
 * Il perimetro (`getEditableFields`, `canEditField`) risponde a "chi può
 * toccare cosa". Questo modulo risponde alla domanda che viene prima: "cosa è
 * stato toccato". Erano la stessa cosa finché il server leggeva la presenza di
 * un campo nel corpo della richiesta come volontà di cambiarlo — ma il form
 * rimanda SEMPRE tutti i campi, anche quelli che nessuno ha sfiorato. Così un
 * Hotel Manager che promuoveva un operatore a capo reparto si prendeva un 403
 * per i tipi di contenuto e per l'email, che non aveva nemmeno guardato.
 *
 * Regola: un campo è toccato solo se il valore in arrivo è DIVERSO da quello
 * attuale. Un campo assente non è mai toccato.
 *
 * Funzioni PURE: nessun React, nessun Prisma. Il confronto va testato caso per
 * caso, compresi i casi in cui deve dire "non toccato".
 */

import type { EditableField } from "./user-scope";
import { normalizeEmail } from "./email-normalize";

export interface AssignmentValue {
  propertyId: string;
  departmentId?: string | null;
}

/** Valori in arrivo dalla richiesta. `undefined` = campo assente. */
export interface IncomingUserValues {
  name?: string;
  email?: string;
  role?: string;
  canView?: boolean;
  canEdit?: boolean;
  canApprove?: boolean;
  canPublish?: boolean;
  canCreateUsers?: boolean;
  targetDepartmentIds?: string[];
  viewDepartmentIds?: string[];
  isActive?: boolean;
  propertyAssignments?: AssignmentValue[];
  contentTypes?: string[];
}

/** Valori attuali dell'utente, come stanno scritti adesso. */
export interface CurrentUserValues {
  name: string;
  email: string;
  role: string;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canCreateUsers: boolean;
  targetDepartmentIds: string[];
  viewDepartmentIds: string[];
  isActive: boolean;
  propertyAssignments: AssignmentValue[];
  contentTypes: string[];
}

// ─── Normalizzazioni: confrontare ciò che verrebbe DAVVERO scritto ────

/** Il nome viene salvato trimmato: è quello il valore da confrontare. */
export function normalizeIncomingName(name: string): string {
  return name.trim();
}

/** L'email viene salvata trimmata e minuscola: idem. Regola unica in normalizeEmail(). */
export const normalizeIncomingEmail = normalizeEmail;

/**
 * Confronto insensibile all'ordine ma NON alle ripetizioni: due elenchi
 * coincidono se contengono le stesse voci con le stesse molteplicità. Un
 * elemento in più è una differenza anche quando è un doppione.
 */
export function sameBag(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/** Alias parlante per gli elenchi di reparti (`viewDepartmentIds`, `targetDepartmentIds`). */
export const sameDepartmentIds = sameBag;

/**
 * Chiave di un'assegnazione. Il separatore è un carattere che non può
 * comparire in un id, così (struttura "a|b", reparto null) e (struttura "a",
 * reparto "b") non finiscono per coincidere.
 */
function assignmentKey(assignment: AssignmentValue): string {
  return `${assignment.propertyId}\u0000${assignment.departmentId ?? ""}`;
}

export function sameAssignments(a: AssignmentValue[], b: AssignmentValue[]): boolean {
  return sameBag(a.map(assignmentKey), b.map(assignmentKey));
}

// ─── La decisione ────────────────────────────────────────────────────

/** Ordine stabile: rende leggibile sia il risultato sia i test. */
const FIELD_ORDER: EditableField[] = [
  "name",
  "email",
  "role",
  "permissionFlags",
  "canCreateUsers",
  "departments",
  "viewDepartmentIds",
  "contentTypes",
  "isActive",
];

/**
 * I campi realmente toccati dalla richiesta.
 *
 * `departments` copre due dati che viaggiano insieme nel form e che il
 * perimetro tratta come uno solo: le assegnazioni struttura/reparto e i
 * reparti destinatari.
 *
 * `permissionFlags` copre i quattro flag di potere: basta che uno cambi
 * perché il gruppo risulti toccato.
 */
export function getTouchedFields(
  incoming: IncomingUserValues,
  current: CurrentUserValues
): EditableField[] {
  const touched = new Set<EditableField>();

  if (incoming.name !== undefined && normalizeIncomingName(incoming.name) !== current.name) {
    touched.add("name");
  }

  if (incoming.email !== undefined && normalizeIncomingEmail(incoming.email) !== current.email) {
    touched.add("email");
  }

  if (incoming.role !== undefined && incoming.role !== current.role) {
    touched.add("role");
  }

  const flagChanged =
    (incoming.canView !== undefined && incoming.canView !== current.canView) ||
    (incoming.canEdit !== undefined && incoming.canEdit !== current.canEdit) ||
    (incoming.canApprove !== undefined && incoming.canApprove !== current.canApprove) ||
    (incoming.canPublish !== undefined && incoming.canPublish !== current.canPublish);
  if (flagChanged) touched.add("permissionFlags");

  if (incoming.canCreateUsers !== undefined && incoming.canCreateUsers !== current.canCreateUsers) {
    touched.add("canCreateUsers");
  }

  if (
    incoming.propertyAssignments !== undefined &&
    !sameAssignments(incoming.propertyAssignments, current.propertyAssignments)
  ) {
    touched.add("departments");
  }
  if (
    incoming.targetDepartmentIds !== undefined &&
    !sameBag(incoming.targetDepartmentIds, current.targetDepartmentIds)
  ) {
    touched.add("departments");
  }

  if (
    incoming.viewDepartmentIds !== undefined &&
    !sameBag(incoming.viewDepartmentIds, current.viewDepartmentIds)
  ) {
    touched.add("viewDepartmentIds");
  }

  if (incoming.contentTypes !== undefined && !sameBag(incoming.contentTypes, current.contentTypes)) {
    touched.add("contentTypes");
  }

  if (incoming.isActive !== undefined && incoming.isActive !== current.isActive) {
    touched.add("isActive");
  }

  return FIELD_ORDER.filter((field) => touched.has(field));
}

/** Comodità per i chiamanti che ragionano su un campo alla volta. */
export function isTouched(
  incoming: IncomingUserValues,
  current: CurrentUserValues,
  field: EditableField
): boolean {
  return getTouchedFields(incoming, current).includes(field);
}
