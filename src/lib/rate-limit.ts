/**
 * Rate limiter persistente su PostgreSQL.
 *
 * Due livelli di protezione:
 * 1. Per IP: 5 tentativi falliti in 15 minuti -> blocco IP
 * 2. Per email: 10 tentativi falliti in 30 minuti -> blocco account
 *
 * I record vengono contati con una query sul DB (tabella LoginAttempt).
 * I record scaduti vengono puliti periodicamente dal cron /api/cron/cleanup-login-attempts
 * oppure in modo lazy ad ogni check (DELETE dei record oltre la finestra).
 */

import { prisma } from "./prisma";

const IP_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

const EMAIL_MAX_ATTEMPTS = 10;
const EMAIL_WINDOW_MS = 30 * 60 * 1000; // 30 minuti

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number;
}

async function checkLimit(
  key: string,
  type: "ip" | "email",
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs);

  const count = await prisma.loginAttempt.count({
    where: {
      key,
      type,
      createdAt: { gte: windowStart },
    },
  });

  if (count >= maxAttempts) {
    // Trova il primo tentativo nella finestra per calcolare retryAfter
    const oldest = await prisma.loginAttempt.findFirst({
      where: { key, type, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const retryAfterMs = oldest
      ? windowMs - (Date.now() - oldest.createdAt.getTime())
      : windowMs;

    return { allowed: false, remainingAttempts: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  return { allowed: true, remainingAttempts: maxAttempts - count, retryAfterMs: 0 };
}

/**
 * Controlla rate limit per IP.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return checkLimit(ip, "ip", IP_MAX_ATTEMPTS, IP_WINDOW_MS);
}

/**
 * Controlla rate limit per email (blocco account).
 */
export async function checkEmailRateLimit(email: string): Promise<RateLimitResult> {
  return checkLimit(email.toLowerCase(), "email", EMAIL_MAX_ATTEMPTS, EMAIL_WINDOW_MS);
}

/**
 * Registra tentativo fallito per IP e email.
 */
export async function recordFailedAttempt(ip: string, email?: string): Promise<void> {
  const records = [
    prisma.loginAttempt.create({ data: { key: ip, type: "ip" } }),
  ];
  if (email) {
    records.push(
      prisma.loginAttempt.create({ data: { key: email.toLowerCase(), type: "email" } })
    );
  }
  await Promise.all(records);
}

/**
 * Reset tentativi dopo login riuscito.
 */
export async function resetAttempts(ip: string, email?: string): Promise<void> {
  const deletes = [
    prisma.loginAttempt.deleteMany({ where: { key: ip, type: "ip" } }),
  ];
  if (email) {
    deletes.push(
      prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase(), type: "email" } })
    );
  }
  await Promise.all(deletes);
}

/**
 * Pulizia record scaduti. Chiamata dal cron o on-demand.
 * Elimina tutti i record piu vecchi della finestra piu lunga (30 min).
 */
export async function cleanupExpiredAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - EMAIL_WINDOW_MS);
  const result = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
