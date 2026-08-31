import { describe, it, expect } from "vitest";
import { classifyLoginMatches } from "../login-lookup";

describe("classifyLoginMatches", () => {
  it("nessuna riga -> not_found", () => {
    expect(classifyLoginMatches([])).toEqual({ kind: "not_found" });
  });

  it("una riga -> found, con l'utente dentro", () => {
    const user = { id: "u1", email: "mario@x.it" };
    expect(classifyLoginMatches([user])).toEqual({ kind: "found", user });
  });

  it("due righe -> ambiguous, non sceglie tra le due", () => {
    const a = { id: "u1", email: "Mario@x.it" };
    const b = { id: "u2", email: "mario@x.it" };
    expect(classifyLoginMatches([a, b])).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("più di due righe -> ambiguous con il conteggio esatto", () => {
    const rows = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    expect(classifyLoginMatches(rows)).toEqual({ kind: "ambiguous", count: 3 });
  });
});
