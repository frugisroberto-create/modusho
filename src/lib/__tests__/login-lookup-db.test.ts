import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from "../prisma";
import { findUserForLogin } from "../login-lookup-db";
import { normalizeEmail } from "../email-normalize";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findUserForLogin", () => {
  it("cerca con confronto case-insensitive, non con uguaglianza esatta", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([{ id: "u1", email: "mario@x.it" }] as never);

    await findUserForLogin("mario@x.it");

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { equals: "mario@x.it", mode: "insensitive" } },
    });
  });

  it("nessuna corrispondenza -> not_found", async () => {
    mockedPrisma.user.findMany.mockResolvedValueOnce([] as never);
    expect(await findUserForLogin("nessuno@x.it")).toEqual({ kind: "not_found" });
  });

  it("una corrispondenza -> found", async () => {
    const user = { id: "u1", email: "mario@x.it" };
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);
    expect(await findUserForLogin("mario@x.it")).toEqual({ kind: "found", user });
  });

  it("un utente salvato CON maiuscole (il caso Mihaela) trovato tramite l'input in minuscolo", async () => {
    // La riga in tabella è "MSERBAN799@GMAIL.COM": mode "insensitive" la trova
    // comunque, senza bisogno di correggerla.
    const user = { id: "u1", email: "MSERBAN799@GMAIL.COM" };
    mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);

    const result = await findUserForLogin(normalizeEmail("mserban799@gmail.com"));

    expect(result).toEqual({ kind: "found", user });
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { equals: "mserban799@gmail.com", mode: "insensitive" } },
    });
  });

  it("due righe che differiscono solo per maiuscole -> ambiguous, nessuna scelta arbitraria", async () => {
    const a = { id: "u1", email: "Vanessa1812@libero.it" };
    const b = { id: "u2", email: "vanessa1812@libero.it" };
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
    const user = { id: "u1", email: "mario.rossi@example.com" };

    for (const variante of varianti) {
      mockedPrisma.user.findMany.mockResolvedValueOnce([user] as never);
      const result = await findUserForLogin(normalizeEmail(variante));
      expect(result).toEqual({ kind: "found", user });
    }

    for (const call of mockedPrisma.user.findMany.mock.calls) {
      expect(call[0]).toEqual({
        where: { email: { equals: "mario.rossi@example.com", mode: "insensitive" } },
      });
    }
  });
});
