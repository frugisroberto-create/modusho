/**
 * Ponte fra il database e le regole pure di `user-scope.ts`.
 *
 * Qui stanno le sole query necessarie a costruire attore e bersaglio; le
 * decisioni restano nelle funzioni pure, così il perimetro è testabile.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getVisibleRoles, type ScopeActor, type ScopeTarget } from "./user-scope";

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
