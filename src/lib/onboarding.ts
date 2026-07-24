import { prisma } from "@/lib/prisma";
import type { OnboardingSectionType } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────

interface CloneOptions {
  userId: string;
  propertyId: string;
  assignedById: string;
  templateId: string;
  dueDate?: Date;
  /** Override sections (for customization before assignment) */
  customSections?: SectionInput[];
}

interface MergeOptions {
  userId: string;
  propertyId: string;
  assignedById: string;
  templateIds: string[];
  dueDate?: Date;
}

export interface SectionInput {
  type: OnboardingSectionType;
  title: string;
  body?: string | null;
  fileUrl?: string | null;
  contentId?: string | null;
  sortOrder: number;
  requiresAck?: boolean;
}

export interface OnboardingProgressResult {
  assignmentId: string;
  userId: string;
  propertyId: string;
  totalSections: number;
  requiredSections: number;
  acknowledgedSections: number;
  percentage: number;
  startedAt: Date | null;
  completedAt: Date | null;
  dueDate: Date | null;
  sections: {
    id: string;
    type: OnboardingSectionType;
    title: string;
    sortOrder: number;
    requiresAck: boolean;
    viewedAt: Date | null;
    acknowledgedAt: Date | null;
    contentId: string | null;
    fileUrl: string | null;
  }[];
}

// ─── Clone template for single-department user ───────────────────────

export async function cloneTemplateForUser(opts: CloneOptions) {
  const { userId, propertyId, assignedById, templateId, dueDate, customSections } = opts;

  // Fetch template sections if no custom sections provided
  let sections: SectionInput[];
  if (customSections && customSections.length > 0) {
    sections = customSections;
  } else {
    const template = await prisma.onboardingTemplate.findUnique({
      where: { id: templateId },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new Error("Template non trovato");
    sections = template.sections.map((s) => ({
      type: s.type,
      title: s.title,
      body: s.body,
      fileUrl: s.fileUrl,
      contentId: s.contentId,
      sortOrder: s.sortOrder,
      requiresAck: s.requiresAck,
    }));
  }

  return createAssignmentWithSections({ userId, propertyId, assignedById, dueDate, sections });
}

// ─── Merge templates for multi-department user ───────────────────────

export async function mergeTemplatesForUser(opts: MergeOptions) {
  const { templateIds } = opts;

  const templates = await prisma.onboardingTemplate.findMany({
    where: { id: { in: templateIds }, isActive: true },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      department: { select: { name: true } },
    },
  });

  if (templates.length === 0) throw new Error("Nessun template trovato");

  // Merge sections by type
  const welcomeSections: SectionInput[] = [];
  const rulesSections: SectionInput[] = [];
  const jobDescSections: SectionInput[] = [];
  const documentSections: SectionInput[] = [];
  const sopSections: SectionInput[] = [];

  for (const tpl of templates) {
    const deptLabel = tpl.department?.name ?? "Generale";
    for (const s of tpl.sections) {
      const base: SectionInput = {
        type: s.type,
        title: s.title,
        body: s.body,
        fileUrl: s.fileUrl,
        contentId: s.contentId,
        sortOrder: 0,
        requiresAck: s.requiresAck,
      };

      switch (s.type) {
        case "WELCOME":
          welcomeSections.push(base);
          break;
        case "RULES":
          rulesSections.push({ ...base, title: `${base.title} — ${deptLabel}` });
          break;
        case "JOB_DESCRIPTION":
          jobDescSections.push({ ...base, title: `${base.title} — ${deptLabel}` });
          break;
        case "DOCUMENT":
          documentSections.push(base);
          break;
        case "SOP":
          sopSections.push(base);
          break;
      }
    }
  }

  // Deduplicate: WELCOME → keep longest body; DOCUMENT → deduplicate by fileUrl; SOP → deduplicate by contentId, cap 15
  const merged: SectionInput[] = [];

  // 1. WELCOME: keep the one with the longest body
  if (welcomeSections.length > 0) {
    const best = welcomeSections.reduce((a, b) =>
      (a.body?.length ?? 0) >= (b.body?.length ?? 0) ? a : b
    );
    merged.push(best);
  }

  // 2. RULES: keep all (they're department-specific)
  merged.push(...rulesSections);

  // 3. JOB_DESCRIPTION: keep all
  merged.push(...jobDescSections);

  // 4. DOCUMENT: deduplicate by fileUrl
  const seenFileUrls = new Set<string>();
  for (const doc of documentSections) {
    const key = doc.fileUrl ?? doc.title;
    if (!seenFileUrls.has(key)) {
      seenFileUrls.add(key);
      merged.push(doc);
    }
  }

  // 5. SOP: deduplicate by contentId, cap at 15
  const seenContentIds = new Set<string>();
  for (const sop of sopSections) {
    if (sop.contentId && seenContentIds.has(sop.contentId)) continue;
    if (sop.contentId) seenContentIds.add(sop.contentId);
    if (seenContentIds.size <= 15) {
      merged.push(sop);
    }
  }

  // Assign sortOrder
  merged.forEach((s, i) => (s.sortOrder = i));

  return merged;
}

/** Confirm a merged preview and create the assignment */
export async function confirmMergedAssignment(
  opts: Omit<MergeOptions, "templateIds"> & { sections: SectionInput[] }
) {
  const { userId, propertyId, assignedById, dueDate, sections } = opts;
  return createAssignmentWithSections({ userId, propertyId, assignedById, dueDate, sections });
}

// ─── Progress calculation ────────────────────────────────────────────

export async function getOnboardingProgress(
  assignmentId: string
): Promise<OnboardingProgressResult | null> {
  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          type: true,
          title: true,
          sortOrder: true,
          requiresAck: true,
          viewedAt: true,
          acknowledgedAt: true,
          contentId: true,
          fileUrl: true,
        },
      },
    },
  });

  if (!assignment) return null;

  const requiredSections = assignment.sections.filter((s) => s.requiresAck);
  const acknowledgedSections = requiredSections.filter((s) => s.acknowledgedAt !== null);

  return {
    assignmentId: assignment.id,
    userId: assignment.userId,
    propertyId: assignment.propertyId,
    totalSections: assignment.sections.length,
    requiredSections: requiredSections.length,
    acknowledgedSections: acknowledgedSections.length,
    percentage:
      requiredSections.length === 0
        ? 100
        : Math.round((acknowledgedSections.length / requiredSections.length) * 100),
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    dueDate: assignment.dueDate,
    sections: assignment.sections,
  };
}

/** Get progress for a user by userId + propertyId */
export async function getOnboardingProgressForUser(
  userId: string,
  propertyId: string
): Promise<OnboardingProgressResult | null> {
  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { userId_propertyId: { userId, propertyId } },
  });
  if (!assignment) return null;
  return getOnboardingProgress(assignment.id);
}

// ─── Completion check ────────────────────────────────────────────────

export async function checkOnboardingCompletion(assignmentId: string): Promise<boolean> {
  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { id: assignmentId },
    include: { sections: { where: { requiresAck: true } } },
  });

  if (!assignment || assignment.completedAt) return !!assignment?.completedAt;

  const allAcked = assignment.sections.every((s) => s.acknowledgedAt !== null);
  if (allAcked) {
    await prisma.onboardingAssignment.update({
      where: { id: assignmentId },
      data: { completedAt: new Date() },
    });
    return true;
  }

  return false;
}

// ─── Internal helper ─────────────────────────────────────────────────

async function createAssignmentWithSections(opts: {
  userId: string;
  propertyId: string;
  assignedById: string;
  dueDate?: Date;
  sections: SectionInput[];
}) {
  const { userId, propertyId, assignedById, dueDate, sections } = opts;

  const assignment = await prisma.onboardingAssignment.create({
    data: {
      userId,
      propertyId,
      assignedById,
      dueDate: dueDate ?? null,
      sections: {
        create: sections.map((s) => ({
          type: s.type,
          title: s.title,
          body: s.body ?? null,
          fileUrl: s.fileUrl ?? null,
          contentId: s.contentId ?? null,
          sortOrder: s.sortOrder,
          requiresAck: s.requiresAck ?? true,
        })),
      },
    },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
    },
  });

  return assignment;
}
