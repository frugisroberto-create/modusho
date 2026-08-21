/**
 * Ponte fra il database e le regole pure di `user-scope.ts`.
 *
 * Qui stanno le sole query necessarie a costruire attore e bersaglio; le
 * decisioni restano nelle funzioni pure, così il perimetro è testabile.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  getVisibleRoles,
  canAssignDepartment,
  type ScopeActor,
  type ScopeTarget,
  type ScopeResult,
  type AssignmentScopeMessages,
} from "./user-scope";

/** Carica l'attore (chi sta agendo) con property e reparti assegnati. */
export async function loadActor(userId: string): Promise<ScopeActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      canCreateUsers: true,
      isActive: true,
      propertyAssignments: { select: { propertyId: true, departmentId: true } },
    },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    role: user.role,
    canCreateUsers: user.canCreateUsers,
    propertyIds: [...new Set(user.propertyAssignments.map((a) => a.propertyId))],
    departmentIds: [
      ...new Set(
        user.propertyAssignments
          .map((a) => a.departmentId)
          .filter((id): id is string => id !== null)
      ),
    ],
  };
}

/** Carica il bersaglio dell'azione. */
export async function loadTarget(userId: string): Promise<ScopeTarget | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      createdById: true,
      activatedAt: true,
      propertyAssignments: { select: { propertyId: true, departmentId: true } },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    createdById: user.createdById,
    activatedAt: user.activatedAt,
    propertyIds: [...new Set(user.propertyAssignments.map((a) => a.propertyId))],
    departmentIds: [
      ...new Set(
        user.propertyAssignments
          .map((a) => a.departmentId)
          .filter((id): id is string => id !== null)
      ),
    ],
  };
}

/**
 * Risolve, con una sola query, a quale struttura appartiene ciascun reparto
 * indicato. Vive qui e non in `user-scope.ts` perché richiede una lettura:
 * `PropertyAssignment.departmentId` e `PropertyAssignment.propertyId` sono
 * due foreign key indipendenti — il database non impedisce di abbinare un
 * reparto alla struttura sbagliata — quindi l'unica fonte vera è
 * `Department.propertyId`, non l'elenco in memoria dell'attore.
 */
async function resolveDepartmentProperties(departmentIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(departmentIds)];
  if (ids.length === 0) return new Map();

  const rows = await prisma.department.findMany({
    where: { id: { in: ids } },
    select: { id: true, propertyId: true },
  });
  return new Map(rows.map((d) => [d.id, d.propertyId]));
}

export interface AssignmentInput {
  propertyId: string;
  departmentId?: string | null;
}

/**
 * Valida un elenco di assegnazioni (struttura, reparto) per un attore, in due
 * passi:
 *   1. Perimetro — `canAssignDepartment`, pura, per ciascuna assegnazione.
 *   2. Integrità — il reparto indicato appartiene DAVVERO alla struttura
 *      indicata nella stessa riga. Vale per QUALUNQUE ruolo, SUPER_ADMIN
 *      incluso: non è un controllo di potere, è un controllo di senso — una
 *      riga (StrutturaA, RepartoDiStrutturaB) non ha significato per nessuno.
 *
 * Un solo passo per il database (tutti i reparti coinvolti in una query),
 * qualunque sia il numero di assegnazioni. Usata sia dalla creazione sia
 * dalla modifica: è la sola fonte di verità sulle assegnazioni.
 */
export async function validateAssignments(
  actor: ScopeActor,
  assignments: AssignmentInput[],
  messages?: AssignmentScopeMessages
): Promise<ScopeResult> {
  for (const assignment of assignments) {
    const verdict = canAssignDepartment(actor, assignment, messages);
    if (!verdict.allowed) return verdict;
  }

  const departmentIds = assignments
    .map((a) => a.departmentId)
    .filter((id): id is string => !!id);
  const propertyByDept = await resolveDepartmentProperties(departmentIds);

  for (const assignment of assignments) {
    if (!assignment.departmentId) continue;
    const realPropertyId = propertyByDept.get(assignment.departmentId);
    if (realPropertyId === undefined || realPropertyId !== assignment.propertyId) {
      return {
        allowed: false,
        reason: "Il reparto indicato non appartiene alla struttura indicata.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Valida un elenco di id di reparto "sciolti" (`viewDepartmentIds`,
 * `targetDepartmentIds`): nessuno può concedere a un altro l'accesso a un
 * reparto che non ha lui stesso. A differenza di `validateAssignments`, qui
 * non arriva un propertyId dal chiamante — si risale alla struttura vera del
 * reparto e si applica la stessa regola di `canAssignDepartment`.
 */
export async function validateDepartmentIds(
  actor: ScopeActor,
  departmentIds: string[],
  messages?: AssignmentScopeMessages & { notFound?: string }
): Promise<ScopeResult> {
  if (departmentIds.length === 0) return { allowed: true };

  const propertyByDept = await resolveDepartmentProperties(departmentIds);

  for (const departmentId of departmentIds) {
    const propertyId = propertyByDept.get(departmentId);
    if (propertyId === undefined) {
      return { allowed: false, reason: messages?.notFound ?? "Reparto inesistente." };
    }
    const verdict = canAssignDepartment(actor, { propertyId, departmentId }, messages);
    if (!verdict.allowed) return verdict;
  }

  return { allowed: true };
}

/**
 * Clausola Prisma che limita la lista agli utenti visibili all'attore.
 * Rispecchia `canViewUser`: se una delle due cambia, cambiano entrambe.
 */
export function buildVisibilityWhere(actor: ScopeActor): Prisma.UserWhereInput {
  if (actor.role === "SUPER_ADMIN") return {};

  const roles = getVisibleRoles(actor);
  if (roles.length === 0) {
    // Nessun ruolo visibile: clausola impossibile, lista vuota.
    return { id: "__nessuno__" };
  }

  if (actor.role === "HOD") {
    // Solo gli operatori del proprio reparto: property E reparto nello stesso
    // assignment, altrimenti si vedrebbero operatori di reparti vicini.
    return {
      role: { in: roles },
      propertyAssignments: {
        some: {
          propertyId: { in: actor.propertyIds },
          departmentId: { in: actor.departmentIds },
        },
      },
    };
  }

  return {
    role: { in: roles },
    propertyAssignments: { some: { propertyId: { in: actor.propertyIds } } },
  };
}
