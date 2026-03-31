/**
 * POST /api/sop — Create a new SOP with RACI workflow
 *
 * Creates a Content (type=SOP, status=DRAFT) + SopWorkflow in a single transaction.
 * Resolves R/C/A roles based on the initiator and involveHod flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess, canUserManageContentType } from "@/lib/rbac";
import { resolveRaciRoles } from "@/lib/sop-workflow";
import { z } from "zod/v4";

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

  const { id: userId, role, canEdit } = session.user;

  // Only HOD, HM, ADMIN, SUPER_ADMIN can create SOPs
  if (role === "OPERATOR") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  if (!canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const canManageSop = await canUserManageContentType(userId, "SOP");
  if (!canManageSop) {
    return NextResponse.json({ error: "Non hai permesso di creare SOP" }, { status: 403 });
  }

  const rawBody = await request.json();
  const parsed = createSopSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });
  }

  const { title, body, propertyId, departmentId, involveHod, hodUserId } = parsed.data;

  // RBAC: verify property/department access
  const hasAccess = await checkAccess(userId, "HOD", propertyId, departmentId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa property/reparto" }, { status: 403 });
  }

  // HOD can only create SOPs for their own department (enforced by checkAccess above)
  if (role === "HOD" && involveHod) {
    return NextResponse.json({ error: "HOD non può coinvolgere un altro HOD" }, { status: 400 });
  }

  // Validate involveHod + hodUserId
  if (involveHod && !hodUserId && role !== "HOD") {
    return NextResponse.json({ error: "hodUserId richiesto quando involveHod=true" }, { status: 400 });
  }
  if (involveHod && hodUserId) {
    const hod = await prisma.user.findUnique({
      where: { id: hodUserId, isActive: true },
      select: { role: true },
    });
    if (!hod || hod.role !== "HOD") {
      return NextResponse.json({ error: "HOD specificato non valido" }, { status: 400 });
    }
    // Verify HOD has access to this property+department
    const hodAccess = await checkAccess(hodUserId, "HOD", propertyId, departmentId);
    if (!hodAccess) {
      return NextResponse.json({ error: "HOD non ha accesso a questa property/reparto" }, { status: 400 });
    }
  }

  // Resolve HM — find HOTEL_MANAGER for the property (or use specified)
  let hmUserId = parsed.data.hmUserId;
  if (!hmUserId) {
    const hm = await prisma.user.findFirst({
      where: {
        role: "HOTEL_MANAGER",
        isActive: true,
        propertyAssignments: { some: { propertyId } },
      },
      select: { id: true },
    });
    if (!hm && (role === "HOD" || involveHod || (role !== "HOTEL_MANAGER" && !involveHod))) {
      // HM is needed as C (when HOD involved) or as R (when HOO opens w/o HOD)
      // For HM opening, HM is the initiator, so no need to find
      if (role !== "HOTEL_MANAGER") {
        return NextResponse.json({ error: "Nessun Hotel Manager trovato per questa property" }, { status: 400 });
      }
    }
    hmUserId = hm?.id;
  }

  // Resolve HOO — find ADMIN/SUPER_ADMIN for the property (or use specified)
  let hooUserId = parsed.data.hooUserId;
  if (!hooUserId && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    const hoo = await prisma.user.findFirst({
      where: {
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        isActive: true,
        propertyAssignments: { some: { propertyId } },
      },
      select: { id: true },
    });
    if (!hoo) {
      // Try SUPER_ADMIN (bypasses property assignments)
      const superAdmin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN", isActive: true },
        select: { id: true },
      });
      if (!superAdmin) {
        return NextResponse.json({ error: "Nessun HOO (ADMIN/SUPER_ADMIN) trovato" }, { status: 400 });
      }
      hooUserId = superAdmin.id;
    } else {
      hooUserId = hoo.id;
    }
  }

  // For ADMIN/SUPER_ADMIN opening, they are the HOO (A)
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    hooUserId = userId;
  }

  // For HM opening, HM is the initiator
  if (role === "HOTEL_MANAGER" && !involveHod && !hmUserId) {
    hmUserId = userId;
  }

  // Resolve RACI
  const raci = resolveRaciRoles({
    initiatorId: userId,
    initiatorRole: role,
    involveHod,
    hodUserId,
    hmUserId: hmUserId || userId,
    hooUserId: hooUserId!,
  });

  // Create Content + SopWorkflow + initial version + event in transaction
  const result = await prisma.$transaction(async (tx) => {
    const content = await tx.content.create({
      data: {
        type: "SOP",
        title,
        body,
        status: "DRAFT",
        propertyId,
        departmentId,
        createdById: userId,
        updatedById: userId,
      },
    });

    // ContentTarget — audience
    if (parsed.data.targetAllDepartments) {
      await tx.contentTarget.create({
        data: { contentId: content.id, targetType: "ROLE", targetRole: "OPERATOR" },
      });
    } else if (parsed.data.targetDepartmentIds.length > 0) {
      await tx.contentTarget.createMany({
        data: parsed.data.targetDepartmentIds.map((deptId) => ({
          contentId: content.id,
          targetType: "DEPARTMENT" as const,
          targetDepartmentId: deptId,
        })),
      });
    } else {
      await tx.contentTarget.create({
        data: { contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: departmentId },
      });
    }

    // ContentStatusHistory
    await tx.contentStatusHistory.create({
      data: { contentId: content.id, fromStatus: null, toStatus: "DRAFT", changedById: userId },
    });

    // SopWorkflow
    const workflow = await tx.sopWorkflow.create({
      data: {
        contentId: content.id,
        sopStatus: "IN_LAVORAZIONE",
        responsibleId: raci.responsibleId,
        consultedId: raci.consultedId,
        accountableId: raci.accountableId,
        lastSavedAt: new Date(),
        lastSavedById: userId,
        textVersionCount: 1,
      },
    });

    // Initial text version
    await tx.sopTextVersion.create({
      data: {
        sopWorkflowId: workflow.id,
        versionNumber: 1,
        title,
        body,
        savedById: userId,
      },
    });

    // Workflow event: DRAFT_CREATED
    await tx.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: workflow.id,
        eventType: "DRAFT_CREATED",
        actorId: userId,
        note: `Bozza creata. R=${raci.responsibleId}, C=${raci.consultedId ?? "nessuno"}, A=${raci.accountableId}`,
      },
    });

    return { content, workflow };
  });

  return NextResponse.json({
    data: {
      contentId: result.content.id,
      sopWorkflowId: result.workflow.id,
      raci: {
        R: raci.responsibleId,
        C: raci.consultedId,
        A: raci.accountableId,
      },
    },
  }, { status: 201 });
}
