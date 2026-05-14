import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getRaciRole,
  isInvolved,
  canEditText,
  canViewDraft,
  needsReview,
} from "@/lib/sop-workflow";
import { checkAccess } from "@/lib/rbac";
import { sendWorkflowActivityPush } from "@/lib/push-notification";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET: dettaglio SOP workflow ─────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    include: {
      content: {
        select: {
          id: true,
          code: true,
          title: true,
          body: true,
          status: true,
          version: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          property: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true, role: true } },
          targetAudience: {
            select: { targetType: true, targetRole: true, targetDepartment: { select: { id: true, name: true } } },
          },
        },
      },
      responsible: { select: { id: true, name: true, role: true } },
      consulted: { select: { id: true, name: true, role: true } },
      accountable: { select: { id: true, name: true, role: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // Build wfInfo for permission checks
  const wfInfo = {
    contentStatus: wf.content.status,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  // RBAC: l'utente deve avere accesso alla property della SOP
  // (anche per SUPER_ADMIN, anche se di fatto SUPER_ADMIN ha accesso a tutto)
  const userRole = session.user.role;
  const hasAccess = await checkAccess(userId, "OPERATOR", wf.content.property.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
  }

  // Visibilita' bozza: R/C/A oppure HM/ADMIN/SUPER_ADMIN possono vedere la bozza
  const contentStatus = wf.content.status;
  if (contentStatus !== "PUBLISHED" && contentStatus !== "ARCHIVED") {
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && userRole !== "HOTEL_MANAGER" && userRole !== "CORPORATE" && !canViewDraft(userId, wfInfo)) {
      return NextResponse.json({ error: "Non hai accesso a questa bozza" }, { status: 403 });
    }
  }

  const myRole = getRaciRole(userId, wfInfo);

  return NextResponse.json({
    data: {
      id: wf.id,
      contentId: wf.content.id,
      code: wf.content.code,
      title: wf.content.title,
      body: wf.content.body,
      contentStatus: wf.content.status,
      sopStatus: wf.sopStatus, // legacy
      myRole,
      submittedToC: wf.submittedToC,
      submittedToCAt: wf.submittedToCAt,
      submittedToA: wf.submittedToA,
      submittedToAAt: wf.submittedToAAt,
      reviewDueDate: wf.reviewDueDate,
      reviewDueMonths: wf.reviewDueMonths,
      needsReview: needsReview({ contentStatus: wf.content.status, reviewDueDate: wf.reviewDueDate }),
      lastSavedAt: wf.lastSavedAt,
      textVersionCount: wf.textVersionCount,
      canEditText: canEditText(userId, wfInfo, userRole),
      property: wf.content.property,
      department: wf.content.department,
      createdBy: wf.content.createdBy,
      responsible: wf.responsible,
      consulted: wf.consulted,
      accountable: wf.accountable,
      targetAudience: wf.content.targetAudience,
      consultedConfirmedAt: wf.consultedConfirmedAt,
      consultedConfirmedVersion: wf.consultedConfirmedVersion,
      consultedConfirmedNote: wf.consultedConfirmedNote,
      consultationPending: wf.submittedToC && wf.consultedConfirmedVersion !== wf.textVersionCount,
      publishedAt: wf.content.publishedAt,
      createdAt: wf.content.createdAt,
    },
  });
}

// ─── PUT: salva testo della bozza (crea nuova versione) ─────────────

const saveTextSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  expectedVersionCount: z.number().int().optional(), // optimistic locking
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const reqBody = await request.json();
  const parsed = saveTextSchema.safeParse(reqBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { title, body, expectedVersionCount } = parsed.data;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      contentId: true,
      sopStatus: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
      textVersionCount: true,
      content: { select: { status: true, propertyId: true, code: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // RBAC: l'utente deve avere accesso alla property della SOP
  const userRole = session.user.role;
  const hasAccess = await checkAccess(userId, "OPERATOR", wf.content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
  }

  const wfInfo = { ...wf, contentStatus: wf.content.status };

  // Solo R puo' modificare il testo (o HM/ADMIN/SUPER_ADMIN pre-submit)
  if (!canEditText(userId, wfInfo, userRole)) {
    // Messaggio specifico per C/A quando la bozza e' sottoposta
    if (isInvolved(userId, wfInfo) && (wf.submittedToC || wf.submittedToA)) {
      return NextResponse.json({
        error: "Questa bozza e' attualmente sottoposta a revisione. Il testo puo' essere modificato solo dal responsabile operativo della procedura. Puoi comunque lasciare note.",
      }, { status: 403 });
    }
    return NextResponse.json({ error: "Non hai permesso di modificare il testo" }, { status: 403 });
  }

  // Optimistic locking: verifica che nessuno abbia salvato nel frattempo
  if (expectedVersionCount !== undefined && expectedVersionCount !== wf.textVersionCount) {
    return NextResponse.json({
      error: "Conflitto di versione: un altro soggetto ha salvato una nuova versione. Ricarica la bozza.",
      currentVersionCount: wf.textVersionCount,
    }, { status: 409 });
  }

  const newVersionNumber = wf.textVersionCount + 1;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Nuova versione del testo
    await tx.sopTextVersion.create({
      data: {
        sopWorkflowId: wf.id,
        versionNumber: newVersionNumber,
        title,
        body,
        savedById: userId,
      },
    });

    // 2. Aggiorna Content.body/title come snapshot corrente
    // Se era in REVIEW_HM e R salva, torna a DRAFT (la consultazione è revocata)
    // Se era RETURNED e R salva, torna a DRAFT (ha iniziato a lavorarci)
    const contentUpdateData: Record<string, unknown> = { title, body, updatedById: userId, version: newVersionNumber };
    if (wf.content.status === "REVIEW_HM" && wf.submittedToC) {
      contentUpdateData.status = "DRAFT";
    } else if (wf.content.status === "RETURNED") {
      contentUpdateData.status = "DRAFT";
    }
    await tx.content.update({
      where: { id: wf.contentId },
      data: contentUpdateData,
    });

    // 3. Aggiorna SopWorkflow
    const updateData: Record<string, unknown> = {
      textVersionCount: newVersionNumber,
      lastSavedAt: now,
      lastSavedById: userId,
    };

    // Flag C: si spegne quando R salva una nuova versione
    if (wf.submittedToC) {
      updateData.submittedToC = false;
      updateData.submittedToCAt = null;
      updateData.submittedToCById = null;
    }

    // Conferma consultazione C: si resetta con nuova versione
    updateData.consultedConfirmedAt = null;
    updateData.consultedConfirmedById = null;
    updateData.consultedConfirmedVersion = null;
    updateData.consultedConfirmedNote = null;

    const updatedWf = await tx.sopWorkflow.update({
      where: { id: wf.id },
      data: updateData,
    });

    // 4. Evento workflow
    await tx.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "TEXT_SAVED",
        actorId: userId,
        metadata: { versionNumber: newVersionNumber },
      },
    });

    return updatedWf;
  });

  // Push notification ai soggetti RACI (escluso chi salva) — best-effort
  await sendWorkflowActivityPush({
    workflowId: wf.id,
    contentCode: wf.content.code ?? null,
    contentTitle: title,
    actorName: session.user.name,
    actorRole: session.user.role,
    actorId: userId,
    eventType: "TEXT_SAVED",
  }).catch((err) => { console.error("[push] TEXT_SAVED error:", err); });

  return NextResponse.json({
    data: {
      versionNumber: newVersionNumber,
      textVersionCount: result.textVersionCount,
      submittedToC: result.submittedToC,
      lastSavedAt: result.lastSavedAt,
    },
  });
}
