import { describe, it, expect } from "vitest";
import {
  resolveRaciRoles,
  canEditText,
  canSubmit,
  canReturn,
  canApprove,
  canAddNote,
  canManageAttachments,
  isInvolved,
  getRaciRole,
  getValidityStatus,
  needsReview,
  type SopWorkflowInfo,
} from "../sop-workflow";

// ─── Test IDs ──────────────────────────────────────────────────────────

const HOD_ID = "hod-1";
const HM_ID = "hm-1";
const HOO_ID = "hoo-1";
const CORP_ID = "corp-1";
const OUTSIDER_ID = "outsider-1";

// ─── Helper per creare workflow info ───────────────────────────────────

function makeWf(overrides: Partial<SopWorkflowInfo> = {}): SopWorkflowInfo {
  return {
    contentStatus: "DRAFT",
    responsibleId: HOD_ID,
    consultedId: HM_ID,
    accountableId: HOO_ID,
    submittedToC: false,
    submittedToA: false,
    ...overrides,
  };
}

// ─── resolveRaciRoles ──────────────────────────────────────────────────

describe("resolveRaciRoles", () => {
  it("HOD apre: R=HOD, C=HM, A=HOO", () => {
    const result = resolveRaciRoles({
      initiatorId: HOD_ID,
      initiatorRole: "HOD",
      involveHod: false,
      hmUserId: HM_ID,
      hooUserId: HOO_ID,
    });
    expect(result.responsibleId).toBe(HOD_ID);
    expect(result.consultedId).toBe(HM_ID);
    expect(result.accountableId).toBe(HOO_ID);
  });

  it("HM apre senza HOD: R=HM, C=null, A=HOO", () => {
    const result = resolveRaciRoles({
      initiatorId: HM_ID,
      initiatorRole: "HOTEL_MANAGER",
      involveHod: false,
      hmUserId: HM_ID,
      hooUserId: HOO_ID,
    });
    expect(result.responsibleId).toBe(HM_ID);
    expect(result.consultedId).toBeNull();
    expect(result.accountableId).toBe(HOO_ID);
  });

  it("HM apre con HOD: R=HOD, C=HM, A=HOO", () => {
    const result = resolveRaciRoles({
      initiatorId: HM_ID,
      initiatorRole: "HOTEL_MANAGER",
      involveHod: true,
      hodUserId: HOD_ID,
      hmUserId: HM_ID,
      hooUserId: HOO_ID,
    });
    expect(result.responsibleId).toBe(HOD_ID);
    expect(result.consultedId).toBe(HM_ID);
    expect(result.accountableId).toBe(HOO_ID);
  });

  it("CORPORATE apre con HOD: R=HOD, C=HM, A=CORPORATE", () => {
    const result = resolveRaciRoles({
      initiatorId: CORP_ID,
      initiatorRole: "CORPORATE",
      involveHod: true,
      hodUserId: HOD_ID,
      hmUserId: HM_ID,
      hooUserId: CORP_ID,
    });
    expect(result.responsibleId).toBe(HOD_ID);
    expect(result.consultedId).toBe(HM_ID);
    expect(result.accountableId).toBe(CORP_ID);
  });

  it("ADMIN apre senza HOD: R=HM, C=null, A=ADMIN", () => {
    const result = resolveRaciRoles({
      initiatorId: HOO_ID,
      initiatorRole: "ADMIN",
      involveHod: false,
      hmUserId: HM_ID,
      hooUserId: HOO_ID,
    });
    expect(result.responsibleId).toBe(HM_ID);
    expect(result.consultedId).toBeNull();
    expect(result.accountableId).toBe(HOO_ID);
  });

  it("OPERATOR non puo avviare SOP RACI", () => {
    expect(() =>
      resolveRaciRoles({
        initiatorId: "op-1",
        initiatorRole: "OPERATOR",
        involveHod: false,
        hmUserId: HM_ID,
        hooUserId: HOO_ID,
      })
    ).toThrow();
  });
});

// ─── Role queries ──────────────────────────────────────────────────────

describe("isInvolved / getRaciRole", () => {
  const wf = makeWf();

  it("R e coinvolto con ruolo R", () => {
    expect(isInvolved(HOD_ID, wf)).toBe(true);
    expect(getRaciRole(HOD_ID, wf)).toBe("R");
  });

  it("C e coinvolto con ruolo C", () => {
    expect(isInvolved(HM_ID, wf)).toBe(true);
    expect(getRaciRole(HM_ID, wf)).toBe("C");
  });

  it("A e coinvolto con ruolo A", () => {
    expect(isInvolved(HOO_ID, wf)).toBe(true);
    expect(getRaciRole(HOO_ID, wf)).toBe("A");
  });

  it("estraneo non e coinvolto", () => {
    expect(isInvolved(OUTSIDER_ID, wf)).toBe(false);
    expect(getRaciRole(OUTSIDER_ID, wf)).toBeNull();
  });
});

// ─── canEditText ───────────────────────────────────────────────────────

describe("canEditText", () => {
  it("R puo editare in DRAFT", () => {
    expect(canEditText(HOD_ID, makeWf())).toBe(true);
  });

  it("C puo editare in DRAFT", () => {
    expect(canEditText(HM_ID, makeWf())).toBe(true);
  });

  it("nessuno puo editare se submittedToA", () => {
    const wf = makeWf({ submittedToA: true });
    expect(canEditText(HOD_ID, wf)).toBe(false);
    expect(canEditText(HM_ID, wf)).toBe(false);
  });

  it("nessuno puo editare se PUBLISHED", () => {
    const wf = makeWf({ contentStatus: "PUBLISHED" });
    expect(canEditText(HOD_ID, wf)).toBe(false);
  });

  it("HM puo editare anche se non coinvolto (governance)", () => {
    const wf = makeWf({ consultedId: null });
    expect(canEditText(HM_ID, wf, "HOTEL_MANAGER")).toBe(true);
  });

  it("estraneo NON puo editare", () => {
    expect(canEditText(OUTSIDER_ID, makeWf())).toBe(false);
  });
});

// ─── canSubmit ─────────────────────────────────────────────────────────

describe("canSubmit", () => {
  it("R puo inviare da DRAFT", () => {
    expect(canSubmit(HOD_ID, makeWf())).toBe(true);
  });

  it("R puo inviare da RETURNED", () => {
    expect(canSubmit(HOD_ID, makeWf({ contentStatus: "RETURNED" }))).toBe(true);
  });

  it("R NON puo inviare da REVIEW_HM", () => {
    expect(canSubmit(HOD_ID, makeWf({ contentStatus: "REVIEW_HM" }))).toBe(false);
  });

  it("C NON puo inviare", () => {
    expect(canSubmit(HM_ID, makeWf())).toBe(false);
  });

  it("A NON puo inviare", () => {
    expect(canSubmit(HOO_ID, makeWf())).toBe(false);
  });
});

// ─── canReturn ─────────────────────────────────────────────────────────

describe("canReturn", () => {
  it("A puo restituire da REVIEW_ADMIN quando submittedToA", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: true });
    expect(canReturn(HOO_ID, wf)).toBe(true);
  });

  it("A NON puo restituire se non submittedToA", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: false });
    expect(canReturn(HOO_ID, wf)).toBe(false);
  });

  it("C puo restituire da REVIEW_HM quando submittedToC", () => {
    const wf = makeWf({ contentStatus: "REVIEW_HM", submittedToC: true });
    expect(canReturn(HM_ID, wf)).toBe(true);
  });

  it("R NON puo restituire", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: true });
    expect(canReturn(HOD_ID, wf)).toBe(false);
  });
});

// ─── canApprove ────────────────────────────────────────────────────────

describe("canApprove", () => {
  it("A puo approvare da REVIEW_ADMIN quando submittedToA", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: true });
    expect(canApprove(HOO_ID, wf)).toBe(true);
  });

  it("A NON puo approvare da DRAFT", () => {
    expect(canApprove(HOO_ID, makeWf())).toBe(false);
  });

  it("A NON puo approvare se non submittedToA", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: false });
    expect(canApprove(HOO_ID, wf)).toBe(false);
  });

  it("R NON puo approvare", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: true });
    expect(canApprove(HOD_ID, wf)).toBe(false);
  });

  it("C NON puo approvare", () => {
    const wf = makeWf({ contentStatus: "REVIEW_ADMIN", submittedToA: true });
    expect(canApprove(HM_ID, wf)).toBe(false);
  });
});

// ─── canAddNote ────────────────────────────────────────────────────────

describe("canAddNote", () => {
  it("R, C, A possono aggiungere note", () => {
    const wf = makeWf();
    expect(canAddNote(HOD_ID, wf)).toBe(true);
    expect(canAddNote(HM_ID, wf)).toBe(true);
    expect(canAddNote(HOO_ID, wf)).toBe(true);
  });

  it("estraneo NON puo aggiungere note", () => {
    expect(canAddNote(OUTSIDER_ID, makeWf())).toBe(false);
  });

  it("note possibili anche su PUBLISHED", () => {
    const wf = makeWf({ contentStatus: "PUBLISHED" });
    expect(canAddNote(HOD_ID, wf)).toBe(true);
  });
});

// ─── canManageAttachments ──────────────────────────────────────────────

describe("canManageAttachments", () => {
  it("solo R puo gestire allegati in DRAFT", () => {
    const wf = makeWf();
    expect(canManageAttachments(HOD_ID, wf)).toBe(true);
    expect(canManageAttachments(HM_ID, wf)).toBe(false);
    expect(canManageAttachments(HOO_ID, wf)).toBe(false);
  });

  it("R NON puo gestire allegati se PUBLISHED", () => {
    const wf = makeWf({ contentStatus: "PUBLISHED" });
    expect(canManageAttachments(HOD_ID, wf)).toBe(false);
  });
});

// ─── getValidityStatus ─────────────────────────────────────────────────

describe("getValidityStatus", () => {
  it("null -> UNKNOWN", () => {
    expect(getValidityStatus(null)).toBe("UNKNOWN");
  });

  it("data futura lontana -> VALID", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(getValidityStatus(future)).toBe("VALID");
  });

  it("scade tra 15 giorni -> EXPIRING", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    expect(getValidityStatus(soon)).toBe("EXPIRING");
  });

  it("data passata -> EXPIRED", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(getValidityStatus(past)).toBe("EXPIRED");
  });
});

// ─── needsReview ───────────────────────────────────────────────────────

describe("needsReview", () => {
  it("SOP pubblicata con reviewDueDate scaduta -> true", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(needsReview({ contentStatus: "PUBLISHED", reviewDueDate: past })).toBe(true);
  });

  it("SOP pubblicata con reviewDueDate futura -> false", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(needsReview({ contentStatus: "PUBLISHED", reviewDueDate: future })).toBe(false);
  });

  it("SOP in DRAFT -> false (anche con data scaduta)", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(needsReview({ contentStatus: "DRAFT", reviewDueDate: past })).toBe(false);
  });

  it("SOP pubblicata senza reviewDueDate -> false", () => {
    expect(needsReview({ contentStatus: "PUBLISHED", reviewDueDate: null })).toBe(false);
  });
});
