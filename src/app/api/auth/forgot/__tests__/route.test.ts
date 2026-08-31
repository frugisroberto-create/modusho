import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/auth/forgot ora usa la stessa ricerca del login
 * (findUserForReset, mockata qui): copre l'indirizzo storico salvato con
 * maiuscole e l'ambiguità, mantenendo la risposta SEMPRE neutra — anche
 * quando la ricerca trova più di una riga idonea, non deve trapelare nulla.
 */

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remainingAttempts: 5, retryAfterMs: 0 })),
  getClientIp: vi.fn(() => "203.0.113.9"),
}));
vi.mock("@/lib/auth-tokens", () => ({
  issueToken: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  buildResetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(),
  getAppUrl: vi.fn(() => "https://modusho.test"),
}));
vi.mock("@/lib/login-lookup-db", () => ({
  findUserForReset: vi.fn(),
}));

import { issueToken } from "@/lib/auth-tokens";
import { sendEmail } from "@/lib/email";
import { findUserForReset } from "@/lib/login-lookup-db";
import { POST } from "../route";

const mockedFind = vi.mocked(findUserForReset);
const mockedIssueToken = vi.mocked(issueToken);
const mockedSendEmail = vi.mocked(sendEmail);

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedIssueToken.mockResolvedValue({ token: "tok-123", expiresAt: new Date("2026-01-08") } as never);
  mockedSendEmail.mockResolvedValue({ ok: true, adapter: "test" } as never);
});

describe("POST /api/auth/forgot", () => {
  it("indirizzo salvato con maiuscole, digitato in minuscolo: il token viene emesso e l'email parte", async () => {
    mockedFind.mockResolvedValueOnce({
      kind: "found",
      user: { id: "u1", name: "Mihaela Serban", email: "MSERBAN799@GMAIL.COM" },
    } as never);

    const res = await POST(fakeRequest({ email: "mserban799@gmail.com" }));

    expect(res.status).toBe(200);
    expect(mockedIssueToken).toHaveBeenCalledWith({ userId: "u1", type: "RESET" });
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
  });

  it("due righe idonee sullo stesso indirizzo (ambiguità): risposta neutra, NESSUNA email, log ANOMALIA", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedFind.mockResolvedValueOnce({ kind: "ambiguous", count: 2 } as never);

    const res = await POST(fakeRequest({ email: "vanessa1812@libero.it" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatch(/Se l'indirizzo è registrato/);
    expect(mockedIssueToken).not.toHaveBeenCalled();
    expect(mockedSendEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ANOMALIA-EMAIL-DUPLICATA"));
    errorSpy.mockRestore();
  });

  it("nessun destinatario idoneo: la stessa risposta neutra, nessuna email", async () => {
    mockedFind.mockResolvedValueOnce({ kind: "not_found" } as never);

    const res = await POST(fakeRequest({ email: "sconosciuto@x.it" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatch(/Se l'indirizzo è registrato/);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("il ramo not_found rispetta comunque il pavimento MIN_RESPONSE_MS (800ms)", async () => {
    mockedFind.mockResolvedValueOnce({ kind: "not_found" } as never);
    const start = Date.now();

    await POST(fakeRequest({ email: "sconosciuto@x.it" }));

    expect(Date.now() - start).toBeGreaterThanOrEqual(790);
  }, 2000);
});
