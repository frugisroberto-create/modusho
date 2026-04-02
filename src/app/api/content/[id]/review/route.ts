import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { sendContentPublishedPush } from "@/lib/push-notification";
import { z } from "zod/v4";

const reviewSchema = z.object({
  action: z.enum(["APPROVED", "RETURNED"]),
  note: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { role, canApprove } = session.user;
  const userId = session.user.id;

  if (!canApprove) {
    return NextResponse.json({ error: "Non hai permessi di approvazione" }, { status: 403 });
  }

  const { id: contentId } = await params;

  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { action, note } = parsed.data;

  // RETURNED richiede nota obbligatoria
  if (action === "RETURNED" && (!note || note.trim().length === 0)) {
    return NextResponse.json(
      { error: "La nota è obbligatoria per la restituzione" },
      { status: 400 }
    );
  }

  // Carica il contenuto (con SopWorkflow se è una SOP)
  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true, status: true, propertyId: true, departmentId: true, type: true, title: true,
      sopWorkflow: { select: { id: true } },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // Determina le transizioni permesse in base al ruolo e allo stato
  if (content.status === "REVIEW_HM") {
    // Solo HOTEL_MANAGER della property, ADMIN, SUPER_ADMIN
    if (role === "HOTEL_MANAGER") {
      const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", content.propertyId);
      if (!hasAccess) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
    } else if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    if (action === "APPROVED") {
      // HM approva → REVIEW_ADMIN (inoltra)
      await changeContentStatus({
        contentId,
        fromStatus: "REVIEW_HM",
        toStatus: "REVIEW_ADMIN",
        changedById: userId,
        note: note || "Approvato dall'Hotel Manager, inoltrato per approvazione finale",
      });
    } else {
      // RETURNED → stato RETURNED (R riprende il lavoro)
      await changeContentStatus({
        contentId,
        fromStatus: "REVIEW_HM",
        toStatus: "RETURNED",
        changedById: userId,
        note,
      });
    }
  } else if (content.status === "REVIEW_ADMIN") {
    // Solo ADMIN e SUPER_ADMIN
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    if (action === "APPROVED") {
      // Admin approva → PUBLISHED
      await changeContentStatus({
        contentId,
        fromStatus: "REVIEW_ADMIN",
        toStatus: "PUBLISHED",
        changedById: userId,
        note,
      });

      // Push notification best-effort
      sendContentPublishedPush({
        contentId,
        contentTitle: content.title,
        contentType: content.type,
        actorId: userId,
      }).catch(() => {});
    } else {
      // RETURNED → stato RETURNED (R riprende il lavoro)
      await changeContentStatus({
        contentId,
        fromStatus: "REVIEW_ADMIN",
        toStatus: "RETURNED",
        changedById: userId,
        note,
      });
    }
  } else {
    return NextResponse.json(
      { error: `Impossibile fare review di un contenuto in stato ${content.status}` },
      { status: 400 }
    );
  }

  // Sync RACI flags and create workflow events for SOP content
  if (content.type === "SOP" && content.sopWorkflow) {
    const wfId = content.sopWorkflow.id;
    if (content.status === "REVIEW_HM" && action === "APPROVED") {
      // HM approves → forwarded to REVIEW_ADMIN: clear C flag, create event
      await prisma.sopWorkflow.update({
        where: { id: wfId },
        data: { submittedToC: false, submittedToCAt: null, submittedToCById: null },
      });
      await prisma.sopWorkflowEvent.create({
        data: { sopWorkflowId: wfId, eventType: "SUBMITTED_TO_A", actorId: userId, note: note || null },
      });
    } else if (content.status === "REVIEW_HM" && action === "RETURNED") {
      // HM returns → DRAFT: clear both C and A flags, create event + note
      await prisma.sopWorkflow.update({
        where: { id: wfId },
        data: {
          submittedToC: false, submittedToCAt: null, submittedToCById: null,
          submittedToA: false, submittedToAAt: null, submittedToAById: null,
        },
      });
      await prisma.sopWorkflowEvent.create({
        data: { sopWorkflowId: wfId, eventType: "RETURNED_BY_A", actorId: userId, note: note || null },
      });
      if (note) {
        await prisma.contentNote.create({
          data: { contentId, authorId: userId, body: `[Restituzione HM] ${note}` },
        });
      }
    } else if (content.status === "REVIEW_ADMIN" && action === "RETURNED") {
      // A returns → DRAFT: clear A flag, create event + note
      await prisma.sopWorkflow.update({
        where: { id: wfId },
        data: { submittedToA: false, submittedToAAt: null, submittedToAById: null },
      });
      await prisma.sopWorkflowEvent.create({
        data: { sopWorkflowId: wfId, eventType: "RETURNED_BY_A", actorId: userId, note: note || null },
      });
      if (note) {
        await prisma.contentNote.create({
          data: { contentId, authorId: userId, body: `[Restituzione] ${note}` },
        });
      }
    } else if (content.status === "REVIEW_ADMIN" && action === "APPROVED") {
      // A approves → PUBLISHED: create event
      await prisma.sopWorkflowEvent.create({
        data: { sopWorkflowId: wfId, eventType: "APPROVED", actorId: userId },
      });
      await prisma.sopWorkflowEvent.create({
        data: { sopWorkflowId: wfId, eventType: "PUBLISHED", actorId: userId },
      });
    }
  }

  // Crea ContentReview
  const reviewAction = action === "APPROVED"
    ? (content.status === "REVIEW_HM" ? "FORWARDED" : "APPROVED")
    : "RETURNED";

  await prisma.contentReview.create({
    data: {
      contentId,
      reviewerId: userId,
      action: reviewAction,
      note: note || null,
    },
  });

  return NextResponse.json({
    data: { contentId, action: reviewAction, success: true },
  });
}
