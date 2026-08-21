import { describe, it, expect, vi, beforeEach } from "vitest";

// Il client Prisma è sostituito: questi test non toccano nessun database.
vi.mock("../prisma", () => ({
  prisma: {
    department: { findMany: vi.fn() },
  },
}));

import { prisma } from "../prisma";
import { validateAssignments, validateDepartmentIds } from "../user-scope-db";
import type { ScopeActor } from "../user-scope";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

const P1 = "prop-1";
const P2 = "prop-2";
const D1 = "dept-1"; // reparto vero di P1
const D2 = "dept-2"; // reparto vero di P2

function hm(propertyIds: string[]): ScopeActor {
  return { id: "actor-1", role: "HOTEL_MANAGER", canCreateUsers: false, propertyIds, departmentIds: [] };
}

function superAdmin(): ScopeActor {
  return { id: "actor-1", role: "SUPER_ADMIN", canCreateUsers: false, propertyIds: [], departmentIds: [] };
}

describe("validateAssignments — perimetro + integrità, in un solo giro di database", () => {
  it("un'assegnazione con reparto appartenente a un'altra struttura viene rifiutata, per QUALUNQUE ruolo — anche SUPER_ADMIN", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D2, propertyId: P2 }] as never);

    const verdetto = await validateAssignments(superAdmin(), [{ propertyId: P1, departmentId: D2 }]);

    expect(verdetto.allowed).toBe(false);
    if (!verdetto.allowed) {
      expect(verdetto.reason).toBe("Il reparto indicato non appartiene alla struttura indicata.");
    }
  });

  it("un'assegnazione coerente (reparto della struttura giusta, dentro il perimetro) è ammessa", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D1, propertyId: P1 }] as never);

    const verdetto = await validateAssignments(hm([P1]), [{ propertyId: P1, departmentId: D1 }]);

    expect(verdetto.allowed).toBe(true);
  });

  it("il perimetro viene verificato PRIMA dell'integrità: struttura fuori raggio nega senza nemmeno interrogare il database", async () => {
    const verdetto = await validateAssignments(hm([P1]), [{ propertyId: P2, departmentId: D2 }]);

    expect(verdetto.allowed).toBe(false);
    expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
  });

  it("una sola query anche con più assegnazioni", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D1, propertyId: P1 }] as never);

    await validateAssignments(hm([P1]), [
      { propertyId: P1, departmentId: D1 },
      { propertyId: P1, departmentId: null },
    ]);

    expect(mockedPrisma.department.findMany).toHaveBeenCalledTimes(1);
  });

  it("array vuoto: nessuna query, nessun diniego", async () => {
    const verdetto = await validateAssignments(hm([P1]), []);
    expect(verdetto.allowed).toBe(true);
    expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
  });
});

describe("validateDepartmentIds — viewDepartmentIds/targetDepartmentIds", () => {
  it("un reparto fuori perimetro viene rifiutato", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D2, propertyId: P2 }] as never);

    const verdetto = await validateDepartmentIds(hm([P1]), [D2]);

    expect(verdetto.allowed).toBe(false);
  });

  it("un reparto dentro il perimetro è ammesso", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D1, propertyId: P1 }] as never);

    const verdetto = await validateDepartmentIds(hm([P1]), [D1]);

    expect(verdetto.allowed).toBe(true);
  });

  it("un reparto inesistente viene rifiutato esplicitamente", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([] as never);

    const verdetto = await validateDepartmentIds(hm([P1]), ["id-non-esistente"]);

    expect(verdetto.allowed).toBe(false);
  });

  it("lista vuota: nessuna query, sempre ammessa", async () => {
    const verdetto = await validateDepartmentIds(hm([P1]), []);
    expect(verdetto.allowed).toBe(true);
    expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
  });
});
