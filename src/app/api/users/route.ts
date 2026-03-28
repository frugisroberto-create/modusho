import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

const querySchema = z.object({
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"]).optional(),
  propertyId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { role, propertyId, page, pageSize } = parsed.data;

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (propertyId) where.propertyAssignments = { some: { propertyId } };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
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
  password: z.string().min(6),
  role: z.enum(["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN"]),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canApprove: z.boolean().default(false),
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

  const { email, name, password, role, canView, canEdit, canApprove, propertyAssignments, contentTypes } = parsed.data;

  // Validazioni coerenza ruolo-permessi
  if (role === "OPERATOR" && (canEdit || canApprove)) {
    return NextResponse.json({ error: "Un operatore non può avere permessi di modifica o approvazione" }, { status: 400 });
  }
  if (role === "HOD" && canApprove) {
    return NextResponse.json({ error: "Un HOD non può avere permessi di approvazione" }, { status: 400 });
  }
  if (canApprove && role !== "HOTEL_MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Il permesso di approvazione richiede almeno il ruolo Hotel Manager" }, { status: 400 });
  }
  if (!canEdit && contentTypes.length > 0) {
    return NextResponse.json({ error: "Tipi contenuto non assegnabili senza permesso di modifica" }, { status: 400 });
  }

  // Solo SUPER_ADMIN può creare ADMIN
  if (role === "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può creare utenti ADMIN" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email già in uso" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name, passwordHash, role, canView, canEdit, canApprove },
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
