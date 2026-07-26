/**
 * Perimetri della gestione utenti — matrice ratificata.
 *
 * Qui vive la risposta a tre domande: chi vede chi, chi crea chi, chi modifica
 * cosa. Sono funzioni PURE (nessun accesso a database) perché il perimetro di
 * potere va testato caso per caso, compresi i casi negati.
 *
 * Le API chiamano queste funzioni PRIMA di ogni scrittura: la UI può nascondere
 * i comandi, ma è il server a decidere.
 *
 * Matrice (vincolante):
 *
 * | Attore            | Vede                        | Crea            | Modifica                         |
 * |-------------------|-----------------------------|-----------------|----------------------------------|
 * | SUPER_ADMIN       | tutti                       | tutti           | tutto                            |
 * | ADMIN             | sue property                | fino a HM/CORP  | tutto nel perimetro              |
 * | HOTEL_MANAGER     | OPERATOR e HOD sue property | OPERATOR, HOD   | dati base, ruolo OP↔HOD, flag    |
 * | HOD + canCreate   | OPERATOR suo reparto        | OPERATOR        | solo email dei suoi non attivati |
 * | HOD senza flag    | OPERATOR suo reparto        | nessuno         | niente (sola lettura)            |
 * | CORPORATE         | nessuno                     | nessuno         | niente                           |
 * | OPERATOR          | nessuno                     | nessuno         | niente                           |
 */

import type { Role, ContentType } from "@prisma/client";

// ─── Tipi ────────────────────────────────────────────────────────────

export interface ScopeActor {
  id: string;
  role: Role;
  canCreateUsers: boolean;
  /** Property a cui l'attore è assegnato. */
  propertyIds: string[];
  /** Reparti a cui l'attore è assegnato (rilevante per HOD). */
  departmentIds: string[];
}

export interface ScopeTarget {
  id: string;
  role: Role;
  propertyIds: string[];
  departmentIds: string[];
  /** Chi ha creato l'utente (null per gli storici). */
  createdById: string | null;
  /** null = invito mai completato. */
  activatedAt: Date | null;
}

/** Campi modificabili, granulari: il permesso non è mai "tutto o niente". */
export type EditableField =
  | "name"
  | "email"
  | "departments"
  | "contentTypes"
  | "viewDepartmentIds"
  | "permissionFlags"
  | "role"
  | "isActive"
  | "canCreateUsers";

export type ScopeResult = { allowed: true } | { allowed: false; reason: string };

const ALLOW: ScopeResult = { allowed: true };
const deny = (reason: string): ScopeResult => ({ allowed: false, reason });

// ─── Utilità ─────────────────────────────────────────────────────────

function intersects(a: string[], b: string[]): boolean {
  return a.some((value) => b.includes(value));
}

const isAdminLevel = (role: Role): boolean => role === "ADMIN" || role === "SUPER_ADMIN";

// ─── Accesso alla sezione ────────────────────────────────────────────

/**
 * Chi può aprire "Gestione utenti".
 * HOD entra sempre: senza flag vede la lista in sola lettura (serve a
 * sollecitare a voce chi non si è ancora attivato).
 */
export function canAccessUserManagement(actor: Pick<ScopeActor, "role">): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    actor.role === "ADMIN" ||
    actor.role === "HOTEL_MANAGER" ||
    actor.role === "HOD"
  );
}

/** Ruoli che l'attore può vedere in lista (alimenta anche il filtro ruoli). */
export function getVisibleRoles(actor: Pick<ScopeActor, "role">): Role[] {
  switch (actor.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"];
    case "HOTEL_MANAGER":
      // Mai ADMIN, CORPORATE o altri HM.
      return ["OPERATOR", "HOD"];
    case "HOD":
      return ["OPERATOR"];
    default:
      return [];
  }
}

/** Un attore vede un utente se il ruolo è visibile e il perimetro combacia. */
export function canViewUser(actor: ScopeActor, target: ScopeTarget): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (!canAccessUserManagement(actor)) return false;
  if (!getVisibleRoles(actor).includes(target.role)) return false;

  if (actor.role === "ADMIN" || actor.role === "HOTEL_MANAGER") {
    return intersects(actor.propertyIds, target.propertyIds);
  }

  if (actor.role === "HOD") {
    // Solo gli operatori del proprio reparto.
    return (
      intersects(actor.propertyIds, target.propertyIds) &&
      intersects(actor.departmentIds, target.departmentIds)
    );
  }

  return false;
}

// ─── Creazione ───────────────────────────────────────────────────────

/** Ruoli che l'attore può assegnare a un nuovo utente. */
export function getCreatableRoles(actor: Pick<ScopeActor, "role" | "canCreateUsers">): Role[] {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"];
    case "ADMIN":
      // Il ruolo ADMIN resta riservato al SUPER_ADMIN (regola preesistente).
      return ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE"];
    case "HOTEL_MANAGER":
      return ["OPERATOR", "HOD"];
    case "HOD":
      return actor.canCreateUsers ? ["OPERATOR"] : [];
    default:
      return [];
  }
}

export function canCreateUsers(actor: Pick<ScopeActor, "role" | "canCreateUsers">): boolean {
  return getCreatableRoles(actor).length > 0;
}

/** Verifica completa della creazione: ruolo richiesto + struttura + reparto. */
export function canCreateUser(
  actor: ScopeActor,
  request: { role: Role; propertyId: string; departmentId?: string | null }
): ScopeResult {
  if (!canCreateUsers(actor)) {
    return deny("Non hai i permessi per creare utenti.");
  }

  if (!getCreatableRoles(actor).includes(request.role)) {
    return deny("Non puoi creare utenti con questo ruolo.");
  }

  // SUPER_ADMIN non ha vincolo di property.
  if (actor.role !== "SUPER_ADMIN" && !actor.propertyIds.includes(request.propertyId)) {
    return deny("Non puoi creare utenti in questa struttura.");
  }

  // L'HOD crea solo dentro il proprio reparto.
  if (actor.role === "HOD") {
    if (!request.departmentId || !actor.departmentIds.includes(request.departmentId)) {
      return deny("Puoi creare operatori solo nel tuo reparto.");
    }
  }

  return ALLOW;
}

// ─── Modifica ────────────────────────────────────────────────────────

/**
 * Campi che l'attore può modificare su questo utente. Insieme vuoto = sola lettura.
 * È l'unico punto in cui si decide cosa un ruolo può toccare.
 */
export function getEditableFields(actor: ScopeActor, target: ScopeTarget): EditableField[] {
  if (!canViewUser(actor, target)) return [];

  // Nessuno modifica se stesso da qui (si usa il proprio profilo).
  if (actor.id === target.id && !isAdminLevel(actor.role)) return [];

  if (actor.role === "SUPER_ADMIN") {
    return [
      "name", "email", "departments", "contentTypes", "viewDepartmentIds",
      "permissionFlags", "role", "isActive", "canCreateUsers",
    ];
  }

  if (actor.role === "ADMIN") {
    // Su ADMIN/SUPER_ADMIN interviene solo il SUPER_ADMIN (regola preesistente).
    if (isAdminLevel(target.role)) return [];
    return [
      "name", "email", "departments", "contentTypes", "viewDepartmentIds",
      "permissionFlags", "role", "isActive", "canCreateUsers",
    ];
  }

  if (actor.role === "HOTEL_MANAGER") {
    const fields: EditableField[] = [
      "name",
      "departments",
      "viewDepartmentIds",
      "role",
      "isActive",
    ];
    // I tipi di contenuto hanno senso solo su chi produce contenuti.
    if (target.role === "HOD") {
      fields.push("contentTypes", "canCreateUsers");
    }
    // L'email è correggibile finché l'invito non è stato completato.
    if (target.activatedAt === null) fields.push("email");
    // NOTA: mai "permissionFlags" — canView/canEdit/canApprove/canPublish
    // restano all'Head of Operations.
    return fields;
  }

  if (actor.role === "HOD") {
    // Solo col flag, solo sui propri creati, solo finché non si sono attivati,
    // e solo l'email (serve a correggere un indirizzo sbagliato e rimandare l'invito).
    if (!actor.canCreateUsers) return [];
    if (target.createdById !== actor.id) return [];
    if (target.activatedAt !== null) return [];
    return ["email"];
  }

  return [];
}

/** Scorciatoia: l'attore può modificare almeno un campo di questo utente? */
export function canEditUser(actor: ScopeActor, target: ScopeTarget): boolean {
  return getEditableFields(actor, target).length > 0;
}

/** Verifica puntuale su un campo, con messaggio pronto per la risposta 403. */
export function canEditField(
  actor: ScopeActor,
  target: ScopeTarget,
  field: EditableField
): ScopeResult {
  if (!canViewUser(actor, target)) return deny("Utente fuori dal tuo perimetro.");
  if (getEditableFields(actor, target).includes(field)) return ALLOW;

  if (field === "permissionFlags") {
    return deny("I permessi di questo utente li governa l'Head of Operations.");
  }
  if (field === "email" && target.activatedAt !== null) {
    return deny("L'email è modificabile solo prima dell'attivazione.");
  }
  return deny("Non hai i permessi per modificare questo dato.");
}

// ─── Cambio ruolo ────────────────────────────────────────────────────

/** Ruoli verso cui l'attore può spostare questo utente. */
export function getAssignableRoles(actor: ScopeActor, target: ScopeTarget): Role[] {
  if (!getEditableFields(actor, target).includes("role")) return [];

  if (actor.role === "SUPER_ADMIN") {
    return ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"];
  }
  if (actor.role === "ADMIN") {
    return ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE"];
  }
  if (actor.role === "HOTEL_MANAGER") {
    // Solo il travaso fra operativo e capo reparto.
    return ["OPERATOR", "HOD"];
  }
  return [];
}

/** Una retrocessione da capo reparto a operatore esige sempre una motivazione. */
export function requiresDemotionNote(fromRole: Role, toRole: Role): boolean {
  return fromRole === "HOD" && toRole === "OPERATOR";
}

export function canChangeRole(
  actor: ScopeActor,
  target: ScopeTarget,
  newRole: Role,
  note?: string | null
): ScopeResult {
  if (newRole === target.role) return ALLOW;

  const assignable = getAssignableRoles(actor, target);
  if (assignable.length === 0) {
    return deny("Non puoi cambiare il ruolo di questo utente.");
  }
  if (!assignable.includes(newRole)) {
    return deny("Non puoi assegnare questo ruolo.");
  }

  if (requiresDemotionNote(target.role, newRole) && !note?.trim()) {
    return deny("La motivazione è obbligatoria");
  }

  return ALLOW;
}

// ─── Flag di creazione ───────────────────────────────────────────────

/** canCreateUsers: ADMIN ovunque, HM sui propri HOD. Mai sugli operatori. */
export function canToggleCreateFlag(actor: ScopeActor, target: ScopeTarget): ScopeResult {
  if (target.role !== "HOD") {
    return deny("La creazione utenti si concede solo ai capi reparto.");
  }
  return canEditField(actor, target, "canCreateUsers");
}

// ─── Attivazione e disattivazione ────────────────────────────────────

export function canDeactivateUser(actor: ScopeActor, target: ScopeTarget): ScopeResult {
  if (actor.id === target.id) return deny("Non puoi disattivare te stesso.");
  return canEditField(actor, target, "isActive");
}

/** Chi può (ri)mandare l'invito di attivazione. */
export function canSendActivation(actor: ScopeActor, target: ScopeTarget): ScopeResult {
  if (!canViewUser(actor, target)) return deny("Utente fuori dal tuo perimetro.");

  if (isAdminLevel(actor.role) || actor.role === "HOTEL_MANAGER") return ALLOW;

  if (actor.role === "HOD") {
    if (!actor.canCreateUsers) return deny("Non hai i permessi per mandare inviti.");
    if (target.createdById !== actor.id) {
      return deny("Puoi rimandare l'invito solo a chi hai creato tu.");
    }
    if (target.activatedAt !== null) return deny("Questo utente è già attivo.");
    return ALLOW;
  }

  return deny("Non hai i permessi per mandare inviti.");
}

/** Il link di reimpostazione ha senso solo per chi si è già attivato. */
export function canSendReset(actor: ScopeActor, target: ScopeTarget): ScopeResult {
  if (!canViewUser(actor, target)) return deny("Utente fuori dal tuo perimetro.");
  if (target.activatedAt === null) {
    return deny("Questo utente non ha ancora attivato l'account: mandagli l'invito.");
  }
  if (isAdminLevel(actor.role) || actor.role === "HOTEL_MANAGER") return ALLOW;
  return deny("Non hai i permessi per inviare il link di reimpostazione.");
}

// ─── Preset per ruolo ────────────────────────────────────────────────

export interface RolePresets {
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  contentTypes: ContentType[];
}

/**
 * Permessi applicati dal sistema in base al ruolo.
 *
 * Chi non può toccare i flag (l'HM) non li sceglie: li riceve da qui. In
 * particolare `canCreateUsers` NON è mai acceso in automatico — è sempre una
 * concessione esplicita.
 */
export function getRolePresets(role: Role): RolePresets {
  switch (role) {
    case "OPERATOR":
      return { canView: true, canEdit: false, canApprove: false, canPublish: false, contentTypes: [] };
    case "HOD":
      return {
        canView: true,
        canEdit: true,
        canApprove: false,
        canPublish: false,
        contentTypes: ["SOP", "DOCUMENT", "MEMO"],
      };
    case "HOTEL_MANAGER":
    case "CORPORATE":
      return {
        canView: true,
        canEdit: true,
        canApprove: true,
        canPublish: false,
        contentTypes: ["SOP", "DOCUMENT", "MEMO"],
      };
    case "ADMIN":
    case "SUPER_ADMIN":
      return {
        canView: true,
        canEdit: true,
        canApprove: true,
        canPublish: true,
        contentTypes: ["SOP", "DOCUMENT", "MEMO"],
      };
    default:
      return { canView: true, canEdit: false, canApprove: false, canPublish: false, contentTypes: [] };
  }
}

// ─── Stato di attivazione (per la colonna in lista) ──────────────────

export type ActivationState = "ACTIVATED" | "PENDING" | "NEVER_INVITED";

export interface ActivationStatus {
  state: ActivationState;
  /** Giorni dall'ultimo invito, valorizzato solo quando in attesa. */
  daysWaiting: number | null;
}

/**
 * Stato di attivazione mostrato in lista.
 * `lastInviteAt` è la data dell'ultimo token ACTIVATION emesso.
 */
export function getActivationStatus(
  target: { activatedAt: Date | null },
  lastInviteAt: Date | null,
  now: Date = new Date()
): ActivationStatus {
  if (target.activatedAt !== null) return { state: "ACTIVATED", daysWaiting: null };
  if (!lastInviteAt) return { state: "NEVER_INVITED", daysWaiting: null };

  const days = Math.floor((now.getTime() - lastInviteAt.getTime()) / (24 * 60 * 60 * 1000));
  return { state: "PENDING", daysWaiting: Math.max(0, days) };
}

// ─── Doppioni ────────────────────────────────────────────────────────

/** Normalizza un nome per il confronto: minuscolo, spazi compattati. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Due nomi coincidono (per l'avviso non bloccante sui doppioni). */
export function isSameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
