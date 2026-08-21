/**
 * POST /api/users/[id]/assignments — aggiunge una singola assegnazione.
 *
 * È la porta gemella di POST /api/users e PUT /api/users/[id]: scrive nella
 * stessa tabella e deve rispettare lo stesso perimetro. Usa perciò le stesse
 * funzioni (`loadActor` + `validateAssignments`), non una regola propria.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { loadActor, validateAssignments } from "@/lib/user-scope-db";

const assignmentSchema = z.object({
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = await request.json();
  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });

  const { propertyId, departmentId } = parsed.data;

  // ─── Perimetro: il gate sul ruolo dice CHI può assegnare, non DOVE. Anche
  // un ADMIN scrive solo dentro le proprie strutture, e il reparto dev'essere
  // davvero di quella struttura — il database non lo garantisce ───
  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const verdict = await validateAssignments(actor, [{ propertyId, departmentId }], {
    outsideProperty: "Non puoi assegnare questo utente a una struttura fuori dal tuo perimetro.",
    outsideDepartment: "Non puoi assegnare questo utente a un reparto fuori dal tuo perimetro.",
  });
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 403 });
  }

  // Verifica che utente e property esistano
  const [user, property] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.property.findUnique({ where: { id: propertyId } }),
  ]);

  if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  if (!property) return NextResponse.json({ error: "Property non trovata" }, { status: 404 });

  // Check duplicato
  const existing = await prisma.propertyAssignment.findFirst({
    where: { userId, propertyId, departmentId: departmentId || null },
  });
  if (existing) return NextResponse.json({ error: "Assegnazione già esistente" }, { status: 409 });

  const assignment = await prisma.propertyAssignment.create({
    data: { userId, propertyId, departmentId: departmentId || null },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ data: assignment }, { status: 201 });
}
