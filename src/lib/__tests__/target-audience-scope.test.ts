import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  hasRestrictedAudience,
  getTargetableDepartmentIds,
  getTargetableDepartmentIdsInProperty,
  canTargetEveryone,
  canTargetRoles,
  isTargetableUser,
  filterTargetableUsers,
  checkAudienceProposal,
  isNominableUserRole,
  AUDIENCE_MESSAGES,
  type AudienceActor,
  type AudienceProposal,
  type AudienceContext,
} from "../target-audience-scope";

// ─── Fixture ─────────────────────────────────────────────────────────
// Due strutture. Nella prima (P1) quattro reparti: cucina, sala, piani,
// ricevimento. Nella seconda (P2) una cucina distinta.
const FB1 = "dept-fb-1";
const SALA1 = "dept-sala-1";
const PIANI1 = "dept-piani-1";
const RICEV1 = "dept-ricev-1";
const FB2 = "dept-fb-2";

const P1_DEPTS = [FB1, SALA1, PIANI1, RICEV1];

const ME = "actor-1";

function actor(role: Role, overrides: Partial<AudienceActor> = {}): AudienceActor {
  return {
    id: ME,
    role,
    targetDepartmentIds: [],
    assignedDepartmentIds: [],
    ...overrides,
  };
}

/** L'Head of F&B: destinabili cucina e sala di P1, più la cucina di P2. */
function headOfFb(overrides: Partial<AudienceActor> = {}): AudienceActor {
  return actor("CORPORATE", {
    targetDepartmentIds: [FB1, SALA1, FB2],
    assignedDepartmentIds: [FB1],
    ...overrides,
  });
}

function proposal(overrides: Partial<AudienceProposal> = {}): AudienceProposal {
  return { allDepartments: false, roles: [], departmentIds: [], userIds: [], ...overrides };
}

/** Un candidato destinatario. Operatore, salvo diversa indicazione. */
function persona(id: string, departmentIds: string[], role: Role = "OPERATOR") {
  return { id, role, departmentIds };
}

function context(overrides: Partial<AudienceContext> = {}): AudienceContext {
  return { propertyDepartmentIds: P1_DEPTS, candidates: [], ...overrides };
}

const OTHER_ROLES: Role[] = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"];

// ─── Chi è ristretto ─────────────────────────────────────────────────

describe("hasRestrictedAudience", () => {
  it("restringe il CORPORATE", () => {
    expect(hasRestrictedAudience("CORPORATE")).toBe(true);
  });

  it("non restringe nessun altro ruolo", () => {
    for (const role of OTHER_ROLES) {
      expect(hasRestrictedAudience(role)).toBe(false);
    }
    expect(hasRestrictedAudience("OPERATOR")).toBe(false);
  });
});

// ─── Il perimetro ────────────────────────────────────────────────────

describe("getTargetableDepartmentIds", () => {
  it("CORPORATE con reparti destinabili pieni: sono quelli", () => {
    expect(getTargetableDepartmentIds(headOfFb())).toEqual([FB1, SALA1, FB2]);
  });

  it("CORPORATE con reparti destinabili VUOTI: ricade sui reparti assegnati", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [], assignedDepartmentIds: [FB1, PIANI1] });
    expect(getTargetableDepartmentIds(a)).toEqual([FB1, PIANI1]);
  });

  it("CORPORATE senza reparti destinabili né assegnati: perimetro vuoto, mai «tutti»", () => {
    const a = actor("CORPORATE");
    expect(getTargetableDepartmentIds(a)).toEqual([]);
  });

  it("elimina i doppioni", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [FB1, FB1, SALA1] });
    expect(getTargetableDepartmentIds(a)).toEqual([FB1, SALA1]);
  });

  it("gli altri ruoli non hanno restrizione", () => {
    for (const role of OTHER_ROLES) {
      const a = actor(role, { targetDepartmentIds: [FB1], assignedDepartmentIds: [FB1] });
      expect(getTargetableDepartmentIds(a)).toBeNull();
    }
  });
});

describe("getTargetableDepartmentIdsInProperty", () => {
  it("restringe il perimetro alla struttura scelta", () => {
    // FB2 appartiene a un'altra struttura e cade.
    expect(getTargetableDepartmentIdsInProperty(headOfFb(), P1_DEPTS)).toEqual([FB1, SALA1]);
  });

  it("perimetro che non interseca la struttura: elenco VUOTO, non «tutti»", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [FB2] });
    expect(getTargetableDepartmentIdsInProperty(a, P1_DEPTS)).toEqual([]);
  });

  it("reparti destinabili vuoti: si restringono gli assegnati, non la struttura intera", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [], assignedDepartmentIds: [PIANI1] });
    expect(getTargetableDepartmentIdsInProperty(a, P1_DEPTS)).toEqual([PIANI1]);
  });

  it("gli altri ruoli restano senza restrizione", () => {
    for (const role of OTHER_ROLES) {
      expect(getTargetableDepartmentIdsInProperty(actor(role), P1_DEPTS)).toBeNull();
    }
  });
});

describe("canTargetEveryone / canTargetRoles", () => {
  it("il CORPORATE non dispone né di «Tutti gli operatori» né dei ruoli trasversali", () => {
    expect(canTargetEveryone("CORPORATE")).toBe(false);
    expect(canTargetRoles("CORPORATE")).toBe(false);
  });

  it("gli altri ruoli dispongono di entrambi", () => {
    for (const role of OTHER_ROLES) {
      expect(canTargetEveryone(role)).toBe(true);
      expect(canTargetRoles(role)).toBe(true);
    }
  });
});

// ─── Gli utenti destinabili ──────────────────────────────────────────

describe("isTargetableUser", () => {
  it("chi scrive non è mai destinabile, nemmeno senza perimetro", () => {
    expect(isTargetableUser(ME, persona(ME, [FB1]), [FB1])).toBe(false);
    expect(isTargetableUser(ME, persona(ME, [FB1]), null)).toBe(false);
  });

  it("dentro il perimetro passa", () => {
    expect(isTargetableUser(ME, persona("u1", [SALA1]), [FB1, SALA1])).toBe(true);
  });

  it("fuori dal perimetro non passa", () => {
    expect(isTargetableUser(ME, persona("u1", [PIANI1]), [FB1, SALA1])).toBe(false);
  });

  it("basta un reparto in comune", () => {
    expect(isTargetableUser(ME, persona("u1", [PIANI1, FB1]), [FB1])).toBe(true);
  });

  it("senza reparti assegnati non passa quando c'è un perimetro", () => {
    expect(isTargetableUser(ME, persona("u1", []), [FB1])).toBe(false);
  });

  it("senza perimetro passa chiunque tranne chi scrive", () => {
    expect(isTargetableUser(ME, persona("u1", []), null)).toBe(true);
  });

  // Il perimetro era definito per reparto e mai per ruolo: un altro referente
  // corporate con assegnazioni operative sui reparti giusti passava. Il
  // contenuto lo vede già — nominarlo aggiungeva una riga falsa nel registro
  // delle prese visione.
  it("dentro il perimetro, un OPERATOR è nominabile", () => {
    expect(isTargetableUser(ME, persona("chef", [FB1], "OPERATOR"), [FB1])).toBe(true);
  });

  it("dentro il perimetro, un HOD è nominabile", () => {
    expect(isTargetableUser(ME, persona("capo", [FB1], "HOD"), [FB1])).toBe(true);
  });

  it("dentro il perimetro, un altro CORPORATE NON è nominabile", () => {
    expect(isTargetableUser(ME, persona("altro-corp", [FB1], "CORPORATE"), [FB1])).toBe(false);
  });

  it("dentro il perimetro, un HOTEL_MANAGER NON è nominabile", () => {
    expect(isTargetableUser(ME, persona("direttore", [FB1], "HOTEL_MANAGER"), [FB1])).toBe(false);
  });

  it("dentro il perimetro, ADMIN e SUPER_ADMIN NON sono nominabili", () => {
    expect(isTargetableUser(ME, persona("hoo", [FB1], "ADMIN"), [FB1])).toBe(false);
    expect(isTargetableUser(ME, persona("tecnico", [FB1], "SUPER_ADMIN"), [FB1])).toBe(false);
  });

  it("senza perimetro tutti e quattro i ruoli restano nominabili", () => {
    // La regola sul ruolo è una conseguenza del perimetro ristretto: chi non
    // ce l'ha non deve perdere una sola riga dal proprio elenco.
    for (const role of ["OPERATOR", "HOD", "CORPORATE", "HOTEL_MANAGER"] as Role[]) {
      expect(isTargetableUser(ME, persona("x", [FB1], role), null), `ruolo ${role}`).toBe(true);
    }
  });
});

describe("isNominableUserRole", () => {
  it("operatori e capi reparto sì, chi dirige no", () => {
    expect(isNominableUserRole("OPERATOR")).toBe(true);
    expect(isNominableUserRole("HOD")).toBe(true);
    expect(isNominableUserRole("CORPORATE")).toBe(false);
    expect(isNominableUserRole("HOTEL_MANAGER")).toBe(false);
    expect(isNominableUserRole("ADMIN")).toBe(false);
    expect(isNominableUserRole("SUPER_ADMIN")).toBe(false);
  });
});

describe("filterTargetableUsers", () => {
  const people = [
    persona(ME, [FB1]),
    persona("chef", [FB1]),
    persona("cameriere", [SALA1]),
    persona("governante", [PIANI1]),
  ];

  it("il CORPORATE vede solo il proprio perimetro, sé stesso escluso", () => {
    const result = filterTargetableUsers(ME, people, [FB1, SALA1]);
    expect(result.map((p) => p.id)).toEqual(["chef", "cameriere"]);
  });

  it("senza perimetro l'elenco perde solo chi scrive", () => {
    const result = filterTargetableUsers(ME, people, null);
    expect(result.map((p) => p.id)).toEqual(["chef", "cameriere", "governante"]);
  });

  it("perimetro vuoto: nessuno", () => {
    expect(filterTargetableUsers(ME, people, [])).toEqual([]);
  });

  it("dal perimetro ristretto spariscono i ruoli che il contenuto lo vedono già", () => {
    const misti = [
      persona("chef", [FB1], "OPERATOR"),
      persona("capo-cucina", [FB1], "HOD"),
      persona("altro-corp", [FB1], "CORPORATE"),
      persona("direttore", [FB1], "HOTEL_MANAGER"),
      persona("hoo", [FB1], "ADMIN"),
    ];
    const result = filterTargetableUsers(ME, misti, [FB1]);
    expect(result.map((p) => p.id)).toEqual(["chef", "capo-cucina"]);
  });

  it("senza perimetro quell'elenco non perde nessuno", () => {
    const misti = [
      persona("chef", [FB1], "OPERATOR"),
      persona("capo-cucina", [FB1], "HOD"),
      persona("altro-corp", [FB1], "CORPORATE"),
      persona("direttore", [FB1], "HOTEL_MANAGER"),
      persona("hoo", [FB1], "ADMIN"),
    ];
    const result = filterTargetableUsers(ME, misti, null);
    expect(result.map((p) => p.id)).toEqual([
      "chef", "capo-cucina", "altro-corp", "direttore", "hoo",
    ]);
  });
});

// ─── Il giudizio sulla proposta ──────────────────────────────────────

describe("checkAudienceProposal — CORPORATE", () => {
  it("accetta i reparti dentro il perimetro", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ departmentIds: [FB1, SALA1] }),
      context()
    );
    expect(verdict).toEqual({ allowed: true });
  });

  it("rifiuta «Tutti gli operatori»", () => {
    const verdict = checkAudienceProposal(headOfFb(), proposal({ allDepartments: true }), context());
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.everyone });
  });

  it("rifiuta i ruoli trasversali", () => {
    const verdict = checkAudienceProposal(headOfFb(), proposal({ roles: ["HOD"] }), context());
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.roles });
  });

  it("rifiuta un reparto fuori perimetro", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ departmentIds: [FB1, PIANI1] }),
      context()
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.departments });
  });

  it("rifiuta un reparto del perimetro che appartiene a un'altra struttura", () => {
    // FB2 è destinabile in assoluto, ma non in questa struttura.
    const verdict = checkAudienceProposal(headOfFb(), proposal({ departmentIds: [FB2] }), context());
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.departments });
  });

  it("rifiuta un utente fuori perimetro", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["governante"] }),
      context({ candidates: [persona("governante", [PIANI1])] })
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.users });
  });

  it("accetta un utente dentro il perimetro", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["chef"] }),
      context({ candidates: [persona("chef", [FB1])] })
    );
    expect(verdict).toEqual({ allowed: true });
  });

  it("rifiuta un utente che il ponte non ha trovato", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["fantasma"] }),
      context({ candidates: [] })
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.users });
  });

  it("rifiuta un altro referente corporate, e lo dice con la frase giusta", () => {
    // Lavora davvero in quel reparto: dirgli che non ci lavora sarebbe falso.
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["altro-corp"] }),
      context({ candidates: [persona("altro-corp", [FB1], "CORPORATE")] })
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.userRole });
  });

  it("rifiuta un Hotel Manager con la stessa frase", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["direttore"] }),
      context({ candidates: [persona("direttore", [FB1], "HOTEL_MANAGER")] })
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.userRole });
  });

  it("accetta un capo reparto del perimetro", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: ["capo-cucina"] }),
      context({ candidates: [persona("capo-cucina", [FB1], "HOD")] })
    );
    expect(verdict).toEqual({ allowed: true });
  });

  it("rifiuta chi scrive fra i destinatari", () => {
    const verdict = checkAudienceProposal(
      headOfFb(),
      proposal({ userIds: [ME] }),
      context({ candidates: [persona(ME, [FB1], "CORPORATE")] })
    );
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.self });
  });

  it("reparti destinabili VUOTI: accetta i reparti assegnati", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [], assignedDepartmentIds: [PIANI1] });
    const verdict = checkAudienceProposal(a, proposal({ departmentIds: [PIANI1] }), context());
    expect(verdict).toEqual({ allowed: true });
  });

  it("reparti destinabili VUOTI: rifiuta comunque il resto della struttura", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [], assignedDepartmentIds: [PIANI1] });
    const verdict = checkAudienceProposal(a, proposal({ departmentIds: [FB1] }), context());
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.departments });
  });

  it("perimetro vuoto in questa struttura: il ripiego chiude", () => {
    const a = actor("CORPORATE", { targetDepartmentIds: [FB2] });
    const verdict = checkAudienceProposal(a, proposal({ departmentIds: [FB1] }), context());
    expect(verdict).toEqual({ allowed: false, reason: AUDIENCE_MESSAGES.empty });
  });

  it("perimetro vuoto e nessun destinatario proposto: non è questo il posto dove protestare", () => {
    // L'assenza di destinatari la segnala la rotta con le sue regole di sempre.
    const a = actor("CORPORATE", { targetDepartmentIds: [FB2] });
    expect(checkAudienceProposal(a, proposal(), context())).toEqual({ allowed: true });
  });
});

// ─── Gli altri ruoli non subiscono nulla di nuovo ────────────────────

describe("checkAudienceProposal — HOD, HM, ADMIN, SUPER_ADMIN invariati", () => {
  const everything = proposal({
    allDepartments: true,
    roles: ["HOD", "HOTEL_MANAGER"],
    departmentIds: [FB1, SALA1, PIANI1, RICEV1, FB2],
    userIds: [ME, "chiunque"],
  });

  it("accetta qualunque proposta, compresa sé stesso e reparti di altre strutture", () => {
    for (const role of OTHER_ROLES) {
      const verdict = checkAudienceProposal(actor(role), everything, context({ candidates: [] }));
      expect(verdict, `ruolo ${role}`).toEqual({ allowed: true });
    }
  });

  it("un HOTEL_MANAGER senza reparti assegnati non viene ristretto", () => {
    const hm = actor("HOTEL_MANAGER", { targetDepartmentIds: [], assignedDepartmentIds: [] });
    expect(checkAudienceProposal(hm, everything, context())).toEqual({ allowed: true });
  });

  it("un HOD con targetDepartmentIds valorizzati resta comunque non ristretto", () => {
    // Il campo esiste su tutti gli utenti: non deve iniziare a mordere qui.
    const hod = actor("HOD", { targetDepartmentIds: [FB1] });
    expect(checkAudienceProposal(hod, proposal({ departmentIds: [PIANI1] }), context())).toEqual({
      allowed: true,
    });
  });
});
