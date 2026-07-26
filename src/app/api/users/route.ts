import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { issueToken } from "@/lib/auth-tokens";
import { buildActivationEmail, sendEmail, getAppUrl } from "@/lib/email";
import { recordUserAudit } from "@/lib/user-audit";
import { loadActor, buildVisibilityWhere } from "@/lib/user-scope-db";
import {
  canAccessUserManagement,
  canCreateUser,
  getRolePresets,
  getVisibleRoles,
  isSameName,
} from "@/lib/user-scope";

const querySchema = z.object({
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"]).optional(),
  propertyId: z.string().optional(),
  search: z.string().optional(),
  /** Filtro sullo stato di attivazione. */
  activation: z.enum(["all", "pending", "activated"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  // CORPORATE mantiene l'accesso in sola lettura storico; OPERATOR mai.
  const isCorporate = session.user.role === "CORPORATE";
  if (!canAccessUserManagement(session.user) && !isCorporate) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { role, propertyId, search, activation, page, pageSize } = parsed.data;
  const isActiveParam = params.isActive;

  // Perimetro: la clausola di visibilità è la traduzione SQL di canViewUser.
  const scopeWhere = isCorporate
    ? {
        propertyAssignments: { some: { propertyId: { in: actor.propertyIds } } },
      }
    : buildVisibilityWhere(actor);

  const filters: Record<string, unknown>[] = [];

  if (role) {
    // Un ruolo fuori dal perimetro non allarga la vista: restringe a nulla.
    const visible = isCorporate
      ? ["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"]
      : getVisibleRoles(actor);
    if (!visible.includes(role)) {
      return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
    }
    filters.push({ role });
  }

  if (isActiveParam === "true") filters.push({ isActive: true });
  else if (isActiveParam === "false") filters.push({ isActive: false });

  if (activation === "pending") filters.push({ activatedAt: null });
  else if (activation === "activated") filters.push({ activatedAt: { not: null } });

  if (search) {
    filters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (propertyId) {
    if (actor.role !== "SUPER_ADMIN" && !actor.propertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
    }
    filters.push({ propertyAssignments: { some: { propertyId } } });
  }

  const where = { AND: [scopeWhere, ...filters] };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true,
        canView: true, canEdit: true, canApprove: true, canPublish: true,
        canCreateUsers: true, activatedAt: true, createdById: true,
        isActive: true, lastLoginAt: true, createdAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
        propertyAssignments: {
          include: {
            property: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
        contentPermissions: { select: { contentType: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  // Data dell'ultimo invito, in una sola query per l'intera pagina.
  const pendingIds = users.filter((u) => u.activatedAt === null).map((u) => u.id);
  const lastInvites = pendingIds.length
    ? await prisma.authToken.groupBy({
        by: ["userId"],
        where: { userId: { in: pendingIds }, type: "ACTIVATION" },
        _max: { createdAt: true },
      })
    : [];
  const lastInviteByUser = new Map(
    lastInvites.map((row) => [row.userId, row._max.createdAt ?? null])
  );

  const data = users.map((user) => ({
    ...user,
    lastInviteAt: lastInviteByUser.get(user.id) ?? null,
  }));

  return NextResponse.json({ data, meta: { page, pageSize, total } });
}

// La password NON è più un campo: ogni utente sceglie la propria attivandosi.
const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"]),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canApprove: z.boolean().default(false),
  canPublish: z.boolean().default(false),
  targetDepartmentIds: z.array(z.string()).default([]),
  viewDepartmentIds: z.array(z.string()).default([]),
  propertyAssignments: z.array(z.object({
    propertyId: z.string(),
    departmentId: z.string().nullable().optional(),
  })).min(1, "Almeno una struttura richiesta"),
  contentTypes: z.array(z.enum(["SOP", "DOCUMENT", "MEMO"])).default([]),
  /** L'utente ha già visto l'avviso sui nomi simili e vuole procedere. */
  confirmDuplicateName: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const {
    email, name, role, targetDepartmentIds, viewDepartmentIds,
    propertyAssignments, confirmDuplicateName,
  } = parsed.data;

  // ─── Perimetro: ogni assegnazione deve stare nel raggio dell'attore ───
  for (const assignment of propertyAssignments) {
    const verdict = canCreateUser(actor, {
      role,
      propertyId: assignment.propertyId,
      departmentId: assignment.departmentId ?? null,
    });
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.reason }, { status: 403 });
    }
  }

  const isAdminActor = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
  const presets = getRolePresets(role);

  // HM e HOD non scelgono i flag: li riceve il sistema dai preset di ruolo.
  const canView = isAdminActor ? parsed.data.canView : presets.canView;
  const canEdit = isAdminActor ? parsed.data.canEdit : presets.canEdit;
  const canApprove = isAdminActor ? parsed.data.canApprove : presets.canApprove;
  const canPublish = isAdminActor ? parsed.data.canPublish : presets.canPublish;
  const contentTypes = isAdminActor ? parsed.data.contentTypes : presets.contentTypes;

  // ─── Coerenza ruolo↔permessi (regole preesistenti) ───
  if (role === "OPERATOR" && (canEdit || canApprove)) {
    return NextResponse.json({ error: "Un operatore non può avere permessi di modifica o approvazione" }, { status: 400 });
  }
  if (role === "HOD" && canApprove) {
    return NextResponse.json({ error: "Un HOD non può avere permessi di approvazione" }, { status: 400 });
  }
  if (canApprove && role !== "HOTEL_MANAGER" && role !== "CORPORATE" && role !== "ADMIN") {
    return NextResponse.json({ error: "Il permesso di approvazione richiede almeno il ruolo Hotel Manager" }, { status: 400 });
  }
  if (!canEdit && contentTypes.length > 0) {
    return NextResponse.json({ error: "Tipi contenuto non assegnabili senza permesso di modifica" }, { status: 400 });
  }

  if (role === "OPERATOR" || role === "HOD" || role === "CORPORATE") {
    const hasNullDept = propertyAssignments.some((a) => !a.departmentId);
    if (hasNullDept) {
      const roleLabel = role === "OPERATOR" ? "Operatore" : role === "HOD" ? "HOD" : "Corporate";
      return NextResponse.json({
        error: `Un ${roleLabel} deve avere reparti specifici assegnati, non accesso a tutti i reparti`,
      }, { status: 400 });
    }
  }

  if (role === "CORPORATE" && canApprove) {
    for (const assignment of propertyAssignments) {
      if (!assignment.departmentId) continue;
      const existing = await prisma.propertyAssignment.findFirst({
        where: {
          propertyId: assignment.propertyId,
          departmentId: assignment.departmentId,
          user: { role: "CORPORATE", canApprove: true, isActive: true },
        },
        select: { user: { select: { name: true } } },
      });
      if (existing) {
        const dept = await prisma.department.findUnique({ where: { id: assignment.departmentId }, select: { name: true } });
        return NextResponse.json({
          error: `${existing.user.name} è già Accountable per il reparto ${dept?.name || assignment.departmentId}. Può esserci un solo Corporate con approvazione per reparto.`,
        }, { status: 400 });
      }
    }
  }

  if (role === "ADMIN" && actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può creare utenti ADMIN" }, { status: 403 });
  }

  // ─── Email: identificativo unico ───
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "Questa email è già registrata in ModusHO. Ogni persona ha un solo accesso: controlla se è già in elenco." },
      { status: 409 }
    );
  }

  // ─── Doppioni di nome: avviso NON bloccante ───
  if (!confirmDuplicateName) {
    const propertyIds = propertyAssignments.map((a) => a.propertyId);
    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        propertyAssignments: { some: { propertyId: { in: propertyIds } } },
      },
      select: { id: true, name: true, role: true },
    });
    const twin = candidates.find((c) => isSameName(c.name, name));
    if (twin) {
      return NextResponse.json(
        {
          warning: {
            code: "DUPLICATE_NAME",
            message: `In questa struttura c'è già ${twin.name}. Se è la stessa persona non crearne un altro: ogni persona ha un solo accesso.`,
          },
        },
        { status: 409 }
      );
    }
  }

  // ─── Creazione: nessuna password, l'utente se la sceglie attivandosi ───
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: "", // vuoto = nessun accesso possibile finché non si attiva
      role,
      canView, canEdit, canApprove, canPublish,
      targetDepartmentIds, viewDepartmentIds,
      activatedAt: null,
      createdById: actor.id,
      // canCreateUsers non si accende mai in automatico: è sempre una concessione.
    },
  });

  for (const assignment of propertyAssignments) {
    await prisma.propertyAssignment.create({
      data: {
        userId: user.id,
        propertyId: assignment.propertyId,
        departmentId: assignment.departmentId || null,
      },
    });
  }

  for (const ct of contentTypes) {
    await prisma.userContentPermission.create({
      data: { userId: user.id, contentType: ct },
    });
  }

  await recordUserAudit({
    userId: user.id,
    actorId: actor.id,
    action: "CREATED",
    meta: { role, propertyIds: propertyAssignments.map((a) => a.propertyId) },
  });

  // ─── Invito di attivazione, automatico ───
  const { token } = await issueToken({
    userId: user.id,
    type: "ACTIVATION",
    createdById: actor.id,
  });

  const context = await prisma.propertyAssignment.findFirst({
    where: { userId: user.id },
    select: {
      property: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

  const emailResult = await sendEmail(
    buildActivationEmail({
      name: user.name,
      email: user.email,
      activationUrl: `${getAppUrl()}/attiva/${token}`,
      propertyName: context?.property?.name ?? null,
      departmentName: context?.department?.name ?? null,
    })
  );

  await recordUserAudit({
    userId: user.id,
    actorId: actor.id,
    action: "INVITE_SENT",
    meta: { adapter: emailResult.adapter, ok: emailResult.ok },
  });

  if (!emailResult.ok) {
    console.error(`[users] invito non inviato userId=${user.id} — ${emailResult.error}`);
  }

  return NextResponse.json(
    {
      data: {
        id: user.id,
        inviteSent: emailResult.ok,
        email: user.email,
      },
    },
    { status: 201 }
  );
}
