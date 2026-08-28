import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAccess } from "@/lib/rbac";
import { loadAccountableCandidates } from "@/lib/accountable-scope-db";
import { z } from "zod/v4";

// ─── GET: la rosa dei candidati Accountable per struttura + reparto ───
//
// La rosa la calcola accountable-scope.ts (via accountable-scope-db.ts): qui
// si autorizza e si chiama, non si ricalcola nulla. Usata dal modulo SOP per
// costruire il selettore quando chi apre è HOD o HOTEL_MANAGER.

const querySchema = z.object({
  propertyId: z.string().min(1),
  // Vuoto/assente per una SOP senza reparto proprietario (caso raro, possibile
  // solo dopo modifica): la rosa si restringe agli ADMIN della struttura, come
  // fa la regola pura quando nessuna assegnazione ha un reparto corrispondente.
  departmentId: z.string().optional().default(""),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }
  const { propertyId, departmentId } = parsed.data;

  // Solo chi può aprire una SOP per questa struttura/reparto vede la rosa.
  const hasAccess = await checkAccess(session.user.id, "HOD", propertyId, departmentId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato a questa struttura/reparto" }, { status: 403 });
  }

  const candidates = await loadAccountableCandidates(propertyId, departmentId);
  return NextResponse.json({ data: candidates });
}
