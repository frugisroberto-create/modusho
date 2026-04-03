import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, canUserManageContentType } from "@/lib/rbac";
import { resolveRaciRoles, needsReview } from "@/lib/sop-workflow";
import { z } from "zod/v4";

// ─── GET: lista bozze SOP in cui l'utente e' coinvolto come R/C/A ────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userId = session.user.id;
  const role = session.user.role;

  // OPERATOR non partecipa al workflow RACI
  if (role === "OPERATOR") {
    return NextResponse.json({ data: [], meta: { total: 0 } });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(params.pageSize || "20", 10)));
  // Support both legacy sopStatus param and new contentStatus param
  const rawStatus = params.contentStatus || params.sopStatus;
  const statusFilter = rawStatus as string | undefined;
  const excludeStatusRaw = params.excludeContentStatus || params.excludeStatus;
  const excludeStatus = excludeStatusRaw as string | undefined;

  // Map legacy sopStatus values to Content.status
  const SOP_TO_CONTENT_STATUS: Record<string, string> = {
    IN_LAVORAZIONE: "DRAFT",
    PUBBLICATA: "PUBLISHED",
    ARCHIVIATA: "ARCHIVED",
  };
  const mapStatus = (s: string) => SOP_TO_CONTENT_STATUS[s] || s;
  const search = (params.search || "").trim();

  const propertyId = params.propertyId as string | undefined;
  const departmentId = params.departmentId as string | undefined;

  // Full-text search: pre-filter Content IDs via PostgreSQL tsvector
  let matchingContentIds: string[] | null = null;
  if (search) {
    const sanitized = search
      .replace(/[^\w\sàèéìòùÀÈÉÌÒÙ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(" & ");

    if (sanitized) {
      const matches = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM "Content" c
        WHERE c."isDeleted" = false
          AND (
            to_tsvector('italian', c.title || ' ' || c.body) @@ to_tsquery('italian', ${sanitized})
            OR c.title ILIKE '%' || ${search} || '%'
            OR c.code ILIKE '%' || ${search} || '%'
          )
      `;
      matchingContentIds = matches.map((m) => m.id);
    } else {
      matchingContentIds = [];
    }

    if (matchingContentIds.length === 0) {
      return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
    }
  }

  // SUPER_ADMIN e ADMIN vedono tutti i workflow; HOD/HM solo quelli dove sono R/C/A
  const contentFilter: Record<string, unknown> = { isDeleted: false };

  if (matchingContentIds !== null) {
    contentFilter.id = { in: matchingContentIds };
  }

  if (propertyId) {
    contentFilter.propertyId = propertyId;
  }
  if (departmentId) {
    contentFilter.departmentId = departmentId;
  }

  const where: Record<string, unknown> = {
    content: contentFilter,
  };

  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    where.OR = [
      { responsibleId: userId },
      { consultedId: userId },
      { accountableId: userId },
    ];
  }

  // Filter by Content.status (source of truth), not sopStatus
  if (statusFilter) {
    const mapped = mapStatus(statusFilter);
    // DRAFT filter should include all working states
    if (mapped === "DRAFT") {
      (contentFilter as Record<string, unknown>).status = { in: ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"] };
    } else {
      (contentFilter as Record<string, unknown>).status = mapped;
    }
  } else if (excludeStatus) {
    const mapped = mapStatus(excludeStatus);
    if (mapped === "DRAFT") {
      (contentFilter as Record<string, unknown>).status = { notIn: ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"] };
    } else {
      (contentFilter as Record<string, unknown>).status = { not: mapped };
    }
  }

  const [workflows, total] = await Promise.all([
    prisma.sopWorkflow.findMany({
      where,
      select: {
        id: true,
        sopStatus: true,
        responsibleId: true,
        consultedId: true,
        accountableId: true,
        submittedToC: true,
        submittedToCAt: true,
        submittedToA: true,
        submittedToAAt: true,
        reviewDueDate: true,
        lastSavedAt: true,
        lastSavedById: true,
        textVersionCount: true,
        content: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            version: true,
            property: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
        responsible: { select: { id: true, name: true, role: true } },
        consulted: { select: { id: true, name: true, role: true } },
        accountable: { select: { id: true, name: true, role: true } },
        workflowEvents: {
          where: { eventType: "DRAFT_CREATED" },
          select: { metadata: true },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sopWorkflow.count({ where }),
  ]);

  const data = workflows.map((wf) => {
    let myRole: "R" | "C" | "A" | null = null;
    if (wf.responsibleId === userId) myRole = "R";
    else if (wf.consultedId === userId) myRole = "C";
    else if (wf.accountableId === userId) myRole = "A";

    return {
      id: wf.id,
      contentId: wf.content.id,
      code: wf.content.code,
      title: wf.content.title,
      contentStatus: wf.content.status,
      sopStatus: wf.sopStatus, // legacy — do not use for new logic
      myRole,
      submittedToC: wf.submittedToC,
      submittedToCAt: wf.submittedToCAt,
      submittedToA: wf.submittedToA,
      submittedToAAt: wf.submittedToAAt,
      reviewDueDate: wf.reviewDueDate,
      needsReview: needsReview({ contentStatus: wf.content.status, reviewDueDate: wf.reviewDueDate }),
      lastSavedAt: wf.lastSavedAt,
      textVersionCount: wf.textVersionCount,
      property: wf.content.property,
      department: wf.content.department,
      responsible: wf.responsible,
      consulted: wf.consulted,
      accountable: wf.accountable,
      isImported: ((wf as unknown as { workflowEvents: { metadata: unknown }[] }).workflowEvents ?? []).some((e) => {
        const meta = e.metadata as Record<string, unknown> | null;
        return meta?.source === "bulk-import";
      }),
    };
  });

  return NextResponse.json({ data, meta: { page, pageSize, total } });
}

// ─── POST: Crea nuova SOP con workflow RACI ──────────────────────────

const createSopSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string(),
  involveHod: z.boolean().default(false),
  hodUserId: z.string().optional(),
  hmUserId: z.string().optional(),
  hooUserId: z.string().optional(),
  targetDepartmentIds: z.array(z.string()).optional().default([]),
  targetAllDepartments: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userId = session.user.id;
  const role = session.user.role;

  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  // OPERATOR non puo' creare SOP
  if (role === "OPERATOR") {
    return NextResponse.json({ error: "Operatore non puo' creare SOP" }, { status: 403 });
  }

  const canManageSop = await canUserManageContentType(userId, "SOP");
  if (!canManageSop) {
    return NextResponse.json({ error: "Non hai permesso di creare SOP" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  // RBAC: verifica accesso a property + department
  const hasAccess = await checkAccess(userId, "HOD", data.propertyId, data.departmentId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa property/reparto" }, { status: 403 });
  }

  // HOD: puo' aprire solo per il proprio reparto (verificato da checkAccess con departmentId)
  // Inoltre HOD non sceglie involveHod — e' sempre R
  if (role === "HOD" && data.involveHod) {
    return NextResponse.json({ error: "HOD non puo' coinvolgere un altro HOD" }, { status: 400 });
  }

  // Risolvi i soggetti RACI
  // Serve trovare HM e HOO per la property se non forniti
  let hmUserId = data.hmUserId;
  let hooUserId = data.hooUserId;

  if (!hmUserId) {
    const hm = await prisma.propertyAssignment.findFirst({
      where: { propertyId: data.propertyId, user: { role: "HOTEL_MANAGER", isActive: true } },
      select: { userId: true },
    });
    if (!hm) {
      return NextResponse.json({ error: "Nessun Hotel Manager trovato per questa struttura" }, { status: 400 });
    }
    hmUserId = hm.userId;
  }

  if (!hooUserId) {
    // HOO = primo ADMIN assegnato alla property, oppure se chi crea e' ADMIN/SUPER_ADMIN, e' lui
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      hooUserId = userId;
    } else {
      const hoo = await prisma.propertyAssignment.findFirst({
        where: { propertyId: data.propertyId, user: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true } },
        select: { userId: true },
      });
      if (!hoo) {
        return NextResponse.json({ error: "Nessun ADMIN/HOO trovato per questa struttura" }, { status: 400 });
      }
      hooUserId = hoo.userId;
    }
  }

  // HOD coinvolto: se involveHod=true serve hodUserId
  if (data.involveHod && !data.hodUserId && role !== "HOD") {
    return NextResponse.json({ error: "hodUserId richiesto quando involveHod=true" }, { status: 400 });
  }

  const raciAssignment = resolveRaciRoles({
    initiatorId: userId,
    initiatorRole: role,
    involveHod: role === "HOD" ? false : data.involveHod,
    hodUserId: role === "HOD" ? userId : data.hodUserId,
    hmUserId,
    hooUserId,
  });

  // Genera codice SOP
  const property = await prisma.property.findUnique({ where: { id: data.propertyId }, select: { code: true } });
  const department = await prisma.department.findUnique({ where: { id: data.departmentId }, select: { code: true } });
  if (!property || !department) {
    return NextResponse.json({ error: "Property o reparto non trovati" }, { status: 400 });
  }

  const lastCode = await prisma.content.findFirst({
    where: {
      type: "SOP",
      code: { startsWith: `${property.code}-${department.code}-` },
    },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextNum = 1;
  if (lastCode?.code) {
    const parts = lastCode.code.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  const sopCode = `${property.code}-${department.code}-${String(nextNum).padStart(3, "0")}`;

  // Crea tutto in transazione
  const result = await prisma.$transaction(async (tx) => {
    // 1. Content
    const content = await tx.content.create({
      data: {
        type: "SOP",
        code: sopCode,
        title: data.title,
        body: data.body,
        status: "DRAFT",
        propertyId: data.propertyId,
        departmentId: data.departmentId,
        createdById: userId,
        updatedById: userId,
      },
    });

    // 2. SopWorkflow
    const workflow = await tx.sopWorkflow.create({
      data: {
        contentId: content.id,
        sopStatus: "IN_LAVORAZIONE",
        responsibleId: raciAssignment.responsibleId,
        consultedId: raciAssignment.consultedId,
        accountableId: raciAssignment.accountableId,
        textVersionCount: 1,
        lastSavedAt: new Date(),
        lastSavedById: userId,
      },
    });

    // 3. Prima versione del testo
    await tx.sopTextVersion.create({
      data: {
        sopWorkflowId: workflow.id,
        versionNumber: 1,
        title: data.title,
        body: data.body,
        savedById: userId,
      },
    });

    // 4. Evento workflow: creazione bozza
    await tx.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: workflow.id,
        eventType: "DRAFT_CREATED",
        actorId: userId,
      },
    });

    // 5. ContentTarget: destinatari
    if (data.targetAllDepartments) {
      await tx.contentTarget.create({
        data: { contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" },
      });
    } else if (data.targetDepartmentIds.length > 0) {
      await tx.contentTarget.createMany({
        data: data.targetDepartmentIds.map((deptId) => ({
          contentId: content.id,
          targetType: "DEPARTMENT" as const,
          targetDepartmentId: deptId,
        })),
      });
    } else {
      // Default: reparto della SOP
      await tx.contentTarget.create({
        data: { contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: data.departmentId },
      });
    }

    // 6. ContentStatusHistory
    await tx.contentStatusHistory.create({
      data: { contentId: content.id, fromStatus: null, toStatus: "DRAFT", changedById: userId },
    });

    return { content, workflow };
  });

  return NextResponse.json({
    data: {
      id: result.workflow.id,
      contentId: result.content.id,
      code: sopCode,
      contentStatus: "DRAFT",
      sopStatus: "IN_LAVORAZIONE", // legacy sync
      responsible: raciAssignment.responsibleId,
      consulted: raciAssignment.consultedId,
      accountable: raciAssignment.accountableId,
    },
  }, { status: 201 });
}
