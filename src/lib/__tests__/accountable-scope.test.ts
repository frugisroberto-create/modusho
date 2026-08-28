import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  requiresAccountableSelection,
  isAccountableCandidate,
  getAccountableCandidates,
  hasSingleCandidate,
  checkAccountableProposal,
  ACCOUNTABLE_MESSAGES,
  type AccountableCandidate,
} from "../accountable-scope";

// ─── Fixture ─────────────────────────────────────────────────────────
// Una struttura (P1) con due reparti: Front Office e F&B.

const P1 = "prop-1";
const P2 = "prop-2";
const FO = "dept-fo-1";
const FB = "dept-fb-1";

function candidate(
  id: string,
  role: Role,
  assignments: { propertyId: string; departmentId: string | null }[],
  overrides: Partial<AccountableCandidate> = {}
): AccountableCandidate {
  return {
    id,
    role,
    canApprove: false,
    isActive: true,
    assignments,
    ...overrides,
  };
}

const adminP1 = candidate("admin-1", "ADMIN", [{ propertyId: P1, departmentId: null }]);
const superAdminP1 = candidate("sa-1", "SUPER_ADMIN", [{ propertyId: P1, departmentId: FO }]);
const hmCanApproveFo = candidate("hm-1", "HOTEL_MANAGER", [{ propertyId: P1, departmentId: FO }], {
  canApprove: true,
});
const hmNoCanApproveFo = candidate("hm-2", "HOTEL_MANAGER", [{ propertyId: P1, departmentId: FO }], {
  canApprove: false,
});
const corporateCanApproveFb = candidate("corp-1", "CORPORATE", [{ propertyId: P1, departmentId: FB }], {
  canApprove: true,
});
const adminP2 = candidate("admin-2", "ADMIN", [{ propertyId: P2, departmentId: null }]);
const inactiveCanApproveFo = candidate("inactive-1", "HOTEL_MANAGER", [{ propertyId: P1, departmentId: FO }], {
  canApprove: true,
  isActive: false,
});

// ─── requiresAccountableSelection ──────────────────────────────────────

describe("requiresAccountableSelection", () => {
  it("HOD e HOTEL_MANAGER scelgono l'Accountable", () => {
    expect(requiresAccountableSelection("HOD")).toBe(true);
    expect(requiresAccountableSelection("HOTEL_MANAGER")).toBe(true);
  });

  it("CORPORATE, ADMIN, SUPER_ADMIN non scelgono — restano self-accountable o senza scelta", () => {
    expect(requiresAccountableSelection("CORPORATE")).toBe(false);
    expect(requiresAccountableSelection("ADMIN")).toBe(false);
    expect(requiresAccountableSelection("SUPER_ADMIN")).toBe(false);
  });

  it("OPERATOR non apre SOP: comunque non richiede selezione", () => {
    expect(requiresAccountableSelection("OPERATOR")).toBe(false);
  });
});

// ─── isAccountableCandidate / getAccountableCandidates ────────────────

describe("isAccountableCandidate", () => {
  it("un ADMIN assegnato alla struttura è candidato, qualunque sia il reparto", () => {
    expect(isAccountableCandidate(adminP1, P1, FO)).toBe(true);
    expect(isAccountableCandidate(adminP1, P1, FB)).toBe(true);
  });

  it("un SUPER_ADMIN assegnato alla struttura è candidato, qualunque sia il reparto", () => {
    expect(isAccountableCandidate(superAdminP1, P1, FB)).toBe(true);
  });

  it("un ADMIN di un'altra struttura NON è candidato", () => {
    expect(isAccountableCandidate(adminP2, P1, FO)).toBe(false);
  });

  it("un utente con canApprove assegnato a struttura + reparto è candidato", () => {
    expect(isAccountableCandidate(hmCanApproveFo, P1, FO)).toBe(true);
  });

  it("un utente con canApprove ma assegnato a un ALTRO reparto NON è candidato", () => {
    expect(isAccountableCandidate(hmCanApproveFo, P1, FB)).toBe(false);
  });

  it("un utente senza canApprove NON è candidato, anche se assegnato al reparto giusto", () => {
    expect(isAccountableCandidate(hmNoCanApproveFo, P1, FO)).toBe(false);
  });

  it("un CORPORATE con canApprove sul proprio reparto è candidato", () => {
    expect(isAccountableCandidate(corporateCanApproveFb, P1, FB)).toBe(true);
  });

  it("un utente inattivo non è mai candidato, nemmeno con canApprove nel reparto giusto", () => {
    expect(isAccountableCandidate(inactiveCanApproveFo, P1, FO)).toBe(false);
  });
});

describe("getAccountableCandidates", () => {
  it("un reparto senza utenti con canApprove: la rosa è comunque gli ADMIN della struttura", () => {
    const pool = getAccountableCandidates([adminP1, superAdminP1, adminP2], P1, FB);
    expect(pool.map((c) => c.id).sort()).toEqual(["admin-1", "sa-1"]);
  });

  it("reparto con un utente competente in più: la rosa lo aggiunge agli ADMIN", () => {
    const pool = getAccountableCandidates([adminP1, superAdminP1, hmCanApproveFo], P1, FO);
    expect(pool.map((c) => c.id).sort()).toEqual(["admin-1", "hm-1", "sa-1"]);
  });

  it("gli ADMIN di un'altra struttura non entrano mai nella rosa", () => {
    const pool = getAccountableCandidates([adminP1, adminP2], P1, FO);
    expect(pool.map((c) => c.id)).toEqual(["admin-1"]);
  });
});

// ─── hasSingleCandidate ─────────────────────────────────────────────

describe("hasSingleCandidate", () => {
  it("un solo candidato: preselezionabile", () => {
    expect(hasSingleCandidate([{ id: "admin-1" }])).toBe(true);
  });

  it("due o più candidati: non si preseleziona", () => {
    expect(hasSingleCandidate([{ id: "admin-1" }, { id: "hm-1" }])).toBe(false);
  });

  it("nessun candidato: non si preseleziona", () => {
    expect(hasSingleCandidate([])).toBe(false);
  });
});

// ─── checkAccountableProposal ───────────────────────────────────────

describe("checkAccountableProposal", () => {
  const pool = [adminP1, hmCanApproveFo, hmNoCanApproveFo];

  it("nessuna proposta: rifiutata come campo obbligatorio", () => {
    const verdict = checkAccountableProposal(undefined, pool, P1, FO);
    expect(verdict).toEqual({ allowed: false, reason: ACCOUNTABLE_MESSAGES.required });
  });

  it("stringa vuota: rifiutata come campo obbligatorio", () => {
    const verdict = checkAccountableProposal("", pool, P1, FO);
    expect(verdict.allowed).toBe(false);
  });

  it("un candidato legittimo (ADMIN della struttura) è accettato", () => {
    const verdict = checkAccountableProposal("admin-1", pool, P1, FO);
    expect(verdict).toEqual({ allowed: true, accountableId: "admin-1" });
  });

  it("un candidato legittimo (canApprove sul reparto giusto) è accettato", () => {
    const verdict = checkAccountableProposal("hm-1", pool, P1, FO);
    expect(verdict).toEqual({ allowed: true, accountableId: "hm-1" });
  });

  it("un utente non candidato (senza canApprove) è rifiutato con messaggio leggibile", () => {
    const verdict = checkAccountableProposal("hm-2", pool, P1, FO);
    expect(verdict).toEqual({ allowed: false, reason: ACCOUNTABLE_MESSAGES.notCandidate });
  });

  it("un utente estraneo (id non presente nella rosa) è rifiutato", () => {
    const verdict = checkAccountableProposal("chiunque", pool, P1, FO);
    expect(verdict.allowed).toBe(false);
  });

  it("un candidato legittimo per un altro reparto è rifiutato qui", () => {
    // hm-1 ha canApprove solo su FO, non su FB
    const verdict = checkAccountableProposal("hm-1", pool, P1, FB);
    expect(verdict.allowed).toBe(false);
  });
});
