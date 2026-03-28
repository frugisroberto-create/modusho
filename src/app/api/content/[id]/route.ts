import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { changeContentStatus } from "@/lib/content-status";
import { z } from "zod/v4";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const content = await prisma.content.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      acknowledgments: {
        where: { userId },
        select: { acknowledgedAt: true },
        take: 1,
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // RBAC: verifica accesso alla property e al department
  const hasAccess = await checkAccess(
    userId,
    "OPERATOR",
    content.propertyId,
    content.departmentId ?? undefined
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  return NextResponse.json({
    data: {
      id: content.id,
      type: content.type,
      title: content.title,
      body: content.body,
      status: content.status,
      version: content.version,
      publishedAt: content.publishedAt,
      createdAt: content.createdAt,
      property: content.property,
      department: content.department,
      createdBy: content.createdBy.name,
      acknowledged: content.acknowledgments.length > 0,
      acknowledgedAt: content.acknowledgments[0]?.acknowledgedAt ?? null,
    },
  });
}

// --- PUT: Modifica contenuto (solo DRAFT) ---
const updateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
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
  const userId = session.user.id;
  const { role } = session.user;

  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const rawBody = await request.json();
  const parsed = updateContentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const content = await prisma.content.findUnique({
    where: { id },
    select: { id: true, status: true, propertyId: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  if (content.status !== "DRAFT") {
    return NextResponse.json({ error: "Solo i contenuti in DRAFT possono essere modificati" }, { status: 400 });
  }

  const hasAccess = await checkAccess(userId, "ADMIN", content.propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { title, body, departmentId, sendToReview } = parsed.data;

  const updated = await prisma.content.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(departmentId !== undefined && { departmentId }),
      updatedById: userId,
    },
  });

  // Se richiesto invio a review
  if (sendToReview) {
    await changeContentStatus({
      contentId: id,
      fromStatus: "DRAFT",
      toStatus: "REVIEW_HM",
      changedById: userId,
      note: "Inviata a review HM",
    });
  }

  return NextResponse.json({ data: { id: updated.id, status: sendToReview ? "REVIEW_HM" : updated.status } });
}
