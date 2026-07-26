import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { issueToken } from "@/lib/auth-tokens";
import { buildActivationEmail, sendEmail, getAppUrl } from "@/lib/email";
import { recordUserAudit } from "@/lib/user-audit";
import { loadActor, loadTarget } from "@/lib/user-scope-db";
import {
  canViewUser,
  canEditField,
  canChangeRole,
  canToggleCreateFlag,
  canDeactivateUser,
  getEditableFields,
  getAssignableRoles,
  getRolePresets,
  requiresDemotionNote,
} from "@/lib/user-scope";

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
  const permissions = {
    editableFields: getEditableFields(actor, target),
    assignableRoles: getAssignableRoles(actor, target),
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
  /** Motivazione: obbligatoria per la retrocessione HOD → Operatore. */
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

  const current = await prisma.user.findUnique({
    where: { id },
    select: { role: true, canEdit: true, canApprove: true, email: true, name: true, isActive: true, canCreateUsers: true },
  });
  if (!current) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  // ─── Perimetro campo per campo: ogni dato toccato dev'essere concesso ───
  const touches: Array<[boolean, Parameters<typeof canEditField>[2]]> = [
    [name !== undefined, "name"],
    [email !== undefined, "email"],
    [role !== undefined, "role"],
    [canView !== undefined || canEdit !== undefined || canApprove !== undefined || canPublish !== undefined, "permissionFlags"],
    [canCreateUsers !== undefined, "canCreateUsers"],
    [propertyAssignments !== undefined || targetDepartmentIds !== undefined, "departments"],
    [viewDepartmentIds !== undefined, "viewDepartmentIds"],
    [contentTypes !== undefined, "contentTypes"],
    [isActive !== undefined, "isActive"],
  ];

  for (const [isTouched, field] of touches) {
    if (!isTouched) continue;
    const verdict = canEditField(actor, target, field);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Cambio ruolo ───
  if (role !== undefined && role !== current.role) {
    const verdict = canChangeRole(actor, target, role, note);
    if (!verdict.allowed) {
      // La nota mancante è un errore di compilazione, non di permesso.
      const status = verdict.reason === "La motivazione è obbligatoria" ? 400 : 403;
      return NextResponse.json({ error: verdict.reason }, { status });
    }
  }

  // ─── Flag di creazione utenti ───
  if (canCreateUsers !== undefined && canCreateUsers !== current.canCreateUsers) {
    const verdict = canToggleCreateFlag(actor, target);
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  // ─── Disattivazione ───
  if (isActive !== undefined && isActive !== current.isActive) {
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
  const isPromotion = role !== undefined && current.role === "OPERATOR" && role === "HOD";
  const isDemotion = role !== undefined && requiresDemotionNote(current.role, role);

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (normalizedEmail !== undefined) updateData.email = normalizedEmail;
  if (role !== undefined) updateData.role = role;
  if (targetDepartmentIds !== undefined) updateData.targetDepartmentIds = targetDepartmentIds;
  if (viewDepartmentIds !== undefined) updateData.viewDepartmentIds = viewDepartmentIds;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (canCreateUsers !== undefined) updateData.canCreateUsers = canCreateUsers;

  // I flag di potere li tocca solo chi ne ha titolo.
  if (isAdminActor) {
    if (canView !== undefined) updateData.canView = canView;
    if (canEdit !== undefined) updateData.canEdit = canEdit;
    if (canApprove !== undefined) updateData.canApprove = canApprove;
    if (canPublish !== undefined) updateData.canPublish = canPublish;
  }

  // Il cambio di ruolo riallinea i permessi tramite i preset: chi promuove non
  // sceglie i flag, li riceve dal sistema. canCreateUsers NON è mai automatico.
  let presetContentTypes: string[] | null = null;
  if (role !== undefined && role !== current.role) {
    const presets = getRolePresets(role);
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

  if (propertyAssignments !== undefined) {
    await prisma.propertyAssignment.deleteMany({ where: { userId: id } });
    for (const a of propertyAssignments) {
      await prisma.propertyAssignment.create({
        data: { userId: id, propertyId: a.propertyId, departmentId: a.departmentId || null },
      });
    }
  }

  // I tipi di contenuto seguono il ruolo quando il ruolo cambia.
  const finalContentTypes = presetContentTypes ?? contentTypes;
  if (finalContentTypes !== undefined && finalContentTypes !== null) {
    await prisma.userContentPermission.deleteMany({ where: { userId: id } });
    for (const ct of finalContentTypes) {
      await prisma.userContentPermission.create({
        data: { userId: id, contentType: ct as "SOP" | "DOCUMENT" | "MEMO" },
      });
    }
  }

  // ─── Registro di governance ───
  if (role !== undefined && role !== current.role) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: "ROLE_CHANGED",
      note,
      meta: { from: current.role, to: role },
    });
  }

  if (canCreateUsers !== undefined && canCreateUsers !== current.canCreateUsers) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: "FLAG_CHANGED",
      meta: { flag: "canCreateUsers", from: current.canCreateUsers, to: canCreateUsers },
    });
  }

  if (isActive !== undefined && isActive !== current.isActive) {
    await recordUserAudit({
      userId: id,
      actorId: actor.id,
      action: isActive ? "REACTIVATED" : "DEACTIVATED",
      note,
    });
  }

  // ─── Email cambiata prima dell'attivazione: l'invito va rifatto ───
  let inviteResent = false;
  if (normalizedEmail && normalizedEmail !== current.email) {
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
          email: normalizedEmail,
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
