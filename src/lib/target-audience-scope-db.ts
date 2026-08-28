/**
 * Ponte fra il database e le regole pure di `target-audience-scope.ts`.
 *
 * Qui stanno le sole query necessarie a costruire l'attore e i candidati; il
 * giudizio resta nelle funzioni pure, così il perimetro è testabile e vive in
 * un posto solo. Questo file non decide niente: carica e delega.
 *
 * Stessa divisione già adottata da `user-scope.ts` / `user-scope-db.ts`.
 */

import { prisma } from "./prisma";
import {
  checkAudienceProposal,
  getTargetableDepartmentIdsInProperty,
  hasRestrictedAudience,
  type AudienceActor,
  type AudienceProposal,
  type AudienceVerdict,
} from "./target-audience-scope";

/** Carica chi sta destinando, con reparti destinabili e reparti assegnati. */
export async function loadAudienceActor(userId: string): Promise<AudienceActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      targetDepartmentIds: true,
      propertyAssignments: { select: { departmentId: true } },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    targetDepartmentIds: user.targetDepartmentIds,
    assignedDepartmentIds: [
      ...new Set(
        user.propertyAssignments
          .map((a) => a.departmentId)
          .filter((id): id is string => id !== null)
      ),
    ],
  };
}

/**
 * I reparti destinabili nella struttura scelta. `null` = nessuna restrizione.
 *
 * Serve alle pagine per costruire l'elenco: il modulo mostra esattamente ciò
 * che la rotta accetterà.
 */
export async function loadTargetableDepartmentIds(
  userId: string,
  propertyId: string
): Promise<string[] | null> {
  const actor = await loadAudienceActor(userId);
  if (!actor) return [];
  if (!hasRestrictedAudience(actor.role)) return null;

  const propertyDepartmentIds = await loadPropertyDepartmentIds(propertyId);
  return getTargetableDepartmentIdsInProperty(actor, propertyDepartmentIds);
}

async function loadPropertyDepartmentIds(propertyId: string): Promise<string[]> {
  const departments = await prisma.department.findMany({
    where: { propertyId },
    select: { id: true },
  });
  return departments.map((d) => d.id);
}

/**
 * Il giudizio che ogni rotta chiama prima di scrivere i `ContentTarget`.
 *
 * Per chi non ha perimetro ristretto esce subito, senza toccare il database:
 * HOD, Hotel Manager, ADMIN e SUPER_ADMIN non pagano nemmeno una query in più
 * e attraversano questa funzione come se non ci fosse.
 */
export async function checkAudienceForUser(
  userId: string,
  propertyId: string,
  proposal: AudienceProposal
): Promise<AudienceVerdict> {
  const actor = await loadAudienceActor(userId);
  if (!actor) return { allowed: false, reason: "Utente non trovato" };
  if (!hasRestrictedAudience(actor.role)) return { allowed: true };

  const [propertyDepartmentIds, candidates] = await Promise.all([
    loadPropertyDepartmentIds(propertyId),
    loadAudienceCandidates(proposal.userIds),
  ]);

  return checkAudienceProposal(actor, proposal, { propertyDepartmentIds, candidates });
}

async function loadAudienceCandidates(userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      propertyAssignments: { select: { departmentId: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    departmentIds: u.propertyAssignments
      .map((a) => a.departmentId)
      .filter((id): id is string => id !== null),
  }));
}
