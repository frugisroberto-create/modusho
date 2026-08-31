import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../email-normalize";

describe("normalizeEmail", () => {
  it("porta l'indirizzo in minuscolo", () => {
    expect(normalizeEmail("Mario.Rossi@Example.COM")).toBe("mario.rossi@example.com");
  });

  it("toglie gli spazi davanti e dietro", () => {
    expect(normalizeEmail("  mario.rossi@example.com  ")).toBe("mario.rossi@example.com");
  });

  it("maiuscole e spazi insieme", () => {
    expect(normalizeEmail("  Mario.Rossi@Example.COM  ")).toBe("mario.rossi@example.com");
  });

  it("un indirizzo già normalizzato resta invariato", () => {
    expect(normalizeEmail("mario.rossi@example.com")).toBe("mario.rossi@example.com");
  });

  it("è idempotente", () => {
    const once = normalizeEmail("  Mario.Rossi@Example.COM  ");
    expect(normalizeEmail(once)).toBe(once);
  });
});
