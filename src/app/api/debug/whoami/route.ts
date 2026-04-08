import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds } from "@/lib/rbac";

/**
 * GET /api/debug/whoami
 *
 * Endpoint diagnostico: restituisce quello che il server vede per la sessione
 * corrente e quanti contenuti sono effettivamente visibili all'utente.
 *
 * Serve per distinguere bundle JS cachato da Safari iOS / sessione stale /
 * bug runtime di React: se questa risposta è corretta ma la UI mostra vuoto,
 * il problema è sul client. Se la risposta mostra dati sbagliati, il problema
 * è nel token/DB.
 *
 * Nessun segreto esposto: solo ciò che l'utente già conosce di se stesso.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "non_authenticated", session: null },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const userId = session.user.id;

  // Stato DB dell'utente
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      canView: true,
      canEdit: true,
      canApprove: true,
    },
  });

  // Property e department accessibili
  const propertyIds = await getAccessiblePropertyIds(userId);
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, code: true, name: true, isActive: true },
  });

  const propertiesWithDepts = await Promise.all(
    properties.map(async (p) => ({
      ...p,
      accessibleDepartments: await prisma.department.findMany({
        where: { id: { in: await getAccessibleDepartmentIds(userId, p.id) } },
        select: { id: true, code: true, name: true },
      }),
    }))
  );

  // Conteggi visibili per tipo (replica esatta del filtro di /api/content per OPERATOR/HOD)
  const userRole = session.user.role;
  const counts: Record<string, number> = {};

  for (const p of propertiesWithDepts) {
    const deptIds = p.accessibleDepartments.map((d) => d.id);
    const orClauses: Record<string, unknown>[] = [
      { targetType: "ROLE", targetRole: "OPERATOR" },
      { targetType: "ROLE", targetRole: userRole },
      { targetType: "USER", targetUserId: userId },
    ];
    if (deptIds.length > 0) {
      orClauses.push({ targetType: "DEPARTMENT", targetDepartmentId: { in: deptIds } });
    }

    const baseWhere = {
      isDeleted: false,
      propertyId: p.id,
      status: "PUBLISHED" as const,
      ...(userRole === "OPERATOR" || userRole === "HOD"
        ? { targetAudience: { some: { OR: orClauses } } }
        : {}),
    };

    for (const type of ["SOP", "DOCUMENT", "MEMO", "STANDARD_BOOK"] as const) {
      const key = `${p.code}_${type}`;
      counts[key] = await prisma.content.count({ where: { ...baseWhere, type } });
    }
  }

  return NextResponse.json(
    {
      sessionUser: session.user,
      dbUser,
      properties: propertiesWithDepts,
      visibleCounts: counts,
      note: "Se i counts sono > 0 ma la UI mostra vuoto, il problema è client-side (cache Safari / bundle vecchio). Fai hard refresh o cancella i dati del sito dalle impostazioni Safari.",
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
  );
}
