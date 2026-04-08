/**
 * GET /api/sop/[id] — Get SOP details with RACI workflow info
 *
 * Returns Content + SopWorkflow data, current user's RACI role,
 * permissions, and review status.
 * Enforces draft visibility: only R/C/A can see IN_LAVORAZIONE SOPs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";
import {
  getRaciRole,
  isInvolved,
  canEditText,
  canSubmit,
  canReturn,
  canApprove,
  canManageAttachments,
  canAddNote,
  canModifyReviewDueDate,
  needsReview,
  SUBMITTED_EDIT_MESSAGE,
} from "@/lib/sop-workflow";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false, type: "SOP" },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      sopWorkflow: {
        include: {
          responsible: { select: { id: true, name: true, role: true } },
          consulted: { select: { id: true, name: true, role: true } },
          accountable: { select: { id: true, name: true, role: true } },
        },
      },
      targetAudience: {
        select: {
          targetType: true,
          targetRole: true,
          targetDepartmentId: true,
          targetUserId: true,
          targetDepartment: { select: { name: true } },
        },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // RBAC coarse: property access (no departmentId — visibility fine via
  // targetAudience subito sotto, allineato con /api/content e detail pages).
  const userRole = session.user.role;
  const hasAccess = await checkAccess(userId, "OPERATOR", content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // RBAC fine per OPERATOR/HOD: match su targetAudience
  if (userRole === "OPERATOR" || userRole === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(userId, content.propertyId);
    const isInTarget = content.targetAudience.some((t) => {
      if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
      if (t.targetType === "ROLE" && t.targetRole === userRole) return true;
      if (t.targetType === "USER" && t.targetUserId === userId) return true;
      if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
      return false;
    });
    if (!isInTarget && !(userRole === "HOD" && content.createdBy.id === userId)) {
      return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
    }
  }

  const wf = content.sopWorkflow;

  // If no RACI workflow, return basic content (legacy SOP)
  if (!wf) {
    return NextResponse.json({
      data: {
        id: content.id,
        type: content.type,
        title: content.title,
        body: content.body,
        status: content.status,
        version: content.version,
        publishedAt: content.publishedAt,
        createdAt: content.createdAt,
        property: content.property,
        department: content.department,
        createdBy: content.createdBy,
        targetAudience: content.targetAudience,
        sopWorkflow: null,
      },
    });
  }

  // Draft visibility: only R/C/A can view draft SOPs
  const draftStatuses = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  const wfInfo = {
    contentStatus: content.status,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  if (draftStatuses.includes(content.status)) {
    if (!isInvolved(userId, wfInfo)) {
      // OPERATOR and non-involved users cannot see drafts
      return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
    }
  }

  const raciRole = getRaciRole(userId, wfInfo);

  // Build editability message for non-R users when submitted
  let editabilityMessage: string | null = null;
  if (draftStatuses.includes(content.status) && (wf.submittedToC || wf.submittedToA) && raciRole !== "R") {
    editabilityMessage = SUBMITTED_EDIT_MESSAGE;
  }

  return NextResponse.json({
    data: {
      id: content.id,
      type: content.type,
      title: content.title,
      body: content.body,
      status: content.status,
      version: content.version,
      publishedAt: content.publishedAt,
      createdAt: content.createdAt,
      property: content.property,
      department: content.department,
      createdBy: content.createdBy,
      targetAudience: content.targetAudience,
      sopWorkflow: {
        id: wf.id,
        sopStatus: wf.sopStatus,
        responsible: wf.responsible,
        consulted: wf.consulted,
        accountable: wf.accountable,
        submittedToC: wf.submittedToC,
        submittedToCAt: wf.submittedToCAt,
        submittedToA: wf.submittedToA,
        submittedToAAt: wf.submittedToAAt,
        reviewDueDate: wf.reviewDueDate,
        reviewDueMonths: wf.reviewDueMonths,
        lastSavedAt: wf.lastSavedAt,
        lastSavedById: wf.lastSavedById,
        textVersionCount: wf.textVersionCount,
        needsReview: needsReview({ contentStatus: content.status, reviewDueDate: wf.reviewDueDate }),
      },
      currentUser: {
        raciRole,
        canEditText: canEditText(userId, wfInfo),
        canManageAttachments: canManageAttachments(userId, wfInfo),
        canAddNote: canAddNote(userId, wfInfo),
        canSubmit: canSubmit(userId, wfInfo),
        canReturn: canReturn(userId, wfInfo),
        canApprove: canApprove(userId, wfInfo),
        canModifyReviewDueDate: canModifyReviewDueDate(userId, wfInfo),
      },
      editabilityMessage,
    },
  });
}
