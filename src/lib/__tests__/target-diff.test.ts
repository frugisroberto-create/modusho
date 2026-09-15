import { describe, it, expect } from "vitest";
import { buildTargetRows, diffTargets, targetKey, describeTargetChanges } from "../target-diff";

const nessuno = { allDepartments: false, roles: [], departmentIds: [], userIds: [] };

describe("buildTargetRows", () => {
  it("«Tutti gli operatori» è una sola riga, anche se arriva pure fra i ruoli", () => {
    const rows = buildTargetRows({ ...nessuno, allDepartments: true, roles: ["OPERATOR", "HOD"] });
    expect(rows.map(targetKey)).toEqual(["ROLE:OPERATOR", "ROLE:HOD"]);
  });

  it("reparti e utenti diventano righe distinte, senza doppioni", () => {
    const rows = buildTargetRows({ ...nessuno, departmentIds: ["fo", "fo", "fb"], userIds: ["u1"] });
    expect(rows.map(targetKey)).toEqual(["DEPARTMENT:fo", "DEPARTMENT:fb", "USER:u1"]);
  });
});

describe("diffTargets", () => {
  const salvati = buildTargetRows({ ...nessuno, departmentIds: ["fo", "fb"] });

  it("stessi destinatari in altro ordine: nessun cambiamento", () => {
    const d = diffTargets(salvati, buildTargetRows({ ...nessuno, departmentIds: ["fb", "fo"] }));
    expect(d.changed).toBe(false);
  });

  it("tolto F&B: una riga rimossa, nessuna aggiunta (il caso HO1-FO-009)", () => {
    const d = diffTargets(salvati, buildTargetRows({ ...nessuno, departmentIds: ["fo"] }));
    expect(d.changed).toBe(true);
    expect(d.removed.map(targetKey)).toEqual(["DEPARTMENT:fb"]);
    expect(d.added).toEqual([]);
  });

  it("da reparti a «Tutti gli operatori»: aggiunto il ruolo, rimossi i reparti", () => {
    const d = diffTargets(salvati, buildTargetRows({ ...nessuno, allDepartments: true }));
    expect(d.added.map(targetKey)).toEqual(["ROLE:OPERATOR"]);
    expect(d.removed.map(targetKey).sort()).toEqual(["DEPARTMENT:fb", "DEPARTMENT:fo"]);
  });
});

describe("describeTargetChanges", () => {
  it("scrive in chiaro che cosa è stato aggiunto e tolto", () => {
    const prima = buildTargetRows({ allDepartments: false, roles: [], departmentIds: ["fo", "fb"], userIds: [] });
    const dopo = buildTargetRows({ allDepartments: false, roles: ["HOD"], departmentIds: ["fo"], userIds: ["u1"] });
    const testo = describeTargetChanges(diffTargets(prima, dopo), {
      departments: new Map([["fo", "Front Office"], ["fb", "F&B "]]),
      users: new Map([["u1", "Antonia Indiveri"]]),
    });
    expect(testo).toBe("aggiunti: Tutti gli HOD, Antonia Indiveri; rimossi: F&B");
  });
});
