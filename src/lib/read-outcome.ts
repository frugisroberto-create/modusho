/**
 * I tre esiti di una lettura, tenuti distinti.
 *
 * Il difetto che questo modulo chiude: le pagine scrivevano `if (res.ok)` senza
 * ramo alternativo, quindi un 500, un 403 o una connessione caduta finivano
 * tutti nello stesso posto di un elenco legittimamente vuoto — e l'utente
 * leggeva "Nessun utente trovato", una frase rassicurante e falsa.
 *
 * Un esito vuoto e un fallimento non sono la stessa cosa e non devono
 * assomigliarsi.
 */

export type ReadOutcome =
  /** Risposta valida: i dati si possono leggere. Vuoti o no, è un esito vero. */
  | { kind: "ok" }
  /** Sessione decaduta: se ne occupa il guard, la pagina non deve dire nulla. */
  | { kind: "session-expired" }
  /** Non siamo riusciti a sapere: va detto, e va offerto di riprovare. */
  | { kind: "error" };

/**
 * Classifica una risposta HTTP.
 *
 * Il 401 esce PRIMA di ogni altra cosa: confluisce nel flusso della sessione
 * decaduta, e mostrarne il messaggio d'errore generico direbbe all'utente di
 * controllare la connessione mentre il problema è un altro.
 */
export function classifyReadResponse(status: number): ReadOutcome {
  if (status === 401) return { kind: "session-expired" };
  if (status >= 200 && status < 300) return { kind: "ok" };
  return { kind: "error" };
}

/** Un'eccezione della fetch (rete assente, DNS, timeout) è un fallimento. */
export const NETWORK_OUTCOME: ReadOutcome = { kind: "error" };

/** Messaggio d'errore, adattato a ciò che non si è potuto caricare. */
export function readErrorMessage(cosa: string): string {
  return `Non siamo riusciti a caricare ${cosa}. Controlla la connessione e riprova.`;
}

/** L'esito di una lettura, con i dati quando ci sono. */
export type ReadResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "session-expired" }
  | { kind: "error"; message: string };

/**
 * Esegue una lettura e ne restituisce l'esito, senza mai lanciare.
 *
 * Il `catch` non è un dettaglio: prima mancava, e un errore di rete diventava
 * una promise rejection non gestita — invisibile all'utente, assente dai log,
 * e indistinguibile da un elenco vuoto perché lo stato non veniva toccato.
 *
 * `cosa` entra nel messaggio ("l'elenco", "la scheda"): chi legge deve sapere
 * che cosa non si è caricato, non solo che qualcosa è andato storto.
 */
export async function performRead<T>(url: string, cosa: string): Promise<ReadResult<T>> {
  try {
    const res = await fetch(url);
    const esito = classifyReadResponse(res.status);
    if (esito.kind === "session-expired") return { kind: "session-expired" };
    if (esito.kind === "error") return { kind: "error", message: readErrorMessage(cosa) };
    return { kind: "ok", data: (await res.json()) as T };
  } catch {
    return { kind: "error", message: readErrorMessage(cosa) };
  }
}
