import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Il link di attivazione al reinvio.
 *
 * È la via di riserva quando l'email non arriva: senza, un utente con
 * indirizzo sbagliato non è recuperabile. Il difetto che questi test
 * bloccano non produce errori e non compare nei log — l'unico modo di
 * accorgersene è asserire sulla presenza del campo nella risposta.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  buildActivationEmail: vi.fn(() => ({ to: "x", subject: "y", html: "", text: "" })),
  sendEmail: vi.fn(),
  getAppUrl: vi.fn(() => "https://modusho.test"),
}));
vi.mock("@/lib/auth-tokens", () => ({ issueToken: vi.fn() }));
vi.mock("@/lib/user-audit", () => ({ recordUserAudit: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authToken: { findFirst: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { issueToken } from "@/lib/auth-tokens";
import { POST } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);
const mockedSendEmail = vi.mocked(sendEmail);
const mockedIssueToken = vi.mocked(issueToken);

const P1 = "prop-1";
const SCADENZA = new Date("2026-09-20T10:00:00.000Z");

function fakeRequest() {
  return {} as unknown as Parameters<typeof POST>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Riga restituita da prisma.user.findUnique.
 * `activatedAt` è incluso di proposito: la rotta decide su questo campo, e il
 * test più sotto ("il campo su cui si decide dev'essere davvero letto")
 * fallisce se qualcuno lo toglie dalla select della query che lo alimenta.
 */
function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    name: "Maria",
    email: "maria@example.com",
    role: "OPERATOR",
    canCreateUsers: false,
    isActive: true,
    createdById: "actor-1",
    activatedAt: null,
    propertyAssignments: [{ propertyId: P1, departmentId: null, property: { name: "Hotel" }, department: null }],
    ...overrides,
  };
}

/** ADMIN che agisce: vede tutti, può sempre rimandare l'invito. */
function actorRow() {
  return {
    id: "actor-1",
    role: "ADMIN",
    canCreateUsers: true,
    isActive: true,
    createdById: null,
    activatedAt: new Date("2026-01-01"),
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
  };
}

/**
 * La rotta interroga prisma.user.findUnique tre volte, in quest'ordine:
 * loadActor, loadTarget, recipient.
 */
function mockUserQueries(targetOverrides: Record<string, unknown> = {}) {
  mockedPrisma.user.findUnique
    .mockResolvedValueOnce(actorRow() as never)
    .mockResolvedValueOnce(userRow(targetOverrides) as never)
    .mockResolvedValueOnce(userRow(targetOverrides) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);
  mockedPrisma.authToken.findFirst.mockResolvedValue(null as never); // nessun cooldown attivo
  mockedIssueToken.mockResolvedValue({ token: "tok-nuovo", expiresAt: SCADENZA } as never);
});

describe("POST /api/users/[id]/send-activation — il link al reinvio", () => {
  it("restituisce activationUrl quando l'invio riesce (200), per un utente non attivato", async () => {
    mockUserQueries({ activatedAt: null });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
    expect(body.data.activationExpiresAt).toBe(SCADENZA.toISOString());
  });

  it("restituisce activationUrl anche quando l'invio fallisce (502): è proprio il caso in cui serve", async () => {
    mockUserQueries({ activatedAt: null });
    mockedSendEmail.mockResolvedValue({
      ok: false,
      adapter: "console",
      reason: "not-configured",
    } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
    expect(body.activationExpiresAt).toBe(SCADENZA.toISOString());
  });

  it("NON restituisce il link per un utente GIÀ attivato (200)", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBeUndefined();
    expect(body.data.activationExpiresAt).toBeUndefined();
  });

  it("NON restituisce il link per un utente GIÀ attivato nemmeno in caso di fallimento (502)", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: false, adapter: "console", reason: "not-configured" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.activationUrl).toBeUndefined();
  });

  it("entro il minuto di cooldown la rotta risponde 429 e NON può restituire alcun link", async () => {
    mockUserQueries({ activatedAt: null });
    // Un token ACTIVATION emesso pochi secondi fa: è il caso di chi crea un
    // utente e subito dopo preme "Rimanda invito".
    mockedPrisma.authToken.findFirst.mockResolvedValueOnce({ createdAt: new Date() } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.activationUrl).toBeUndefined();
    // Nessun token nuovo viene emesso: del precedente esiste solo l'hash, il
    // valore in chiaro non è più ricostruibile.
    expect(mockedIssueToken).not.toHaveBeenCalled();
  });

  it("il campo su cui si decide dev'essere davvero letto: se activatedAt manca dalla riga, il link NON deve sparire", async () => {
    // Simula una query che NON seleziona activatedAt: il campo arriva
    // `undefined`, non `null`. Un confronto `=== null` fallirebbe qui e il
    // link non uscirebbe mai — è la regressione che questo test blocca.
    const rigaSenzaCampo = userRow();
    delete (rigaSenzaCampo as Record<string, unknown>).activatedAt;

    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(actorRow() as never)
      .mockResolvedValueOnce(rigaSenzaCampo as never)
      .mockResolvedValueOnce(rigaSenzaCampo as never);
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
  });
});
