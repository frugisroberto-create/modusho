import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true,
      canView: true, canEdit: true, canApprove: true,
      isActive: true, createdAt: true,
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

  return NextResponse.json({ data: user });
}

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN"]).optional(),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canApprove: z.boolean().optional(),
  isActive: z.boolean().optional(),
  propertyAssignments: z.array(z.object({
    propertyId: z.string(),
    departmentId: z.string().nullable().optional(),
  })).optional(),
  contentTypes: z.array(z.enum(["SOP", "DOCUMENT", "MEMO"])).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, canEdit: true, canApprove: true },
  });
  if (!target) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  // Solo SUPER_ADMIN può modificare ADMIN/SUPER_ADMIN
  if ((target.role === "ADMIN" || target.role === "SUPER_ADMIN") && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può modificare utenti ADMIN" }, { status: 403 });
  }

  const { name, email, password, role, canView, canEdit, canApprove, isActive, propertyAssignments, contentTypes } = parsed.data;

  // Unicità email
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Questa email è già utilizzata da un altro utente" }, { status: 400 });
    }
  }

  // Merge dei valori finali (PUT parziale: i campi non passati restano quelli del DB)
  const finalRole = role ?? target.role;
  const finalCanEdit = canEdit ?? target.canEdit;
  let finalCanApprove = canApprove ?? target.canApprove;

  // Coerenza ruolo↔permessi: forza i flag in conflitto invece di rifiutare
  // (la regola dello spec è che cambiare ruolo deve allineare i permessi)
  if (finalRole === "OPERATOR") {
    if (finalCanEdit) {
      return NextResponse.json({ error: "Un operatore non può avere permessi di modifica" }, { status: 400 });
    }
    if (finalCanApprove) {
      // Se il caller non passa esplicitamente canApprove ma sta downgradando un HM a OPERATOR,
      // forziamo canApprove=false per coerenza.
      if (canApprove === undefined) {
        finalCanApprove = false;
      } else {
        return NextResponse.json({ error: "Un operatore non può avere permessi di approvazione" }, { status: 400 });
      }
    }
  }
  if (finalRole === "HOD" && finalCanApprove) {
    if (canApprove === undefined) {
      finalCanApprove = false;
    } else {
      return NextResponse.json({ error: "Un HOD non può avere permessi di approvazione" }, { status: 400 });
    }
  }
  if (role === "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può assegnare ruolo ADMIN" }, { status: 403 });
  }

  // Validazione coerenza ruolo-reparti: OPERATOR e HOD non possono avere departmentId = null
  if (propertyAssignments !== undefined && (finalRole === "OPERATOR" || finalRole === "HOD")) {
    const hasNullDept = propertyAssignments.some(a => !a.departmentId);
    if (hasNullDept) {
      return NextResponse.json({
        error: `Un ${finalRole === "OPERATOR" ? "Operatore" : "HOD"} deve avere reparti specifici assegnati, non accesso a tutti i reparti`,
      }, { status: 400 });
    }
  }

  // Update user fields
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (canView !== undefined) updateData.canView = canView;
  if (canEdit !== undefined) updateData.canEdit = canEdit;
  if (canApprove !== undefined) updateData.canApprove = canApprove;
  // Persist forced coherence: se l'utente sta cambiando ruolo a OPERATOR/HOD
  // e i permessi attuali nel DB sono incompatibili, allinea
  if (role !== undefined && finalCanApprove !== target.canApprove) {
    updateData.canApprove = finalCanApprove;
  }
  if (role !== undefined && finalCanEdit !== target.canEdit) {
    updateData.canEdit = finalCanEdit;
  }
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({ where: { id }, data: updateData });

  // Replace property assignments if provided
  if (propertyAssignments !== undefined) {
    await prisma.propertyAssignment.deleteMany({ where: { userId: id } });
    for (const a of propertyAssignments) {
      await prisma.propertyAssignment.create({
        data: { userId: id, propertyId: a.propertyId, departmentId: a.departmentId || null },
      });
    }
  }

  // Replace content permissions if provided
  if (contentTypes !== undefined) {
    await prisma.userContentPermission.deleteMany({ where: { userId: id } });
    for (const ct of contentTypes) {
      await prisma.userContentPermission.create({
        data: { userId: id, contentType: ct },
      });
    }
  }

  return NextResponse.json({ data: { id, success: true } });
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

  return NextResponse.json({ data: { deactivated: true } });
}
