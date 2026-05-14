/**
 * SOP RACI Workflow — Domain Logic
 *
 * Pure functions for:
 * - RACI role assignment (R/C/A)
 * - Permission checks (editability, submission, return, approval)
 * - Flag management
 * - Review lifecycle
 */

import { Role, ContentStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────

export type RaciRole = "R" | "C" | "A";

export interface RaciAssignment {
  responsibleId: string;
  consultedId: string | null;
  accountableId: string;
}

/** Minimal workflow shape used by permission checks.
 *  contentStatus is the single source of truth for SOP state. */
export interface SopWorkflowInfo {
  contentStatus: ContentStatus;
  responsibleId: string;
  consultedId: string | null;
  accountableId: string;
  submittedToC: boolean;
  submittedToA: boolean;
}

/** Helper: is the SOP in a draft/working state? (not yet published or archived) */
function isDraft(status: ContentStatus): boolean {
  return status === "DRAFT" || status === "REVIEW_HM" || status === "REVIEW_ADMIN" || status === "RETURNED";
}

// ─── RACI Role Resolution ─────────────────────────────────────────────

/**
 * Resolve RACI roles based on who initiates and whether HOD is involved.
 *
 * Rules:
 *   HOD opens             → R=HOD,  C=HM,   A=HOO (or CORPORATE if available)
 *   HM opens w/o HOD      → R=HM,           A=HOO (or CORPORATE if available)
 *   HM opens w/ HOD       → R=HOD,  C=HM,   A=HOO (or CORPORATE if available)
 *   CORPORATE opens w/o HOD → R=CORPORATE,  C=HM, A=CORPORATE
 *   CORPORATE opens w/ HOD  → R=HOD,  C=HM,  A=CORPORATE
 *   HOO opens w/o HOD     → R=HM,           A=HOO
 *   HOO opens w/ HOD      → R=HOD,  C=HM,   A=HOO
 */
export function resolveRaciRoles(params: {
  initiatorId: string;
  initiatorRole: Role;
  involveHod: boolean;
  hodUserId?: string;
  hmUserId: string;
  hooUserId: string;
}): RaciAssignment {
  const { initiatorId, initiatorRole, involveHod, hodUserId, hmUserId, hooUserId } = params;

  switch (initiatorRole) {
    case "HOD":
      // HOD opens → HOD=R, HM=C, A=hooUserId (could be CORPORATE or ADMIN)
      return { responsibleId: initiatorId, consultedId: hmUserId, accountableId: hooUserId };

    case "HOTEL_MANAGER":
      if (involveHod && hodUserId) {
        // HM with HOD → HOD=R, HM=C, A=hooUserId
        return { responsibleId: hodUserId, consultedId: initiatorId, accountableId: hooUserId };
      }
      // HM without HOD → HM=R, A=hooUserId
      return { responsibleId: initiatorId, consultedId: null, accountableId: hooUserId };

    case "CORPORATE":
      if (involveHod && hodUserId) {
        // CORPORATE with HOD → HOD=R, HM=C, CORPORATE=A
        return { responsibleId: hodUserId, consultedId: hmUserId, accountableId: initiatorId };
      }
      // CORPORATE without HOD → CORPORATE=R, HM=C, CORPORATE=A
      // (R e A sono lo stesso utente — il Corporate gestisce tutto nel suo perimetro)
      return { responsibleId: initiatorId, consultedId: hmUserId, accountableId: initiatorId };

    case "ADMIN":
    case "SUPER_ADMIN":
      if (involveHod && hodUserId) {
        // HOO with HOD → HOD=R, HM=C, HOO=A
        return { responsibleId: hodUserId, consultedId: hmUserId, accountableId: initiatorId };
      }
      // HOO without HOD → HM=R, HOO=A
      return { responsibleId: hmUserId, consultedId: null, accountableId: initiatorId };

    default:
      throw new Error(`Il ruolo ${initiatorRole} non può avviare una SOP RACI`);
  }
}

// ─── Role Queries ──────────────────────────────────────────────────────

export function isInvolved(userId: string, wf: SopWorkflowInfo): boolean {
  return userId === wf.responsibleId || userId === wf.consultedId || userId === wf.accountableId;
}

export function getRaciRole(userId: string, wf: SopWorkflowInfo): RaciRole | null {
  if (userId === wf.responsibleId) return "R";
  if (userId === wf.consultedId) return "C";
  if (userId === wf.accountableId) return "A";
  return null;
}

// ─── Permission Checks ────────────────────────────────────────────────

/** Anyone involved (R/C/A) or HM/ADMIN/SUPER_ADMIN can edit while IN_LAVORAZIONE,
 *  as long as the draft has NOT been submitted to A.
 *  HM and HOO have governance authority and can intervene on any draft in their perimeter. */
export function canEditText(userId: string, wf: SopWorkflowInfo, userRole?: string): boolean {
  if (!isDraft(wf.contentStatus)) return false;
  if (wf.submittedToA) return false;
  if (userId === wf.responsibleId) return true;
  if (userId === wf.consultedId) return true;
  if (userId === wf.accountableId) return true;
  if (userRole === "HOTEL_MANAGER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN") return true;
  return false;
}

/** Only R can manage (add/remove/reorder) attachments while IN_LAVORAZIONE */
export function canManageAttachments(userId: string, wf: SopWorkflowInfo): boolean {
  if (!isDraft(wf.contentStatus)) return false;
  return userId === wf.responsibleId;
}

/** R, C, A can view attachments while IN_LAVORAZIONE */
export function canViewAttachments(userId: string, wf: SopWorkflowInfo): boolean {
  if (!isDraft(wf.contentStatus)) return false;
  return isInvolved(userId, wf);
}

/** Only involved actors (R/C/A) can add notes while IN_LAVORAZIONE */
export function canAddNote(userId: string, wf: SopWorkflowInfo): boolean {
  if (!isDraft(wf.contentStatus)) return false;
  return isInvolved(userId, wf);
}

/** R can submit to C and/or A — from DRAFT or RETURNED (not already in review) */
export function canSubmit(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.contentStatus !== "DRAFT" && wf.contentStatus !== "RETURNED") return false;
  return userId === wf.responsibleId;
}

/** A can return from REVIEW_ADMIN, C (HM) can return from REVIEW_HM */
export function canReturn(userId: string, wf: SopWorkflowInfo): boolean {
  // A returns from REVIEW_ADMIN
  if (wf.contentStatus === "REVIEW_ADMIN" && wf.submittedToA && userId === wf.accountableId) {
    return true;
  }
  // C (HM) returns from REVIEW_HM
  if (wf.contentStatus === "REVIEW_HM" && wf.submittedToC && userId === wf.consultedId) {
    return true;
  }
  return false;
}

/** Only A can approve, and only when in REVIEW_ADMIN (submitted to A) */
export function canApprove(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.contentStatus !== "REVIEW_ADMIN") return false;
  if (!wf.submittedToA) return false;
  return userId === wf.accountableId;
}

/** Only A can modify the review due date */
export function canModifyReviewDueDate(userId: string, wf: SopWorkflowInfo): boolean {
  return userId === wf.accountableId;
}

/** Can the user view this draft? Only R, C, A */
export function canViewDraft(userId: string, wf: SopWorkflowInfo): boolean {
  if (!isDraft(wf.contentStatus)) return false;
  return isInvolved(userId, wf);
}

// ─── Review Lifecycle ──────────────────────────────────────────────────

/** Check if a published SOP needs review (review due date exceeded) */
export function needsReview(wf: { contentStatus: ContentStatus; reviewDueDate: Date | null }): boolean {
  if (wf.contentStatus !== "PUBLISHED") return false;
  if (!wf.reviewDueDate) return false;
  return new Date() > wf.reviewDueDate;
}

/** Stato di validità temporale della SOP */
export type ValidityStatus = "VALID" | "EXPIRING" | "EXPIRED" | "UNKNOWN";

/** Calcola lo stato di validità di una SOP pubblicata */
export function getValidityStatus(reviewDueDate: Date | string | null): ValidityStatus {
  if (!reviewDueDate) return "UNKNOWN";
  const due = new Date(reviewDueDate);
  const now = new Date();
  const thirtyDaysBefore = new Date(due);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

  if (now >= due) return "EXPIRED";
  if (now >= thirtyDaysBefore) return "EXPIRING";
  return "VALID";
}

/** Formatta la scadenza in modo leggibile */
export function formatExpiryInfo(reviewDueDate: Date | string | null): string {
  if (!reviewDueDate) return "";
  const due = new Date(reviewDueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `Scaduta il ${due.toLocaleDateString("it-IT")}`;
  if (diffDays <= 30) return `Scade tra ${diffDays} giorni`;
  return `Scade il ${due.toLocaleDateString("it-IT")}`;
}

/** Calculate review due date from a reference date */
export function calculateReviewDueDate(fromDate: Date, months: number = 12): Date {
  const due = new Date(fromDate);
  due.setMonth(due.getMonth() + months);
  return due;
}

// ─── Editability Message ───────────────────────────────────────────────

export const SUBMITTED_EDIT_MESSAGE =
  "Questa bozza è attualmente sottoposta a revisione. Il testo può essere modificato solo dal responsabile operativo della procedura. Puoi comunque lasciare note.";
