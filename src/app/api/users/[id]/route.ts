import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  // Solo SUPER_ADMIN può modificare ADMIN/SUPER_ADMIN
  if ((target.role === "ADMIN" || target.role === "SUPER_ADMIN") && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può modificare utenti ADMIN" }, { status: 403 });
  }

  const { name, role, canView, canEdit, canApprove, isActive, propertyAssignments, contentTypes } = parsed.data;

  const finalRole = role ?? target.role;
  const finalCanEdit = canEdit ?? false;
  const finalCanApprove = canApprove ?? false;

  // Validazioni coerenza
  if (finalRole === "OPERATOR" && (finalCanEdit || finalCanApprove)) {
    return NextResponse.json({ error: "Un operatore non può avere permessi di modifica o approvazione" }, { status: 400 });
  }
  if (finalRole === "HOD" && finalCanApprove) {
    return NextResponse.json({ error: "Un HOD non può avere permessi di approvazione" }, { status: 400 });
  }
  if (role === "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo SUPER_ADMIN può assegnare ruolo ADMIN" }, { status: 403 });
  }

  // Update user fields
  await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(canView !== undefined && { canView }),
      ...(canEdit !== undefined && { canEdit }),
      ...(canApprove !== undefined && { canApprove }),
      ...(isActive !== undefined && { isActive }),
    },
  });

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
