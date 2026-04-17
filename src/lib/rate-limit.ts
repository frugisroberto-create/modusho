/**
 * Rate limiter in-memory per login.
 * Blocca un IP dopo MAX_ATTEMPTS tentativi falliti in WINDOW_MS.
 * Su Vercel Fluid Compute le istanze vengono riutilizzate,
 * quindi la mappa resta in memoria per la durata dell'istanza.
 * Non è perfetto (reset al cold start) ma è un buon primo livello.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuti

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const attempts = new Map<string, AttemptRecord>();

// Pulizia periodica delle entry scadute (ogni 5 minuti)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (now - record.firstAttempt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Controlla se un IP è bloccato. Ritorna true se può procedere, false se bloccato.
 */
export function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; retryAfterMs: number } {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  // Finestra scaduta: reset
  if (now - record.firstAttempt > WINDOW_MS) {
    attempts.delete(ip);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - record.firstAttempt);
    return { allowed: false, remainingAttempts: 0, retryAfterMs };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - record.count, retryAfterMs: 0 };
}

/**
 * Registra un tentativo fallito per un IP.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    record.count++;
  }
}

/**
 * Reset tentativi dopo login riuscito.
 */
export function resetAttempts(ip: string): void {
  attempts.delete(ip);
}
