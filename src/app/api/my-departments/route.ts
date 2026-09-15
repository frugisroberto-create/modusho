import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessibleDepartmentIds, getOperativeDepartmentIds } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const propertyId = request.nextUrl.searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });

  // scope=operative: solo i reparti in cui l'utente lavora, senza i reparti
  // visibili aggiuntivi. Serve dove si sceglie a chi scrivere; i filtri di
  // consultazione (liste, approvazioni) usano il perimetro completo.
  const operativeOnly = request.nextUrl.searchParams.get("scope") === "operative";
  const deptIds = operativeOnly
    ? await getOperativeDepartmentIds(session.user.id, propertyId)
    : await getAccessibleDepartmentIds(session.user.id, propertyId);

  const departments = await prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: departments });
}
