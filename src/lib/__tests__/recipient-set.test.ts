import { describe, it, expect } from "vitest";
import {
  ackRate,
  coverageOf,
  coverageState,
  resolveRecipientIds,
  sumCoverage,
  type RecipientPools,
  type TargetRow,
} from "../recipient-set";

/**
 * La regola che risponde a «quante persone devono prendere visione di questo
 * contenuto, e quante l'hanno fatto». Prima viveva in tre posti che davano tre
 * risposte diverse; qui si prova una volta sola.
 */

const OP1 = "op-1", OP2 = "op-2", HOD1 = "hod-1", HM1 = "hm-1", EXTRA = "ext-1";
const FB = "dept-fb", SALA = "dept-sala";

const pools: RecipientPools = {
  byRole: { OPERATOR: [OP1, OP2], HOD: [HOD1], HOTEL_MANAGER: [HM1] },
  byDepartment: { [FB]: [OP1, HOD1], [SALA]: [OP2] },
};

function role(targetRole: TargetRow["targetRole"]): TargetRow {
  return { targetType: "ROLE", targetRole, targetDepartmentId: null, targetUserId: null };
}
function department(id: string): TargetRow {
  return { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: id, targetUserId: null };
}
function user(id: string, isActive: boolean): TargetRow {
  return { targetType: "USER", targetRole: null, targetDepartmentId: null, targetUserId: id, targetUser: { isActive } };
}

describe("resolveRecipientIds", () => {
  it("«tutti gli operatori» comprende i capi reparto", () => {
    expect(resolveRecipientIds([role("OPERATOR")], pools)).toEqual(new Set([OP1, OP2, HOD1]));
  });

  it("un target sui capi reparto non tira dentro gli operatori", () => {
    expect(resolveRecipientIds([role("HOD")], pools)).toEqual(new Set([HOD1]));
  });

  it("un reparto porta gli operatori e i capi reparto assegnati", () => {
    expect(resolveRecipientIds([department(FB)], pools)).toEqual(new Set([OP1, HOD1]));
  });

  it("un reparto senza persone non produce destinatari", () => {
    expect(resolveRecipientIds([department("dept-vuoto")], pools)).toEqual(new Set());
  });

  it("una persona disattivata non è destinataria", () => {
    expect(resolveRecipientIds([user(EXTRA, false)], pools)).toEqual(new Set());
    expect(resolveRecipientIds([user(EXTRA, true)], pools)).toEqual(new Set([EXTRA]));
  });

  it("una riga USER caricata senza la persona non conta", () => {
    const orfana: TargetRow = { targetType: "USER", targetRole: null, targetDepartmentId: null, targetUserId: EXTRA };
    expect(resolveRecipientIds([orfana], pools)).toEqual(new Set());
  });

  it("più righe si uniscono senza contare nessuno due volte", () => {
    const set = resolveRecipientIds([department(FB), department(SALA), user(OP1, true)], pools);
    expect(set).toEqual(new Set([OP1, OP2, HOD1]));
    expect(set.size).toBe(3);
  });

  it("nessuna riga, nessun destinatario", () => {
    expect(resolveRecipientIds([], pools)).toEqual(new Set());
  });
});

describe("coverageOf", () => {
  it("conta solo le letture di chi è destinatario", () => {
    const recipients = new Set([OP1, OP2]);
    const coverage = coverageOf(recipients, [{ userId: OP1 }, { userId: HM1 }, { userId: EXTRA }]);
    expect(coverage).toEqual({ required: 2, done: 1 });
  });

  it("una lettura ripetuta vale una", () => {
    expect(coverageOf(new Set([OP1]), [{ userId: OP1 }, { userId: OP1 }])).toEqual({ required: 1, done: 1 });
  });

  it("le letture non possono superare i destinatari: è ciò che teneva il tasso sopra il 100%", () => {
    const molte = Array.from({ length: 40 }, (_, i) => ({ userId: `estraneo-${i}` }));
    const coverage = coverageOf(new Set([OP1, OP2]), [...molte, { userId: OP1 }]);
    expect(coverage.done).toBeLessThanOrEqual(coverage.required);
  });
});

describe("coverageState", () => {
  it("senza destinatari non è «completata»: è un contenuto che nessuno può leggere", () => {
    expect(coverageState({ required: 0, done: 0 })).toBe("senza-destinatari");
  });

  it("tutti hanno letto: completata", () => {
    expect(coverageState({ required: 3, done: 3 })).toBe("completata");
  });

  it("manca qualcuno: aperta", () => {
    expect(coverageState({ required: 3, done: 2 })).toBe("aperta");
  });
});

describe("ackRate", () => {
  it("nessun obbligo non fa «zero per cento», fa «non applicabile»", () => {
    expect(ackRate({ required: 0, done: 0 })).toBeNull();
  });

  it("arrotonda all'intero", () => {
    expect(ackRate({ required: 3, done: 1 })).toBe(33);
    expect(ackRate({ required: 8, done: 7 })).toBe(88);
  });

  it("non supera mai il 100%", () => {
    expect(ackRate({ required: 2, done: 2 })).toBe(100);
    expect(ackRate({ required: 2, done: 9 })).toBe(100);
  });
});

describe("sumCoverage", () => {
  it("somma le coperture di più contenuti", () => {
    expect(sumCoverage([{ required: 3, done: 1 }, { required: 5, done: 5 }])).toEqual({ required: 8, done: 6 });
  });

  it("un elenco vuoto vale zero, e il tasso diventa «non applicabile»", () => {
    const totale = sumCoverage([]);
    expect(totale).toEqual({ required: 0, done: 0 });
    expect(ackRate(totale)).toBeNull();
  });
});
