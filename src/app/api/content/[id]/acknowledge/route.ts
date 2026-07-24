import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;

  // Verifica che il contenuto esista e sia PUBLISHED
  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: {
      id: true,
      status: true,
      propertyId: true,
      createdById: true,
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  if (content.status !== "PUBLISHED") {
    return NextResponse.json(
      { error: "Il contenuto non è pubblicato" },
      { status: 400 }
    );
  }

  const canAccess = await canUserAccessContent(userId, session.user.role, content);
  if (!canAccess) {
    return NextResponse.json({ error: "Non sei tra i destinatari di questo contenuto" }, { status: 403 });
  }

  // Idempotente: se già confermato, ritorna il record esistente
  const existing = await prisma.contentAcknowledgment.findUnique({
    where: { contentId_userId: { contentId, userId } },
  });

  if (existing) {
    return NextResponse.json({
      data: {
        contentId: existing.contentId,
        acknowledgedAt: existing.acknowledgedAt,
        alreadyAcknowledged: true,
      },
    });
  }

  const acknowledgment = await prisma.contentAcknowledgment.create({
    data: {
      contentId,
      userId,
      required: true,
    },
  });

  // Sync with onboarding: if this content is in an active onboarding, mark that section too
  await syncOnboardingSection(contentId, userId);

  return NextResponse.json({
    data: {
      contentId: acknowledgment.contentId,
      acknowledgedAt: acknowledgment.acknowledgedAt,
      alreadyAcknowledged: false,
    },
  });
}

async function syncOnboardingSection(contentId: string, userId: string) {
  try {
    const { checkOnboardingCompletion } = await import("@/lib/onboarding");
    const now = new Date();

    // Find any active onboarding assigned section referencing this content
    const sections = await prisma.onboardingAssignedSection.findMany({
      where: {
        contentId,
        acknowledgedAt: null,
        assignment: { userId, completedAt: null },
      },
      select: { id: true, assignmentId: true, viewedAt: true },
    });

    for (const section of sections) {
      await prisma.onboardingAssignedSection.update({
        where: { id: section.id },
        data: {
          viewedAt: section.viewedAt ?? now,
          acknowledgedAt: now,
        },
      });
      await checkOnboardingCompletion(section.assignmentId);
    }
  } catch {
    // Best-effort sync — don't break the main ack flow
  }
}
