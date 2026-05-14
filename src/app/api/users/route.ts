import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

const querySchema = z.object({
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"]).optional(),
  propertyId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const userRole = session.user.role;
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const isHM = userRole === "HOTEL_MANAGER";

  if (!isAdmin && !isHM) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { role, propertyId, search, page, pageSize } = parsed.data;
  const isActiveParam = params.isActive;

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (isActiveParam === "true") where.isActive = true;
  else if (isActiveParam === "false") where.isActive = false;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  // HOTEL_MANAGER: accesso in sola lettura, limitato alle property assegnate
  if (isHM) {
    if (propertyId) {
      // Se specifica una propertyId, verifica che HM sia assegnato
      const hmAssignment = await prisma.propertyAssignment.findFirst({
        where: { userId: session.user.id, propertyId },
      });
      if (!hmAssignment) {
        return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
      }
      where.propertyAssignments = { some: { propertyId } };
    } else {
      // Se non specifica propertyId, scope automatico su tutte le property assegnate
      const hmProperties = await prisma.propertyAssignment.findMany({
        where: { userId: session.user.id },
        select: { propertyId: true },
      });
      if (hmProperties.length === 0) {
        return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
      }
      const hmPropertyIds = hmProperties.map((p) => p.propertyId);
      where.propertyAssignments = { some: { propertyId: { in: hmPropertyIds } } };
    }
  } else if (isAdmin) {
    // ADMIN: scope to assigned properties (SUPER_ADMIN sees all)
    if (userRole !== "SUPER_ADMIN") {
      const adminProperties = await prisma.propertyAssignment.findMany({
        where: { userId: session.user.id },
        select: { propertyId: true },
        distinct: ["propertyId"],
      });
      const adminPropertyIds = adminProperties.map((p) => p.propertyId);
      if (propertyId) {
        if (!adminPropertyIds.includes(propertyId)) {
          return NextResponse.json({ error: "Accesso negato a questa struttura" }, { status: 403 });
        }
        where.propertyAssignments = { some: { propertyId } };
      } else {
        where.propertyAssignments = { some: { propertyId: { in: adminPropertyIds } } };
      }
    } else if (propertyId) {
      where.propertyAssignments = { some: { propertyId } };
    }
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true,
        canView: true, canEdit: true, canApprove: true, canPublish: true,
        isActive: true, lastLoginAt: true, createdAt: true,
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

  return NextResponse.json({ data: users, meta: { page, pageSize, total } });
}

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  password: z.string().min(10).regex(/[A-Z]/, "Almeno una lettera maiuscola").regex(/[0-9]/, "Almeno un numero"),
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"]),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canApprove: z.boolean().default(false),
  canPublish: z.boolean().default(false),
  propertyAssignments: z.array(z.object({
    propertyId: z.string(),
    departmentId: z.string().nullable().optional(),
  })).min(1, "Almeno una struttura richiesta"),
  contentTypes: z.array(z.enum(["SOP", "DOCUMENT", "MEMO"])).default([]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });

  const { email, name, password, role, canView, canEdit, canApprove, canPublish, propertyAssignments, contentTypes } = parsed.data;

  // Validazioni coerenza ruolo-permessi
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

  // Validazione coerenza ruolo-reparti: OPERATOR, HOD e CORPORATE devono avere departmentId specifici
  if (role === "OPERATOR" || role === "HOD" || role === "CORPORATE") {
    const hasNullDept = propertyAssignments.some(a => !a.departmentId);
    if (hasNullDept) {
      const roleLabel = role === "OPERATOR" ? "Operatore" : role === "HOD" ? "HOD" : "Corporate";
      return NextResponse.json({
        error: `Un ${roleLabel} deve avere reparti specifici assegnati, non accesso a tutti i reparti`,
      }, { status: 400 });
    }
  }

  // CORPORATE con canApprove: verifica che non esista già un altro Corporate A sugli stessi reparti
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

  // Solo SUPER_ADMIN può creare ADMIN
  if (role === "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può creare utenti ADMIN" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email già in uso" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name, passwordHash, role, canView, canEdit, canApprove, canPublish },
  });

  // Property assignments
  for (const assignment of propertyAssignments) {
    await prisma.propertyAssignment.create({
      data: {
        userId: user.id,
        propertyId: assignment.propertyId,
        departmentId: assignment.departmentId || null,
      },
    });
  }

  // Content permissions
  for (const ct of contentTypes) {
    await prisma.userContentPermission.create({
      data: { userId: user.id, contentType: ct },
    });
  }

  return NextResponse.json({ data: { id: user.id } }, { status: 201 });
}
