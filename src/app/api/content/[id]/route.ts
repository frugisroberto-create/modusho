import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, canUserManageContentType } from "@/lib/rbac";
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

// --- PUT: Modifica contenuto ---
const updateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
  requireNewAcknowledgment: z.boolean().optional(),
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

  const rawBody = await request.json();
  const parsed = updateContentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, propertyId: true, departmentId: true, type: true, version: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // ARCHIVED: non modificabile
  if (content.status === "ARCHIVED") {
    return NextResponse.json({ error: "I contenuti archiviati non possono essere modificati" }, { status: 400 });
  }

  // PUBLISHED: solo HM, ADMIN, SUPER_ADMIN
  if (content.status === "PUBLISHED") {
    if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Non autorizzato a modificare contenuti pubblicati" }, { status: 403 });
    }
  } else if (content.status === "REVIEW_ADMIN") {
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo ADMIN può modificare contenuti in attesa di approvazione finale" }, { status: 403 });
    }
  } else if (content.status === "REVIEW_HM") {
    if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Solo l'Hotel Manager o superiore può modificare contenuti in review HM" }, { status: 403 });
    }
  } else {
    // DRAFT/RETURNED: canEdit required
    if (!session.user.canEdit) {
      return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
    }
  }

  // Verifica accesso property
  const hasAccess = await checkAccess(userId, "HOD", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { title, body, departmentId, sendToReview, requireNewAcknowledgment } = parsed.data;
  const isPublishedEdit = content.status === "PUBLISHED";

  const updated = await prisma.content.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(departmentId !== undefined && { departmentId }),
      updatedById: userId,
      ...(isPublishedEdit && { version: content.version + 1 }),
    },
  });

  // Modifica post-pubblicazione: traccia in history
  if (isPublishedEdit) {
    await prisma.contentStatusHistory.create({
      data: {
        contentId: id,
        fromStatus: "PUBLISHED",
        toStatus: "PUBLISHED",
        changedById: userId,
        note: "Modifica post-pubblicazione",
      },
    });

    // Reset prese visione se richiesto
    if (requireNewAcknowledgment) {
      await prisma.contentAcknowledgment.deleteMany({ where: { contentId: id } });
    }
  }

  // Invio a review (per DRAFT/RETURNED)
  if (sendToReview && (content.status === "DRAFT" || content.status === "RETURNED")) {
    await changeContentStatus({
      contentId: id,
      fromStatus: content.status,
      toStatus: "REVIEW_HM",
      changedById: userId,
      note: "Inviata a review HM",
    });
  }

  return NextResponse.json({ data: { id: updated.id, status: updated.status, version: updated.version } });
}

// --- DELETE: Soft delete ---
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const { role } = session.user;
  const userId = session.user.id;

  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const content = await prisma.content.findUnique({
    where: { id },
    select: { id: true, status: true, propertyId: true, isDeleted: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }
  if (content.isDeleted) {
    return NextResponse.json({ error: "Contenuto già eliminato" }, { status: 409 });
  }

  // HM: solo sulla propria property
  if (role === "HOTEL_MANAGER") {
    const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", content.propertyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  }

  await prisma.content.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: userId },
  });

  await prisma.contentStatusHistory.create({
    data: {
      contentId: id,
      fromStatus: content.status,
      toStatus: "ARCHIVED",
      changedById: userId,
      note: "Eliminato (soft delete)",
    },
  });

  return NextResponse.json({ data: { success: true, message: "Contenuto eliminato" } });
}
