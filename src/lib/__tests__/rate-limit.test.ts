import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Finto store in memoria per LoginAttempt: più fedele di una sequenza di
 * mockResolvedValueOnce, perché replica il conteggio reale (count/findFirst/
 * deleteMany filtrati per key+type+finestra) invece di dettare riga per riga
 * cosa deve rispondere ogni chiamata.
 */
type Row = { key: string; type: string; createdAt: Date };
let store: Row[] = [];

vi.mock("../prisma", () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(async ({ where }: any) => matches(where).length),
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = matches(where).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows[0] ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { key: data.key, type: data.type, createdAt: new Date() };
        store.push(row);
        return row;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = store.length;
        store = store.filter((r) => !(r.key === where.key && r.type === where.type));
        return { count: before - store.length };
      }),
    },
  },
}));

function matches(where: { key: string; type: string; createdAt?: { gte: Date } }): Row[] {
  return store.filter(
    (r) =>
      r.key === where.key &&
      r.type === where.type &&
      (!where.createdAt || r.createdAt >= where.createdAt.gte)
  );
}

import {
  checkIpEmailRateLimit,
  checkIpCeilingRateLimit,
  checkEmailRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "../rate-limit";

beforeEach(() => {
  store = [];
  vi.clearAllMocks();
});

const IP = "203.0.113.9";

describe("checkIpEmailRateLimit — per coppia IP+email", () => {
  it("5 fallimenti su (IP, emailA) bloccano quella coppia", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(IP, "a@x.it");

    const result = await checkIpEmailRateLimit(IP, "a@x.it");
    expect(result.allowed).toBe(false);
  });

  it("4 fallimenti su (IP, emailA) NON bloccano ancora quella coppia", async () => {
    for (let i = 0; i < 4; i++) await recordFailedAttempt(IP, "a@x.it");

    const result = await checkIpEmailRateLimit(IP, "a@x.it");
    expect(result.allowed).toBe(true);
  });

  it("5 fallimenti su (IP, emailA) NON bloccano (IP, emailB) — il caso del 31 agosto", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(IP, "a@x.it");

    const result = await checkIpEmailRateLimit(IP, "b@x.it");
    expect(result.allowed).toBe(true);
  });

  it("la coppia è case-insensitive sull'email (normalizzata prima della chiave)", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(IP, "Mario@X.it");

    const result = await checkIpEmailRateLimit(IP, "  mario@x.it  ");
    expect(result.allowed).toBe(false);
  });
});

describe("checkIpCeilingRateLimit — tetto largo sul solo IP", () => {
  it("50 fallimenti dallo stesso IP, su email tutte diverse, fanno scattare il tetto", async () => {
    for (let i = 0; i < 50; i++) await recordFailedAttempt(IP, `utente${i}@x.it`);

    expect(await checkIpCeilingRateLimit(IP)).toMatchObject({ allowed: false });
  });

  it("49 fallimenti dallo stesso IP NON fanno ancora scattare il tetto", async () => {
    for (let i = 0; i < 49; i++) await recordFailedAttempt(IP, `utente${i}@x.it`);

    expect(await checkIpCeilingRateLimit(IP)).toMatchObject({ allowed: true });
  });

  it("con email tutte diverse, il gate per coppia IP+email non scatta mai (ogni coppia ha un solo fallimento)", async () => {
    for (let i = 0; i < 50; i++) await recordFailedAttempt(IP, `utente${i}@x.it`);

    expect(await checkIpEmailRateLimit(IP, "utente0@x.it")).toMatchObject({ allowed: true });
  });
});

describe("checkEmailRateLimit — blocco account, invariato: 10 tentativi / 30 min", () => {
  it("10 fallimenti sulla stessa email bloccano l'account", async () => {
    for (let i = 0; i < 10; i++) await recordFailedAttempt(`ip-${i}`, "vittima@x.it");

    expect(await checkEmailRateLimit("vittima@x.it")).toMatchObject({ allowed: false });
  });

  it("9 fallimenti sulla stessa email NON bloccano ancora l'account", async () => {
    for (let i = 0; i < 9; i++) await recordFailedAttempt(`ip-${i}`, "vittima@x.it");

    expect(await checkEmailRateLimit("vittima@x.it")).toMatchObject({ allowed: true });
  });
});

describe("resetAttempts — login riuscito", () => {
  it("azzera anche il contatore della coppia IP+email, non solo IP ed email", async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt(IP, "a@x.it");
    expect(await checkIpEmailRateLimit(IP, "a@x.it")).toMatchObject({ allowed: false });

    await resetAttempts(IP, "a@x.it");

    expect(await checkIpEmailRateLimit(IP, "a@x.it")).toMatchObject({ allowed: true });
  });
});
