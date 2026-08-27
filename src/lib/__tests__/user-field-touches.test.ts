import { describe, it, expect } from "vitest";
import {
  getTouchedFields,
  isTouched,
  sameAssignments,
  sameDepartmentIds,
} from "../user-field-touches";
import type { CurrentUserValues } from "../user-field-touches";

/**
 * Il form rimanda SEMPRE tutti i campi. Da qui in avanti conta il
 * cambiamento, non la presenza: questi test coprono soprattutto i casi in cui
 * la risposta giusta è "non toccato", perché è lì che il difetto viveva.
 */

const D1 = "dept-1";
const D2 = "dept-2";
const P1 = "prop-1";
const P2 = "prop-2";

function current(overrides: Partial<CurrentUserValues> = {}): CurrentUserValues {
  return {
    name: "Maria Rossi",
    email: "maria@modusho.test",
    role: "OPERATOR",
    canView: true,
    canEdit: false,
    canApprove: false,
    canPublish: false,
    canCreateUsers: false,
    targetDepartmentIds: [],
    viewDepartmentIds: [D1],
    isActive: true,
    propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    contentTypes: [],
    ...overrides,
  };
}

describe("user-field-touches — campi scalari", () => {
  it("un campo assente non è mai toccato", () => {
    expect(getTouchedFields({}, current())).toEqual([]);
  });

  it("un campo rimandato indietro identico non è toccato", () => {
    const touched = getTouchedFields(
      {
        name: "Maria Rossi",
        email: "maria@modusho.test",
        role: "OPERATOR",
        isActive: true,
        canCreateUsers: false,
      },
      current()
    );
    expect(touched).toEqual([]);
  });

  it("un campo diverso è toccato", () => {
    expect(getTouchedFields({ name: "Maria Bianchi" }, current())).toEqual(["name"]);
    expect(getTouchedFields({ role: "HOD" }, current())).toEqual(["role"]);
    expect(getTouchedFields({ isActive: false }, current())).toEqual(["isActive"]);
    expect(getTouchedFields({ canCreateUsers: true }, current())).toEqual(["canCreateUsers"]);
  });

  it("il nome si confronta trimmato, com'è quello che verrebbe scritto", () => {
    expect(getTouchedFields({ name: "  Maria Rossi  " }, current())).toEqual([]);
    expect(getTouchedFields({ name: "Maria  Rossi" }, current())).toEqual(["name"]);
  });

  it("l'email si confronta normalizzata: maiuscole e spazi non sono una modifica", () => {
    expect(getTouchedFields({ email: "  MARIA@ModusHO.test " }, current())).toEqual([]);
    expect(getTouchedFields({ email: "maria.rossi@modusho.test" }, current())).toEqual(["email"]);
  });

  it("i quattro flag di potere formano un gruppo solo", () => {
    const invariati = {
      canView: true, canEdit: false, canApprove: false, canPublish: false,
    };
    expect(getTouchedFields(invariati, current())).toEqual([]);
    expect(getTouchedFields({ ...invariati, canApprove: true }, current())).toEqual([
      "permissionFlags",
    ]);
  });
});

describe("user-field-touches — elenchi, senza riguardo per l'ordine", () => {
  it("un elenco riordinato non è toccato", () => {
    const attuale = current({ contentTypes: ["SOP", "DOCUMENT", "MEMO"], viewDepartmentIds: [D1, D2] });
    expect(getTouchedFields({ contentTypes: ["MEMO", "SOP", "DOCUMENT"] }, attuale)).toEqual([]);
    expect(getTouchedFields({ viewDepartmentIds: [D2, D1] }, attuale)).toEqual([]);
  });

  it("un elenco con un elemento in più è toccato", () => {
    const attuale = current({ contentTypes: ["SOP", "DOCUMENT"], viewDepartmentIds: [D1] });
    expect(getTouchedFields({ contentTypes: ["SOP", "DOCUMENT", "MEMO"] }, attuale)).toEqual([
      "contentTypes",
    ]);
    expect(getTouchedFields({ viewDepartmentIds: [D1, D2] }, attuale)).toEqual([
      "viewDepartmentIds",
    ]);
  });

  it("un elenco con un elemento in meno è toccato", () => {
    const attuale = current({ contentTypes: ["SOP", "DOCUMENT"] });
    expect(getTouchedFields({ contentTypes: ["SOP"] }, attuale)).toEqual(["contentTypes"]);
  });

  it("un doppione in più è una differenza, non un riordino", () => {
    expect(sameDepartmentIds([D1, D1], [D1])).toBe(false);
    expect(sameDepartmentIds([D1, D2, D1], [D1, D1, D2])).toBe(true);
  });

  it("un elenco svuotato è toccato", () => {
    const attuale = current({ viewDepartmentIds: [D1] });
    expect(getTouchedFields({ viewDepartmentIds: [] }, attuale)).toEqual(["viewDepartmentIds"]);
  });
});

describe("user-field-touches — assegnazioni struttura/reparto", () => {
  it("le stesse assegnazioni in ordine diverso non sono toccate", () => {
    const attuale = current({
      propertyAssignments: [
        { propertyId: P1, departmentId: D1 },
        { propertyId: P1, departmentId: D2 },
      ],
    });
    const touched = getTouchedFields(
      {
        propertyAssignments: [
          { propertyId: P1, departmentId: D2 },
          { propertyId: P1, departmentId: D1 },
        ],
      },
      attuale
    );
    expect(touched).toEqual([]);
  });

  it("un reparto in più è toccato", () => {
    const attuale = current({ propertyAssignments: [{ propertyId: P1, departmentId: D1 }] });
    const touched = getTouchedFields(
      {
        propertyAssignments: [
          { propertyId: P1, departmentId: D1 },
          { propertyId: P1, departmentId: D2 },
        ],
      },
      attuale
    );
    expect(touched).toEqual(["departments"]);
  });

  it("cambia la struttura a parità di reparto: toccato", () => {
    const attuale = current({ propertyAssignments: [{ propertyId: P1, departmentId: D1 }] });
    expect(
      getTouchedFields({ propertyAssignments: [{ propertyId: P2, departmentId: D1 }] }, attuale)
    ).toEqual(["departments"]);
  });

  it("reparto nullo (tutta la struttura) e reparto valorizzato non coincidono", () => {
    const attuale = current({ propertyAssignments: [{ propertyId: P1, departmentId: null }] });
    expect(
      getTouchedFields({ propertyAssignments: [{ propertyId: P1, departmentId: D1 }] }, attuale)
    ).toEqual(["departments"]);
    expect(
      getTouchedFields({ propertyAssignments: [{ propertyId: P1, departmentId: null }] }, attuale)
    ).toEqual([]);
    // departmentId assente equivale a nullo: è così che arriva dallo schema.
    expect(getTouchedFields({ propertyAssignments: [{ propertyId: P1 }] }, attuale)).toEqual([]);
  });

  it("assegnazioni e reparti destinatari confluiscono nello stesso campo", () => {
    const attuale = current({ targetDepartmentIds: [D1] });
    expect(getTouchedFields({ targetDepartmentIds: [D2] }, attuale)).toEqual(["departments"]);
    expect(
      sameAssignments(
        [{ propertyId: P1, departmentId: D1 }],
        [{ propertyId: P1, departmentId: D1 }]
      )
    ).toBe(true);
  });
});

describe("user-field-touches — il caso che ha rotto la promozione", () => {
  it("l'invio integrale del form su un operatore promosso tocca solo il ruolo", () => {
    // Il form rimanda tutto: nome, email, tipi di contenuto, assegnazioni.
    // L'unica cosa che l'Hotel Manager ha davvero cambiato è il ruolo.
    const attuale = current({ email: "mario@modusho.test", name: "Mario Verdi" });
    const touched = getTouchedFields(
      {
        name: "Mario Verdi",
        email: "mario@modusho.test",
        role: "HOD",
        targetDepartmentIds: [],
        viewDepartmentIds: [D1],
        isActive: true,
        propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
        contentTypes: [],
      },
      attuale
    );
    expect(touched).toEqual(["role"]);
    expect(isTouched({ contentTypes: [] }, attuale, "contentTypes")).toBe(false);
    expect(isTouched({ email: "mario@modusho.test" }, attuale, "email")).toBe(false);
  });

  it("l'ordine del risultato è stabile", () => {
    const touched = getTouchedFields(
      { isActive: false, name: "Altro Nome", role: "HOD" },
      current()
    );
    expect(touched).toEqual(["name", "role", "isActive"]);
  });
});
