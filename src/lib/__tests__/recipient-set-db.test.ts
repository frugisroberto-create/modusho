import { describe, it, expect, vi, beforeEach } from "vitest";

// Il client Prisma è sostituito: questi test non toccano nessun database.
vi.mock("../prisma", () => ({
  prisma: { propertyAssignment: { findMany: vi.fn() } },
}));

import { prisma } from "../prisma";
import { computeCoverage, type CoverageInput } from "../recipient-set-db";

const mockedPrisma = vi.mocked(prisma, true);

// `reset` e non `clear`: i valori accodati con `mockResolvedValueOnce` e non
// consumati da un test sopravvivrebbero al successivo, servendogli i dati
// sbagliati.
beforeEach(() => vi.resetAllMocks());

const P1 = "prop-1", P2 = "prop-2";
const FB = "dept-fb", SALA = "dept-sala";
const OP1 = "op-1", OP2 = "op-2", HOD1 = "hod-1", HM1 = "hm-1";

/** `findMany` di PropertyAssignment è chiamata due volte: strutture, poi reparti. */
function givenAssignments(
  perProperty: { propertyId: string; user: { id: string; role: string } }[],
  perDepartment: { departmentId: string | null; userId: string }[]
) {
  mockedPrisma.propertyAssignment.findMany
    .mockResolvedValueOnce(perProperty as never)
    .mockResolvedValueOnce(perDepartment as never);
}

function content(over: Partial<CoverageInput> = {}): CoverageInput {
  return { propertyId: P1, targetAudience: [], acknowledgments: [], ...over };
}

describe("computeCoverage", () => {
  it("non interroga il database quando non c'è niente da misurare", async () => {
    expect(await computeCoverage([])).toEqual([]);
    expect(mockedPrisma.propertyAssignment.findMany).not.toHaveBeenCalled();
  });

  it("carica le persone in due query sole, qualunque sia il numero di contenuti", async () => {
    givenAssignments(
      [{ propertyId: P1, user: { id: OP1, role: "OPERATOR" } }],
      [{ departmentId: FB, userId: OP1 }]
    );

    const contenuti = Array.from({ length: 30 }, () =>
      content({
        targetAudience: [
          { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: FB, targetUserId: null },
        ],
      })
    );
    await computeCoverage(contenuti);

    expect(mockedPrisma.propertyAssignment.findMany).toHaveBeenCalledTimes(2);
  });

  it("misura ogni contenuto con i suoi destinatari e le sue letture", async () => {
    givenAssignments(
      [
        { propertyId: P1, user: { id: OP1, role: "OPERATOR" } },
        { propertyId: P1, user: { id: OP2, role: "OPERATOR" } },
        { propertyId: P1, user: { id: HOD1, role: "HOD" } },
      ],
      [{ departmentId: FB, userId: OP1 }, { departmentId: FB, userId: HOD1 }]
    );

    const rows = await computeCoverage([
      content({
        targetAudience: [{ targetType: "ROLE", targetRole: "OPERATOR", targetDepartmentId: null, targetUserId: null }],
        acknowledgments: [{ userId: OP1 }],
      }),
      content({
        targetAudience: [{ targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: FB, targetUserId: null }],
        acknowledgments: [{ userId: OP1 }, { userId: HOD1 }],
      }),
    ]);

    // «Tutti gli operatori» sono i due operatori più il capo reparto
    expect(rows[0].coverage).toEqual({ required: 3, done: 1 });
    expect(rows[0].state).toBe("aperta");
    expect(rows[1].coverage).toEqual({ required: 2, done: 2 });
    expect(rows[1].state).toBe("completata");
  });

  it("chi è assegnato due volte alla stessa struttura conta una volta sola", async () => {
    givenAssignments(
      [
        { propertyId: P1, user: { id: OP1, role: "OPERATOR" } },
        { propertyId: P1, user: { id: OP1, role: "OPERATOR" } },
      ],
      []
    );

    const [row] = await computeCoverage([
      content({
        targetAudience: [{ targetType: "ROLE", targetRole: "OPERATOR", targetDepartmentId: null, targetUserId: null }],
      }),
    ]);
    expect(row.coverage.required).toBe(1);
  });

  it("le persone di una struttura non finiscono nei destinatari di un'altra", async () => {
    givenAssignments(
      [
        { propertyId: P1, user: { id: OP1, role: "OPERATOR" } },
        { propertyId: P2, user: { id: OP2, role: "OPERATOR" } },
      ],
      []
    );

    const target = { targetType: "ROLE" as const, targetRole: "OPERATOR" as const, targetDepartmentId: null, targetUserId: null };
    const rows = await computeCoverage([
      content({ propertyId: P1, targetAudience: [target] }),
      content({ propertyId: P2, targetAudience: [target] }),
    ]);

    expect([...rows[0].recipientIds]).toEqual([OP1]);
    expect([...rows[1].recipientIds]).toEqual([OP2]);
  });

  it("un reparto rimasto senza personale attivo lascia il contenuto senza destinatari", async () => {
    givenAssignments([{ propertyId: P1, user: { id: HM1, role: "HOTEL_MANAGER" } }], []);

    const [row] = await computeCoverage([
      content({
        targetAudience: [{ targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: SALA, targetUserId: null }],
      }),
    ]);

    expect(row.coverage).toEqual({ required: 0, done: 0 });
    expect(row.state).toBe("senza-destinatari");
  });

  it("chiede al database solo i reparti che i contenuti nominano davvero", async () => {
    givenAssignments([], [{ departmentId: FB, userId: OP1 }]);

    await computeCoverage([
      content({
        targetAudience: [
          { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: FB, targetUserId: null },
          { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: FB, targetUserId: null },
          { targetType: "ROLE", targetRole: "OPERATOR", targetDepartmentId: null, targetUserId: null },
        ],
      }),
    ]);

    const secondCall = mockedPrisma.propertyAssignment.findMany.mock.calls[1][0];
    expect(secondCall.where.departmentId).toEqual({ in: [FB] });
    // Una riga DEPARTMENT non riguarda hotel manager e corporate assegnati al reparto
    expect(secondCall.where.user.role).toEqual({ in: ["OPERATOR", "HOD"] });
    expect(secondCall.where.user.isActive).toBe(true);
  });
});
