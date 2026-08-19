/**
 * Stato di una lista contenuti (SOP / Documenti) espresso nell'indirizzo.
 *
 * PERCHÉ ESISTE QUESTO MODULO
 * Reparto, stato di lettura, testo cercato e pagina vivevano solo nella memoria
 * del componente: un F5 li azzerava e tornando indietro dal dettaglio la lista
 * ripartiva dall'alto, senza filtri. Portandoli nell'indirizzo diventano
 * ricaricabili, condivisibili e ricostruibili al ritorno.
 *
 * NOMENCLATURA
 * I nomi dei parametri sono quelli che il resto del sistema già usa:
 * `propertyId` (letto dalla shell operatore), `departmentId`, `acknowledged`,
 * `page` (gli stessi che /api/content accetta) e `q` (lo stesso di /api/search).
 * L'unico nome nuovo è `focus`, che non è un filtro ma la voce su cui la lista
 * deve riposizionarsi al ritorno.
 *
 * DIREZIONE UNICA
 * Le funzioni qui sono PURE. Il componente semina il proprio stato dall'URL una
 * volta sola, al mount, e da lì in poi scrive solo nella direzione stato → URL.
 * L'URL non rialimenta mai lo stato: è ciò che rende impossibile il ciclo fra
 * l'effect che scrive e il fetch che osserva.
 */

export interface ListState {
  /**
   * Struttura applicata. NON è modificabile da qui: è sempre il valore che la
   * shell operatore ha risolto (?propertyId= → localStorage → default). Vive
   * nello stato solo per essere serializzato, così il link è condivisibile:
   * senza, il destinatario vedrebbe i propri dati con i filtri di chi glielo ha
   * mandato.
   */
  propertyId: string;
  /** Reparto selezionato. "" = tutti i reparti. */
  departmentId: string;
  /** Filtro di lettura: "" = tutti, "true" = letti, "false" = da leggere. */
  acknowledged: "" | "true" | "false";
  /** Testo nella barra di ricerca. */
  q: string;
  /** Pagina corrente, 1-based. */
  page: number;
  /** Id della voce su cui riposizionarsi ed evidenziare. "" = nessuna. */
  focus: string;
}

/**
 * Chiavi ammesse nell'indirizzo di una lista. Usata anche per ripulire il
 * parametro `back` che arriva dal dettaglio, che è testo di provenienza esterna.
 */
export const LIST_PARAM_KEYS = [
  "propertyId",
  "departmentId",
  "acknowledged",
  "q",
  "page",
  "focus",
] as const;

export type ListParamKey = (typeof LIST_PARAM_KEYS)[number];

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseAcknowledged(raw: string | null): ListState["acknowledged"] {
  return raw === "true" || raw === "false" ? raw : "";
}

/**
 * Ricostruisce lo stato iniziale dall'indirizzo.
 *
 * `propertyId` è AUTOREVOLE e non viene letto dai parametri: lo passa il
 * chiamante prendendolo dal contesto shell, che lo ha già validato contro le
 * property accessibili. Così un link condiviso che punta a una struttura su cui
 * il destinatario non ha diritti non lascia l'indirizzo in disaccordo con la
 * tendina: la tendina mostra sempre la struttura effettivamente applicata.
 */
export function parseListState(
  params: URLSearchParams,
  propertyId: string
): ListState {
  return {
    propertyId,
    departmentId: params.get("departmentId") ?? "",
    acknowledged: parseAcknowledged(params.get("acknowledged")),
    q: params.get("q") ?? "",
    page: parsePage(params.get("page")),
    focus: params.get("focus") ?? "",
  };
}

/**
 * Serializza lo stato. I valori a default sono omessi per tenere l'indirizzo
 * leggibile; `propertyId` è invece SEMPRE presente, perché è il campo che rende
 * il link condivisibile.
 */
export function buildListQuery(state: ListState): string {
  const params = new URLSearchParams();
  params.set("propertyId", state.propertyId);
  if (state.departmentId) params.set("departmentId", state.departmentId);
  if (state.acknowledged) params.set("acknowledged", state.acknowledged);
  if (state.q) params.set("q", state.q);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.focus) params.set("focus", state.focus);
  return params.toString();
}

// ── Transizioni ────────────────────────────────────────────────────────────
// Ogni transizione che cambia il RISULTATO della lista azzera `page` e `focus`:
// restare a pagina 7 dopo aver cambiato reparto mostrerebbe una pagina vuota, e
// evidenziare una voce che non è più in elenco non ha senso.
// Tutte restituiscono lo STESSO oggetto quando non cambia nulla, così un
// setState che le usa non provoca un render (e quindi un fetch) inutile.

export function applyDepartment(state: ListState, departmentId: string): ListState {
  if (state.departmentId === departmentId) return state;
  return { ...state, departmentId, page: 1, focus: "" };
}

export function applyAcknowledged(
  state: ListState,
  acknowledged: ListState["acknowledged"]
): ListState {
  if (state.acknowledged === acknowledged) return state;
  return { ...state, acknowledged, page: 1, focus: "" };
}

/** Il testo cercato non filtra la lista sottostante: non tocca `page`. */
export function applyQuery(state: ListState, q: string): ListState {
  if (state.q === q) return state;
  return { ...state, q };
}

export function applyPage(state: ListState, page: number): ListState {
  const next = page >= 1 ? page : 1;
  if (state.page === next) return state;
  return { ...state, page: next, focus: "" };
}

/**
 * Cambio di struttura dalla tendina della shell.
 * Il reparto appartiene alla struttura, quindi cade; il testo cercato cade
 * insieme a lui (era il comportamento già in essere di LiveSearchBar). Il
 * filtro di lettura è trasversale e sopravvive, come prima.
 */
export function applyProperty(state: ListState, propertyId: string): ListState {
  if (state.propertyId === propertyId) return state;
  return { ...state, propertyId, departmentId: "", q: "", page: 1, focus: "" };
}

/**
 * Riallinea il reparto a quelli realmente accessibili, appena l'elenco arriva.
 *
 * Due casi:
 *  - un `departmentId` fuori perimetro (link condiviso, reparto di un'altra
 *    struttura, assegnazione revocata) viene scartato: non deve finire in query;
 *  - OPERATOR/HOD con un solo reparto lo hanno preselezionato e bloccato, come
 *    prima. Questa scrittura è il motivo per cui il fetch dei contenuti aspetta
 *    l'elenco reparti: senza l'attesa partirebbe due volte.
 */
export function reconcileDepartment(
  state: ListState,
  accessibleDepartmentIds: string[],
  roleRequiresSpecificDept: boolean
): ListState {
  if (state.departmentId && !accessibleDepartmentIds.includes(state.departmentId)) {
    return { ...state, departmentId: "", page: 1 };
  }
  if (
    !state.departmentId &&
    roleRequiresSpecificDept &&
    accessibleDepartmentIds.length === 1
  ) {
    return { ...state, departmentId: accessibleDepartmentIds[0] };
  }
  return state;
}

/**
 * Ripulisce il query string che il dettaglio riceve in `?back=`.
 *
 * È testo che arriva dall'indirizzo, quindi potenzialmente da un link
 * confezionato da altri: si tengono solo le chiavi note e si ricompone. Il
 * percorso di destinazione non viene mai preso da qui — è costante nel
 * chiamante — quindi non c'è modo di dirottare la navigazione altrove.
 */
export function sanitizeListQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  const source = new URLSearchParams(raw);
  const clean = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    const value = source.get(key);
    if (value) clean.set(key, value);
  }
  return clean.toString();
}
