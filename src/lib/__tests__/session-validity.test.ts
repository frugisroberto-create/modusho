import { describe, it, expect } from "vitest";
import { isSessionStale } from "../session-validity";

/** `iat` del JWT è in secondi epoch. */
function secondi(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

describe("session-validity", () => {
  it("password mai cambiata: la sessione resta valida", () => {
    expect(isSessionStale(secondi("2026-07-25T10:00:00Z"), null)).toBe(false);
    expect(isSessionStale(secondi("2026-07-25T10:00:00Z"), undefined)).toBe(false);
  });

  it("token emesso PRIMA del cambio password: sessione decaduta", () => {
    const emesso = secondi("2026-07-25T09:00:00Z");
    const cambio = new Date("2026-07-25T10:00:00Z");
    expect(isSessionStale(emesso, cambio)).toBe(true);
  });

  it("token emesso DOPO il cambio password: sessione valida", () => {
    const emesso = secondi("2026-07-25T11:00:00Z");
    const cambio = new Date("2026-07-25T10:00:00Z");
    expect(isSessionStale(emesso, cambio)).toBe(false);
  });

  it("token emesso nello stesso secondo del cambio resta valido", () => {
    // È il caso di chi ha appena cambiato la password: non deve buttarsi fuori da solo.
    const istante = "2026-07-25T10:00:00Z";
    expect(isSessionStale(secondi(istante), new Date(istante))).toBe(false);
  });

  it("un secondo prima del cambio: decaduta", () => {
    const cambio = new Date("2026-07-25T10:00:00Z");
    expect(isSessionStale(secondi("2026-07-25T09:59:59Z"), cambio)).toBe(true);
  });

  it("ignora i millisecondi del cambio password", () => {
    // iat ha granularità al secondo: il cambio alle 10:00:00.900 non deve
    // invalidare un token emesso alle 10:00:00.
    const emesso = secondi("2026-07-25T10:00:00Z");
    expect(isSessionStale(emesso, new Date("2026-07-25T10:00:00.900Z"))).toBe(false);
  });

  it("iat mancante o non numerico: si invalida (fail-closed)", () => {
    const cambio = new Date("2026-07-25T10:00:00Z");
    expect(isSessionStale(undefined, cambio)).toBe(true);
    expect(isSessionStale(NaN, cambio)).toBe(true);
    expect(isSessionStale(Infinity, cambio)).toBe(true);
  });

  it("senza cambio password un iat mancante non basta a invalidare", () => {
    expect(isSessionStale(undefined, null)).toBe(false);
  });
});
