import { describe, it, expect } from "vitest";
import {
  applyDepartment,
  applyPage,
  applyProperty,
  applyState,
  applyType,
  buildComplianceApiQuery,
  buildComplianceQuery,
  DEFAULT_COMPLIANCE_STATE,
  parseComplianceState,
  reconcileDepartment,
  type ComplianceUrlState,
} from "../compliance-url-state";

/**
 * I filtri della pagina Presa visione vivono nell'indirizzo: si ricaricano, si
 * mandano a qualcuno, e tornano com'erano.
 */

const P1 = "prop-1", FB = "dept-fb", SALA = "dept-sala";

function stato(over: Partial<ComplianceUrlState> = {}): ComplianceUrlState {
  return { ...DEFAULT_COMPLIANCE_STATE, ...over };
}

describe("parseComplianceState", () => {
  it("un indirizzo nudo dà i valori di partenza: si apre sulle righe aperte", () => {
    expect(parseComplianceState(new URLSearchParams())).toEqual(stato());
  });

  it("legge i filtri scritti nell'indirizzo", () => {
    const params = new URLSearchParams("propertyId=prop-1&departmentId=dept-fb&type=MEMO&state=completata&page=3");
    expect(parseComplianceState(params)).toEqual(
      stato({ propertyId: P1, departmentId: FB, type: "MEMO", state: "completata", page: 3 })
    );
  });

  it("scarta i valori che non esistono invece di passarli alla rotta", () => {
    const params = new URLSearchParams("type=RICETTA&state=archiviata&page=-4");
    expect(parseComplianceState(params)).toEqual(stato());
  });
});

describe("buildComplianceQuery", () => {
  it("tiene l'indirizzo corto: i valori di partenza non si scrivono", () => {
    expect(buildComplianceQuery(stato())).toBe("");
  });

  it("scrive solo ciò che è stato scelto", () => {
    const query = buildComplianceQuery(stato({ propertyId: P1, state: "completata", page: 2 }));
    expect(query).toBe("propertyId=prop-1&state=completata&page=2");
  });

  it("ciò che scrive è ciò che rilegge", () => {
    const originale = stato({ propertyId: P1, departmentId: FB, type: "SOP", state: "senza-destinatari", page: 5 });
    expect(parseComplianceState(new URLSearchParams(buildComplianceQuery(originale)))).toEqual(originale);
  });
});

describe("buildComplianceApiQuery", () => {
  it("verso la rotta lo stato e l'impaginazione sono sempre espliciti", () => {
    const query = new URLSearchParams(buildComplianceApiQuery(stato(), 20));
    expect(query.get("state")).toBe("aperta");
    expect(query.get("page")).toBe("1");
    expect(query.get("pageSize")).toBe("20");
    expect(query.get("propertyId")).toBeNull();
  });

  it("passa i filtri scelti", () => {
    const query = new URLSearchParams(
      buildComplianceApiQuery(stato({ propertyId: P1, departmentId: FB, type: "DOCUMENT", state: "completata" }), 20)
    );
    expect(query.get("propertyId")).toBe(P1);
    expect(query.get("departmentId")).toBe(FB);
    expect(query.get("type")).toBe("DOCUMENT");
    expect(query.get("state")).toBe("completata");
  });
});

describe("transizioni", () => {
  it("cambiare struttura fa cadere il reparto, che apparteneva all'altra", () => {
    const next = applyProperty(stato({ propertyId: "prop-0", departmentId: FB, page: 4 }), P1);
    expect(next).toEqual(stato({ propertyId: P1, departmentId: "", page: 1 }));
  });

  it("ogni filtro che cambia il risultato riporta alla prima pagina", () => {
    expect(applyDepartment(stato({ page: 7 }), FB).page).toBe(1);
    expect(applyType(stato({ page: 7 }), "SOP").page).toBe(1);
    expect(applyState(stato({ page: 7 }), "completata").page).toBe(1);
  });

  it("scegliere lo stesso valore non produce un oggetto nuovo: niente chiamata inutile", () => {
    const s = stato({ propertyId: P1, departmentId: FB, type: "SOP", page: 2 });
    expect(applyProperty(s, P1)).toBe(s);
    expect(applyDepartment(s, FB)).toBe(s);
    expect(applyType(s, "SOP")).toBe(s);
    expect(applyState(s, "aperta")).toBe(s);
    expect(applyPage(s, 2)).toBe(s);
  });

  it("la pagina non scende sotto la prima", () => {
    expect(applyPage(stato({ page: 1 }), 0).page).toBe(1);
  });
});

describe("reconcileDepartment", () => {
  it("un reparto che non appartiene alla struttura scelta viene scartato", () => {
    const next = reconcileDepartment(stato({ propertyId: P1, departmentId: "dept-di-un-altro", page: 3 }), [FB, SALA]);
    expect(next.departmentId).toBe("");
    expect(next.page).toBe(1);
  });

  it("un reparto legittimo resta, e lo stato non cambia oggetto", () => {
    const s = stato({ propertyId: P1, departmentId: FB });
    expect(reconcileDepartment(s, [FB, SALA])).toBe(s);
  });

  it("nessun reparto scelto: niente da riallineare", () => {
    const s = stato({ propertyId: P1 });
    expect(reconcileDepartment(s, [])).toBe(s);
  });
});
