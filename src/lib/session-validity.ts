/**
 * Validità della sessione rispetto al cambio password.
 *
 * Quando un utente cambia password, le sessioni aperte altrove devono
 * decadere: un token emesso PRIMA di `passwordChangedAt` non vale più.
 *
 * Funzione pura e isolata dai callback NextAuth per poter essere testata
 * senza database e senza sessione reale.
 */

/**
 * True se il token va invalidato.
 *
 * @param issuedAtSeconds  campo `iat` del JWT (secondi epoch, come da standard)
 * @param passwordChangedAt data dell'ultimo cambio password (null = mai cambiata)
 */
export function isSessionStale(
  issuedAtSeconds: number | undefined,
  passwordChangedAt: Date | null | undefined
): boolean {
  if (!passwordChangedAt) return false;
  if (typeof issuedAtSeconds !== "number" || !Number.isFinite(issuedAtSeconds)) {
    // Token senza `iat` attendibile: in dubbio si invalida (fail-closed).
    return true;
  }

  // `iat` è in secondi: si confronta al secondo, arrotondando per difetto la
  // data di cambio password. Un token emesso nello STESSO secondo del cambio
  // è considerato valido (è quello appena rilasciato a chi ha cambiato).
  const changedAtSeconds = Math.floor(passwordChangedAt.getTime() / 1000);
  return issuedAtSeconds < changedAtSeconds;
}
