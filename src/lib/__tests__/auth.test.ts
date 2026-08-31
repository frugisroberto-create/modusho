import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test end-to-end di authorize() (il provider credentials di NextAuth), con
 * solo Prisma e bcrypt sostituiti. Copre esattamente gli scenari del
 * rapporto: lo stesso indirizzo scritto in quattro modi diversi entra allo
 * stesso modo; un account storico salvato con maiuscole (il caso Mihaela)
 * continua a funzionare sia scrivendolo come prima sia in minuscolo; due
 * righe che differiscono solo per maiuscole vengono rifiutate, non scelte a
 * caso; il blocco per coppia IP+email non tocca altre email sullo stesso IP.
 */

type Row = { key: string; type: string; createdAt: Date };
let attemptStore: Row[] = [];

vi.mock("../prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    loginAttempt: {
      count: vi.fn(async ({ where }: any) => matches(where).length),
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = matches(where).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows[0] ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { key: data.key, type: data.type, createdAt: new Date() };
        attemptStore.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = attemptStore.length;
        attemptStore = attemptStore.filter((r) => !(r.key === where.key && r.type === where.type));
        return { count: before - attemptStore.length };
      }),
    },
  },
}));

function matches(where: { key: string; type: string; createdAt?: { gte: Date } }): Row[] {
  return attemptStore.filter(
    (r) =>
      r.key === where.key &&
      r.type === where.type &&
      (!where.createdAt || r.createdAt >= where.createdAt.gte)
  );
}

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { authOptions } from "../auth";

const mockedPrisma = vi.mocked(prisma, true);
const mockedCompare = vi.mocked(bcrypt.compare);

// Vedi node_modules/next-auth/providers/credentials.js: Credentials(options)
// restituisce { ..., options }, con la nostra authorize() dentro `options`.
type AuthorizeFn = (
  credentials: Record<string, string> | undefined,
  req: { headers?: Record<string, unknown> }
) => Promise<unknown>;
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } })
  .options.authorize;

const REQ = { headers: { "x-forwarded-for": "203.0.113.5" } };

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "mario.rossi@example.com",
    name: "Mario Rossi",
    role: "OPERATOR",
    isActive: true,
    passwordHash: "$2a$12$hashfinto",
    canView: true,
    canEdit: false,
    canApprove: false,
    canPublish: false,
    mustChangePassword: false,
    canCreateUsers: false,
    ...overrides,
  };
}

beforeEach(() => {
  attemptStore = [];
  vi.clearAllMocks();
  mockedCompare.mockResolvedValue(true as never);
});

describe("authorize — lo stesso indirizzo scritto in quattro modi diversi", () => {
  const user = activeUser({ email: "mario.rossi@example.com" });
  const varianti = [
    "mario.rossi@example.com",
    "Mario.Rossi@example.com",
    "MARIO.ROSSI@EXAMPLE.COM",
    "  mario.rossi@example.com  ",
  ];

  it.each(varianti)("entra scrivendo %s", async (variante) => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await authorize({ email: variante, password: "giusta" }, REQ);

    expect(result).toMatchObject({ id: "u1", email: "mario.rossi@example.com" });
  });
});

describe("authorize — account storico salvato con maiuscole (il caso Mihaela)", () => {
  const user = activeUser({ id: "u2", email: "MSERBAN799@GMAIL.COM" });

  it("entra scrivendo l'indirizzo in minuscolo", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await authorize({ email: "mserban799@gmail.com", password: "giusta" }, REQ);

    expect(result).toMatchObject({ id: "u2" });
  });

  it("continua a entrare scrivendolo come prima (in maiuscolo)", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await authorize({ email: "MSERBAN799@GMAIL.COM", password: "giusta" }, REQ);

    expect(result).toMatchObject({ id: "u2" });
  });
});

describe("authorize — righe ambigue: non si sceglie", () => {
  it("due account che differiscono solo per maiuscole vengono rifiutati, non scelti a caso", async () => {
    const a = activeUser({ id: "u1", email: "Vanessa1812@libero.it" });
    const b = activeUser({ id: "u2", email: "vanessa1812@libero.it" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([a, b] as never);

    const result = await authorize({ email: "vanessa1812@libero.it", password: "giusta" }, REQ);

    expect(result).toBeNull();
  });
});

describe("authorize — rate limiting per coppia IP+email", () => {
  it("5 fallimenti su (IP, emailA) bloccano quella coppia con un messaggio che non nomina l'account", async () => {
    mockedPrisma.user.findMany.mockResolvedValue([] as never); // "not_found" per ogni tentativo

    for (let i = 0; i < 5; i++) {
      await authorize({ email: "a@x.it", password: "sbagliata" }, REQ);
    }

    await expect(authorize({ email: "a@x.it", password: "qualsiasi" }, REQ)).rejects.toThrow(
      /Troppi tentativi\. Riprova tra \d+ minuti\./
    );
  });

  it("lo stesso blocco NON impedisce il login su un'altra email dallo stesso IP", async () => {
    mockedPrisma.user.findMany.mockResolvedValue([] as never);
    for (let i = 0; i < 5; i++) {
      await authorize({ email: "a@x.it", password: "sbagliata" }, REQ);
    }

    const user = activeUser({ id: "u3", email: "b@x.it" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await authorize({ email: "b@x.it", password: "giusta" }, REQ);

    expect(result).toMatchObject({ id: "u3" });
  });
});
