import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Lo scrittore unico, guardato dal lato del database.
 *
 * Il punto in collaudo non è "scrive qualcosa": è che scrive in DUE registri,
 * con gli stessi campi e lo stesso istante. Se un giorno una sola delle due
 * righe smettesse di partire, cruscotti e percentuali della presa visione
 * scenderebbero senza che nessuno abbia cambiato i dati.
 */

vi.mock("../prisma", () => ({
  prisma: {
    sopViewRecord: { upsert: vi.fn() },
    contentAcknowledgment: { upsert: vi.fn() },
  },
}));

import { prisma } from "../prisma";
import { recordSopRead } from "../sop-read-db";
import { buildSopReadWrites } from "../sop-read";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.sopViewRecord.upsert.mockResolvedValue({
    contentId: "sop-1",
    contentVersion: 3,
    viewedAt: new Date(),
    acknowledgedAt: new Date(),
  } as never);
  mockedPrisma.contentAcknowledgment.upsert.mockResolvedValue({} as never);
});

const NOW = new Date("2026-08-31T10:00:00.000Z");

describe("recordSopRead", () => {
  it("scrive entrambi i registri, con la forma dichiarata in buildSopReadWrites", async () => {
    await recordSopRead({ contentId: "sop-1", userId: "u-1", contentVersion: 3, now: NOW });

    const atteso = buildSopReadWrites({ contentId: "sop-1", userId: "u-1", contentVersion: 3, now: NOW });
    expect(mockedPrisma.sopViewRecord.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.sopViewRecord.upsert).toHaveBeenCalledWith(atteso.viewRecord);
    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledWith(atteso.acknowledgment);
  });

  it("campo per campo: la riga legata alla versione", async () => {
    await recordSopRead({ contentId: "sop-1", userId: "u-1", contentVersion: 3, now: NOW });

    const args = mockedPrisma.sopViewRecord.upsert.mock.calls[0][0];
    expect(args).toEqual({
      where: { contentId_userId_contentVersion: { contentId: "sop-1", userId: "u-1", contentVersion: 3 } },
      update: { acknowledgedAt: NOW, viewedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", contentVersion: 3, viewedAt: NOW, acknowledgedAt: NOW },
    });
  });

  it("campo per campo: la riga per coppia contenuto-persona, quella che leggono i contatori", async () => {
    await recordSopRead({ contentId: "sop-1", userId: "u-1", contentVersion: 3, now: NOW });

    const args = mockedPrisma.contentAcknowledgment.upsert.mock.calls[0][0];
    expect(args).toEqual({
      where: { contentId_userId: { contentId: "sop-1", userId: "u-1" } },
      update: { acknowledgedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", required: true },
    });
  });

  it("restituisce il record legato alla versione", async () => {
    const record = await recordSopRead({ contentId: "sop-1", userId: "u-1", contentVersion: 3, now: NOW });
    expect(record.contentVersion).toBe(3);
  });
});
