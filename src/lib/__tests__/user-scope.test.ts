import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  canAccessUserManagement,
  getVisibleRoles,
  canViewUser,
  getCreatableRoles,
  canCreateUsers,
  canCreateUser,
  canAssignDepartment,
  getEditableFields,
  canEditUser,
  canEditField,
  getAssignableRoles,
  canChangeRole,
  isDemotionToOperator,
  canToggleCreateFlag,
  canDeactivateUser,
  canSendActivation,
  canSendReset,
  getRolePresets,
  getActivationStatus,
  normalizeName,
  isSameName,
  type ScopeActor,
  type ScopeTarget,
} from "../user-scope";

// ─── Fixture: una struttura (P1) con due reparti (D1 cucina, D2 sala) ───
const P1 = "prop-1";
const P2 = "prop-2";
const D1 = "dept-1";
const D2 = "dept-2";

function actor(role: Role, overrides: Partial<ScopeActor> = {}): ScopeActor {
  return {
    id: "actor-1",
    role,
    canCreateUsers: false,
    propertyIds: [P1],
    departmentIds: [D1],
    ...overrides,
  };
}

function target(role: Role, overrides: Partial<ScopeTarget> = {}): ScopeTarget {
  return {
    id: "target-1",
    role,
    propertyIds: [P1],
    departmentIds: [D1],
    createdById: null,
    activatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const NON_ATTIVATO = { activatedAt: null };

describe("user-scope — accesso alla sezione", () => {
  it.each([
    ["SUPER_ADMIN", true],
    ["ADMIN", true],
    ["HOTEL_MANAGER", true],
    ["HOD", true],
    ["CORPORATE", false],
    ["OPERATOR", false],
  ] as [Role, boolean][])("%s → %s", (role, atteso) => {
    expect(canAccessUserManagement({ role })).toBe(atteso);
  });

  it("l'HOD entra anche senza il flag: la lista è in sola lettura", () => {
    expect(canAccessUserManagement({ role: "HOD" })).toBe(true);
    expect(getEditableFields(actor("HOD"), target("OPERATOR"))).toEqual([]);
  });
});

describe("user-scope — chi vede chi", () => {
  it("ADMIN vede tutti i ruoli, HM solo operatori e capi reparto, HOD solo operatori", () => {
    expect(getVisibleRoles({ role: "ADMIN" })).toContain("ADMIN");
    expect(getVisibleRoles({ role: "HOTEL_MANAGER" })).toEqual(["OPERATOR", "HOD"]);
    expect(getVisibleRoles({ role: "HOD" })).toEqual(["OPERATOR"]);
    expect(getVisibleRoles({ role: "CORPORATE" })).toEqual([]);
    expect(getVisibleRoles({ role: "OPERATOR" })).toEqual([]);
  });

  it("HM NON vede altri HM, né ADMIN, né CORPORATE", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canViewUser(hm, target("HOTEL_MANAGER"))).toBe(false);
    expect(canViewUser(hm, target("ADMIN"))).toBe(false);
    expect(canViewUser(hm, target("CORPORATE"))).toBe(false);
    expect(canViewUser(hm, target("SUPER_ADMIN"))).toBe(false);
  });

  it("HM vede operatori e capi reparto della SUA struttura", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canViewUser(hm, target("OPERATOR"))).toBe(true);
    expect(canViewUser(hm, target("HOD"))).toBe(true);
  });

  it("HM non vede utenti di un'altra struttura", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canViewUser(hm, target("OPERATOR", { propertyIds: [P2] }))).toBe(false);
  });

  it("HOD vede solo gli operatori del PROPRIO reparto", () => {
    const hod = actor("HOD");
    expect(canViewUser(hod, target("OPERATOR"))).toBe(true);
    expect(canViewUser(hod, target("OPERATOR", { departmentIds: [D2] }))).toBe(false);
    expect(canViewUser(hod, target("HOD"))).toBe(false);
  });

  it("CORPORATE e OPERATOR non vedono nessuno", () => {
    expect(canViewUser(actor("CORPORATE"), target("OPERATOR"))).toBe(false);
    expect(canViewUser(actor("OPERATOR"), target("OPERATOR"))).toBe(false);
  });

  it("SUPER_ADMIN vede chiunque, ovunque", () => {
    const sa = actor("SUPER_ADMIN", { propertyIds: [] });
    expect(canViewUser(sa, target("ADMIN", { propertyIds: [P2] }))).toBe(true);
  });

  it("ADMIN non vede fuori dalle property assegnate", () => {
    const admin = actor("ADMIN");
    expect(canViewUser(admin, target("HOD", { propertyIds: [P2] }))).toBe(false);
  });
});

describe("user-scope — chi crea chi", () => {
  it("i ruoli creabili seguono la matrice", () => {
    expect(getCreatableRoles({ role: "SUPER_ADMIN", canCreateUsers: false })).toContain("ADMIN");
    expect(getCreatableRoles({ role: "ADMIN", canCreateUsers: false })).not.toContain("ADMIN");
    expect(getCreatableRoles({ role: "HOTEL_MANAGER", canCreateUsers: false })).toEqual(["OPERATOR", "HOD"]);
    expect(getCreatableRoles({ role: "HOD", canCreateUsers: true })).toEqual(["OPERATOR"]);
    expect(getCreatableRoles({ role: "HOD", canCreateUsers: false })).toEqual([]);
    expect(getCreatableRoles({ role: "CORPORATE", canCreateUsers: true })).toEqual([]);
    expect(getCreatableRoles({ role: "OPERATOR", canCreateUsers: true })).toEqual([]);
  });

  it("HOD senza flag non può creare nulla", () => {
    expect(canCreateUsers({ role: "HOD", canCreateUsers: false })).toBe(false);
    const verdetto = canCreateUser(actor("HOD"), { role: "OPERATOR", propertyId: P1, departmentId: D1 });
    expect(verdetto.allowed).toBe(false);
  });

  it("HOD col flag crea operatori SOLO nel suo reparto", () => {
    const hod = actor("HOD", { canCreateUsers: true });
    expect(canCreateUser(hod, { role: "OPERATOR", propertyId: P1, departmentId: D1 }).allowed).toBe(true);

    const altroReparto = canCreateUser(hod, { role: "OPERATOR", propertyId: P1, departmentId: D2 });
    expect(altroReparto.allowed).toBe(false);
    if (!altroReparto.allowed) expect(altroReparto.reason).toBe("Puoi creare operatori solo nel tuo reparto.");

    const senzaReparto = canCreateUser(hod, { role: "OPERATOR", propertyId: P1, departmentId: null });
    expect(senzaReparto.allowed).toBe(false);
  });

  it("HOD col flag NON può creare capi reparto", () => {
    const hod = actor("HOD", { canCreateUsers: true });
    expect(canCreateUser(hod, { role: "HOD", propertyId: P1, departmentId: D1 }).allowed).toBe(false);
  });

  it("HM crea operatori e capi reparto, ma non HM né ADMIN", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canCreateUser(hm, { role: "OPERATOR", propertyId: P1, departmentId: D1 }).allowed).toBe(true);
    expect(canCreateUser(hm, { role: "HOD", propertyId: P1, departmentId: D2 }).allowed).toBe(true);
    expect(canCreateUser(hm, { role: "HOTEL_MANAGER", propertyId: P1 }).allowed).toBe(false);
    expect(canCreateUser(hm, { role: "ADMIN", propertyId: P1 }).allowed).toBe(false);
  });

  it("HM non crea fuori dalle sue strutture", () => {
    const hm = actor("HOTEL_MANAGER");
    const fuori = canCreateUser(hm, { role: "OPERATOR", propertyId: P2, departmentId: D1 });
    expect(fuori.allowed).toBe(false);
    if (!fuori.allowed) expect(fuori.reason).toBe("Non puoi creare utenti in questa struttura.");
  });

  it("solo il SUPER_ADMIN crea ADMIN", () => {
    expect(canCreateUser(actor("ADMIN"), { role: "ADMIN", propertyId: P1 }).allowed).toBe(false);
    const sa = actor("SUPER_ADMIN", { propertyIds: [] });
    expect(canCreateUser(sa, { role: "ADMIN", propertyId: P1 }).allowed).toBe(true);
  });

  it("CORPORATE e OPERATOR non creano nessuno", () => {
    expect(canCreateUser(actor("CORPORATE"), { role: "OPERATOR", propertyId: P1, departmentId: D1 }).allowed).toBe(false);
    expect(canCreateUser(actor("OPERATOR"), { role: "OPERATOR", propertyId: P1, departmentId: D1 }).allowed).toBe(false);
  });
});

describe("user-scope — canAssignDepartment (perimetro di un'assegnazione, riusato da creazione e modifica)", () => {
  it("un HOTEL_MANAGER PUÒ assegnare QUALUNQUE reparto della propria struttura — decisione ratificata", () => {
    const hm = actor("HOTEL_MANAGER", { propertyIds: [P1], departmentIds: [] });
    expect(canAssignDepartment(hm, { propertyId: P1, departmentId: D1 }).allowed).toBe(true);
    expect(canAssignDepartment(hm, { propertyId: P1, departmentId: D2 }).allowed).toBe(true);
    // Anche senza reparto specifico (accesso a tutta la struttura).
    expect(canAssignDepartment(hm, { propertyId: P1, departmentId: null }).allowed).toBe(true);
  });

  it("un HOTEL_MANAGER NON PUÒ assegnare una struttura diversa dalla propria", () => {
    const hm = actor("HOTEL_MANAGER", { propertyIds: [P1] });
    const verdetto = canAssignDepartment(hm, { propertyId: P2, departmentId: D1 });
    expect(verdetto.allowed).toBe(false);
  });

  it("un ADMIN può assegnare qualunque reparto delle proprie strutture, non le altrui", () => {
    const admin = actor("ADMIN", { propertyIds: [P1] });
    expect(canAssignDepartment(admin, { propertyId: P1, departmentId: D2 }).allowed).toBe(true);
    expect(canAssignDepartment(admin, { propertyId: P2, departmentId: D1 }).allowed).toBe(false);
  });

  it("un HOD NON PUÒ assegnare un reparto che non è il suo", () => {
    const hod = actor("HOD", { propertyIds: [P1], departmentIds: [D1] });
    expect(canAssignDepartment(hod, { propertyId: P1, departmentId: D1 }).allowed).toBe(true);
    expect(canAssignDepartment(hod, { propertyId: P1, departmentId: D2 }).allowed).toBe(false);
    expect(canAssignDepartment(hod, { propertyId: P1, departmentId: null }).allowed).toBe(false);
  });

  it("CORPORATE e OPERATOR non possono assegnare nessuno a nessun reparto", () => {
    expect(canAssignDepartment(actor("CORPORATE"), { propertyId: P1, departmentId: D1 }).allowed).toBe(false);
    expect(canAssignDepartment(actor("OPERATOR"), { propertyId: P1, departmentId: D1 }).allowed).toBe(false);
  });

  it("SUPER_ADMIN non ha alcun vincolo", () => {
    const sa = actor("SUPER_ADMIN", { propertyIds: [], departmentIds: [] });
    expect(canAssignDepartment(sa, { propertyId: P2, departmentId: "qualunque" }).allowed).toBe(true);
  });

  it("accetta messaggi di diniego personalizzati per contesto", () => {
    const hod = actor("HOD", { propertyIds: [P1], departmentIds: [D1] });
    const verdetto = canAssignDepartment(
      hod,
      { propertyId: P1, departmentId: D2 },
      { outsideDepartment: "Messaggio su misura." }
    );
    expect(verdetto.allowed).toBe(false);
    if (!verdetto.allowed) expect(verdetto.reason).toBe("Messaggio su misura.");
  });
});

describe("user-scope — chi modifica cosa", () => {
  it("HM tocca i dati base ma MAI i flag di potere", () => {
    const hm = actor("HOTEL_MANAGER");
    const campi = getEditableFields(hm, target("HOD"));

    expect(campi).toContain("name");
    expect(campi).toContain("departments");
    expect(campi).toContain("viewDepartmentIds");
    expect(campi).toContain("contentTypes");
    expect(campi).toContain("role");
    expect(campi).toContain("isActive");
    expect(campi).not.toContain("permissionFlags");
  });

  it("il rifiuto sui flag spiega di chi è la competenza", () => {
    const hm = actor("HOTEL_MANAGER");
    const verdetto = canEditField(hm, target("HOD"), "permissionFlags");
    expect(verdetto.allowed).toBe(false);
    if (!verdetto.allowed) {
      expect(verdetto.reason).toBe("I permessi di questo utente li governa l'Head of Operations.");
    }
  });

  it("HM cambia l'email solo prima dell'attivazione", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(getEditableFields(hm, target("OPERATOR", NON_ATTIVATO))).toContain("email");
    expect(getEditableFields(hm, target("OPERATOR"))).not.toContain("email");

    const verdetto = canEditField(hm, target("OPERATOR"), "email");
    expect(verdetto.allowed).toBe(false);
    if (!verdetto.allowed) {
      expect(verdetto.reason).toBe("L'email è modificabile solo prima dell'attivazione.");
    }
  });

  it("i tipi di contenuto si toccano solo sui capi reparto", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(getEditableFields(hm, target("OPERATOR"))).not.toContain("contentTypes");
    expect(getEditableFields(hm, target("HOD"))).toContain("contentTypes");
  });

  it("HOD col flag corregge SOLO l'email dei suoi creati non attivati", () => {
    const hod = actor("HOD", { canCreateUsers: true });

    const suo = target("OPERATOR", { createdById: "actor-1", ...NON_ATTIVATO });
    expect(getEditableFields(hod, suo)).toEqual(["email"]);

    // Creato da un altro
    const altrui = target("OPERATOR", { createdById: "altro", ...NON_ATTIVATO });
    expect(getEditableFields(hod, altrui)).toEqual([]);

    // Suo ma già attivato
    const attivato = target("OPERATOR", { createdById: "actor-1" });
    expect(getEditableFields(hod, attivato)).toEqual([]);
  });

  it("HOD col flag NON disattiva nessuno", () => {
    const hod = actor("HOD", { canCreateUsers: true });
    const suo = target("OPERATOR", { createdById: "actor-1", ...NON_ATTIVATO });
    expect(canDeactivateUser(hod, suo).allowed).toBe(false);
  });

  it("HOD senza flag è in sola lettura su tutto", () => {
    const hod = actor("HOD");
    const t = target("OPERATOR", { createdById: "actor-1", ...NON_ATTIVATO });
    expect(canEditUser(hod, t)).toBe(false);
    expect(canDeactivateUser(hod, t).allowed).toBe(false);
    expect(canChangeRole(hod, t, "HOD").allowed).toBe(false);
  });

  it("ADMIN non modifica altri ADMIN: quello lo fa il SUPER_ADMIN", () => {
    expect(getEditableFields(actor("ADMIN"), target("ADMIN"))).toEqual([]);
    const sa = actor("SUPER_ADMIN", { propertyIds: [] });
    expect(getEditableFields(sa, target("ADMIN"))).toContain("permissionFlags");
  });

  it("nessuno modifica un utente fuori dal proprio perimetro", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(getEditableFields(hm, target("OPERATOR", { propertyIds: [P2] }))).toEqual([]);
  });

  it("HM non disattiva se stesso", () => {
    const hm = actor("HOTEL_MANAGER", { id: "stesso" });
    const seStesso = target("HOD", { id: "stesso" });
    expect(canDeactivateUser(hm, seStesso).allowed).toBe(false);
  });
});

describe("user-scope — cambio ruolo", () => {
  it("HM sposta solo fra Operatore e Capo reparto", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(getAssignableRoles(hm, target("OPERATOR"))).toEqual(["OPERATOR", "HOD"]);
    expect(canChangeRole(hm, target("OPERATOR"), "HOD").allowed).toBe(true);
    expect(canChangeRole(hm, target("OPERATOR"), "HOTEL_MANAGER").allowed).toBe(false);
    expect(canChangeRole(hm, target("OPERATOR"), "ADMIN").allowed).toBe(false);
    expect(canChangeRole(hm, target("OPERATOR"), "CORPORATE").allowed).toBe(false);
  });

  it("la retrocessione da capo reparto a operatore NON esige la motivazione", () => {
    // La retrocessione resta riconoscibile — è da lì che discendono l'azzera-
    // mento dei tipi di contenuto e lo spegnimento del flag di creazione — ma
    // non è più un gate: la motivazione è facoltativa.
    expect(isDemotionToOperator("HOD", "OPERATOR")).toBe(true);
    expect(isDemotionToOperator("OPERATOR", "HOD")).toBe(false);

    const hm = actor("HOTEL_MANAGER");
    const capo = target("HOD");

    expect(canChangeRole(hm, capo, "OPERATOR").allowed).toBe(true);
  });

  it("nemmeno all'ADMIN si chiede più la motivazione", () => {
    const admin = actor("ADMIN");
    expect(canChangeRole(admin, target("HOD"), "OPERATOR").allowed).toBe(true);
  });

  it("la promozione a capo reparto non richiede motivazione", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canChangeRole(hm, target("OPERATOR"), "HOD").allowed).toBe(true);
  });

  it("il ruolo invariato passa sempre", () => {
    const hod = actor("HOD");
    expect(canChangeRole(hod, target("OPERATOR"), "OPERATOR").allowed).toBe(true);
  });
});

describe("user-scope — flag di creazione utenti", () => {
  it("si concede solo ai capi reparto", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canToggleCreateFlag(hm, target("HOD")).allowed).toBe(true);

    const suOperatore = canToggleCreateFlag(hm, target("OPERATOR"));
    expect(suOperatore.allowed).toBe(false);
    if (!suOperatore.allowed) {
      expect(suOperatore.reason).toBe("La creazione utenti si concede solo ai capi reparto.");
    }
  });

  it("ADMIN lo concede nel suo perimetro, HOD mai", () => {
    expect(canToggleCreateFlag(actor("ADMIN"), target("HOD")).allowed).toBe(true);
    expect(canToggleCreateFlag(actor("HOD", { canCreateUsers: true }), target("HOD")).allowed).toBe(false);
  });

  it("i preset non accendono MAI la creazione utenti in automatico", () => {
    // Il flag non fa parte dei preset di ruolo: è sempre una concessione esplicita.
    const presets = getRolePresets("HOD");
    expect(Object.keys(presets)).not.toContain("canCreateUsers");
  });
});

describe("user-scope — preset di ruolo", () => {
  it("la promozione a capo reparto porta canEdit e i tre tipi di contenuto", () => {
    const hod = getRolePresets("HOD");
    expect(hod.canEdit).toBe(true);
    expect(hod.canApprove).toBe(false);
    expect(hod.canPublish).toBe(false);
    expect(hod.contentTypes).toEqual(["SOP", "DOCUMENT", "MEMO"]);
  });

  it("l'operatore non modifica e non gestisce contenuti", () => {
    const op = getRolePresets("OPERATOR");
    expect(op.canView).toBe(true);
    expect(op.canEdit).toBe(false);
    expect(op.canApprove).toBe(false);
    expect(op.contentTypes).toEqual([]);
  });
});

describe("user-scope — inviti e reimpostazione", () => {
  it("ADMIN e HM mandano l'invito nel proprio perimetro", () => {
    expect(canSendActivation(actor("ADMIN"), target("HOD", NON_ATTIVATO)).allowed).toBe(true);
    expect(canSendActivation(actor("HOTEL_MANAGER"), target("OPERATOR", NON_ATTIVATO)).allowed).toBe(true);
  });

  it("HOD col flag rimanda l'invito solo ai suoi non attivati", () => {
    const hod = actor("HOD", { canCreateUsers: true });
    expect(canSendActivation(hod, target("OPERATOR", { createdById: "actor-1", ...NON_ATTIVATO })).allowed).toBe(true);
    expect(canSendActivation(hod, target("OPERATOR", { createdById: "altro", ...NON_ATTIVATO })).allowed).toBe(false);
    expect(canSendActivation(hod, target("OPERATOR", { createdById: "actor-1" })).allowed).toBe(false);
  });

  it("HOD senza flag non manda inviti", () => {
    expect(canSendActivation(actor("HOD"), target("OPERATOR", NON_ATTIVATO)).allowed).toBe(false);
  });

  it("il reset vale solo per chi si è già attivato", () => {
    const hm = actor("HOTEL_MANAGER");
    expect(canSendReset(hm, target("OPERATOR")).allowed).toBe(true);

    const nonAttivo = canSendReset(hm, target("OPERATOR", NON_ATTIVATO));
    expect(nonAttivo.allowed).toBe(false);
    if (!nonAttivo.allowed) expect(nonAttivo.reason).toContain("mandagli l'invito");
  });

  it("l'HOD non manda link di reimpostazione", () => {
    const hod = actor("HOD", { canCreateUsers: true });
    expect(canSendReset(hod, target("OPERATOR", { createdById: "actor-1" })).allowed).toBe(false);
  });
});

describe("user-scope — stato di attivazione", () => {
  const ora = new Date("2026-07-25T12:00:00Z");

  it("attivato", () => {
    const s = getActivationStatus({ activatedAt: new Date("2026-07-01") }, null, ora);
    expect(s.state).toBe("ACTIVATED");
    expect(s.daysWaiting).toBeNull();
  });

  it("mai invitato", () => {
    expect(getActivationStatus({ activatedAt: null }, null, ora).state).toBe("NEVER_INVITED");
  });

  it("in attesa: conta i giorni dall'ultimo invito", () => {
    const s = getActivationStatus({ activatedAt: null }, new Date("2026-07-20T12:00:00Z"), ora);
    expect(s.state).toBe("PENDING");
    expect(s.daysWaiting).toBe(5);
  });

  it("invito di oggi: zero giorni, mai negativo", () => {
    const s = getActivationStatus({ activatedAt: null }, new Date("2026-07-25T18:00:00Z"), ora);
    expect(s.daysWaiting).toBe(0);
  });
});

describe("user-scope — nomi doppi", () => {
  it("normalizza maiuscole e spazi", () => {
    expect(normalizeName("  Mario   Rossi ")).toBe("mario rossi");
  });

  it("riconosce lo stesso nome scritto diversamente", () => {
    expect(isSameName("Mario Rossi", "mario rossi")).toBe(true);
    expect(isSameName("Mario  Rossi", "Mario Rossi")).toBe(true);
    expect(isSameName("Mario Rossi", "Maria Rossi")).toBe(false);
  });
});
