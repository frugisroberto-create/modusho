import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Copre il lato SCRITTURA della normalizzazione email (vedi anche
 * email-normalize.test.ts e login-lookup-db.test.ts per la ricerca): un
 * indirizzo inviato con maiuscole va salvato in minuscolo, altrimenti si
 * torna a produrre righe che il login case-insensitive non può più
 * distinguere in modo deterministico (vedi login-lookup.ts).
 *
 * NOTA: z.email() (schema di validazione di questa route) rifiuta a monte
 * un indirizzo con spazi davanti o dietro (400 "Parametri non validi",
 * prima ancora di arrivare a normalizeEmail) — qui si copre quindi solo il
 * caso maiuscole/minuscole, l'unico che questa route lascia passare.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  buildActivationEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => ({ ok: true, adapter: "test" })),
  getAppUrl: vi.fn(() => "https://modusho.test"),
}));
vi.mock("@/lib/auth-tokens", () => ({
  issueToken: vi.fn(async () => ({ token: "tok-123", expiresAt: new Date("2026-01-08") })),
}));
vi.mock("@/lib/user-audit", () => ({ recordUserAudit: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    propertyAssignment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    department: { findMany: vi.fn() },
    userContentPermission: { create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const P1 = "prop-1";

/** Attore SUPER_ADMIN: bypassa il perimetro, così il test resta sul solo comportamento dell'email. */
function superAdminRow() {
  return {
    id: "actor-1",
    role: "SUPER_ADMIN",
    canCreateUsers: true,
    isActive: true,
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
  };
}

beforeEach(() => {
  // resetAllMocks (non solo clear): senza, una mockResolvedValueOnce rimasta
  // in coda da un test che è uscito presto (es. un 400 prima di consumarla)
  // finirebbe risposta al primo findUnique del test successivo.
  vi.resetAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);

  // loadActor
  mockedPrisma.user.findUnique.mockResolvedValueOnce(superAdminRow() as never);
  // integrità assegnazioni: nessun reparto specifico da risolvere
  mockedPrisma.department.findMany.mockResolvedValue([] as never);
  // email non già registrata
  mockedPrisma.user.findUnique.mockResolvedValueOnce(null as never);
  // nessun doppione di nome nella struttura
  mockedPrisma.user.findMany.mockResolvedValueOnce([] as never);
  mockedPrisma.propertyAssignment.findFirst.mockResolvedValue({
    property: { name: "Test Hotel" },
    department: null,
  } as never);
  mockedPrisma.user.create.mockImplementation((async ({ data }: any) => ({
    id: "new-user-1",
    name: data.name,
    email: data.email,
  })) as never);
});

function creationBody(email: string) {
  return {
    email,
    name: "Nuova Persona",
    role: "HOTEL_MANAGER",
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
  };
}

describe("POST /api/users — normalizzazione email in scrittura", () => {
  it("un indirizzo con maiuscole viene salvato in minuscolo", async () => {
    const res = await POST(fakeRequest(creationBody("Mario.Rossi@Example.COM")));

    expect(res.status).toBe(201);
    expect(mockedPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "mario.rossi@example.com" }) })
    );
  });

  it("un indirizzo già in minuscolo non cambia", async () => {
    const res = await POST(fakeRequest(creationBody("mario.rossi@example.com")));

    expect(res.status).toBe(201);
    expect(mockedPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "mario.rossi@example.com" }) })
    );
  });
});
