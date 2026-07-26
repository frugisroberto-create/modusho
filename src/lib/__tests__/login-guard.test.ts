import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hasUsablePassword } from "../login-guard";

describe("login-guard — account senza password utilizzabile", () => {
  it("hash vuoto: login negato (utente creato ma non ancora attivato)", () => {
    expect(hasUsablePassword("")).toBe(false);
  });

  it("hash di soli spazi: login negato", () => {
    expect(hasUsablePassword("   ")).toBe(false);
  });

  it("hash assente: login negato", () => {
    expect(hasUsablePassword(null)).toBe(false);
    expect(hasUsablePassword(undefined)).toBe(false);
  });

  it("stringa che non è un hash bcrypt: login negato", () => {
    expect(hasUsablePassword("password1")).toBe(false);
    expect(hasUsablePassword("non-un-hash")).toBe(false);
  });

  it("un vero hash bcrypt è utilizzabile", () => {
    const hash = bcrypt.hashSync("password1", 10);
    expect(hasUsablePassword(hash)).toBe(true);
  });

  it("accetta le varianti di prefisso bcrypt", () => {
    expect(hasUsablePassword("$2a$12$" + "x".repeat(53))).toBe(true);
    expect(hasUsablePassword("$2b$12$" + "x".repeat(53))).toBe(true);
    expect(hasUsablePassword("$2y$12$" + "x".repeat(53))).toBe(true);
  });

  it("bcrypt.compare su hash vuoto non solleva ma dà false: il guard evita comunque la chiamata", async () => {
    // Il guard esiste perché nessun confronto vada fatto su un hash malformato:
    // il login deve fallire pulito, non generare un errore nel provider.
    expect(hasUsablePassword("")).toBe(false);
    await expect(bcrypt.compare("qualsiasi", "")).resolves.toBe(false);
  });
});
