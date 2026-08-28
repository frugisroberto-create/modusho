import { describe, it, expect, vi, beforeEach } from "vitest";

// Il client Prisma è sostituito: questi test non toccano nessun database.
vi.mock("../prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    department: { findMany: vi.fn() },
  },
}));

import type { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { checkAudienceForUser, loadTargetableDepartmentIds } from "../target-audience-scope-db";
import { AUDIENCE_MESSAGES } from "../target-audience-scope";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

const P1 = "prop-1";
const FB1 = "dept-fb-1";
const SALA1 = "dept-sala-1";
const PIANI1 = "dept-piani-1";
const ME = "actor-1";

/** L'utente come lo restituisce `loadAudienceActor`. */
function dbUser(role: Role, targetDepartmentIds: string[], assigned: string[]) {
  return {
    id: ME,
    role,
    targetDepartmentIds,
    propertyAssignments: assigned.map((departmentId) => ({ departmentId })),
  };
}

function p1Departments() {
  return [{ id: FB1 }, { id: SALA1 }, { id: PIANI1 }];
}

const EVERYTHING = {
  allDepartments: true,
  roles: ["HOD", "HOTEL_MANAGER"],
  departmentIds: [FB1, SALA1, PIANI1],
  userIds: [ME, "chiunque"],
};

// ─── Gli altri ruoli attraversano il controllo come se non ci fosse ──

describe("checkAudienceForUser — HOD, HM, ADMIN, SUPER_ADMIN invariati", () => {
  const roles: Role[] = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"];

  for (const role of roles) {
    it(`${role}: concede qualunque proposta, compresi ruoli trasversali e sé stesso`, async () => {
      const verdetto = await checkAudienceForUser(ME, role, P1, EVERYTHING);

      expect(verdetto).toEqual({ allowed: true });
    });

    it(`${role}: non tocca il database — nemmeno per sapere chi è`, async () => {
      await checkAudienceForUser(ME, role, P1, EVERYTHING);

      // Zero letture. È la garanzia che conta: questa funzione sta sul
      // percorso di tutti, e su chi non ha un perimetro deve passare senza
      // che accada niente. Nessuna riga letta significa nessuna riga da cui
      // possa uscire un verdetto — compreso il "negato" di un utente non
      // trovato, che a un Hotel Manager non deve poter capitare.
      expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
      expect(mockedPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it(`${role}: nemmeno un database che risponde male lo blocca`, async () => {
      // Il caso che fa danno in silenzio: se il controllo leggesse la riga
      // utente e non la trovasse, risponderebbe "negato" a chi con questo
      // perimetro non c'entra nulla. Qui la riga non esiste, e non importa.
      mockedPrisma.user.findUnique.mockResolvedValue(null as never);

      const verdetto = await checkAudienceForUser(ME, role, P1, EVERYTHING);

      expect(verdetto).toEqual({ allowed: true });
    });
  }

  it("un HOTEL_MANAGER con targetDepartmentIds valorizzati resta senza restrizione", async () => {
    // Il campo esiste su ogni utente: non deve iniziare a mordere qui.
    const verdetto = await checkAudienceForUser(ME, "HOTEL_MANAGER", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [PIANI1],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: true });
  });
});

// ─── Il CORPORATE ────────────────────────────────────────────────────

describe("checkAudienceForUser — CORPORATE", () => {
  function corporate(targetDepartmentIds: string[], assigned: string[] = [FB1]) {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(
      dbUser("CORPORATE", targetDepartmentIds, assigned) as never
    );
    mockedPrisma.department.findMany.mockResolvedValueOnce(p1Departments() as never);
  }

  it("accetta i reparti di competenza", async () => {
    corporate([FB1, SALA1]);
    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [FB1, SALA1],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: true });
  });

  it("rifiuta «Tutti gli operatori»", async () => {
    corporate([FB1]);
    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: true,
      roles: [],
      departmentIds: [],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.everyone });
  });

  it("rifiuta un reparto fuori competenza", async () => {
    corporate([FB1]);
    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [PIANI1],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.departments });
  });

  it("rifiuta un utente che lavora fuori competenza", async () => {
    corporate([FB1]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([
      { id: "governante", propertyAssignments: [{ departmentId: PIANI1 }] },
    ] as never);

    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [],
      userIds: ["governante"],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.users });
  });

  it("accetta un utente del proprio perimetro", async () => {
    corporate([FB1]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([
      { id: "chef", propertyAssignments: [{ departmentId: FB1 }] },
    ] as never);

    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [],
      userIds: ["chef"],
    });

    expect(verdetto).toEqual({ allowed: true });
  });

  it("reparti destinabili VUOTI: vale l'assegnazione, non la struttura intera", async () => {
    corporate([], [SALA1]);
    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [SALA1, PIANI1],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.departments });
  });

  it("nessuna competenza in questa struttura: si chiude, non si apre", async () => {
    corporate([], []);
    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [FB1],
      userIds: [],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.empty });
  });

  it("un utente sconosciuto al database non è destinabile", async () => {
    corporate([FB1]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([] as never);

    const verdetto = await checkAudienceForUser(ME, "CORPORATE", P1, {
      allDepartments: false,
      roles: [],
      departmentIds: [],
      userIds: ["fantasma"],
    });

    expect(verdetto).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.users });
  });
});

describe("checkAudienceForUser — attore inesistente", () => {
  it("non concede nulla", async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null as never);

    const verdetto = await checkAudienceForUser("ignoto", "CORPORATE", P1, EVERYTHING);

    expect(verdetto.allowed).toBe(false);
  });
});

// ─── Il perimetro che le pagine mostrano ─────────────────────────────

describe("loadTargetableDepartmentIds", () => {
  it("per i ruoli non ristretti non c'è perimetro da mostrare", async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(
      dbUser("HOTEL_MANAGER", [FB1], [FB1]) as never
    );

    expect(await loadTargetableDepartmentIds(ME, P1)).toBeNull();
    expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
  });

  it("per il CORPORATE è il perimetro ristretto alla struttura", async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(
      dbUser("CORPORATE", [FB1, "dept-di-un-altro-hotel"], [FB1]) as never
    );
    mockedPrisma.department.findMany.mockResolvedValueOnce(p1Departments() as never);

    expect(await loadTargetableDepartmentIds(ME, P1)).toEqual([FB1]);
  });
});
