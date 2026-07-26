/**
 * Guard del login per gli account senza password utilizzabile.
 *
 * Da quando la creazione utente non chiede più la password, un account appena
 * creato ha `passwordHash` vuoto finché la persona non completa l'invito. Lo
 * stesso vale per gli utenti disattivati (soft delete azzera l'hash).
 *
 * Senza questo controllo, bcrypt.compare riceverebbe un hash malformato: va
 * intercettato PRIMA, così il login fallisce pulito invece di far esplodere il
 * provider credentials.
 */

/**
 * True se l'account ha una password con cui si può tentare il login.
 * Un hash vuoto, assente o palesemente non-bcrypt non è utilizzabile.
 */
export function hasUsablePassword(passwordHash: string | null | undefined): boolean {
  if (!passwordHash) return false;
  if (passwordHash.trim().length === 0) return false;
  // Gli hash bcrypt iniziano con $2a$ / $2b$ / $2y$ e sono lunghi ~60 caratteri.
  return /^\$2[aby]\$/.test(passwordHash);
}
