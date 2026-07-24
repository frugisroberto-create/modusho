import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { z } from "zod/v4";

// ─── Helper: verify template access ─────────────────────────────────

async function getTemplateWithAccess(templateId: string, userId: string) {
  const template = await prisma.onboardingTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { error: "Template non trovato", status: 404 };
  const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", template.propertyId);
  if (!hasAccess) return { error: "Accesso negato", status: 403 };
  return { template };
}

// ─── POST: aggiungi sezione ──────────────────────────────────────────

const createSectionSchema = z.object({
  type: z.enum(["WELCOME", "RULES", "JOB_DESCRIPTION", "DOCUMENT", "SOP"]),
  title: z.string().min(1).max(300),
  body: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0),
  requiresAck: z.boolean().default(true),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const result = await getTemplateWithAccess(templateId, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await request.json();
  const parsed = createSectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { type, contentId } = parsed.data;

  // Validate SOP reference
  if (type === "SOP") {
    if (!contentId) {
      return NextResponse.json({ error: "contentId obbligatorio per sezioni SOP" }, { status: 400 });
    }
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, status: true, type: true, propertyId: true },
    });
    if (!content || content.type !== "SOP" || content.status !== "PUBLISHED") {
      return NextResponse.json({ error: "La SOP deve essere pubblicata" }, { status: 400 });
    }
    if (content.propertyId !== result.template.propertyId) {
      return NextResponse.json({ error: "La SOP deve appartenere alla stessa property" }, { status: 400 });
    }

    // Enforce max SOP count
    const maxSops = result.template.departmentId ? 10 : 15;
    const currentSopCount = await prisma.onboardingSection.count({
      where: { templateId, type: "SOP" },
    });
    if (currentSopCount >= maxSops) {
      return NextResponse.json(
        { error: `Massimo ${maxSops} SOP per template` },
        { status: 400 }
      );
    }
  }

  const section = await prisma.onboardingSection.create({
    data: {
      templateId,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      fileUrl: parsed.data.fileUrl ?? null,
      contentId: parsed.data.contentId ?? null,
      sortOrder: parsed.data.sortOrder,
      requiresAck: parsed.data.requiresAck,
    },
  });

  // Update template timestamp
  await prisma.onboardingTemplate.update({
    where: { id: templateId },
    data: { updatedById: session.user.id },
  });

  return NextResponse.json({ data: section }, { status: 201 });
}

// ─── PUT: riordina sezioni (bulk) ────────────────────────────────────

const reorderSchema = z.object({
  sections: z.array(z.object({
    id: z.string(),
    sortOrder: z.number().int().min(0),
  })),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const result = await getTemplateWithAccess(templateId, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  // Update all sortOrders in a transaction
  await prisma.$transaction(
    parsed.data.sections.map((s) =>
      prisma.onboardingSection.update({
        where: { id: s.id },
        data: { sortOrder: s.sortOrder },
      })
    )
  );

  await prisma.onboardingTemplate.update({
    where: { id: templateId },
    data: { updatedById: session.user.id },
  });

  return NextResponse.json({ data: { success: true } });
}
