import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Il link di reimpostazione agisce per definizione su utenti già attivati:
 * consente di impostare una password nuova, e quindi di entrare come quella
 * persona. La decisione ratificata è che il link si mostri comunque a chi lo
 * genera — quando l'email non arriva è l'unica via — e che ogni generazione
 * lasci traccia. Questi test bloccano entrambe le metà.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  buildResetEmail: vi.fn(() => ({ to: "x", subject: "y", html: "", text: "" })),
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
const SCADENZA = new Date("2026-08-21T18:00:00.000Z");
const ATTIVATO = new Date("2026-02-01");

function fakeRequest() {
  return {} as unknown as Parameters<typeof POST>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    name: "Maria",
    email: "maria@example.com",
    role: "OPERATOR",
    canCreateUsers: false,
    isActive: true,
    createdById: "actor-1",
    activatedAt: ATTIVATO,
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
    ...overrides,
  };
}

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

/** loadActor, loadTarget, recipient — in quest'ordine. */
function mockUserQueries(targetOverrides: Record<string, unknown> = {}) {
  mockedPrisma.user.findUnique
    .mockResolvedValueOnce(actorRow() as never)
    .mockResolvedValueOnce(userRow(targetOverrides) as never)
    .mockResolvedValueOnce(userRow(targetOverrides) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1" } } as never);
  mockedPrisma.authToken.findFirst.mockResolvedValue(null as never);
  mockedIssueToken.mockResolvedValue({ token: "reset-tok", expiresAt: SCADENZA } as never);
});

describe("POST /api/users/[id]/send-reset — il link è sempre visibile a chi lo genera", () => {
  it("restituisce il link quando l'invio riesce (200)", async () => {
    mockUserQueries();
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/reimposta/reset-tok");
    expect(body.data.activationExpiresAt).toBe(SCADENZA.toISOString());
    expect(body.data.targetWasActive).toBe(true);
  });

  it("restituisce il link anche quando l'invio fallisce (502)", async () => {
    mockUserQueries();
    mockedSendEmail.mockResolvedValue({
      ok: false,
      adapter: "console",
      reason: "not-configured",
    } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.activationUrl).toBe("https://modusho.test/reimposta/reset-tok");
    expect(body.targetWasActive).toBe(true);
  });

  it("dentro la finestra dei 60 secondi il link esce, ma l'email NON viene inviata", async () => {
    mockUserQueries();
    mockedPrisma.authToken.findFirst.mockResolvedValueOnce({ createdAt: new Date() } as never);

    const res = await POST(fakeRequest(), params("target-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activationUrl).toBe("https://modusho.test/reimposta/reset-tok");
    expect(body.data.emailSent).toBe(false);
    expect(body.data.notice).toMatch(/non è stata rispedita/i);
    expect(mockedSendEmail).not.toHaveBeenCalled();
    expect(mockedIssueToken).toHaveBeenCalledTimes(1);
  });

  it("registra l'evento nel registro — chi, per chi — senza il token", async () => {
    mockUserQueries();
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);

    await POST(fakeRequest(), params("target-1"));

    expect(mockedRecordUserAudit).toHaveBeenCalledTimes(1);
    const evento = mockedRecordUserAudit.mock.calls[0][0];

    expect(evento.actorId).toBe("actor-1");
    expect(evento.userId).toBe("target-1");
    expect(evento.action).toBe("RESET_SENT");
    expect((evento.meta as Record<string, unknown>).targetWasActive).toBe(true);
    expect(JSON.stringify(evento)).not.toContain("reset-tok");
  });

  it("il token in chiaro non finisce in alcun log", async () => {
    mockUserQueries();
    mockedSendEmail.mockResolvedValue({ ok: true, adapter: "resend", id: "msg-1" } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(fakeRequest(), params("target-1"));

    const scritto = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");

    expect(scritto).not.toContain("reset-tok");
    expect(scritto).not.toContain("/reimposta/");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
