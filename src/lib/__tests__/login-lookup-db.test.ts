import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from "../prisma";
import { findUserForLogin, findUserForReset } from "../login-lookup-db";
import { normalizeEmail } from "../email-normalize";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

const VALID_HASH = "$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX";

/** Riga autenticabile di base: attiva, con un hash bcrypt valido. */
function authenticableRow(overrides: Record<string, unknown> = {}) {
  return { id: "u1", email: "mario@x.it", isActive: true, passwordHash: VALID_HASH, ...overrides };
}

describe("findUserForLogin", () => {
  it("cerca con confronto case-insensitive, solo tra le righe attive con un hash presente", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([authenticableRow()] as never);

    await findUserForLogin("mario@x.it");

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: { equals: "mario@x.it", mode: "insensitive" },
        isActive: true,
        passwordHash: { not: "" },
      },
    });
  });

  it("nessuna corrispondenza -> not_found", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([] as never);
    expect(await findUserForLogin("nessuno@x.it")).toEqual({ kind: "not_found" });
  });

  it("una corrispondenza autenticabile -> found", async () => {
    const user = authenticableRow();
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);
    expect(await findUserForLogin("mario@x.it")).toEqual({ kind: "found", user });
  });

  it("una riga disattivata NON conta come candidato: not_found, non un accesso negato per ambiguità", async () => {
    // Anche se per assurdo la query restituisse una riga isActive=false (il
    // filtro SQL è mockato via), il filtro in memoria non la lascia passare.
    const inattiva = authenticableRow({ id: "u1", isActive: false });
    mockedPrisma.user.findMany.mockResolvedValueOnce([inattiva] as never);

    expect(await findUserForLogin("mario@x.it")).toEqual({ kind: "not_found" });
  });

  it("una riga con l'invito mai completato (hash vuoto) NON conta come candidato: not_found", async () => {
    const nonAttivata = authenticableRow({ id: "u1", passwordHash: "" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([nonAttivata] as never);

    expect(await findUserForLogin("mario@x.it")).toEqual({ kind: "not_found" });
  });

  it("un guscio (disattivato o mai attivato) accanto a una riga vera: found, NON ambiguous", async () => {
    // È esattamente il caso di produzione: una riga inutilizzata e una che
    // funziona sullo stesso indirizzo. Il guscio non deve mai bloccare
    // l'account che funziona.
    const guscio = authenticableRow({ id: "guscio-1", passwordHash: "" });
    const vera = authenticableRow({ id: "vera-1" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([guscio, vera] as never);

    expect(await findUserForLogin("mario@x.it")).toEqual({ kind: "found", user: vera });
  });

  it("un utente salvato CON maiuscole (il caso Mihaela) trovato tramite l'input in minuscolo", async () => {
    // La riga in tabella è "MSERBAN799@GMAIL.COM": mode "insensitive" la trova
    // comunque, senza bisogno di correggerla.
    const user = authenticableRow({ id: "u1", email: "MSERBAN799@GMAIL.COM" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await findUserForLogin(normalizeEmail("mserban799@gmail.com"));

    expect(result).toEqual({ kind: "found", user });
  });

  it("due righe ENTRAMBE autenticabili che differiscono solo per maiuscole -> ambiguous, nessuna scelta arbitraria", async () => {
    const a = authenticableRow({ id: "u1", email: "Vanessa1812@libero.it" });
    const b = authenticableRow({ id: "u2", email: "vanessa1812@libero.it" });
    mockedPrisma.user.findMany.mockResolvedValueOnce([a, b] as never);

    expect(await findUserForLogin("vanessa1812@libero.it")).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("lo stesso indirizzo scritto in quattro modi diversi produce sempre la stessa query", async () => {
    const varianti = [
      "mario.rossi@example.com",
      "Mario.Rossi@example.com",
      "MARIO.ROSSI@EXAMPLE.COM",
      "  mario.rossi@example.com  ",
    ];
    const user = authenticableRow({ id: "u1", email: "mario.rossi@example.com" });

    for (const variante of varianti) {
      mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);
      const result = await findUserForLogin(normalizeEmail(variante));
      expect(result).toEqual({ kind: "found", user });
    }

    for (const call of mockedPrisma.user.findMany.mock.calls) {
      expect(call[0]).toEqual({
        where: {
          email: { equals: "mario.rossi@example.com", mode: "insensitive" },
          isActive: true,
          passwordHash: { not: "" },
        },
      });
    }
  });
});

describe("findUserForReset — stessa ricerca, idoneità del reset (non del login)", () => {
  it("cerca solo tra le righe attive che hanno già completato un'attivazione", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([] as never);

    await findUserForReset("mario@x.it");

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: { equals: "mario@x.it", mode: "insensitive" },
        isActive: true,
        activatedAt: { not: null },
      },
    });
  });

  it("un indirizzo salvato con maiuscole, cercato in minuscolo, viene trovato", async () => {
    const user = { id: "u1", email: "MSERBAN799@GMAIL.COM", isActive: true, activatedAt: new Date("2026-01-01") };
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    expect(await findUserForReset("mserban799@gmail.com")).toEqual({ kind: "found", user });
  });

  it("due righe idonee che differiscono solo per maiuscole -> ambiguous", async () => {
    const a = { id: "u1", email: "Vanessa1812@libero.it", isActive: true, activatedAt: new Date("2026-01-01") };
    const b = { id: "u2", email: "vanessa1812@libero.it", isActive: true, activatedAt: new Date("2026-01-01") };
    mockedPrisma.user.findMany.mockResolvedValueOnce([a, b] as never);

    expect(await findUserForReset("vanessa1812@libero.it")).toEqual({ kind: "ambiguous", count: 2 });
  });
});
