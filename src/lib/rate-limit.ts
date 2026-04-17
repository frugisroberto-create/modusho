/**
 * Rate limiter in-memory per login.
 *
 * Due livelli di protezione:
 * 1. Per IP: 5 tentativi falliti in 15 minuti → blocco IP
 * 2. Per email: 10 tentativi falliti in 30 minuti → blocco account
 *
 * Il doppio livello copre sia brute force da un singolo IP
 * sia attacchi distribuiti (IP diversi, stessa email).
 *
 * Su Vercel Fluid Compute le istanze vengono riutilizzate,
 * quindi le mappe restano in memoria per la durata dell'istanza.
 */

const IP_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minuti

const EMAIL_MAX_ATTEMPTS = 10;
const EMAIL_WINDOW_MS = 30 * 60 * 1000; // 30 minuti

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const ipAttempts = new Map<string, AttemptRecord>();
const emailAttempts = new Map<string, AttemptRecord>();

// Pulizia periodica delle entry scadute (ogni 5 minuti)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipAttempts) {
    if (now - record.firstAttempt > IP_WINDOW_MS) ipAttempts.delete(key);
  }
  for (const [key, record] of emailAttempts) {
    if (now - record.firstAttempt > EMAIL_WINDOW_MS) emailAttempts.delete(key);
  }
}, 5 * 60 * 1000);

function checkMap(map: Map<string, AttemptRecord>, key: string, maxAttempts: number, windowMs: number): { allowed: boolean; remainingAttempts: number; retryAfterMs: number } {
  const now = Date.now();
  const record = map.get(key);

  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterMs: 0 };
  }

  if (now - record.firstAttempt > windowMs) {
    map.delete(key);
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterMs: 0 };
  }

  if (record.count >= maxAttempts) {
    const retryAfterMs = windowMs - (now - record.firstAttempt);
    return { allowed: false, remainingAttempts: 0, retryAfterMs };
  }

  return { allowed: true, remainingAttempts: maxAttempts - record.count, retryAfterMs: 0 };
}

function recordMap(map: Map<string, AttemptRecord>, key: string, windowMs: number): void {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now - record.firstAttempt > windowMs) {
    map.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

/**
 * Controlla rate limit per IP.
 */
export function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; retryAfterMs: number } {
  return checkMap(ipAttempts, ip, IP_MAX_ATTEMPTS, IP_WINDOW_MS);
}

/**
 * Controlla rate limit per email (blocco account).
 */
export function checkEmailRateLimit(email: string): { allowed: boolean; remainingAttempts: number; retryAfterMs: number } {
  return checkMap(emailAttempts, email.toLowerCase(), EMAIL_MAX_ATTEMPTS, EMAIL_WINDOW_MS);
}

/**
 * Registra tentativo fallito per IP e email.
 */
export function recordFailedAttempt(ip: string, email?: string): void {
  recordMap(ipAttempts, ip, IP_WINDOW_MS);
  if (email) {
    recordMap(emailAttempts, email.toLowerCase(), EMAIL_WINDOW_MS);
  }
}

/**
 * Reset tentativi dopo login riuscito.
 */
export function resetAttempts(ip: string, email?: string): void {
  ipAttempts.delete(ip);
  if (email) {
    emailAttempts.delete(email.toLowerCase());
  }
}
