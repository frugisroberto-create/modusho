import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOnboardingProgress } from "@/lib/onboarding";

/**
 * GET /api/onboarding/my?propertyId=X
 * Returns the current user's active onboarding assignment with progress.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
  }

  const assignment = await prisma.onboardingAssignment.findUnique({
    where: {
      userId_propertyId: { userId: session.user.id, propertyId },
    },
  });

  if (!assignment || assignment.completedAt) {
    return NextResponse.json({ data: null });
  }

  const progress = await getOnboardingProgress(assignment.id);
  return NextResponse.json({ data: progress });
}
