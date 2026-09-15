/**
 * Ponte fra il database e le regole pure di `target-audience-scope.ts`.
 *
 * Qui stanno le sole query necessarie a costruire l'attore e i candidati; il
 * giudizio resta nelle funzioni pure, così il perimetro è testabile e vive in
 * un posto solo. Questo file non decide niente: carica e delega.
 *
 * Stessa divisione già adottata da `user-scope.ts` / `user-scope-db.ts`.
 */

import type { Role } from "@prisma/client";
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
  return (await loadAudienceUser(userId))?.actor ?? null;
}

async function loadAudienceUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      targetDepartmentIds: true,
      propertyAssignments: { select: { propertyId: true, departmentId: true } },
    },
  });

  if (!user) return null;

  const actor: AudienceActor = {
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
  return { actor, assignments: user.propertyAssignments };
}

/**
 * Un HOD assegnato alla struttura senza reparto lavora in tutti i suoi reparti:
 * il perimetro sono tutti i reparti della struttura (come getOperativeDepartmentIds).
 */
function withFullAccessHod(
  loaded: NonNullable<Awaited<ReturnType<typeof loadAudienceUser>>>,
  propertyId: string,
  propertyDepartmentIds: string[]
): AudienceActor {
  const { actor, assignments } = loaded;
  if (actor.role !== "HOD") return actor;
  const fullAccess = assignments.some((a) => a.propertyId === propertyId && a.departmentId === null);
  return fullAccess ? { ...actor, assignedDepartmentIds: propertyDepartmentIds } : actor;
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
  const loaded = await loadAudienceUser(userId);
  if (!loaded) return [];
  if (!hasRestrictedAudience(loaded.actor.role)) return null;

  const propertyDepartmentIds = await loadPropertyDepartmentIds(propertyId);
  const actor = withFullAccessHod(loaded, propertyId, propertyDepartmentIds);
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
 * Il ruolo si passa dall'esterno, e si guarda PRIMA di toccare il database.
 * È deliberato: questa funzione sta sul percorso di tutti, e chi non ha un
 * perimetro deve attraversarla senza che accada niente — nessuna lettura,
 * nessuna riga da cui possa arrivare un verdetto. Caricare l'attore e poi
 * scoprire il ruolo significherebbe che una riga utente non trovata risponde
 * "negato" anche a un Hotel Manager, che con questo perimetro non c'entra.
 *
 * Il ruolo di sessione è quello giusto da guardare: il callback JWT lo rilegge
 * dal database a ogni rinnovo del token (`src/lib/auth.ts`), ed è lo stesso
 * valore su cui si reggono già tutti gli altri cancelli di queste rotte.
 */
export async function checkAudienceForUser(
  userId: string,
  role: Role,
  propertyId: string,
  proposal: AudienceProposal
): Promise<AudienceVerdict> {
  if (!hasRestrictedAudience(role)) return { allowed: true };

  const loaded = await loadAudienceUser(userId);
  if (!loaded) return { allowed: false, reason: "Utente non trovato" };

  const [propertyDepartmentIds, candidates] = await Promise.all([
    loadPropertyDepartmentIds(propertyId),
    loadAudienceCandidates(proposal.userIds),
  ]);

  const actor = withFullAccessHod(loaded, propertyId, propertyDepartmentIds);
  return checkAudienceProposal(actor, proposal, { propertyDepartmentIds, candidates });
}

async function loadAudienceCandidates(userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      role: true,
      propertyAssignments: { select: { departmentId: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    role: u.role,
    departmentIds: u.propertyAssignments
      .map((a) => a.departmentId)
      .filter((id): id is string => id !== null),
  }));
}
