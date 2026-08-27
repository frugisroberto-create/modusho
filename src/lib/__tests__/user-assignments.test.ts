import { describe, it, expect } from "vitest";
import { buildSimpleAssignments, validateSimpleAssignments } from "../user-assignments";

describe("buildSimpleAssignments — veste semplificata (HM, HOD in creazione)", () => {
  it("un reparto → una sola assegnazione", () => {
    expect(buildSimpleAssignments({ propertyId: "p1", departmentIds: ["d1"] })).toEqual([
      { propertyId: "p1", departmentId: "d1" },
    ]);
  });

  it("più reparti → un'assegnazione per reparto, stessa struttura", () => {
    expect(
      buildSimpleAssignments({ propertyId: "p1", departmentIds: ["d1", "d2", "d3"] })
    ).toEqual([
      { propertyId: "p1", departmentId: "d1" },
      { propertyId: "p1", departmentId: "d2" },
      { propertyId: "p1", departmentId: "d3" },
    ]);
  });

  it("zero reparti → nessuna assegnazione (non un'assegnazione vuota)", () => {
    expect(buildSimpleAssignments({ propertyId: "p1", departmentIds: [] })).toEqual([]);
  });
});

describe("validateSimpleAssignments — serve struttura e almeno un reparto", () => {
  it("zero reparti: rifiutato", () => {
    const esito = validateSimpleAssignments({ propertyId: "p1", departmentIds: [] });
    expect(esito.valid).toBe(false);
    if (!esito.valid) expect(esito.reason).toMatch(/reparto/i);
  });

  it("nessuna struttura: rifiutato, indipendentemente dai reparti", () => {
    const esito = validateSimpleAssignments({ propertyId: "", departmentIds: ["d1"] });
    expect(esito.valid).toBe(false);
    if (!esito.valid) expect(esito.reason).toMatch(/struttura/i);
  });

  it("un reparto: ammesso", () => {
    expect(validateSimpleAssignments({ propertyId: "p1", departmentIds: ["d1"] })).toEqual({
      valid: true,
    });
  });

  it("più reparti: ammesso", () => {
    expect(
      validateSimpleAssignments({ propertyId: "p1", departmentIds: ["d1", "d2"] })
    ).toEqual({ valid: true });
  });
});

describe("buildSimpleAssignments non trattiene stato fra chiamate", () => {
  // ATTENZIONE a cosa NON verifica questo test: non è un test dell'azzeramento
  // al cambio struttura. Quell'azzeramento vive nell'onChange della tendina
  // struttura in user-form.tsx (`setSimplePropertyId(...); setSimpleDepartmentIds([])`)
  // ed è comportamento di COMPONENTE — il progetto non ha un ambiente DOM
  // (vitest gira con `environment: "node"`), quindi non è verificabile con
  // un test automatico, né qui né altrove nella suite. Resta collaudabile
  // solo a mano — e nemmeno quello, di fatto: in azienda nessun Hotel
  // Manager governa più di una struttura, quindi il percorso "cambia
  // struttura dopo aver spuntato reparti" non è mai stato provato neanche
  // manualmente. Il reset nel codice resta come difesa, non come
  // comportamento collaudato.
  //
  // Quello che QUESTO test verifica davvero: la funzione pura non ha stato
  // condiviso fra due chiamate con propertyId diversi — una chiamata non
  // eredita residui di reparti da una chiamata precedente.
  it("due chiamate consecutive con propertyId diversi non si mescolano", () => {
    const prima = buildSimpleAssignments({ propertyId: "p1", departmentIds: ["d1", "d2"] });
    const dopo = buildSimpleAssignments({ propertyId: "p2", departmentIds: ["d5"] });
    expect(prima.every((a) => a.propertyId === "p1")).toBe(true);
    expect(dopo).toEqual([{ propertyId: "p2", departmentId: "d5" }]);
  });
});
