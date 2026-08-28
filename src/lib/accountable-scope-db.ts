/**
 * Ponte fra il database e le regole pure di `accountable-scope.ts`.
 *
 * Qui sta la sola query necessaria a costruire la rosa grezza; il giudizio
 * (chi ci rientra, se preselezionare, se una proposta è legittima) resta
 * nelle funzioni pure, così il perimetro è testabile. Questo file non decide
 * niente: carica e delega.
 *
 * Stessa divisione già adottata da `target-audience-scope.ts` /
 * `target-audience-scope-db.ts`.
 */

import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import {
  checkAccountableProposal,
  getAccountableCandidates,
  type AccountableCandidate,
  type AccountableVerdict,
} from "./accountable-scope";

interface RawCandidate extends AccountableCandidate {
  name: string;
}

/**
 * Carica la rosa grezza: ADMIN/SUPER_ADMIN assegnati alla struttura (qualunque
 * reparto), più utenti con canApprove assegnati alla struttura. Il filtro
 * esatto per reparto lo applica il modulo puro, non questa query — qui si
 * carica un insieme plausibile, non ancora il verdetto.
 */
async function loadRawCandidates(propertyId: string): Promise<RawCandidate[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { canApprove: true }],
      propertyAssignments: { some: { propertyId } },
    },
    select: {
      id: true,
      name: true,
      role: true,
      canApprove: true,
      isActive: true,
      propertyAssignments: { select: { propertyId: true, departmentId: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    canApprove: u.canApprove,
    isActive: u.isActive,
    assignments: u.propertyAssignments.map((a) => ({
      propertyId: a.propertyId,
      departmentId: a.departmentId,
    })),
  }));
}

/** Per il modulo: la rosa dei candidati Accountable, con nome per la tendina. */
export async function loadAccountableCandidates(
  propertyId: string,
  departmentId: string
): Promise<{ id: string; name: string; role: Role }[]> {
  const raw = await loadRawCandidates(propertyId);
  const pool = getAccountableCandidates(raw, propertyId, departmentId);
  return pool.map((c) => ({ id: c.id, name: c.name, role: c.role }));
}

/** Per la rotta: valida l'accountableId in arrivo dal client. */
export async function validateAccountableProposal(
  proposedUserId: string | undefined | null,
  propertyId: string,
  departmentId: string
): Promise<AccountableVerdict> {
  const raw = await loadRawCandidates(propertyId);
  return checkAccountableProposal(proposedUserId, raw, propertyId, departmentId);
}
