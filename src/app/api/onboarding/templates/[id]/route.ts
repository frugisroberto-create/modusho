import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

// ─── GET: dettaglio template con sezioni ─────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;

  const template = await prisma.onboardingTemplate.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true, code: true } },
      property: { select: { id: true, name: true, code: true } },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          content: { select: { id: true, code: true, title: true, status: true, type: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template non trovato" }, { status: 404 });
  }

  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", template.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  return NextResponse.json({ data: template });
}

// ─── PUT: aggiorna template (isActive toggle) ───────────────────────

const updateSchema = z.object({
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const template = await prisma.onboardingTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template non trovato" }, { status: 404 });
  }

  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", template.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const updated = await prisma.onboardingTemplate.update({
    where: { id },
    data: {
      ...parsed.data,
      updatedById: session.user.id,
    },
  });

  return NextResponse.json({ data: { id: updated.id, isActive: updated.isActive } });
}

// ─── DELETE: disattiva template ──────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;

  const template = await prisma.onboardingTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template non trovato" }, { status: 404 });
  }

  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", template.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  await prisma.onboardingTemplate.update({
    where: { id },
    data: { isActive: false, updatedById: session.user.id },
  });

  return NextResponse.json({ data: { success: true } });
}
