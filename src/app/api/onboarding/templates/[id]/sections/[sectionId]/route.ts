import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

// ─── Helper ──────────────────────────────────────────────────────────

async function getSectionWithAccess(templateId: string, sectionId: string, userId: string) {
  const section = await prisma.onboardingSection.findUnique({
    where: { id: sectionId },
    include: { template: { select: { id: true, propertyId: true, departmentId: true } } },
  });
  if (!section || section.templateId !== templateId) {
    return { error: "Sezione non trovata", status: 404 };
  }
  const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", section.template.propertyId);
  if (!hasAccess) return { error: "Accesso negato", status: 403 };
  return { section };
}

// ─── PUT: modifica sezione ───────────────────────────────────────────

const updateSectionSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
  requiresAck: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: templateId, sectionId } = await params;
  const result = await getSectionWithAccess(templateId, sectionId, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await request.json();
  const parsed = updateSectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  // If changing contentId on a SOP section, validate the new SOP
  if (parsed.data.contentId !== undefined && result.section.type === "SOP" && parsed.data.contentId) {
    const content = await prisma.content.findUnique({
      where: { id: parsed.data.contentId },
      select: { status: true, type: true, propertyId: true },
    });
    if (!content || content.type !== "SOP" || content.status !== "PUBLISHED") {
      return NextResponse.json({ error: "La SOP deve essere pubblicata" }, { status: 400 });
    }
    if (content.propertyId !== result.section.template.propertyId) {
      return NextResponse.json({ error: "La SOP deve appartenere alla stessa property" }, { status: 400 });
    }
  }

  const updated = await prisma.onboardingSection.update({
    where: { id: sectionId },
    data: parsed.data,
  });

  await prisma.onboardingTemplate.update({
    where: { id: templateId },
    data: { updatedById: session.user.id },
  });

  return NextResponse.json({ data: updated });
}

// ─── DELETE: rimuovi sezione ─────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: templateId, sectionId } = await params;
  const result = await getSectionWithAccess(templateId, sectionId, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.onboardingSection.delete({ where: { id: sectionId } });

  await prisma.onboardingTemplate.update({
    where: { id: templateId },
    data: { updatedById: session.user.id },
  });

  return NextResponse.json({ data: { success: true } });
}
