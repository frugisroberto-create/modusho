import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyReadResponse, readErrorMessage, performRead } from "../read-outcome";

/**
 * I tre esiti di una lettura.
 *
 * Prima erano due — "riuscita" e tutto il resto — e "tutto il resto" veniva
 * silenziosamente disegnato come un elenco vuoto. Questi test tengono separato
 * ciò che non deve confondersi: un esito vero e vuoto, un fallimento, e una
 * sessione decaduta che ha un flusso suo.
 */

describe("classifyReadResponse", () => {
  it("una risposta riuscita è un esito vero, anche se i dati saranno vuoti", () => {
    expect(classifyReadResponse(200).kind).toBe("ok");
    expect(classifyReadResponse(201).kind).toBe("ok");
    expect(classifyReadResponse(204).kind).toBe("ok");
  });

  it("il 401 confluisce nel flusso della sessione decaduta, non nell'errore generico", () => {
    expect(classifyReadResponse(401).kind).toBe("session-expired");
  });

  it("un 500 è un fallimento, non un elenco vuoto", () => {
    expect(classifyReadResponse(500).kind).toBe("error");
  });

  it("anche 403, 404 e 502 sono fallimenti da dichiarare", () => {
    for (const status of [403, 404, 429, 502, 503]) {
      expect(classifyReadResponse(status).kind).toBe("error");
    }
  });

  it("il 401 ha la precedenza su ogni altra classificazione", () => {
    // Se un domani qualcuno spostasse il controllo dopo il ramo 2xx, questo
    // test resterebbe l'unico a dire che il messaggio sbagliato parlerebbe di
    // connessione mentre il problema è la sessione.
    expect(classifyReadResponse(401)).toEqual({ kind: "session-expired" });
  });
});

describe("readErrorMessage", () => {
  it("dice cosa non si è caricato e cosa fare", () => {
    expect(readErrorMessage("l'elenco")).toBe(
      "Non siamo riusciti a caricare l'elenco. Controlla la connessione e riprova."
    );
  });

  it("si adatta al contenuto", () => {
    expect(readErrorMessage("la scheda")).toContain("la scheda");
    expect(readErrorMessage("le strutture")).toContain("le strutture");
  });

  it("non promette che non ci sia nulla", () => {
    const messaggio = readErrorMessage("l'elenco");
    expect(messaggio).not.toContain("Nessun");
    expect(messaggio).not.toContain("nessun");
  });
});

// ─── performRead: il flusso vero usato dalle tre letture ─────────────

function rispostaFinta(status: number, body: unknown = {}) {
  return { status, json: async () => body } as unknown as Response;
}

describe("performRead — i tre esiti sul codice che le pagine usano davvero", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lettura riuscita con ZERO risultati: è un esito vero, non un errore", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      rispostaFinta(200, { data: [], meta: { total: 0 } })
    );

    const esito = await performRead<{ data: unknown[]; meta: { total: number } }>(
      "/api/users",
      "l'elenco"
    );

    expect(esito.kind).toBe("ok");
    if (esito.kind === "ok") {
      // È questo che tiene in piedi "Nessun utente trovato": un elenco vuoto
      // legittimo non deve mai finire nel ramo d'errore.
      expect(esito.data.data).toEqual([]);
      expect(esito.data.meta.total).toBe(0);
    }
  });

  it("500: esito d'errore con il messaggio, non un elenco vuoto", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rispostaFinta(500));

    const esito = await performRead("/api/users", "l'elenco");

    expect(esito.kind).toBe("error");
    if (esito.kind === "error") {
      expect(esito.message).toBe(
        "Non siamo riusciti a caricare l'elenco. Controlla la connessione e riprova."
      );
    }
  });

  it("errore di rete: stesso trattamento, e NON lancia", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    // Prima mancava il catch: qui si sarebbe propagata una rejection non
    // gestita, invisibile all'utente.
    const esito = await performRead("/api/users", "l'elenco");

    expect(esito.kind).toBe("error");
    if (esito.kind === "error") {
      expect(esito.message).toContain("Controlla la connessione");
    }
  });

  it("401: confluisce nel flusso della sessione decaduta, senza messaggio d'errore", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rispostaFinta(401, { error: "Sessione scaduta" }));

    const esito = await performRead("/api/users", "l'elenco");

    expect(esito.kind).toBe("session-expired");
    // Nessun `message`: la pagina non deve scrivere nulla, ci pensa SessionGuard.
    expect(esito).not.toHaveProperty("message");
  });

  it("403: è un errore da dichiarare, non una sessione decaduta", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rispostaFinta(403));

    const esito = await performRead("/api/users", "l'elenco");

    expect(esito.kind).toBe("error");
  });

  it("un JSON malformato non lancia: diventa un esito d'errore", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    } as unknown as Response);

    const esito = await performRead("/api/users", "l'elenco");

    expect(esito.kind).toBe("error");
  });

  it("il messaggio si adatta a ciò che si stava caricando", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rispostaFinta(500));

    const esito = await performRead("/api/users/abc", "la scheda");

    expect(esito.kind).toBe("error");
    if (esito.kind === "error") expect(esito.message).toContain("la scheda");
  });
});
