import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Registro visualizzazioni SOP — ritorna tutti gli utenti destinatari
 * con il loro stato di visualizzazione/conferma per la versione corrente.
 *
 * Accessibile solo a HOD+.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (userRole === "OPERATOR") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id: contentId } = await params;
  const filterDepartmentId = request.nextUrl.searchParams.get("departmentId") || undefined;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false, type: "SOP" },
    select: {
      id: true,
      version: true,
      status: true,
      propertyId: true,
      departmentId: true,
      sopWorkflow: { select: { requiresNewAcknowledgment: true } },
      targetAudience: {
        select: {
          targetType: true,
          targetRole: true,
          targetDepartmentId: true,
          targetUserId: true,
        },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const currentVersion = content.version;
  const requiresNewAck = content.sopWorkflow?.requiresNewAcknowledgment ?? true;

  // Trova tutti gli utenti destinatari della SOP (con filtro opzionale per reparto)
  const targetUsers = await resolveTargetUsers(content, filterDepartmentId);

  // Carica tutti i SopViewRecord per questa SOP
  const viewRecords = await prisma.sopViewRecord.findMany({
    where: { contentId },
    select: {
      userId: true,
      contentVersion: true,
      viewedAt: true,
      acknowledgedAt: true,
    },
  });

  // Costruisci la mappa per utente
  const registry = targetUsers.map((u) => {
    // Trova il record per la versione corrente
    const currentRecord = viewRecords.find(
      (r) => r.userId === u.id && r.contentVersion === currentVersion
    );
    // Trova l'ultimo record con acknowledgment (qualsiasi versione)
    const anyAckRecord = viewRecords
      .filter((r) => r.userId === u.id && r.acknowledgedAt != null)
      .sort((a, b) => b.contentVersion - a.contentVersion)[0];
    // Trova l'ultimo record di view (qualsiasi versione)
    const lastViewRecord = viewRecords
      .filter((r) => r.userId === u.id)
      .sort((a, b) => b.contentVersion - a.contentVersion)[0];

    const viewedCurrentVersion = currentRecord != null;
    const acknowledgedCurrentVersion = currentRecord?.acknowledgedAt != null;
    // Se non richiede nuova conferma, vale anche una ack precedente
    const effectivelyAcknowledged = acknowledgedCurrentVersion
      || (!requiresNewAck && anyAckRecord != null);

    let status: "not_viewed" | "viewed" | "acknowledged" | "needs_reack";
    if (effectivelyAcknowledged) {
      status = "acknowledged";
    } else if (requiresNewAck && anyAckRecord && !acknowledgedCurrentVersion) {
      status = "needs_reack";
    } else if (viewedCurrentVersion || lastViewRecord) {
      status = "viewed";
    } else {
      status = "not_viewed";
    }

    return {
      userId: u.id,
      userName: u.name,
      userRole: u.role,
      status,
      lastViewedAt: lastViewRecord?.viewedAt?.toISOString() ?? null,
      lastViewedVersion: lastViewRecord?.contentVersion ?? null,
      acknowledgedAt: effectivelyAcknowledged
        ? (currentRecord?.acknowledgedAt ?? anyAckRecord?.acknowledgedAt)?.toISOString() ?? null
        : null,
      acknowledgedVersion: effectivelyAcknowledged
        ? (acknowledgedCurrentVersion
          ? currentVersion
          : anyAckRecord?.contentVersion ?? null)
        : null,
    };
  });

  // Contatori
  const totals = {
    total: registry.length,
    notViewed: registry.filter((r) => r.status === "not_viewed").length,
    viewed: registry.filter((r) => r.status === "viewed").length,
    acknowledged: registry.filter((r) => r.status === "acknowledged").length,
    needsReack: registry.filter((r) => r.status === "needs_reack").length,
  };

  return NextResponse.json({
    data: {
      currentVersion,
      requiresNewAcknowledgment: requiresNewAck,
      registry,
      totals,
    },
  });
}

// ─── Helper: risolvi utenti destinatari ─────────────────────────────

async function resolveTargetUsers(content: {
  propertyId: string;
  departmentId: string | null;
  targetAudience: {
    targetType: string;
    targetRole: string | null;
    targetDepartmentId: string | null;
    targetUserId: string | null;
  }[];
}, filterDepartmentId?: string) {
  const targets = content.targetAudience;

  // Se c'è un filtro per reparto (es. HOD vede solo il proprio reparto),
  // mostra solo operatori assegnati a quel reparto specifico
  if (filterDepartmentId) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        role: "OPERATOR",
        propertyAssignments: {
          some: {
            propertyId: content.propertyId,
            departmentId: filterDepartmentId,
          },
        },
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: "asc" }],
    });
  }

  const where: Record<string, unknown> = {
    isActive: true,
    propertyAssignments: { some: { propertyId: content.propertyId } },
  };

  if (targets.length === 0) {
    if (content.departmentId) {
      where.propertyAssignments = {
        some: {
          propertyId: content.propertyId,
          OR: [
            { departmentId: content.departmentId },
            { departmentId: null },
          ],
        },
      };
    }
  } else {
    const deptTargets = targets
      .filter((t) => t.targetType === "DEPARTMENT" && t.targetDepartmentId)
      .map((t) => t.targetDepartmentId!);
    const roleTargets = targets
      .filter((t) => t.targetType === "ROLE" && t.targetRole)
      .map((t) => t.targetRole!);

    if (deptTargets.length > 0) {
      where.propertyAssignments = {
        some: {
          propertyId: content.propertyId,
          OR: [
            { departmentId: { in: deptTargets } },
            { departmentId: null },
          ],
        },
      };
    }
    if (roleTargets.length > 0) {
      where.role = { in: roleTargets };
    }
  }

  return prisma.user.findMany({
    where,
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}
