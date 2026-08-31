import { describe, it, expect, vi, afterEach } from "vitest";
import {
  tooManyAttemptsMessage,
  accountLockedMessage,
  isKnownAuthBlockMessage,
  displayAuthError,
} from "../auth-error-message";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isKnownAuthBlockMessage", () => {
  it("riconosce il messaggio del blocco per coppia IP+email / tetto IP", () => {
    expect(isKnownAuthBlockMessage(tooManyAttemptsMessage(12))).toBe(true);
  });

  it("riconosce il messaggio del blocco per email", () => {
    expect(isKnownAuthBlockMessage(accountLockedMessage(30))).toBe(true);
  });

  it("non riconosce il codice generico CredentialsSignin", () => {
    expect(isKnownAuthBlockMessage("CredentialsSignin")).toBe(false);
  });

  it("non riconosce un'eccezione non prevista", () => {
    expect(isKnownAuthBlockMessage("PrismaClientKnownRequestError: connection refused")).toBe(false);
  });

  it("non riconosce testo vuoto o assente", () => {
    expect(isKnownAuthBlockMessage("")).toBe(false);
    expect(isKnownAuthBlockMessage(null)).toBe(false);
    expect(isKnownAuthBlockMessage(undefined)).toBe(false);
  });
});

describe("displayAuthError", () => {
  it("un messaggio di blocco viene mostrato integrale", () => {
    const msg = tooManyAttemptsMessage(7);
    expect(displayAuthError(msg, "Credenziali non valide")).toBe(msg);
  });

  it("CredentialsSignin diventa il testo generico, non il codice grezzo", () => {
    expect(displayAuthError("CredentialsSignin", "Credenziali non valide")).toBe("Credenziali non valide");
  });

  it("un errore inatteso mostra il testo generico e NON il testo originale", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = displayAuthError(
      "PrismaClientKnownRequestError: connection refused",
      "Credenziali non valide"
    );
    expect(result).toBe("Credenziali non valide");
    expect(result).not.toContain("Prisma");
  });

  it("nessun errore -> testo generico", () => {
    expect(displayAuthError(undefined, "Credenziali non valide")).toBe("Credenziali non valide");
    expect(displayAuthError(null, "Credenziali non valide")).toBe("Credenziali non valide");
  });
});
