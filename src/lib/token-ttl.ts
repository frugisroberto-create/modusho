/**
 * Durate di validità dei token, e come si dicono in italiano.
 *
 * Vive in un modulo a sé, senza dipendenze runtime, perché lo usano due parti
 * che non devono conoscersi: `auth-tokens` (che calcola la scadenza vera) e i
 * template email (che la dichiarano al destinatario). Tenendo un'unica fonte,
 * il testo della mail non può più promettere una durata diversa da quella che
 * il token ha davvero.
 */

import type { AuthTokenType } from "@prisma/client";

/** Durata di validità per tipo di token. */
export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  ACTIVATION: 30 * 24 * 60 * 60 * 1000, // 30 giorni
  RESET: 4 * 60 * 60 * 1000, // 4 ore
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formatta una durata in italiano, scegliendo l'unità più grande che divide
 * esattamente: 30 giorni, 4 ore, 90 minuti. Serve ai testi delle email.
 */
export function formatDuration(ms: number): string {
  if (ms % DAY_MS === 0) {
    const days = ms / DAY_MS;
    return `${days} ${days === 1 ? "giorno" : "giorni"}`;
  }
  if (ms % HOUR_MS === 0) {
    const hours = ms / HOUR_MS;
    return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  }
  const minutes = Math.round(ms / MINUTE_MS);
  return `${minutes} ${minutes === 1 ? "minuto" : "minuti"}`;
}

/** Durata dichiarabile all'utente per un tipo di token. */
export function formatTokenTtl(type: AuthTokenType): string {
  return formatDuration(TOKEN_TTL_MS[type]);
}
