import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";
import { computeCoverage, RECIPIENT_COVERAGE_SELECT } from "@/lib/recipient-set-db";
import { z } from "zod/v4";

const ROLE_HIERARCHY: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, CORPORATE: 2, ADMIN: 3, SUPER_ADMIN: 4,
};

const complianceQuerySchema = z.object({
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  type: z.enum(["SOP", "DOCUMENT", "MEMO"]).optional(),
  /**
   * Quale stato mostrare. Il valore predefinito è "aperta" perché questa pagina
   * serve a rincorrere ciò che manca; gli altri stati non spariscono, si
   * raggiungono con un clic e il conteggio è sempre in vista.
   */
  state: z.enum(["aperta", "completata", "senza-destinatari"]).default("aperta"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userRole = session.user.role;
  const userId = session.user.id;

  // Minimum role: HOD
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = complianceQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { propertyId, departmentId, type, state, page, pageSize } = parsed.data;

  // RBAC: get accessible property IDs
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (accessiblePropertyIds.length === 0) {
    return NextResponse.json({
      data: [],
      meta: { page, pageSize, total: 0, state: parsed.data.state, counts: { aperta: 0, completata: 0, "senza-destinatari": 0 } },
    });
  }

  let filteredPropertyIds = accessiblePropertyIds;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredPropertyIds = [propertyId];
  }

  // Build base where clause
  // Nessun filtro sui destinatari: un contenuto pubblicato che non ne ha —
  // o le cui righe non risolvono nessuna persona — è proprio quello che
  // bisogna vedere, non quello da nascondere. Lo stato "senza-destinatari" lo
  // porta a galla.
  const where: Record<string, unknown> = {
    isDeleted: false,
    status: "PUBLISHED",
    propertyId: { in: filteredPropertyIds },
  };

  // Brand Book e Standard Book sono documenti di consultazione, non soggetti
  // a presa visione obbligatoria — esclusi dalla compliance.
  // I documenti hanno il pannello di lettura come le SOP e i memo: tenerli
  // fuori dall'elenco predefinito significava non chiederne mai conto.
  if (type) {
    where.type = type;
  } else {
    where.type = { in: ["SOP", "DOCUMENT", "MEMO"] };
  }
  if (departmentId) where.departmentId = departmentId;

  // HOD: only their own content
  if (userRole === "HOD") {
    where.createdById = userId;
  }

  // Contenuti che rientrano nel perimetro, con destinatari e letture.
  const contents = await prisma.content.findMany({
    where,
    select: {
      id: true,
      code: true,
      type: true,
      title: true,
      propertyId: true,
      department: { select: { id: true, name: true, code: true } },
      property: { select: { id: true, name: true, code: true } },
      ...RECIPIENT_COVERAGE_SELECT,
    },
    orderBy: { publishedAt: "desc" },
  });

  // Chi deve leggere e chi ha letto: la regola sta in `recipient-set.ts`, ed è
  // la stessa che il cruscotto usa per il tasso e per gli allarmi. Prima questa
  // rotta se la calcolava da sola, e le due risposte potevano divergere.
  const rows = await computeCoverage(contents);

  // Quante righe ci sono in ciascuno stato, PRIMA di filtrare per stato: è il
  // numero che la pagina mostra sulle linguette, e serve a far vedere che una
  // riga completata non è sparita, si è solo chiusa.
  const counts = {
    aperta: rows.filter((r) => r.state === "aperta").length,
    completata: rows.filter((r) => r.state === "completata").length,
    "senza-destinatari": rows.filter((r) => r.state === "senza-destinatari").length,
  };

  const results = rows
    .filter((row) => row.state === state)
    .map((row) => ({
      id: row.content.id,
      code: row.content.code,
      type: row.content.type,
      title: row.content.title,
      department: row.content.department,
      property: row.content.property,
      targetCount: row.coverage.required,
      ackedCount: row.coverage.done,
      state: row.state,
    }));

  // Paginate results
  const total = results.length;
  const paginated = results.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    data: paginated,
    meta: { page, pageSize, total, state, counts },
  });
}
