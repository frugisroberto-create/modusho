import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { issueToken } from "@/lib/auth-tokens";
import { buildActivationEmail, sendEmail, getAppUrl } from "@/lib/email";
import { recordUserAudit } from "@/lib/user-audit";
import { loadActor, loadTarget, validateAssignments, validateDepartmentIds } from "@/lib/user-scope-db";
import {
  canViewUser,
  canEditField,
  canChangeRole,
  canToggleCreateFlag,
  canDeactivateUser,
  canSendActivation,
  canSendReset,
  getEditableFields,
  getAssignableRoles,
  getRolePresets,
  isDemotionToOperator,
} from "@/lib/user-scope";
import { getTouchedFields, sameAssignments, sameDepartmentIds } from "@/lib/user-field-touches";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;

  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  if (!canViewUser(actor, target)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true,
      canView: true, canEdit: true, canApprove: true, canPublish: true,
      targetDepartmentIds: true, viewDepartmentIds: true,
      canCreateUsers: true, activatedAt: true, createdById: true,
      isActive: true, createdAt: true, lastLoginAt: true,
      createdBy: { select: { id: true, name: true, role: true } },
      propertyAssignments: {
        include: {
          property: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
      contentPermissions: { select: { id: true, contentType: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  const lastInvite = user.activatedAt
    ? null
    : await prisma.authToken.findFirst({
        where: { userId: id, type: "ACTIVATION" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

  // La UI si accende in base a questo: i comandi che il server non accetterebbe
  // non devono nemmeno comparire.
  //
  // I due flag di invio sono calcolati dalle STESSE funzioni che autorizzano le
  // rotte `send-activation` e `send-reset`. Il client non deve dedurli da un
  // elenco di ruoli proprio: una regola scritta in due posti diverge, ed è
  // esattamente così che l'Hotel Manager si era ritrovato senza quei comandi.
  const permissions = {
    editableFields: getEditableFields(actor, target),
    assignableRoles: getAssignableRoles(actor, target),
    canSendActivation: canSendActivation(actor, target).allowed,
    canSendReset: canSendReset(actor, target).allowed,
  };

  return NextResponse.json({
    data: { ...user, lastInviteAt: lastInvite?.createdAt ?? null },
    permissions,
  });
}

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"]).optional(),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canApprove: z.boolean().optional(),
  canPublish: z.boolean().optional(),
  canCreateUsers: z.boolean().optional(),
  targetDepartmentIds: z.array(z.string()).optional(),
  viewDepartmentIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  propertyAssignments: z.array(z.object({
    propertyId: z.string(),
    departmentId: z.string().nullable().optional(),
  })).optional(),
  contentTypes: z.array(z.enum(["SOP", "DOCUMENT", "MEMO"])).optional(),
  /** Motivazione del cambio di ruolo: facoltativa, finisce a registro. */
  note: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { id } = await params;

  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  if (!canViewUser(actor, target)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const {
    name, email, role, canView, canEdit, canApprove, canPublish, canCreateUsers,
    targetDepartmentIds, viewDepartmentIds, isActive, propertyAssignments, contentTypes, note,
  } = parsed.data;

  // I valori attuali servono per intero: il perimetro si applica a ciò che
  // CAMBIA, quindi ogni campo modificabile va confrontato con il suo valore
  // di adesso — relazioni comprese.
  const current = await prisma.user.findUnique({
    where: { id },
    select: {
      role: true, name: true, email: true, isActive: true,
      canView: true, canEdit: true, canApprove: true, canPublish: true,
      canCreateUsers: true,
      targetDepartmentIds: true, viewDepartmentIds: true,
      propertyAssignments: { select: { propertyId: true, departmentId: true } },
      contentPermissions: { select: { contentType: true } },
    },
  });
  if (!current) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  // ─── Cosa è stato toccato davvero ───
  //
  // Il form rimanda SEMPRE tutti i campi, anche quelli che nessuno ha
  // sfiorato: leggere la sola PRESENZA di un campo come volontà di cambiarlo
  // faceva scattare il perimetro su dati identici. Un Hotel Manager che
  // promuoveva un operatore a capo reparto si prendeva un 403 sui tipi di
  // contenuto (concessi solo sugli HOD) e sull'email (concessa solo prima
  // dell'attivazione) senza aver toccato né gli uni né l'altra.
  const touched = getTouchedFields(
    {
      name, email, role, canView, canEdit, canApprove, canPublish, canCreateUsers,
      targetDepartmentIds, viewDepartmentIds, isActive, propertyAssignments, contentTypes,
    },
    {
      name: current.name,
      email: current.email,
      role: current.role,
      canView: current.canView,
      canEdit: current.canEdit,
      canApprove: current.canApprove,
      canPublish: current.canPublish,
      canCreateUsers: current.canCreateUsers,
      targetDepartmentIds: current.targetDepartmentIds ?? [],
      viewDepartmentIds: current.viewDepartmentIds ?? [],
      isActive: current.isActive,
      // Le due relazioni arrivano sempre valorizzate dalla select qui sopra.
      // Il fallback tiene il confronto dal lato prudente: senza valore attuale
      // tutto risulta toccato, quindi il perimetro si applica invece di tacere.
      propertyAssignments: current.propertyAssignments ?? [],
      contentTypes: (current.contentPermissions ?? []).map((p) => p.contentType),
    }
  );

  const roleChanges = touched.includes("role");
  const isPromotion = roleChanges && current.role === "OPERATOR" && role === "HOD";
  const isDemotion = roleChanges && isDemotionToOperator(current.role, role!);
  // Nei due travasi fra operativo e capo reparto i tipi di contenuto li
  // riscrive il sistema coi preset del ruolo nuovo: quello che è arrivato
  // nella richiesta non finisce a database.
  const presetsOverrideContentTypes = isPromotion || isDemotion;

  // ─── Perimetro campo per campo: ogni dato toccato dev'essere concesso ───
  for (const field of touched) {
    // Un dato che il server scrive da sé non si giudica sul ruolo vecchio:
    // giudicarlo lì significava negare a un Hotel Manager la promozione di un
    // operatore, perché i tipi di contenuto gli sono concessi solo sugli HOD.
    if (field === "contentTypes" && presetsOverrideContentTypes) continue;

    const verdict = canEditField(actor, target, field);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Perimetro sui VALORI: chi può toccare "departments" può comunque
  // scriverci solo dentro il proprio perimetro. La cancellazione e ricrea-
  // zione delle assegnazioni più sotto non deve mai partire da un valore
  // fuori raggio: qui si nega PRIMA di qualunque scrittura.
  //
  // Anche qui vale il criterio del cambiamento: rimandare indietro le
  // assegnazioni che l'utente ha già non è assegnarle. Un operatore con una
  // struttura fuori dal perimetro dell'Hotel Manager resta visibile a
  // quell'HM (basta un'intersezione), e il form gliela rimanda: giudicarla
  // ogni volta bloccava salvataggi che non spostavano nessuno ───
  const assignmentsChanged =
    propertyAssignments !== undefined &&
    !sameAssignments(propertyAssignments, current.propertyAssignments ?? []);
  const viewDeptsChanged = touched.includes("viewDepartmentIds");
  const targetDeptsChanged =
    targetDepartmentIds !== undefined &&
    !sameDepartmentIds(targetDepartmentIds, current.targetDepartmentIds ?? []);

  if (assignmentsChanged) {
    const assignmentVerdict = await validateAssignments(actor, propertyAssignments!, {
      outsideProperty: "Non puoi assegnare questo utente a una struttura fuori dal tuo perimetro.",
      outsideDepartment: "Non puoi assegnare questo utente a un reparto fuori dal tuo perimetro.",
    });
    if (!assignmentVerdict.allowed) {
      return NextResponse.json({ error: assignmentVerdict.reason }, { status: 403 });
    }
  }

  if (viewDeptsChanged) {
    const viewDeptVerdict = await validateDepartmentIds(actor, viewDepartmentIds!, {
      outsideProperty: "Non puoi assegnare visibilità su una struttura fuori dal tuo perimetro.",
      outsideDepartment: "Non puoi assegnare visibilità su un reparto fuori dal tuo perimetro.",
    });
    if (!viewDeptVerdict.allowed) {
      return NextResponse.json({ error: viewDeptVerdict.reason }, { status: 403 });
    }
  }

  if (targetDeptsChanged) {
    const targetDeptVerdict = await validateDepartmentIds(actor, targetDepartmentIds!, {
      outsideProperty: "Non puoi assegnare un reparto destinatario di una struttura fuori dal tuo perimetro.",
      outsideDepartment: "Non puoi assegnare un reparto destinatario fuori dal tuo perimetro.",
    });
    if (!targetDeptVerdict.allowed) {
      return NextResponse.json({ error: targetDeptVerdict.reason }, { status: 403 });
    }
  }

  // ─── Cambio ruolo ───
  if (roleChanges) {
    const verdict = canChangeRole(actor, target, role!);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Flag di creazione utenti ───
  if (touched.includes("canCreateUsers")) {
    const verdict = canToggleCreateFlag(actor, target);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Disattivazione ───
  if (touched.includes("isActive")) {
    const verdict = canDeactivateUser(actor, target);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Email: identificativo unico ───
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail && normalizedEmail !== current.email) {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Questa email è già utilizzata da un altro utente" }, { status: 400 });
    }
  }

  const isAdminActor = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
  const finalRole = role ?? current.role;

  // Si scrive solo ciò che cambia: un campo rimandato indietro identico non
  // ha nulla da dire al database.
  const updateData: Record<string, unknown> = {};
  if (touched.includes("name")) updateData.name = name!.trim();
  if (touched.includes("email")) updateData.email = normalizedEmail;
  if (roleChanges) updateData.role = role;
  if (targetDeptsChanged) updateData.targetDepartmentIds = targetDepartmentIds;
  if (viewDeptsChanged) updateData.viewDepartmentIds = viewDepartmentIds;
  if (touched.includes("isActive")) updateData.isActive = isActive;
  if (touched.includes("canCreateUsers")) updateData.canCreateUsers = canCreateUsers;

  // I flag di potere li tocca solo chi ne ha titolo.
  if (isAdminActor && touched.includes("permissionFlags")) {
    if (canView !== undefined) updateData.canView = canView;
    if (canEdit !== undefined) updateData.canEdit = canEdit;
    if (canApprove !== undefined) updateData.canApprove = canApprove;
    if (canPublish !== undefined) updateData.canPublish = canPublish;
  }

  // Il cambio di ruolo riallinea i permessi tramite i preset: chi promuove non
  // sceglie i flag, li riceve dal sistema. canCreateUsers NON è mai automatico.
  let presetContentTypes: string[] | null = null;
  if (roleChanges) {
    const presets = getRolePresets(role!);
    updateData.canView = presets.canView;
    updateData.canEdit = presets.canEdit;
    updateData.canApprove = presets.canApprove;
    if (!isAdminActor) updateData.canPublish = presets.canPublish;
    if (isPromotion) presetContentTypes = presets.contentTypes;
    if (isDemotion) {
      presetContentTypes = [];
      // Un operatore non crea utenti.
      updateData.canCreateUsers = false;
    }
  }

  // ─── Coerenza ruolo↔reparti (regola preesistente) ───
  if (propertyAssignments !== undefined && (finalRole === "OPERATOR" || finalRole === "HOD" || finalRole === "CORPORATE")) {
    const hasNullDept = propertyAssignments.some((a) => !a.departmentId);
    if (hasNullDept) {
      const roleLabel = finalRole === "OPERATOR" ? "Operatore" : finalRole === "HOD" ? "HOD" : "Corporate";
      return NextResponse.json({
        error: `Un ${roleLabel} deve avere reparti specifici assegnati, non accesso a tutti i reparti`,
      }, { status: 400 });
    }
  }

  if (role === "ADMIN" && actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può assegnare ruolo ADMIN" }, { status: 403 });
  }

  await prisma.user.update({ where: { id }, data: updateData });

  if (assignmentsChanged) {
    // Cancellazione e ricreazione in una transazione: senza, una create che
    // fallisce a metà lascerebbe l'utente senza alcuna assegnazione — le
    // righe già cancellate non tornerebbero indietro da sole.
    await prisma.$transaction(async (tx) => {
      await tx.propertyAssignment.deleteMany({ where: { userId: id } });
      for (const a of propertyAssignments!) {
        await tx.propertyAssignment.create({
          data: { userId: id, propertyId: a.propertyId, departmentId: a.departmentId || null },
        });
      }
    });
  }

  // I tipi di contenuto seguono il ruolo quando il ruolo cambia. Se il ruolo
  // resta e l'elenco è identico a quello di adesso, non c'è nulla da riscrivere.
  const finalContentTypes = presetContentTypes ?? (touched.includes("contentTypes") ? contentTypes : undefined);
  if (finalContentTypes !== undefined && finalContentTypes !== null) {
    await prisma.userContentPermission.deleteMany({ where: { userId: id } });
    for (const ct of finalContentTypes) {
      await prisma.userContentPermission.create({
        data: { userId: id, contentType: ct as "SOP" | "DOCUMENT" | "MEMO" },
      });
    }
  }

  // ─── Registro di governance ───
  if (roleChanges) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: "ROLE_CHANGED",
      note,
      meta: { from: current.role, to: role },
    });
  }

  if (touched.includes("canCreateUsers")) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: "FLAG_CHANGED",
      meta: { flag: "canCreateUsers", from: current.canCreateUsers, to: canCreateUsers },
    });
  }

  if (touched.includes("isActive")) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: isActive ? "REACTIVATED" : "DEACTIVATED",
      note,
    });
  }

  // ─── Email cambiata prima dell'attivazione: l'invito va rifatto ───
  let inviteResent = false;
  if (touched.includes("email")) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: "EMAIL_CHANGED",
      meta: { from: current.email, to: normalizedEmail },
    });

    if (target.activatedAt === null) {
      // issueToken fa scadere i token ACTIVATION precedenti: il vecchio link muore.
      const { token } = await issueToken({
        userId: id,
        type: "ACTIVATION",
        createdById: actor.id,
      });

      const context = await prisma.propertyAssignment.findFirst({
        where: { userId: id },
        select: {
          property: { select: { name: true } },
          department: { select: { name: true } },
        },
      });

      const result = await sendEmail(
        buildActivationEmail({
          name: name?.trim() ?? current.name,
          email: normalizedEmail!,
          activationUrl: `${getAppUrl()}/attiva/${token}`,
          propertyName: context?.property?.name ?? null,
          departmentName: context?.department?.name ?? null,
        })
      );
      inviteResent = result.ok;

      await recordUserAudit({
        userId: id,
        actorId: actor.id,
        action: "INVITE_SENT",
        meta: { adapter: result.adapter, ok: result.ok, reason: "email-changed" },
      });
    }
  }

  return NextResponse.json({ data: { id, success: true, inviteResent } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può eliminare utenti" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Non puoi eliminare te stesso" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, email: true, isActive: true } });
  if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  if (!user.isActive) {
    return NextResponse.json({ error: "Utente già disattivato" }, { status: 400 });
  }

  // Check if user is R/C/A in active workflows (draft/working state)
  const activeWorkflows = await prisma.sopWorkflow.count({
    where: {
      content: {
        status: { in: ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"] },
      },
      OR: [
        { responsibleId: id },
        { consultedId: id },
        { accountableId: id },
      ],
    },
  });
  if (activeWorkflows > 0) {
    return NextResponse.json({
      error: `Impossibile disattivare: l'utente è coinvolto in ${activeWorkflows} SOP in lavorazione. Riassegnare prima i ruoli RACI.`,
    }, { status: 409 });
  }

  // SOFT DELETE: preserva l'audit trail (riferimenti createdById, authorId,
  // SopWorkflowEvent.actorId, ContentNote.authorId, ecc. restano intatti).
  // L'utente non può più loggare (isActive=false + passwordHash vuoto).
  // L'email originale viene rinominata per liberarla per riuso futuro.
  const timestamp = Date.now();
  await prisma.user.update({
    where: { id },
    data: {
      isActive: false,
      passwordHash: "",
      email: `${user.email}_DEACTIVATED_${timestamp}`,
    },
  });

  await recordUserAudit({
    userId: id,
    actorId: session.user.id,
    action: "DEACTIVATED",
    meta: { hard: true },
  });

  return NextResponse.json({ data: { deactivated: true } });
}
