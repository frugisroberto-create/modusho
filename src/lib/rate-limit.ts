/**
 * Rate limiter persistente su PostgreSQL.
 *
 * Tre livelli di protezione:
 * 1. Per coppia IP+email: 5 tentativi falliti in 15 minuti -> blocco di quella
 *    coppia. È il gate del login: chi sbaglia la password sul proprio
 *    indirizzo non blocca nessun altro sullo stesso IP.
 * 2. Per IP (tetto largo): 50 tentativi falliti in 15 minuti -> blocco
 *    dell'IP, difesa contro un attacco automatico distribuito su tante email.
 *    Cinque persone che sbagliano l'indirizzo dallo stesso hotel non ci
 *    arrivano mai: il caso che ha bloccato l'albergo il 31 agosto 2026 (5
 *    fallimenti/15min "per IP" nudo) non può più ripetersi.
 * 3. Per email: 10 tentativi falliti in 30 minuti -> blocco account.
 *
 * I record vengono contati con una query sul DB (tabella LoginAttempt).
 * I record scaduti vengono puliti periodicamente dal cron /api/cron/cleanup-login-attempts
 * oppure in modo lazy ad ogni check (DELETE dei record oltre la finestra).
 *
 * NOTA: checkRateLimit/recordFailedAttempt/resetAttempts restano gli stessi
 * usati da /api/auth/forgot, /api/auth/activate e /api/auth/reset — endpoint
 * diversi dal login, con la propria soglia IP invariata (5/15min). Non sono
 * stati toccati.
 */

import { prisma } from "./prisma";
import { normalizeEmail } from "./email-normalize";

const IP_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

const IP_EMAIL_MAX_ATTEMPTS = 5;
const IP_EMAIL_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

const IP_CEILING_MAX_ATTEMPTS = 50; // tetto largo sul solo IP, stessa finestra di IP_WINDOW_MS

const EMAIL_MAX_ATTEMPTS = 10;
const EMAIL_WINDOW_MS = 30 * 60 * 1000; // 30 minuti

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number;
}

async function checkLimit(
  key: string,
  type: "ip" | "email" | "ip_email",
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
 * Estrae l'IP del chiamante da una Request (route handler).
 * Stessa logica già usata nel provider credentials di NextAuth.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Chiave composita IP+email: un solo tipo di riga, un separatore che non compare in nessuno dei due. */
function ipEmailKey(ip: string, normalizedEmail: string): string {
  return `${ip} ${normalizedEmail}`;
}

/**
 * Controlla rate limit per IP. Usato da /api/auth/forgot, /api/auth/activate
 * e /api/auth/reset — non dal login, che usa checkIpEmailRateLimit +
 * checkIpCeilingRateLimit qui sotto.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return checkLimit(ip, "ip", IP_MAX_ATTEMPTS, IP_WINDOW_MS);
}

/**
 * Controlla rate limit per la coppia IP+email (login): 5 tentativi/15min.
 * Chi sbaglia la password sul proprio indirizzo non blocca altri sullo
 * stesso IP.
 */
export async function checkIpEmailRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  return checkLimit(ipEmailKey(ip, normalizeEmail(email)), "ip_email", IP_EMAIL_MAX_ATTEMPTS, IP_EMAIL_WINDOW_MS);
}

/**
 * Tetto largo sul solo IP (login): 50 tentativi/15min, difesa contro un
 * attacco automatico che provi molte email diverse dallo stesso IP.
 */
export async function checkIpCeilingRateLimit(ip: string): Promise<RateLimitResult> {
  return checkLimit(ip, "ip", IP_CEILING_MAX_ATTEMPTS, IP_WINDOW_MS);
}

/**
 * Controlla rate limit per email (blocco account). Soglia invariata:
 * 10 tentativi/30min.
 */
export async function checkEmailRateLimit(email: string): Promise<RateLimitResult> {
  return checkLimit(normalizeEmail(email), "email", EMAIL_MAX_ATTEMPTS, EMAIL_WINDOW_MS);
}

/**
 * Registra tentativo fallito per IP, per email e per la coppia IP+email.
 */
export async function recordFailedAttempt(ip: string, email?: string): Promise<void> {
  const records = [
    prisma.loginAttempt.create({ data: { key: ip, type: "ip" } }),
  ];
  if (email) {
    const normalized = normalizeEmail(email);
    records.push(
      prisma.loginAttempt.create({ data: { key: normalized, type: "email" } }),
      prisma.loginAttempt.create({ data: { key: ipEmailKey(ip, normalized), type: "ip_email" } })
    );
  }
  await Promise.all(records);
}

/**
 * Reset tentativi dopo login riuscito (IP, email e coppia IP+email).
 */
export async function resetAttempts(ip: string, email?: string): Promise<void> {
  const deletes = [
    prisma.loginAttempt.deleteMany({ where: { key: ip, type: "ip" } }),
  ];
  if (email) {
    const normalized = normalizeEmail(email);
    deletes.push(
      prisma.loginAttempt.deleteMany({ where: { key: normalized, type: "email" } }),
      prisma.loginAttempt.deleteMany({ where: { key: ipEmailKey(ip, normalized), type: "ip_email" } })
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
