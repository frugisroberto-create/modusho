import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Il client Prisma è sostituito: questi test non toccano nessun database.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  generateToken,
  hashToken,
  computeExpiry,
  isTokenUsable,
  issueToken,
  consumeToken,
  TOKEN_TTL_MS,
} from "../auth-tokens";

const mocked = prisma as unknown as {
  authToken: {
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth-tokens", () => {
  describe("generateToken", () => {
    it("produce un token url-safe (nessun +, / o =)", () => {
      for (let i = 0; i < 20; i++) {
        expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it("32 byte di entropia → 43 caratteri base64url", () => {
      expect(generateToken()).toHaveLength(43);
    });

    it("due token consecutivi sono diversi", () => {
      expect(generateToken()).not.toBe(generateToken());
    });
  });

  describe("hashToken", () => {
    it("è lo SHA-256 esadecimale del token", () => {
      const token = "token-di-prova";
      const atteso = crypto.createHash("sha256").update(token).digest("hex");
      expect(hashToken(token)).toBe(atteso);
      expect(hashToken(token)).toHaveLength(64);
    });

    it("è deterministico", () => {
      const token = generateToken();
      expect(hashToken(token)).toBe(hashToken(token));
    });

    it("non contiene il token in chiaro", () => {
      const token = generateToken();
      expect(hashToken(token)).not.toBe(token);
      expect(hashToken(token)).not.toContain(token);
    });

    it("token diversi danno hash diversi", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });

  describe("computeExpiry", () => {
    const now = new Date("2026-07-25T10:00:00.000Z");

    it("ACTIVATION dura 30 giorni", () => {
      expect(computeExpiry("ACTIVATION", now).toISOString()).toBe("2026-08-24T10:00:00.000Z");
      expect(TOKEN_TTL_MS.ACTIVATION).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("RESET dura 60 minuti", () => {
      expect(computeExpiry("RESET", now).toISOString()).toBe("2026-07-25T11:00:00.000Z");
      expect(TOKEN_TTL_MS.RESET).toBe(60 * 60 * 1000);
    });
  });

  describe("isTokenUsable", () => {
    const now = new Date("2026-07-25T10:00:00.000Z");

    it("token vivo e mai usato: utilizzabile", () => {
      const t = { expiresAt: new Date("2026-07-25T10:30:00.000Z"), usedAt: null };
      expect(isTokenUsable(t, now)).toBe(true);
    });

    it("monouso: già consumato non è più utilizzabile", () => {
      const t = {
        expiresAt: new Date("2026-07-25T10:30:00.000Z"),
        usedAt: new Date("2026-07-25T09:00:00.000Z"),
      };
      expect(isTokenUsable(t, now)).toBe(false);
    });

    it("scaduto: non utilizzabile", () => {
      const t = { expiresAt: new Date("2026-07-25T09:59:59.000Z"), usedAt: null };
      expect(isTokenUsable(t, now)).toBe(false);
    });

    it("al confine esatto della scadenza non è più valido", () => {
      const t = { expiresAt: new Date(now), usedAt: null };
      expect(isTokenUsable(t, now)).toBe(false);
    });

    it("un token RESET emesso 61 minuti fa è scaduto", () => {
      const emesso = new Date("2026-07-25T08:59:00.000Z");
      const t = { expiresAt: computeExpiry("RESET", emesso), usedAt: null };
      expect(isTokenUsable(t, now)).toBe(false);
    });

    it("un token ACTIVATION emesso 29 giorni fa è ancora valido", () => {
      const emesso = new Date("2026-06-26T10:00:00.000Z");
      const t = { expiresAt: computeExpiry("ACTIVATION", emesso), usedAt: null };
      expect(isTokenUsable(t, now)).toBe(true);
    });
  });

  describe("issueToken", () => {
    const now = new Date("2026-07-25T10:00:00.000Z");

    it("invalida i precedenti non usati dello stesso tipo prima di crearne uno nuovo", async () => {
      mocked.authToken.updateMany.mockResolvedValue({ count: 2 });
      mocked.authToken.create.mockResolvedValue({});

      await issueToken({ userId: "u1", type: "RESET", now });

      expect(mocked.authToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", type: "RESET", usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      // L'invalidazione avviene prima della creazione del nuovo token.
      expect(mocked.authToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        mocked.authToken.create.mock.invocationCallOrder[0]!
      );
    });

    it("persiste l'hash e mai il token in chiaro", async () => {
      mocked.authToken.updateMany.mockResolvedValue({ count: 0 });
      mocked.authToken.create.mockResolvedValue({});

      const { token, expiresAt } = await issueToken({
        userId: "u1",
        type: "ACTIVATION",
        createdById: "admin1",
        now,
      });

      const salvato = mocked.authToken.create.mock.calls[0]![0].data;
      expect(salvato.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(salvato)).not.toContain(token);
      expect(salvato.createdById).toBe("admin1");
      expect(expiresAt.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    });

    it("non tocca i token di tipo diverso", async () => {
      mocked.authToken.updateMany.mockResolvedValue({ count: 0 });
      mocked.authToken.create.mockResolvedValue({});

      await issueToken({ userId: "u1", type: "ACTIVATION", now });

      expect(mocked.authToken.updateMany.mock.calls[0]![0].where.type).toBe("ACTIVATION");
    });
  });

  describe("consumeToken", () => {
    const now = new Date("2026-07-25T10:00:00.000Z");

    it("consuma con una sola scrittura condizionata (atomica)", async () => {
      mocked.authToken.updateMany.mockResolvedValue({ count: 1 });
      mocked.authToken.findUnique.mockResolvedValue({ userId: "u1" });

      const result = await consumeToken("token-chiaro", "RESET", now);

      expect(result).toEqual({ ok: true, userId: "u1" });
      expect(mocked.authToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken("token-chiaro"),
          type: "RESET",
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
    });

    it("monouso: il secondo consumo fallisce (count 0)", async () => {
      mocked.authToken.updateMany.mockResolvedValue({ count: 0 });

      const result = await consumeToken("token-chiaro", "RESET", now);

      expect(result).toEqual({ ok: false, reason: "invalid" });
      expect(mocked.authToken.findUnique).not.toHaveBeenCalled();
    });

    it("token vuoto: invalido senza interrogare il database", async () => {
      const result = await consumeToken("", "ACTIVATION", now);
      expect(result).toEqual({ ok: false, reason: "invalid" });
      expect(mocked.authToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
