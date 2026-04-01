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

  if (!wf || wf.content.status === "ARCHIVED" && false) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // Visibilita' bozza: R/C/A oppure ADMIN/SUPER_ADMIN possono vedere la bozza
  const userRole = session.user.role;
  if (wf.sopStatus === "IN_LAVORAZIONE") {
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN" && !canViewDraft(userId, wf)) {
      return NextResponse.json({ error: "Non hai accesso a questa bozza" }, { status: 403 });
    }
  }

  const myRole = getRaciRole(userId, wf);

  return NextResponse.json({
    data: {
      id: wf.id,
      contentId: wf.content.id,
      code: wf.content.code,
      title: wf.content.title,
      body: wf.content.body,
      sopStatus: wf.sopStatus,
      contentStatus: wf.content.status,
      myRole,
      submittedToC: wf.submittedToC,
      submittedToCAt: wf.submittedToCAt,
      submittedToA: wf.submittedToA,
      submittedToAAt: wf.submittedToAAt,
      reviewDueDate: wf.reviewDueDate,
      reviewDueMonths: wf.reviewDueMonths,
      needsReview: needsReview({ sopStatus: wf.sopStatus, reviewDueDate: wf.reviewDueDate }),
      lastSavedAt: wf.lastSavedAt,
      textVersionCount: wf.textVersionCount,
      canEditText: canEditText(userId, wf, userRole),
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
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // Solo R puo' modificare il testo (o ADMIN/SUPER_ADMIN pre-submit)
  const userRole = session.user.role;
  if (!canEditText(userId, wf, userRole)) {
    // Messaggio specifico per C/A quando la bozza e' sottoposta
    if (isInvolved(userId, wf) && (wf.submittedToC || wf.submittedToA)) {
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
    await tx.content.update({
      where: { id: wf.contentId },
      data: { title, body, updatedById: userId, version: newVersionNumber },
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

  return NextResponse.json({
    data: {
      versionNumber: newVersionNumber,
      textVersionCount: result.textVersionCount,
      submittedToC: result.submittedToC,
      lastSavedAt: result.lastSavedAt,
    },
  });
}
