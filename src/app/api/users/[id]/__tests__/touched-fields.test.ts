import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Il difetto che questi test chiudono: la PUT considerava "toccato" ogni campo
 * PRESENTE nella richiesta, e il form rimanda sempre tutti i campi. Per un
 * Hotel Manager due permessi sono condizionati — i tipi di contenuto solo sugli
 * HOD, l'email solo prima dell'attivazione — quindi promuovere un operatore
 * attivato a capo reparto finiva in 403 su dati che nessuno aveva sfiorato.
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
import { recordUserAudit } from "@/lib/user-audit";
import { PUT } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);
const mockedAudit = vi.mocked(recordUserAudit);

const P1 = "prop-1";
const D1 = "dept-1-in-p1";

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** L'Hotel Manager che agisce, assegnato a tutta la struttura P1. */
function hmActor() {
  return {
    id: "actor-1",
    role: "HOTEL_MANAGER",
    canCreateUsers: false,
    isActive: true,
    createdById: null,
    activatedAt: new Date("2026-01-01"),
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
  };
}

/** Il bersaglio, come lo legge `loadTarget`. */
function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    role: "OPERATOR",
    createdById: "qualcun-altro",
    // Attivato: per l'HM l'email NON è più modificabile.
    activatedAt: new Date("2026-02-01"),
    propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    ...overrides,
  };
}

/** Il bersaglio, come lo legge la lettura dei valori attuali. */
function currentRow(overrides: Record<string, unknown> = {}) {
  return {
    role: "OPERATOR",
    name: "Mario Verdi",
    email: "mario@modusho.test",
    isActive: true,
    canView: true,
    canEdit: false,
    canApprove: false,
    canPublish: false,
    canCreateUsers: false,
    targetDepartmentIds: [],
    viewDepartmentIds: [D1],
    propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    contentPermissions: [],
    ...overrides,
  };
}

/** Il corpo che il form manda: SEMPRE tutti i campi. */
function fullFormBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Mario Verdi",
    email: "mario@modusho.test",
    role: "OPERATOR",
    targetDepartmentIds: [],
    viewDepartmentIds: [D1],
    propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    contentTypes: [],
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);
  mockedPrisma.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<void>) =>
    fn({ propertyAssignment: { deleteMany: vi.fn(), create: vi.fn() } })) as never);
});

function mockReads(target = targetRow(), currentValues = currentRow()) {
  mockedPrisma.user.findUnique
    .mockResolvedValueOnce(hmActor() as never)
    .mockResolvedValueOnce(target as never)
    .mockResolvedValueOnce(currentValues as never);
}

describe("PUT /api/users/[id] — un campo conta solo se cambia", () => {
  it("un HOTEL_MANAGER promuove un operatore ATTIVATO a capo reparto", async () => {
    mockReads();

    const res = await PUT(
      fakeRequest(fullFormBody({ role: "HOD" })),
      params("target-1")
    );

    expect(res.status).toBe(200);
    // Il ruolo è stato scritto e i preset del ruolo nuovo con lui.
    const written = mockedPrisma.user.update.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(written.role).toBe("HOD");
    expect(written.canEdit).toBe(true);
    // I tipi di contenuto arrivano dai preset del capo reparto, non dal form.
    expect(mockedPrisma.userContentPermission.deleteMany).toHaveBeenCalled();
    const scritti = mockedPrisma.userContentPermission.create.mock.calls.map(
      (call) => (call[0]!.data as { contentType: string }).contentType
    );
    expect(scritti.sort()).toEqual(["DOCUMENT", "MEMO", "SOP"]);
  });

  it("l'annotazione automatica del cambio ruolo resta, anche senza motivazione", async () => {
    mockReads(targetRow({ role: "HOD" }), currentRow({ role: "HOD" }));

    const res = await PUT(
      fakeRequest(fullFormBody({ role: "OPERATOR" })),
      params("target-1")
    );

    expect(res.status).toBe(200);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGED",
        meta: { from: "HOD", to: "OPERATOR" },
      })
    );
  });

  it("un salvataggio che non cambia nulla passa e non riscrive le relazioni", async () => {
    mockReads();

    const res = await PUT(fakeRequest(fullFormBody()), params("target-1"));

    expect(res.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({ where: { id: "target-1" }, data: {} });
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.userContentPermission.deleteMany).not.toHaveBeenCalled();
  });

  it("l'email cambiata su un utente attivato resta vietata all'HOTEL_MANAGER", async () => {
    mockReads();

    const res = await PUT(
      fakeRequest(fullFormBody({ email: "altro@modusho.test" })),
      params("target-1")
    );

    expect(res.status).toBe(403);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("i tipi di contenuto cambiati su un operatore restano vietati all'HOTEL_MANAGER", async () => {
    // Nessun cambio di ruolo: qui i preset non entrano in gioco e il perimetro
    // sui tipi di contenuto vale in pieno.
    mockReads();

    const res = await PUT(
      fakeRequest(fullFormBody({ contentTypes: ["SOP"] })),
      params("target-1")
    );

    expect(res.status).toBe(403);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });
});
