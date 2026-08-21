import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * I flag di visibilità dei comandi di invio, come li calcola il server.
 *
 * Il difetto che questi test bloccano: l'interfaccia decideva da sé, in base al
 * ruolo di chi compilava, se mostrare "Rimanda invito" e "Invia link di
 * reimpostazione". Una regola scritta in due posti diverge — e infatti
 * l'Hotel Manager si era ritrovato senza comandi che il server gli concede.
 * Da qui in avanti la fonte è una sola: `canSendActivation` e `canSendReset`,
 * esposti dalla GET dentro l'oggetto `permissions` già esistente.
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
    authToken: { findFirst: vi.fn() },
    department: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);

const P1 = "prop-1";
const D1 = "dept-1";
const ATTIVATO = new Date("2026-02-01");

function fakeRequest() {
  return {} as unknown as Parameters<typeof GET>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function actorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "actor-1",
    role: "HOTEL_MANAGER",
    canCreateUsers: false,
    isActive: true,
    createdById: null,
    activatedAt: new Date("2026-01-01"),
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
    ...overrides,
  };
}

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    email: "hod@modusho.test",
    name: "Capo reparto",
    role: "HOD",
    canView: true,
    canEdit: true,
    canApprove: false,
    canPublish: false,
    targetDepartmentIds: [],
    viewDepartmentIds: [],
    canCreateUsers: false,
    activatedAt: null,
    createdById: "actor-1",
    isActive: true,
    createdAt: new Date("2026-01-15"),
    lastLoginAt: null,
    createdBy: null,
    propertyAssignments: [
      {
        propertyId: P1,
        departmentId: D1,
        property: { id: P1, name: "Hotel", code: "HTL" },
        department: { id: D1, name: "Front Office", code: "FO" },
      },
    ],
    contentPermissions: [],
    ...overrides,
  };
}

/**
 * La GET interroga prisma.user.findUnique tre volte, in quest'ordine:
 * loadActor, loadTarget, e la query di dettaglio.
 */
function mockQueries(actor: Record<string, unknown>, target: Record<string, unknown>) {
  mockedPrisma.user.findUnique
    .mockResolvedValueOnce(actor as never)
    .mockResolvedValueOnce(target as never)
    .mockResolvedValueOnce(target as never);
  mockedPrisma.authToken.findFirst.mockResolvedValue(null as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);
});

describe("GET /api/users/[id] — i flag di invio arrivano dal server", () => {
  it("un HOTEL_MANAGER può rimandare l'invito a un utente NON attivato del proprio perimetro", async () => {
    mockQueries(actorRow(), targetRow({ activatedAt: null }));

    const res = await GET(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissions.canSendActivation).toBe(true);
    // Su chi non si è ancora attivato la reimpostazione non ha senso: si manda
    // l'invito, non il reset.
    expect(body.permissions.canSendReset).toBe(false);
  });

  it("un HOTEL_MANAGER può inviare la reimpostazione a un utente GIÀ attivato", async () => {
    mockQueries(actorRow(), targetRow({ activatedAt: ATTIVATO }));

    const res = await GET(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.permissions.canSendReset).toBe(true);
  });

  it("un HOD col flag può rimandare l'invito SOLO a chi ha creato lui", async () => {
    const hod = actorRow({
      role: "HOD",
      canCreateUsers: true,
      propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    });
    mockQueries(hod, targetRow({ role: "OPERATOR", activatedAt: null, createdById: "actor-1" }));

    const res = await GET(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.permissions.canSendActivation).toBe(true);
  });

  it("un HOD NON vede il comando su un utente creato da un altro", async () => {
    const hod = actorRow({
      role: "HOD",
      canCreateUsers: true,
      propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    });
    mockQueries(hod, targetRow({ role: "OPERATOR", activatedAt: null, createdById: "qualcun-altro" }));

    const res = await GET(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.permissions.canSendActivation).toBe(false);
  });

  it("un HOD SENZA il flag non riceve alcun comando di invio", async () => {
    const hod = actorRow({
      role: "HOD",
      canCreateUsers: false,
      propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    });
    mockQueries(hod, targetRow({ role: "OPERATOR", activatedAt: null, createdById: "actor-1" }));

    const res = await GET(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.permissions.canSendActivation).toBe(false);
    expect(body.permissions.canSendReset).toBe(false);
  });

  it("i flag sono sempre presenti nella risposta: l'interfaccia non deve dedurli dal ruolo", async () => {
    mockQueries(actorRow(), targetRow());

    const res = await GET(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.permissions).toHaveProperty("canSendActivation");
    expect(body.permissions).toHaveProperty("canSendReset");
    expect(typeof body.permissions.canSendActivation).toBe("boolean");
    expect(typeof body.permissions.canSendReset).toBe("boolean");
  });
});
