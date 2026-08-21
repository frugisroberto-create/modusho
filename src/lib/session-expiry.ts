/**
 * Sessione decaduta: quando dirlo, e cosa dire.
 *
 * Quando la password di un account cambia, le sessioni aperte altrove vengono
 * invalidate — è corretto e non si tocca. Ma il callback `session` restituisce
 * allora `session.user` undefined, e da lì in poi l'interfaccia si limitava a
 * svuotarsi: pulsanti che spariscono perché il permesso non è calcolabile,
 * elenchi vuoti perché le API rispondono 401. All'utente non arrivava nulla.
 *
 * Qui vive la sola regola che decide se espellere, isolata dal componente per
 * poter essere verificata: il caso che conta davvero è quello che NON deve
 * scattare, cioè il transito per lo stato di caricamento.
 */

/** Parametro con cui la pagina di login riconosce una sessione decaduta. */
export const SESSION_EXPIRED_PARAM = "sessione";
export const SESSION_EXPIRED_VALUE = "scaduta";

/** Il messaggio mostrato al login. Uno solo, definito qui. */
export const SESSION_EXPIRED_MESSAGE =
  "La tua sessione è scaduta perché la password del tuo account è cambiata. Entra di nuovo per continuare.";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Va espulso l'utente verso il login?
 *
 * Solo se `useSession` lo dichiara autenticato E l'utente non c'è: è la firma
 * esatta di una sessione invalidata lato server, distinta sia dal caricamento
 * sia dal non essere mai entrati.
 *
 * `loading` non espelle MAI: durante il caricamento i dati non ci sono ancora,
 * e trattare quell'assenza come una decadenza butterebbe fuori ogni utente a
 * ogni montaggio.
 */
export function shouldExpireSession(params: {
  status: SessionStatus;
  hasUser: boolean;
  pathname: string;
}): boolean {
  // Copre sia "loading" sia "unauthenticated": nel primo caso non sappiamo
  // ancora, nel secondo ci pensa il middleware.
  if (params.status !== "authenticated") return false;

  if (params.hasUser) return false;

  // Sul login non si espelle: si finirebbe in un rimbalzo su sé stessi.
  if (params.pathname.startsWith("/login")) return false;

  return true;
}

/** L'indirizzo a cui mandare chi ha la sessione decaduta. */
export function buildSessionExpiredUrl(): string {
  return `/login?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`;
}
