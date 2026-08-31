/**
 * I messaggi che authorize() lancia deliberatamente per un blocco da rate
 * limiting sono sicuri da mostrare così come sono: parlano solo di tentativi
 * e minuti, mai dell'account. Qualunque altro testo che arrivi da
 * signIn()'s result.error — un'eccezione non prevista, un errore di database
 * che ha bucato l'authorize() — NON va mostrato: da quando il messaggio vero
 * riesce ad attraversare il confine di NextAuth, un'eccezione del genere
 * finirebbe scritta grezza sotto il campo password.
 *
 * Un posto solo: auth.ts costruisce i due messaggi con queste funzioni,
 * ogni pagina che legge result.error li riconosce con isKnownAuthBlockMessage
 * (o, più comodo, con displayAuthError). Se la formulazione cambia, cambia
 * qui e resta coerente su entrambi i lati.
 */

export function tooManyAttemptsMessage(retryMinutes: number): string {
  return `Troppi tentativi. Riprova tra ${retryMinutes} minuti.`;
}

export function accountLockedMessage(retryMinutes: number): string {
  return `Account temporaneamente bloccato. Riprova tra ${retryMinutes} minuti.`;
}

const KNOWN_BLOCK_PATTERNS = [
  /^Troppi tentativi\. Riprova tra \d+ minuti\.$/,
  /^Account temporaneamente bloccato\. Riprova tra \d+ minuti\.$/,
];

/** True se il testo è uno dei messaggi di blocco che authorize() lancia apposta. */
export function isKnownAuthBlockMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return KNOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Il testo da mostrare per un errore di signIn(): il messaggio vero se è un
 * blocco riconosciuto, altrimenti `fallback` — senza mai lasciar trapelare
 * un'eccezione non prevista. "CredentialsSignin" è il codice generico che
 * NextAuth assegna quando authorize() restituisce null (email o password
 * sbagliate): anche lì il messaggio resta `fallback`, non deve mai far
 * capire se l'indirizzo è registrato o no.
 */
export function displayAuthError(rawError: string | null | undefined, fallback: string): string {
  if (!rawError || rawError === "CredentialsSignin") return fallback;
  if (isKnownAuthBlockMessage(rawError)) return rawError;
  // eslint-disable-next-line no-console
  console.warn("[auth] messaggio di errore non riconosciuto, sostituito con un testo generico:", rawError);
  return fallback;
}
