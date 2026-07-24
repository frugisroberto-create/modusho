import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import {
  cloneTemplateForUser,
  mergeTemplatesForUser,
  confirmMergedAssignment,
  type SectionInput,
} from "@/lib/onboarding";
import { z } from "zod/v4";

const sectionInputSchema = z.object({
  type: z.enum(["WELCOME", "RULES", "JOB_DESCRIPTION", "DOCUMENT", "SOP"]),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0),
  requiresAck: z.boolean().default(true),
});

const assignSchema = z.object({
  userId: z.string(),
  propertyId: z.string(),
  templateId: z.string().optional(),
  templateIds: z.array(z.string()).optional(),
  customSections: z.array(sectionInputSchema).optional(),
  dueDate: z.string().datetime().optional(),
  /** If true, return merged preview without creating assignment */
  previewMerge: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { userId, propertyId, templateId, templateIds, customSections, dueDate, previewMerge } = parsed.data;

  // RBAC: HM+ con accesso alla property
  const hasAccess = await checkAccess(session.user.id, "HOTEL_MANAGER", propertyId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Verify target user exists and is assigned to this property
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, isActive: true },
  });
  if (!targetUser || !targetUser.isActive) {
    return NextResponse.json({ error: "Utente non trovato o non attivo" }, { status: 404 });
  }

  const userAssignment = await prisma.propertyAssignment.findFirst({
    where: { userId, propertyId },
  });
  if (!userAssignment) {
    return NextResponse.json({ error: "L'utente non e assegnato a questa property" }, { status: 400 });
  }

  // Check no existing active onboarding
  const existing = await prisma.onboardingAssignment.findUnique({
    where: { userId_propertyId: { userId, propertyId } },
  });
  if (existing && !previewMerge) {
    return NextResponse.json(
      { error: "L'utente ha gia un onboarding attivo per questa property", existingId: existing.id },
      { status: 409 }
    );
  }

  const dueDateParsed = dueDate ? new Date(dueDate) : undefined;

  // Case 1: Multi-department merge preview
  if (previewMerge && templateIds && templateIds.length > 1) {
    const mergedSections = await mergeTemplatesForUser({
      userId,
      propertyId,
      assignedById: session.user.id,
      templateIds,
      dueDate: dueDateParsed,
    });
    return NextResponse.json({ data: { preview: true, sections: mergedSections } });
  }

  // Case 2: Confirm merged assignment (with custom sections)
  if (templateIds && templateIds.length > 1 && customSections) {
    const assignment = await confirmMergedAssignment({
      userId,
      propertyId,
      assignedById: session.user.id,
      dueDate: dueDateParsed,
      sections: customSections as SectionInput[],
    });

    await notifyUser(userId, targetUser.name, propertyId);
    return NextResponse.json({ data: { id: assignment.id } }, { status: 201 });
  }

  // Case 3: Single template clone (with optional customizations)
  const resolvedTemplateId = templateId ?? templateIds?.[0];
  if (!resolvedTemplateId) {
    return NextResponse.json({ error: "templateId o templateIds richiesto" }, { status: 400 });
  }

  const assignment = await cloneTemplateForUser({
    userId,
    propertyId,
    assignedById: session.user.id,
    templateId: resolvedTemplateId,
    dueDate: dueDateParsed,
    customSections: customSections as SectionInput[] | undefined,
  });

  await notifyUser(userId, targetUser.name, propertyId);
  return NextResponse.json({ data: { id: assignment.id } }, { status: 201 });
}

// ─── Notify operator ─────────────────────────────────────────────────

async function notifyUser(userId: string, userName: string, propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { name: true },
  });

  await createNotifications([
    {
      userId,
      type: "ONBOARDING_ASSIGNED",
      title: "ModusHO",
      body: `Benvenuto! Il tuo percorso di onboarding per ${property?.name ?? "la struttura"} e pronto.`,
      url: "/my-onboarding",
    },
  ]);
}
