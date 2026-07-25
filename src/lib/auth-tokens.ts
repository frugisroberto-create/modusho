/**
 * Token di attivazione e reset password.
 *
 * Principi (non negoziabili):
 * 1. Il token in chiaro esiste SOLO nel link inviato per email. In database
 *    finisce esclusivamente il suo hash SHA-256: chi legge il DB non può
 *    ricostruire un link valido.
 * 2. Monouso: il consumo è atomico (una sola updateMany condizionata), quindi
 *    due richieste in parallelo non possono consumare lo stesso token.
 * 3. Emettere un nuovo token invalida i precedenti non usati dello stesso
 *    tipo per lo stesso utente (li fa scadere, mantenendo la riga per traccia).
 *
 * Le funzioni pure (generate/hash/computeExpiry/isTokenUsable) accettano la
 * data come parametro per essere testabili senza database.
 */

import crypto from "crypto";
import { prisma } from "./prisma";
import type { AuthTokenType } from "@prisma/client";

/** Durata di validità per tipo di token. */
export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  ACTIVATION: 30 * 24 * 60 * 60 * 1000, // 30 giorni
  RESET: 60 * 60 * 1000, // 60 minuti
};

/** Byte di entropia del token. */
const TOKEN_BYTES = 32;

/**
 * Genera un token url-safe da 32 byte di entropia.
 * Il valore restituito va inviato per email e MAI salvato in chiaro.
 */
export function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hash SHA-256 (hex) del token: è l'unica forma persistita. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Scadenza calcolata dal tipo, a partire da `now` (iniettabile nei test). */
export function computeExpiry(type: AuthTokenType, now: Date = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS[type]);
}

/** Un token è usabile se non è già stato consumato e non è scaduto. */
export function isTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (token.usedAt !== null) return false;
  return token.expiresAt.getTime() > now.getTime();
}

/**
 * Emette un token per l'utente, invalidando i precedenti non usati dello
 * stesso tipo. Restituisce il token IN CHIARO (da mettere nel link) e la
 * scadenza: il chiamante non deve loggarlo né persisterlo.
 */
export async function issueToken(params: {
  userId: string;
  type: AuthTokenType;
  createdById?: string | null;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const { userId, type, createdById = null } = params;
  const now = params.now ?? new Date();

  // I precedenti non usati vengono fatti scadere: un solo link vivo per volta.
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });

  const token = generateToken();
  const expiresAt = computeExpiry(type, now);

  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt,
      createdById,
    },
  });

  return { token, expiresAt };
}

export interface TokenOwner {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

/**
 * Verifica un token SENZA consumarlo (serve alle pagine per mostrare il form).
 * Restituisce null se non esiste, è scaduto, è già usato o l'utente è disattivato.
 */
export async function findValidToken(
  rawToken: string,
  type: AuthTokenType,
  now: Date = new Date()
): Promise<TokenOwner | null> {
  if (!rawToken) return null;

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      type: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, name: true, email: true, isActive: true } },
    },
  });

  if (!record || record.type !== type) return null;
  if (!isTokenUsable(record, now)) return null;
  if (!record.user.isActive) return null;

  return record.user;
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" };

/**
 * Consuma il token in modo atomico e monouso.
 *
 * L'updateMany condizionata (usedAt null + non scaduto) è l'unico punto in cui
 * il token viene marcato: se due richieste arrivano insieme, una sola ottiene
 * count = 1, l'altra riceve "invalid".
 */
export async function consumeToken(
  rawToken: string,
  type: AuthTokenType,
  now: Date = new Date()
): Promise<ConsumeResult> {
  if (!rawToken) return { ok: false, reason: "invalid" };

  const tokenHash = hashToken(rawToken);

  const result = await prisma.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  if (result.count === 0) return { ok: false, reason: "invalid" };

  const record = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });

  if (!record) return { ok: false, reason: "invalid" };

  return { ok: true, userId: record.userId };
}
