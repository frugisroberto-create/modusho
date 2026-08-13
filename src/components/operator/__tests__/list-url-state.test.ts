import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * GUARDIA — invariante: lo stato dei filtri di una lista contenuti DEVE essere
 * riflesso nell'indirizzo, nelle due direzioni.
 *
 * Il difetto originale: reparto, stato di lettura, testo cercato e pagina
 * vivevano solo nella memoria del componente. F5 li azzerava; tornando indietro
 * dal dettaglio la lista ripartiva dall'alto senza filtri; e il link non era
 * condivisibile, perché non conteneva nemmeno la struttura.
 *
 * L'invariante si regge su due fatti, uno per gruppo di test:
 *  - U1 (stato → indirizzo): `buildListQuery` serializza OGNI campo dello stato.
 *        Il test enumera le chiavi di un ListState completo, quindi un campo
 *        aggiunto e dimenticato nella serializzazione fa fallire da solo.
 *  - U2 (indirizzo → stato): i controlli renderizzati da ContentList partono dai
 *        parametri dell'indirizzo. Il render è quello vero del componente, non
 *        una riproduzione.
 * Se una delle due cade, lo stato torna a vivere solo in memoria.
 */

// ── Mock dei soli moduli esterni (next/*). La logica sotto test è quella vera
//    di list-url-state.ts e content-list.tsx.
const searchParamsMock = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
  usePathname: () => "/sop",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { href: string; children?: unknown }) =>
      h("a", { href: String(props.href) }, props.children as never),
  };
});

const PROPERTY_ID = "cmnc28yap00004nixlerjfcfq";
const DEPARTMENT_ID = "cmnc2a1fo00034nixh7k2zzq1";

vi.mock("../operator-shell", () => ({
  useOperatorContext: () => ({
    currentPropertyId: PROPERTY_ID,
    setCurrentPropertyId: () => {},
    properties: [],
    userRole: "ADMIN",
  }),
}));

import {
  applyAcknowledged,
  applyDepartment,
  applyPage,
  applyProperty,
  applyQuery,
  buildListQuery,
  parseListState,
  reconcileDepartment,
  sanitizeListQuery,
  type ListState,
} from "@/lib/list-url-state";
import { ContentList } from "../content-list";

/**
 * Stato completo: ogni campo valorizzato e diverso dal proprio default.
 * È TIPIZZATO `ListState`, quindi aggiungere un campo all'interfaccia obbliga
 * ad aggiungerlo qui (errore di compilazione) e, di conseguenza, il test U1
 * pretende che la serializzazione lo includa.
 */
const FULL_STATE: ListState = {
  propertyId: PROPERTY_ID,
  departmentId: DEPARTMENT_ID,
  acknowledged: "false",
  q: "pulizia camere",
  page: 4,
  focus: "cmnc2b9xy00074nixq0w8ab21",
};

describe("U1 — guardia: ogni campo dello stato finisce nell'indirizzo", () => {
  it("nessun campo dello stato viene perso nella serializzazione", () => {
    const params = new URLSearchParams(buildListQuery(FULL_STATE));
    for (const key of Object.keys(FULL_STATE)) {
      expect(params.get(key), `il campo "${key}" non è riflesso nell'indirizzo`).toBe(
        String(FULL_STATE[key as keyof ListState])
      );
    }
  });

  it("il giro completo stato → indirizzo → stato non altera nulla", () => {
    const roundTrip = parseListState(
      new URLSearchParams(buildListQuery(FULL_STATE)),
      FULL_STATE.propertyId
    );
    expect(roundTrip).toEqual(FULL_STATE);
  });

  it("la struttura c'è SEMPRE: è ciò che rende il link condivisibile", () => {
    const bare: ListState = {
      propertyId: PROPERTY_ID, departmentId: "", acknowledged: "", q: "", page: 1, focus: "",
    };
    // Senza struttura nell'indirizzo, chi riceve il link vedrebbe i propri dati
    // con i filtri di chi glielo ha mandato.
    expect(new URLSearchParams(buildListQuery(bare)).get("propertyId")).toBe(PROPERTY_ID);
    // I soli valori a default restano fuori, per non sporcare l'indirizzo.
    expect(buildListQuery(bare)).toBe(`propertyId=${PROPERTY_ID}`);
  });
});

describe("U2 — guardia: i controlli partono dall'indirizzo", () => {
  function renderList(query: string) {
    searchParamsMock.current = new URLSearchParams(query);
    return renderToStaticMarkup(
      createElement(ContentList, {
        contentType: "SOP" as const,
        detailPath: "sop",
        title: "Procedure operative (SOP)",
      })
    );
  }

  /** Lo stato che il componente dichiara di stare applicando, letto dal markup. */
  function appliedQuery(html: string): URLSearchParams {
    const match = html.match(/data-list-query="([^"]*)"/);
    expect(match, "il componente non espone lo stato applicato").not.toBeNull();
    return new URLSearchParams(match![1].replace(/&amp;/g, "&"));
  }

  it("ogni filtro presente nell'indirizzo è un filtro applicato", () => {
    const html = renderList(`departmentId=${DEPARTMENT_ID}&acknowledged=false&q=pulizia&page=3`);
    const applied = appliedQuery(html);

    expect(applied.get("departmentId"), "il reparto dell'indirizzo non è applicato").toBe(DEPARTMENT_ID);
    expect(applied.get("acknowledged"), "lo stato di lettura dell'indirizzo non è applicato").toBe("false");
    expect(applied.get("q"), "il testo cercato dell'indirizzo non è applicato").toBe("pulizia");
    expect(applied.get("page"), "la pagina dell'indirizzo non è applicata").toBe("3");
    // La struttura è quella del contesto shell, non quella grezza dell'indirizzo.
    expect(applied.get("propertyId")).toBe(PROPERTY_ID);
  });

  it("i controlli visibili mostrano gli stessi valori", () => {
    const html = renderList(`acknowledged=false&q=pulizia`);
    // "Da leggere" è l'opzione marcata `selected`, non "Tutti gli stati".
    expect(html).toMatch(/<option[^>]*value="false"[^>]*selected[^>]*>Da leggere/);
    expect(html).not.toMatch(/<option[^>]*selected[^>]*>Tutti gli stati/);
    // Il testo cercato torna nella barra di ricerca.
    expect(html).toMatch(/<input[^>]*value="pulizia"/);
  });

  it("senza parametri i filtri partono neutri", () => {
    const applied = appliedQuery(renderList(""));
    expect([...applied.keys()]).toEqual(["propertyId"]);
  });
});

describe("transizioni: cambiare filtro riporta a pagina 1 e scioglie l'evidenziazione", () => {
  it("il reparto azzera pagina e voce evidenziata", () => {
    const next = applyDepartment(FULL_STATE, "altro-reparto");
    expect(next).toMatchObject({ departmentId: "altro-reparto", page: 1, focus: "" });
  });

  it("lo stato di lettura azzera pagina e voce evidenziata", () => {
    expect(applyAcknowledged(FULL_STATE, "true")).toMatchObject({ acknowledged: "true", page: 1, focus: "" });
  });

  it("il testo cercato non tocca la pagina: non filtra la lista sottostante", () => {
    expect(applyQuery(FULL_STATE, "altro")).toMatchObject({ q: "altro", page: FULL_STATE.page });
  });

  it("cambiare pagina scioglie l'evidenziazione", () => {
    expect(applyPage(FULL_STATE, 2)).toMatchObject({ page: 2, focus: "" });
  });

  it("cambiare struttura fa cadere reparto, testo, pagina ed evidenziazione", () => {
    expect(applyProperty(FULL_STATE, "altra-property")).toMatchObject({
      propertyId: "altra-property", departmentId: "", q: "", page: 1, focus: "",
      acknowledged: FULL_STATE.acknowledged, // trasversale: sopravvive
    });
  });

  it("una transizione che non cambia nulla restituisce lo STESSO oggetto", () => {
    // È ciò che impedisce a un setState di provocare un render — e quindi un
    // fetch — inutile.
    expect(applyDepartment(FULL_STATE, FULL_STATE.departmentId)).toBe(FULL_STATE);
    expect(applyPage(FULL_STATE, FULL_STATE.page)).toBe(FULL_STATE);
    expect(applyProperty(FULL_STATE, FULL_STATE.propertyId)).toBe(FULL_STATE);
  });
});

describe("reconcileDepartment: il reparto in query non esce mai dal perimetro", () => {
  it("un reparto non accessibile viene scartato", () => {
    const next = reconcileDepartment(FULL_STATE, ["altro-1", "altro-2"], false);
    expect(next).toMatchObject({ departmentId: "", page: 1 });
  });

  it("OPERATOR/HOD con un reparto solo se lo vedono preselezionato", () => {
    const bare: ListState = { ...FULL_STATE, departmentId: "" };
    expect(reconcileDepartment(bare, ["solo-questo"], true).departmentId).toBe("solo-questo");
  });

  it("con reparto accessibile non cambia nulla: nessun render supplementare", () => {
    expect(reconcileDepartment(FULL_STATE, [DEPARTMENT_ID], false)).toBe(FULL_STATE);
  });
});

describe("sanitizeListQuery: il ritorno dal dettaglio non è un vettore", () => {
  it("tiene solo le chiavi note", () => {
    const clean = new URLSearchParams(
      sanitizeListQuery(`departmentId=${DEPARTMENT_ID}&callbackUrl=https://esterno.example&redirect=/admin`)
    );
    expect(clean.get("departmentId")).toBe(DEPARTMENT_ID);
    expect(clean.get("callbackUrl")).toBeNull();
    expect(clean.get("redirect")).toBeNull();
  });

  it("un parametro assente o vuoto non produce nulla", () => {
    expect(sanitizeListQuery(null)).toBe("");
    expect(sanitizeListQuery("")).toBe("");
  });
});
