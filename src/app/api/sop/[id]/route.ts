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
import { checkAccess } from "@/lib/rbac";
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
          targetDepartment: { select: { name: true } },
        },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // RBAC: property/department access
  const hasAccess = await checkAccess(userId, "OPERATOR", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
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

  // Draft visibility: only R/C/A can view IN_LAVORAZIONE SOPs
  if (wf.sopStatus === "IN_LAVORAZIONE") {
    if (!isInvolved(userId, wf)) {
      // OPERATOR and non-involved users cannot see drafts
      return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
    }
  }

  const raciRole = getRaciRole(userId, wf);
  const wfInfo = {
    sopStatus: wf.sopStatus,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  // Build editability message for non-R users when submitted
  let editabilityMessage: string | null = null;
  if (wf.sopStatus === "IN_LAVORAZIONE" && (wf.submittedToC || wf.submittedToA) && raciRole !== "R") {
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
        needsReview: needsReview(wf),
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
