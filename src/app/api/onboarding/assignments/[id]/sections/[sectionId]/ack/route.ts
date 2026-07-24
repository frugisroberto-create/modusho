import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkOnboardingCompletion } from "@/lib/onboarding";

/**
 * POST /api/onboarding/assignments/[id]/sections/[sectionId]/ack
 * Acknowledge a non-SOP onboarding section.
 * For SOP sections, the ack flows through /api/content/[id]/acknowledge (synced).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: assignmentId, sectionId } = await params;

  // Fetch assignment and section
  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, userId: true, completedAt: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Assegnamento non trovato" }, { status: 404 });
  }

  // Only the assigned user (or SUPER_ADMIN) can acknowledge
  if (assignment.userId !== session.user.id && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  if (assignment.completedAt) {
    return NextResponse.json({ error: "Onboarding gia completato" }, { status: 400 });
  }

  const section = await prisma.onboardingAssignedSection.findUnique({
    where: { id: sectionId },
  });

  if (!section || section.assignmentId !== assignmentId) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  if (section.acknowledgedAt) {
    return NextResponse.json({
      data: { sectionId, acknowledgedAt: section.acknowledgedAt, alreadyAcknowledged: true },
    });
  }

  const now = new Date();

  // Update section: set viewedAt (if not set) and acknowledgedAt
  await prisma.onboardingAssignedSection.update({
    where: { id: sectionId },
    data: {
      viewedAt: section.viewedAt ?? now,
      acknowledgedAt: now,
    },
  });

  // Set startedAt on assignment if first interaction
  if (!assignment.completedAt) {
    await prisma.onboardingAssignment.updateMany({
      where: { id: assignmentId, startedAt: null },
      data: { startedAt: now },
    });
  }

  // For SOP sections, also create ContentAcknowledgment
  if (section.type === "SOP" && section.contentId) {
    await prisma.contentAcknowledgment.upsert({
      where: {
        contentId_userId: { contentId: section.contentId, userId: session.user.id },
      },
      create: {
        contentId: section.contentId,
        userId: session.user.id,
        required: true,
      },
      update: {},
    });
  }

  // Check if onboarding is now complete
  const completed = await checkOnboardingCompletion(assignmentId);

  return NextResponse.json({
    data: {
      sectionId,
      acknowledgedAt: now,
      alreadyAcknowledged: false,
      onboardingCompleted: completed,
    },
  });
}
