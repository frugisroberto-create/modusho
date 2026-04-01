/**
 * SOP RACI Workflow — Domain Logic
 *
 * Pure functions for:
 * - RACI role assignment (R/C/A)
 * - Permission checks (editability, submission, return, approval)
 * - Flag management
 * - Review lifecycle
 */

import { Role, SopStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────

export type RaciRole = "R" | "C" | "A";

export interface RaciAssignment {
  responsibleId: string;
  consultedId: string | null;
  accountableId: string;
}

/** Minimal workflow shape used by permission checks (avoids full DB model dependency) */
export interface SopWorkflowInfo {
  sopStatus: SopStatus;
  responsibleId: string;
  consultedId: string | null;
  accountableId: string;
  submittedToC: boolean;
  submittedToA: boolean;
}

// ─── RACI Role Resolution ─────────────────────────────────────────────

/**
 * Resolve RACI roles based on who initiates and whether HOD is involved.
 *
 * Rules (from mini-spec):
 *   HOD opens             → R=HOD,  C=HM,   A=HOO
 *   HM opens w/o HOD      → R=HM,           A=HOO
 *   HM opens w/ HOD       → R=HOD,  C=HM,   A=HOO
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
      // HOD opens → HOD=R, HM=C, HOO=A
      return { responsibleId: initiatorId, consultedId: hmUserId, accountableId: hooUserId };

    case "HOTEL_MANAGER":
      if (involveHod && hodUserId) {
        // HM with HOD → HOD=R, HM=C, HOO=A
        return { responsibleId: hodUserId, consultedId: initiatorId, accountableId: hooUserId };
      }
      // HM without HOD → HM=R, HOO=A
      return { responsibleId: initiatorId, consultedId: null, accountableId: hooUserId };

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

/** Anyone involved (R/C/A) or ADMIN/SUPER_ADMIN can edit while IN_LAVORAZIONE,
 *  as long as the draft has NOT been submitted to A. */
export function canEditText(userId: string, wf: SopWorkflowInfo, userRole?: string): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  if (wf.submittedToA) return false;
  if (userId === wf.responsibleId) return true;
  if (userId === wf.consultedId) return true;
  if (userId === wf.accountableId) return true;
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") return true;
  return false;
}

/** Only R can manage (add/remove/reorder) attachments while IN_LAVORAZIONE */
export function canManageAttachments(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  return userId === wf.responsibleId;
}

/** R, C, A can view attachments while IN_LAVORAZIONE */
export function canViewAttachments(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  return isInvolved(userId, wf);
}

/** Only involved actors (R/C/A) can add notes while IN_LAVORAZIONE */
export function canAddNote(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  return isInvolved(userId, wf);
}

/** R can submit to C and/or A */
export function canSubmit(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  return userId === wf.responsibleId;
}

/** Only A can return, and only when submitted to A */
export function canReturn(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  if (!wf.submittedToA) return false;
  return userId === wf.accountableId;
}

/** Only A can approve, and only when submitted to A */
export function canApprove(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  if (!wf.submittedToA) return false;
  return userId === wf.accountableId;
}

/** Only A can modify the review due date */
export function canModifyReviewDueDate(userId: string, wf: SopWorkflowInfo): boolean {
  return userId === wf.accountableId;
}

/** Can the user view this draft? Only R, C, A */
export function canViewDraft(userId: string, wf: SopWorkflowInfo): boolean {
  if (wf.sopStatus !== "IN_LAVORAZIONE") return false;
  return isInvolved(userId, wf);
}

// ─── Review Lifecycle ──────────────────────────────────────────────────

/** Check if a published SOP needs review (review due date exceeded) */
export function needsReview(wf: { sopStatus: SopStatus; reviewDueDate: Date | null }): boolean {
  if (wf.sopStatus !== "PUBBLICATA") return false;
  if (!wf.reviewDueDate) return false;
  return new Date() > wf.reviewDueDate;
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
