import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { canEditTargetsInWorkflow } from "@/lib/sop-workflow";
import { checkAudienceForUser } from "@/lib/target-audience-scope-db";
import { buildTargetRows, describeTargetChanges, diffTargets, idsInDiff, targetKey, type TargetRow } from "@/lib/target-diff";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const targetsSchema = z.object({
  targetAllDepartments: z.boolean().default(false),
  targetDepartmentIds: z.array(z.string()).default([]),
  targetRoles: z.array(z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER"])).default([]),
  targetUserIds: z.array(z.string()).default([]),
});

/**
 * PUT: modifica dei destinatari di una SOP in lavorazione.
 * - Hotel Manager, ADMIN, SUPER_ADMIN, oppure l'Accountable della SOP
 * - Solo prima della pubblicazione (DRAFT, REVIEW_HM, REVIEW_ADMIN, RETURNED)
 * - Perimetro dei reparti: target-audience-scope (il Corporate Accountable resta nei suoi)
 * - Almeno un destinatario; nessuna scrittura se non cambia nulla
 * - Traccia nella cronologia del workflow e nello storico del contenuto
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const parsed = targetsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true, contentId: true, responsibleId: true, consultedId: true, accountableId: true,
      submittedToC: true, submittedToA: true,
      content: {
        select: {
          status: true, propertyId: true,
          targetAudience: { select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true } },
        },
      },
    },
  });
  if (!wf) return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });

  const wfInfo = {
    contentStatus: wf.content.status,
    responsibleId: wf.responsibleId,
    consultedId: wf.consultedId,
    accountableId: wf.accountableId,
    submittedToC: wf.submittedToC,
    submittedToA: wf.submittedToA,
  };

  if (!canEditTargetsInWorkflow(userId, role, wfInfo)) {
    const inLavorazione = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"].includes(wf.content.status);
    return NextResponse.json({
      error: inLavorazione
        ? "I destinatari di una SOP in lavorazione li modificano l'Hotel Manager o l'Accountable"
        : "Dopo la pubblicazione i destinatari si modificano da «Modifica reparto e destinatari»",
    }, { status: inLavorazione ? 403 : 400 });
  }

  const hasAccess = await checkAccess(userId, "OPERATOR", wf.content.propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Non hai accesso a questa struttura" }, { status: 403 });

  const proposal = {
    allDepartments: parsed.data.targetAllDepartments,
    roles: parsed.data.targetRoles,
    departmentIds: parsed.data.targetDepartmentIds,
    userIds: parsed.data.targetUserIds,
  };
  const audience = await checkAudienceForUser(userId, role, wf.content.propertyId, proposal);
  if (!audience.allowed) return NextResponse.json({ error: audience.reason }, { status: 403 });

  const next = buildTargetRows(proposal);
  if (next.length === 0) return NextResponse.json({ error: "Indica almeno un destinatario" }, { status: 400 });

  const current = wf.content.targetAudience as TargetRow[];
  const diff = diffTargets(current, next);
  if (!diff.changed) return NextResponse.json({ data: { changed: false } });

  const { departmentIds, userIds } = idsInDiff(diff);
  const [depts, users] = await Promise.all([
    departmentIds.length ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
  ]);
  const note = `Destinatari modificati — ${describeTargetChanges(diff, {
    departments: new Map(depts.map((d) => [d.id, d.name])),
    users: new Map(users.map((u) => [u.id, u.name])),
  })}`;

  await prisma.$transaction([
    prisma.contentTarget.deleteMany({ where: { contentId: wf.contentId } }),
    prisma.contentTarget.createMany({ data: next.map((t) => ({ contentId: wf.contentId, ...t })) }),
    // L'enum degli eventi non ha un tipo dedicato: come la riassegnazione RACI,
    // l'azione vera sta in metadata.action e la cronologia la etichetta da lì.
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "NOTE_ADDED",
        actorId: userId,
        note,
        metadata: { action: "targets-change", previous: current.map(targetKey), new: next.map(targetKey) },
      },
    }),
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: wf.content.status,
        toStatus: wf.content.status,
        changedById: userId,
        note,
      },
    }),
  ]);

  return NextResponse.json({ data: { changed: true } });
}
