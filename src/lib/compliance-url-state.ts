/**
 * Stato della pagina Presa visione espresso nell'indirizzo.
 *
 * PERCHÉ ESISTE QUESTO MODULO
 * Struttura, reparto, tipo e stato vivevano solo nella memoria del componente:
 * un F5 li azzerava, e un Hotel Manager che voleva mandare a un capo reparto
 * «guarda queste qui» non aveva un link da mandare. Portandoli nell'indirizzo
 * la pagina diventa ricaricabile e condivisibile.
 *
 * Stessa divisione e stesse regole di `list-url-state.ts`: funzioni pure,
 * direzione unica (stato → URL, mai il contrario), e ogni transizione che
 * cambia il RISULTATO azzera la pagina, perché restare a pagina 4 dopo aver
 * cambiato filtro mostrerebbe un elenco vuoto.
 */

/** Gli stati di una riga, gli stessi che calcola `recipient-set.ts`. */
export const COMPLIANCE_STATES = ["aperta", "completata", "senza-destinatari"] as const;
export type ComplianceStateName = (typeof COMPLIANCE_STATES)[number];

export const COMPLIANCE_STATE_LABELS: Record<ComplianceStateName, string> = {
  aperta: "Aperte",
  completata: "Completate",
  "senza-destinatari": "Senza destinatari",
};

export type ComplianceTypeFilter = "" | "SOP" | "DOCUMENT" | "MEMO";

export interface ComplianceUrlState {
  /** "" = tutte le strutture accessibili. */
  propertyId: string;
  /** "" = tutti i reparti. */
  departmentId: string;
  /** "" = tutti i tipi soggetti a presa visione. */
  type: ComplianceTypeFilter;
  state: ComplianceStateName;
  page: number;
}

export const COMPLIANCE_PARAM_KEYS = ["propertyId", "departmentId", "type", "state", "page"] as const;

export const DEFAULT_COMPLIANCE_STATE: ComplianceUrlState = {
  propertyId: "",
  departmentId: "",
  type: "",
  // La pagina serve a rincorrere ciò che manca: si apre su quello.
  state: "aperta",
  page: 1,
};

function parseType(raw: string | null): ComplianceTypeFilter {
  return raw === "SOP" || raw === "DOCUMENT" || raw === "MEMO" ? raw : "";
}

function parseState(raw: string | null): ComplianceStateName {
  return COMPLIANCE_STATES.includes(raw as ComplianceStateName)
    ? (raw as ComplianceStateName)
    : DEFAULT_COMPLIANCE_STATE.state;
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Ricostruisce lo stato dall'indirizzo. Valori sconosciuti — un link storpiato,
 * un tipo che non esiste più — ricadono sul default invece di arrivare in query.
 */
export function parseComplianceState(params: URLSearchParams): ComplianceUrlState {
  return {
    propertyId: params.get("propertyId") ?? "",
    departmentId: params.get("departmentId") ?? "",
    type: parseType(params.get("type")),
    state: parseState(params.get("state")),
    page: parsePage(params.get("page")),
  };
}

/** Serializza per l'indirizzo: i valori a default restano fuori. */
export function buildComplianceQuery(state: ComplianceUrlState): string {
  const params = new URLSearchParams();
  if (state.propertyId) params.set("propertyId", state.propertyId);
  if (state.departmentId) params.set("departmentId", state.departmentId);
  if (state.type) params.set("type", state.type);
  if (state.state !== DEFAULT_COMPLIANCE_STATE.state) params.set("state", state.state);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/**
 * Serializza per la rotta, che invece vuole tutto esplicito: lo stato governa
 * quali righe tornano, e l'impaginazione non ha un default da indovinare.
 */
export function buildComplianceApiQuery(state: ComplianceUrlState, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(pageSize),
    state: state.state,
  });
  if (state.propertyId) params.set("propertyId", state.propertyId);
  if (state.departmentId) params.set("departmentId", state.departmentId);
  if (state.type) params.set("type", state.type);
  return params.toString();
}

// ── Transizioni ────────────────────────────────────────────────────────────
// Tutte restituiscono lo STESSO oggetto quando non cambia nulla, così un
// setState che le usa non provoca un render (e quindi una chiamata) inutile.

/** Il reparto appartiene alla struttura: cambiando struttura, cade. */
export function applyProperty(state: ComplianceUrlState, propertyId: string): ComplianceUrlState {
  if (state.propertyId === propertyId) return state;
  return { ...state, propertyId, departmentId: "", page: 1 };
}

export function applyDepartment(state: ComplianceUrlState, departmentId: string): ComplianceUrlState {
  if (state.departmentId === departmentId) return state;
  return { ...state, departmentId, page: 1 };
}

export function applyType(state: ComplianceUrlState, type: ComplianceTypeFilter): ComplianceUrlState {
  if (state.type === type) return state;
  return { ...state, type, page: 1 };
}

export function applyState(state: ComplianceUrlState, next: ComplianceStateName): ComplianceUrlState {
  if (state.state === next) return state;
  return { ...state, state: next, page: 1 };
}

export function applyPage(state: ComplianceUrlState, page: number): ComplianceUrlState {
  const next = page >= 1 ? page : 1;
  if (state.page === next) return state;
  return { ...state, page: next };
}

/**
 * Riallinea il reparto a quelli della struttura scelta.
 * Un `departmentId` che non appartiene alla struttura — link condiviso, reparto
 * di un'altra struttura, assegnazione revocata — viene scartato: non deve
 * finire in query, dove restringerebbe l'elenco a nulla senza spiegare perché.
 */
export function reconcileDepartment(
  state: ComplianceUrlState,
  accessibleDepartmentIds: string[]
): ComplianceUrlState {
  if (!state.departmentId) return state;
  if (accessibleDepartmentIds.includes(state.departmentId)) return state;
  return { ...state, departmentId: "", page: 1 };
}
