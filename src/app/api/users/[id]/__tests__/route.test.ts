import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Copre la chiusura del difetto: la PUT cancellava e riscriveva le
 * assegnazioni da input non validato. Qui si verifica che una richiesta con
 * un'assegnazione fuori perimetro venga respinta PRIMA di qualunque
 * scrittura — in particolare, che `prisma.$transaction` (dove vivono
 * `deleteMany`/`create` sulle assegnazioni) non venga mai invocato.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  buildActivationEmail: vi.fn(),
  sendEmail: vi.fn(),
  getAppUrl: vi.fn(() => "https://modusho.test"),
}));
vi.mock("@/lib/auth-tokens", () => ({ issueToken: vi.fn() }));
vi.mock("@/lib/user-audit", () => ({ recordUserAudit: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    propertyAssignment: { deleteMany: vi.fn(), create: vi.fn() },
    userContentPermission: { deleteMany: vi.fn(), create: vi.fn() },
    department: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PUT } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);

// ─── Fixture: due strutture (P1, P2), un reparto per property ─────────
const P1 = "prop-1";
const P2 = "prop-2";
const D1_P1 = "dept-1-in-p1"; // reparto di P1
const D1_P2 = "dept-1-in-p2"; // reparto di P2 (per il test di integrità)

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Riga utente restituita da prisma.user.findUnique dentro loadActor/loadTarget/current. */
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "actor-1",
    role: "HOTEL_MANAGER",
    canCreateUsers: false,
    isActive: true,
    createdById: null,
    activatedAt: new Date("2026-01-01"),
    email: "attore@modusho.test",
    name: "Attore",
    canEdit: true,
    canApprove: false,
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);
});

describe("PUT /api/users/[id] — perimetro sulle assegnazioni", () => {
  it("un HOTEL_MANAGER NON può spostare un utente in una struttura diversa dalla propria: 403, nessuna transazione", async () => {
    // loadActor: HM assegnato solo a P1 (nessun reparto: accesso a tutta la struttura)
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ role: "HOTEL_MANAGER", propertyAssignments: [{ propertyId: P1, departmentId: null }] }) as never) // loadActor
      .mockResolvedValueOnce(userRow({ id: "target-1", role: "OPERATOR", propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never) // loadTarget
      .mockResolvedValueOnce(userRow({ role: "OPERATOR" }) as never); // current

    const res = await PUT(
      fakeRequest({ propertyAssignments: [{ propertyId: P2, departmentId: null }] }),
      params("target-1")
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/struttura fuori dal tuo perimetro/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("un HOTEL_MANAGER PUÒ spostare un utente in un altro reparto della PROPRIA struttura", async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ role: "HOTEL_MANAGER", propertyAssignments: [{ propertyId: P1, departmentId: null }] }) as never) // loadActor
      .mockResolvedValueOnce(userRow({ id: "target-1", role: "OPERATOR", propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never) // loadTarget
      .mockResolvedValueOnce(userRow({ role: "OPERATOR" }) as never); // current

    // Integrità: D1_P1 appartiene davvero a P1.
    mockedPrisma.department.findMany.mockResolvedValueOnce([
      { id: D1_P1, propertyId: P1 },
    ] as never);
    mockedPrisma.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        propertyAssignment: { deleteMany: vi.fn(), create: vi.fn() },
      })) as never);

    const res = await PUT(
      fakeRequest({ propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }),
      params("target-1")
    );

    expect(res.status).toBe(200);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("un HOD NON può assegnare un reparto che non è suo: 403, nessuna transazione", async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ role: "HOD", canCreateUsers: true, propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never) // loadActor
      .mockResolvedValueOnce(
        userRow({ id: "target-1", role: "OPERATOR", createdById: "actor-1", activatedAt: null, propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never
      ) // loadTarget
      .mockResolvedValueOnce(userRow({ role: "OPERATOR" }) as never); // current

    const res = await PUT(
      fakeRequest({ propertyAssignments: [{ propertyId: P1, departmentId: "altro-reparto" }] }),
      params("target-1")
    );

    // Un HOD non ha "departments" fra i campi modificabili: negato al livello
    // del gate per-campo, prima ancora del controllo sui valori.
    expect(res.status).toBe(403);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("un'assegnazione con reparto di un'altra struttura viene rifiutata anche per un ADMIN (integrità)", async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ role: "ADMIN", propertyAssignments: [{ propertyId: P1, departmentId: null }, { propertyId: P2, departmentId: null }] }) as never) // loadActor
      .mockResolvedValueOnce(userRow({ id: "target-1", role: "OPERATOR", propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never) // loadTarget
      .mockResolvedValueOnce(userRow({ role: "OPERATOR" }) as never); // current

    // D1_P2 appartiene davvero a P2, non a P1: la riga richiesta è incoerente.
    mockedPrisma.department.findMany.mockResolvedValueOnce([
      { id: D1_P2, propertyId: P2 },
    ] as never);

    const res = await PUT(
      fakeRequest({ propertyAssignments: [{ propertyId: P1, departmentId: D1_P2 }] }),
      params("target-1")
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Il reparto indicato non appartiene alla struttura indicata.");
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("viewDepartmentIds con un reparto fuori perimetro viene rifiutato", async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(userRow({ role: "HOTEL_MANAGER", propertyAssignments: [{ propertyId: P1, departmentId: null }] }) as never) // loadActor
      .mockResolvedValueOnce(userRow({ id: "target-1", role: "OPERATOR", propertyAssignments: [{ propertyId: P1, departmentId: D1_P1 }] }) as never) // loadTarget
      .mockResolvedValueOnce(userRow({ role: "OPERATOR" }) as never); // current

    // Il reparto richiesto in viewDepartmentIds appartiene a P2: fuori dal
    // perimetro dell'HM, che è assegnato solo a P1.
    mockedPrisma.department.findMany.mockResolvedValueOnce([
      { id: D1_P2, propertyId: P2 },
    ] as never);

    const res = await PUT(
      fakeRequest({ viewDepartmentIds: [D1_P2] }),
      params("target-1")
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/visibilità.*fuori dal tuo perimetro/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
