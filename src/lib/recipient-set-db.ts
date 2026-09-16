/**
 * Ponte fra il database e le regole pure di `recipient-set.ts`.
 *
 * Carica in DUE query le persone che servono a risolvere i destinatari di un
 * intero elenco di contenuti — chi è assegnato alle strutture e chi ai reparti
 * — e poi delega il giudizio alle funzioni pure. Il costo non cresce con il
 * numero di contenuti: è il motivo per cui il cruscotto può permettersi la
 * regola vera al posto della scorciatoia in SQL che aveva prima.
 *
 * Questo file non decide niente: carica e delega.
 */

import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import {
  coverageOf,
  coverageState,
  resolveRecipientIds,
  type Coverage,
  type CoverageState,
  type RecipientPools,
  type TargetRow,
} from "./recipient-set";

/**
 * Cosa deve contenere il `select` di chi chiede la copertura.
 * Sta qui perché la forma dei dati e la regola che li legge restino insieme:
 * una rotta che dimentica `targetUser` conterebbe destinatari disattivati.
 */
export const RECIPIENT_COVERAGE_SELECT = {
  targetAudience: {
    select: {
      targetType: true,
      targetRole: true,
      targetDepartmentId: true,
      targetUserId: true,
      targetUser: { select: { isActive: true } },
    },
  },
  acknowledgments: { select: { userId: true } },
} as const;

/** Il minimo che un contenuto deve esporre per essere misurato. */
export interface CoverageInput {
  propertyId: string;
  targetAudience: TargetRow[];
  acknowledgments: { userId: string }[];
}

export interface CoverageRow<T extends CoverageInput> {
  content: T;
  /** Le persone che devono leggere: serve a chi vuole mostrarle o notificarle. */
  recipientIds: Set<string>;
  coverage: Coverage;
  state: CoverageState;
}

/**
 * Misura un elenco di contenuti con la regola unica.
 *
 * L'ordine dell'elenco è conservato: chi chiama può impaginare dopo.
 */
export async function computeCoverage<T extends CoverageInput>(
  contents: T[]
): Promise<CoverageRow<T>[]> {
  if (contents.length === 0) return [];

  const propertyIds = [...new Set(contents.map((c) => c.propertyId))];
  const departmentIds = [
    ...new Set(
      contents.flatMap((c) =>
        c.targetAudience
          .filter((t) => t.targetType === "DEPARTMENT")
          .map((t) => t.targetDepartmentId)
          .filter((id): id is string => id !== null)
      )
    ),
  ];

  const [byProperty, byDepartment] = await Promise.all([
    loadPropertyPools(propertyIds),
    loadDepartmentPools(departmentIds),
  ]);

  return contents.map((content) => {
    const pools: RecipientPools = {
      byRole: byProperty[content.propertyId] ?? {},
      byDepartment,
    };
    const recipientIds = resolveRecipientIds(content.targetAudience, pools);
    const coverage = coverageOf(recipientIds, content.acknowledgments);
    return { content, recipientIds, coverage, state: coverageState(coverage) };
  });
}

/** Gli utenti attivi assegnati a ciascuna struttura, raggruppati per ruolo. */
async function loadPropertyPools(
  propertyIds: string[]
): Promise<Record<string, Partial<Record<Role, string[]>>>> {
  if (propertyIds.length === 0) return {};

  const assignments = await prisma.propertyAssignment.findMany({
    where: { propertyId: { in: propertyIds }, user: { isActive: true } },
    select: { propertyId: true, user: { select: { id: true, role: true } } },
  });

  // Una persona può avere più assegnazioni alla stessa struttura (un reparto
  // per riga): l'insieme evita di contarla due volte nel denominatore.
  const seen: Record<string, Partial<Record<Role, Set<string>>>> = {};
  for (const a of assignments) {
    const roles = (seen[a.propertyId] ??= {});
    (roles[a.user.role] ??= new Set()).add(a.user.id);
  }

  const pools: Record<string, Partial<Record<Role, string[]>>> = {};
  for (const [propertyId, roles] of Object.entries(seen)) {
    const byRole: Partial<Record<Role, string[]>> = {};
    for (const [role, ids] of Object.entries(roles)) {
      byRole[role as Role] = [...ids];
    }
    pools[propertyId] = byRole;
  }
  return pools;
}

/**
 * Operatori e capi reparto attivi assegnati a ciascun reparto.
 * Hotel manager e corporate assegnati a un reparto non sono destinatari di una
 * riga DEPARTMENT: è la stessa regola di `isInTargetAudience`.
 */
async function loadDepartmentPools(
  departmentIds: string[]
): Promise<Record<string, string[]>> {
  if (departmentIds.length === 0) return {};

  const assignments = await prisma.propertyAssignment.findMany({
    where: {
      departmentId: { in: departmentIds },
      user: { isActive: true, role: { in: ["OPERATOR", "HOD"] } },
    },
    select: { departmentId: true, userId: true },
  });

  const seen: Record<string, Set<string>> = {};
  for (const a of assignments) {
    if (!a.departmentId) continue;
    (seen[a.departmentId] ??= new Set()).add(a.userId);
  }

  const pools: Record<string, string[]> = {};
  for (const [departmentId, ids] of Object.entries(seen)) pools[departmentId] = [...ids];
  return pools;
}
