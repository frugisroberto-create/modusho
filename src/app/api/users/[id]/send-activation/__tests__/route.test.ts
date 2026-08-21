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
import { recordUserAudit } from "@/lib/user-audit";
import { POST } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);
const mockedSendEmail = vi.mocked(sendEmail);
const mockedIssueToken = vi.mocked(issueToken);
const mockedRecordUserAudit = vi.mocked(recordUserAudit);

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

  it("restituisce il link anche per un utente GIÀ attivato (200), marcandolo come tale", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
    // Il marcatore accende l'avviso nell'interfaccia: con questo link si entra
    // come quella persona.
    expect(body.data.targetWasActive).toBe(true);
  });

  it("restituisce il link per un utente GIÀ attivato anche in caso di fallimento (502)", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: false, adapter: "console", reason: "not-configured" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
    expect(body.targetWasActive).toBe(true);
  });

  it("dentro la finestra dei 60 secondi il link esce comunque, ma l'email NON viene inviata", async () => {
    mockUserQueries({ activatedAt: null });
    // Un token ACTIVATION emesso pochi secondi fa: è il caso di chi crea un
    // utente e subito dopo preme "Rimanda invito".
    mockedPrisma.authToken.findFirst.mockResolvedValueOnce({ createdAt: new Date() } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/attiva/tok-nuovo");
    expect(body.data.emailSent).toBe(false);
    expect(body.data.notice).toMatch(/non è stata rispedita/i);
    // Il blocco anti-abuso resta: l'email non parte.
    expect(mockedSendEmail).not.toHaveBeenCalled();
    // Il token invece viene emesso: è ciò che rende il link disponibile.
    expect(mockedIssueToken).toHaveBeenCalledTimes(1);
  });

  it("fuori dalla finestra l'email viene inviata e il link esce lo stesso", async () => {
    mockUserQueries({ activatedAt: null });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    const body = await res.json();
    expect(body.data.emailSent).toBe(true);
    expect(body.data.notice).toBeUndefined();
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
  });

  it("generare un link per un utente attivo lascia traccia nel registro, senza il token", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    await POST(fakeRequest(), params("target-1"));

    expect(mockedRecordUserAudit).toHaveBeenCalledTimes(1);
    const evento = mockedRecordUserAudit.mock.calls[0][0];

    // Chi, per chi, quando (createdAt lo mette il registro stesso).
    expect(evento.actorId).toBe("actor-1");
    expect(evento.userId).toBe("target-1");
    expect(evento.action).toBe("INVITE_SENT");
    expect((evento.meta as Record<string, unknown>).targetWasActive).toBe(true);

    // Il token in chiaro non deve comparire da nessuna parte nell'evento.
    expect(JSON.stringify(evento)).not.toContain("tok-nuovo");
  });

  it("il token in chiaro non finisce in alcun log", async () => {
    mockUserQueries({ activatedAt: new Date("2026-02-01") });
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(fakeRequest(), params("target-1"));

    const scritto = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");

    expect(scritto).not.toContain("tok-nuovo");
    expect(scritto).not.toContain("/attiva/");

    logSpy.mockRestore();
    errorSpy.mockRestore();
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
