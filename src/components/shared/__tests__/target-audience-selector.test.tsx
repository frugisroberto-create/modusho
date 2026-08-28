// @vitest-environment jsdom

/**
 * Il collaudo a mano, fatto fare alla macchina.
 *
 * Il pannello dei destinatari è UN componente per tutti i ruoli. La regola che
 * porta è per un ruolo solo, e il modo in cui può sbagliare non è un errore
 * rosso: è una casella che non c'è. Un'assenza non la segnala nessuno — la si
 * aggira, o si pensa di aver capito male — e ci si accorge del guasto settimane
 * dopo, quando qualcuno dice che una comunicazione a tutti non riesce più a
 * mandarla.
 *
 * Queste prove montano il pannello davvero e guardano che cosa c'è a schermo.
 * Per l'Hotel Manager pretendono le due presenze e negano le quattro frasi
 * riservate al referente corporate; per il referente corporate pretendono
 * l'opposto. È l'unico modo di trasformare un'assenza in un fallimento.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  TargetAudienceSelector,
  type TargetAudienceState,
} from "../target-audience-selector";

// ─── Fixture: una struttura, tre reparti, quattro persone ────────────

const P1 = "prop-1";
const FB = "dept-fb";
const SALA = "dept-sala";
const PIANI = "dept-piani";

const ME = "utente-corrente";

const DEPARTMENTS = [
  { id: FB, name: "Cucina", code: "FB" },
  { id: SALA, name: "Sala", code: "SL" },
  { id: PIANI, name: "Piani", code: "PN" },
];

const USERS = [
  { id: ME, name: "Chi Sta Scrivendo", role: "HOTEL_MANAGER", email: "io@hotel.it",
    propertyAssignments: [{ department: { id: FB } }] },
  { id: "u-chef", name: "Il Capocuoco", role: "OPERATOR", email: "chef@hotel.it",
    propertyAssignments: [{ department: { id: FB } }] },
  { id: "u-sala", name: "Il Maitre", role: "OPERATOR", email: "sala@hotel.it",
    propertyAssignments: [{ department: { id: SALA } }] },
  { id: "u-piani", name: "La Governante", role: "OPERATOR", email: "piani@hotel.it",
    propertyAssignments: [{ department: { id: PIANI } }] },
  // Nel reparto del perimetro, ma di ruoli che il contenuto lo vedono già.
  { id: "u-capo", name: "Il Capo Cucina", role: "HOD", email: "capo@hotel.it",
    propertyAssignments: [{ department: { id: FB } }] },
  { id: "u-corp", name: "L Altro Corporate", role: "CORPORATE", email: "corp@hotel.it",
    propertyAssignments: [{ department: { id: FB } }] },
  { id: "u-dir", name: "Il Direttore", role: "HOTEL_MANAGER", email: "dir@hotel.it",
    propertyAssignments: [{ department: { id: FB } }] },
];

// ─── Le quattro frasi che al di fuori del corporate non devono esistere ─

const FRASI_RISERVATE = {
  spiegazione: /Come referente corporate ti rivolgi ai reparti di tua competenza/,
  soloIMiei: /Sono elencati soltanto i reparti di tua competenza/,
  nessunReparto: /In questa struttura non hai reparti di tua competenza/,
  ereditati: /Questo contenuto è rivolto anche a destinatari fuori dai reparti di tua competenza/,
};

/** Le due presenze che si perdono in silenzio, e che quindi vanno pretese. */
const SEZIONE_TUTTI = "Visibile a ogni operatore della struttura";
const SEZIONE_RUOLI = "Ruoli trasversali";

// ─── Impalcatura ─────────────────────────────────────────────────────

const emptyValue: TargetAudienceState = {
  allDepartments: false,
  departmentIds: [],
  roles: [],
  userIds: [],
};

function stubFetch(myDepartments = DEPARTMENTS) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/api/my-departments")
      ? { data: myDepartments }
      : url.includes("/api/users")
        ? { data: USERS }
        : { data: DEPARTMENTS };
    return { ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function montaPannello(props: {
  userRole: string;
  allowedDepartmentIds?: string[];
  value?: Partial<TargetAudienceState>;
}) {
  const onChange = vi.fn();
  render(
    <TargetAudienceSelector
      propertyId={P1}
      userRole={props.userRole}
      currentUserId={ME}
      allowedDepartmentIds={props.allowedDepartmentIds}
      value={{ ...emptyValue, ...props.value }}
      onChange={onChange}
    />
  );
  // Nessun matcher di jest-dom: si resta alle asserzioni di vitest, così il
  // progetto non si porta dietro una dipendenza in più.
  await waitFor(() =>
    expect(screen.queryByText(/Caricamento destinatari/)).toBeNull()
  );
  return { onChange };
}

/** Nessuna delle quattro frasi riservate è a schermo. */
function nessunaFraseRiservata() {
  for (const [nome, frase] of Object.entries(FRASI_RISERVATE)) {
    expect(screen.queryByText(frase), `frase "${nome}" comparsa dove non deve`).toBeNull();
  }
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── Hotel Manager: niente di nuovo, tranne sé stesso ────────────────

describe("Hotel Manager — il pannello resta quello di prima", () => {
  it("non vede nessuna delle quattro frasi riservate al referente corporate", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER" });
    nessunaFraseRiservata();
  });

  it("ha «Tutti gli operatori» e i ruoli trasversali — le due presenze che si perdono in silenzio", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER" });
    expect(screen.getByText(SEZIONE_TUTTI)).toBeTruthy();
    expect(screen.getByText(SEZIONE_RUOLI)).toBeTruthy();
  });

  it("vede tutti i reparti della struttura, nessuno escluso", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER" });
    for (const dept of DEPARTMENTS) {
      expect(screen.getByText(dept.name), `reparto ${dept.name} sparito`).toBeTruthy();
    }
  });

  it("vede tutte le persone tranne sé stesso — l'unica differenza legittima", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER" });
    expect(screen.getByText("Il Capocuoco")).toBeTruthy();
    expect(screen.getByText("Il Maitre")).toBeTruthy();
    expect(screen.getByText("La Governante")).toBeTruthy();
    expect(screen.queryByText("Chi Sta Scrivendo")).toBeNull();
  });

  it("continua a vedere anche capi reparto, corporate e direttori: la regola sul ruolo non lo tocca", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER" });
    expect(screen.getByText("Il Capo Cucina")).toBeTruthy();
    expect(screen.getByText("L Altro Corporate")).toBeTruthy();
    expect(screen.getByText("Il Direttore")).toBeTruthy();
  });

  it("con «Tutti gli operatori» già scelto non gli compare nessun avviso di destinatari ereditati", async () => {
    await montaPannello({
      userRole: "HOTEL_MANAGER",
      value: { allDepartments: true, roles: ["HOD"] },
    });
    nessunaFraseRiservata();
  });

  it("un perimetro passato per sbaglio viene IGNORATO: non gli toglie reparti in silenzio", async () => {
    // È il guasto che si temeva: un chiamante distratto passa il perimetro di
    // un corporate a un Hotel Manager. Il componente non deve avere il potere
    // di restringerlo.
    await montaPannello({ userRole: "HOTEL_MANAGER", allowedDepartmentIds: [FB] });

    for (const dept of DEPARTMENTS) {
      expect(screen.getByText(dept.name), `reparto ${dept.name} sparito`).toBeTruthy();
    }
    expect(screen.getByText(SEZIONE_TUTTI)).toBeTruthy();
    expect(screen.getByText(SEZIONE_RUOLI)).toBeTruthy();
    expect(screen.getByText("La Governante")).toBeTruthy();
    nessunaFraseRiservata();
  });

  it("nemmeno un perimetro VUOTO lo azzera", async () => {
    await montaPannello({ userRole: "HOTEL_MANAGER", allowedDepartmentIds: [] });

    for (const dept of DEPARTMENTS) {
      expect(screen.getByText(dept.name), `reparto ${dept.name} sparito`).toBeTruthy();
    }
    nessunaFraseRiservata();
  });
});

// ─── ADMIN e SUPER_ADMIN: identici ───────────────────────────────────

describe("ADMIN e SUPER_ADMIN — identici all'Hotel Manager", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    it(`${role}: tutte le sezioni, tutti i reparti, nessuna frase riservata`, async () => {
      await montaPannello({ userRole: role, allowedDepartmentIds: [FB] });

      expect(screen.getByText(SEZIONE_TUTTI)).toBeTruthy();
      expect(screen.getByText(SEZIONE_RUOLI)).toBeTruthy();
      for (const dept of DEPARTMENTS) {
        expect(screen.getByText(dept.name)).toBeTruthy();
      }
      nessunaFraseRiservata();
    });
  }
});

// ─── Capo reparto: pannello suo, non tocca nulla di tutto questo ─────

describe("Capo reparto — ha un pannello suo e non passa di qui", () => {
  it("vede i propri reparti e nessuna delle frasi riservate", async () => {
    stubFetch([DEPARTMENTS[0], DEPARTMENTS[1]]);
    await montaPannello({ userRole: "HOD" });

    expect(
      screen.getByText(/Come Capo Reparto puoi pubblicare solo per gli operatori dei reparti che gestisci/)
    ).toBeTruthy();
    expect(screen.getByText("Cucina")).toBeTruthy();
    expect(screen.getByText("Sala")).toBeTruthy();
    nessunaFraseRiservata();
  });

  it("non ha affatto l'elenco delle persone: lì «sé stesso» non è una differenza osservabile", async () => {
    stubFetch([DEPARTMENTS[0]]);
    await montaPannello({ userRole: "HOD" });

    expect(screen.queryByText("Utenti specifici")).toBeNull();
    expect(screen.queryByText("Il Capocuoco")).toBeNull();
    expect(screen.queryByText("Chi Sta Scrivendo")).toBeNull();
  });
});

// ─── Referente corporate: l'opposto esatto ──────────────────────────

describe("Referente corporate — il perimetro morde, e si vede", () => {
  it("le due sezioni non ci sono, e il pannello dice perché", async () => {
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [FB, SALA] });

    expect(screen.queryByText(SEZIONE_TUTTI)).toBeNull();
    expect(screen.queryByText(SEZIONE_RUOLI)).toBeNull();
    expect(screen.getByText(FRASI_RISERVATE.spiegazione)).toBeTruthy();
  });

  it("vede solo i reparti di competenza, e lo dichiara", async () => {
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [FB, SALA] });

    expect(screen.getByText("Cucina")).toBeTruthy();
    expect(screen.getByText("Sala")).toBeTruthy();
    expect(screen.queryByText("Piani")).toBeNull();
    expect(screen.getByText(FRASI_RISERVATE.soloIMiei)).toBeTruthy();
  });

  it("vede solo le persone di quei reparti, sé stesso escluso", async () => {
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [FB, SALA] });

    expect(screen.getByText("Il Capocuoco")).toBeTruthy();
    expect(screen.getByText("Il Maitre")).toBeTruthy();
    expect(screen.queryByText("La Governante")).toBeNull();
    expect(screen.queryByText("Chi Sta Scrivendo")).toBeNull();
  });

  it("non può nominare un altro corporate né un direttore, anche se lavorano nel suo reparto", async () => {
    // La lacuna emersa in collaudo: il perimetro era per reparto e mai per
    // ruolo, e quelle persone il contenuto lo vedono già.
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [FB, SALA] });

    expect(screen.queryByText("L Altro Corporate")).toBeNull();
    expect(screen.queryByText("Il Direttore")).toBeNull();
  });

  it("il capo reparto del proprio reparto resta nominabile", async () => {
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [FB, SALA] });

    expect(screen.getByText("Il Capo Cucina")).toBeTruthy();
  });

  it("senza competenze in questa struttura non ripiega su tutti i reparti: si ferma e lo dice", async () => {
    await montaPannello({ userRole: "CORPORATE", allowedDepartmentIds: [] });

    for (const dept of DEPARTMENTS) {
      expect(screen.queryByText(dept.name), `reparto ${dept.name} mostrato fuori competenza`).toBeNull();
    }
    expect(screen.getByText(FRASI_RISERVATE.nessunReparto)).toBeTruthy();
  });

  it("un perimetro non passato affatto vale come nessuna competenza, non come nessun filtro", async () => {
    // Il ripiego che apriva: prima l'assenza di perimetro significava
    // "mostra tutto". Su un ruolo ristretto deve significare il contrario.
    await montaPannello({ userRole: "CORPORATE" });

    for (const dept of DEPARTMENTS) {
      expect(screen.queryByText(dept.name), `reparto ${dept.name} mostrato fuori competenza`).toBeNull();
    }
    expect(screen.getByText(FRASI_RISERVATE.nessunReparto)).toBeTruthy();
  });

  it("su un contenuto che si porta dietro «Tutti gli operatori» avvisa e offre il modo di levarlo", async () => {
    const { onChange } = await montaPannello({
      userRole: "CORPORATE",
      allowedDepartmentIds: [FB],
      value: { allDepartments: true },
    });

    expect(screen.getByText(FRASI_RISERVATE.ereditati)).toBeTruthy();

    const bottone = screen.getByRole("button", { name: /Tutti gli operatori/ });
    bottone.click();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ allDepartments: false })
    );
  });
});
