import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAccessiblePropertyIds, getAccessibleDepartmentIds } from "@/lib/rbac";
import { z } from "zod/v4";

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  propertyId: z.string().optional(),
  departmentId: z.string().optional(),
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "STANDARD_BOOK", "BRAND_BOOK"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = searchSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { q, propertyId, departmentId, type, page, pageSize } = parsed.data;
  const userId = session.user.id;

  // RBAC: determina property accessibili
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (accessiblePropertyIds.length === 0) {
    return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
  }

  // Se specificata una propertyId, verificare che sia accessibile
  let filteredPropertyIds = accessiblePropertyIds;
  if (propertyId) {
    if (!accessiblePropertyIds.includes(propertyId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    filteredPropertyIds = [propertyId];
  }

  // RBAC: determina department accessibili per ogni property
  let departmentFilter: string[] | null = null;
  if (departmentId) {
    // Verifica accesso al department nella property specificata
    const propId = propertyId || filteredPropertyIds[0];
    const accessibleDepts = await getAccessibleDepartmentIds(userId, propId);
    if (!accessibleDepts.includes(departmentId)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
    departmentFilter = [departmentId];
  } else {
    // Raccogli tutti i department accessibili
    const allDepts: string[] = [];
    for (const pid of filteredPropertyIds) {
      const depts = await getAccessibleDepartmentIds(userId, pid);
      allDepts.push(...depts);
    }
    departmentFilter = allDepts;
  }

  const offset = (page - 1) * pageSize;

  // Sanitize query per tsquery: rimuovi caratteri speciali, aggiungi :* per prefix matching
  const sanitized = q
    .replace(/[^\w\sàèéìòùÀÈÉÌÒÙ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word}:*`)
    .join(" & ");

  if (!sanitized) {
    return NextResponse.json({ data: [], meta: { page, pageSize, total: 0 } });
  }

  // Build safe type filters using Prisma.sql
  const typeCondition = type ? Prisma.sql`AND c."type" = ${type}` : Prisma.empty;
  const brandBookCondition = (session.user.role === "OPERATOR" || session.user.role === "HOD")
    ? Prisma.sql`AND c."type" != 'BRAND_BOOK'`
    : Prisma.empty;

  // Status filter:
  //  - OPERATOR: only PUBLISHED
  //  - HOD/HM/ADMIN/SUPER_ADMIN: all active states (PUBLISHED + DRAFT + REVIEW_*+RETURNED)
  //    Always excluded: ARCHIVED (never returned in search)
  const statusCondition = session.user.role === "OPERATOR"
    ? Prisma.sql`AND c.status = 'PUBLISHED'`
    : Prisma.sql`AND c.status != 'ARCHIVED'`;

  // Visibility filter:
  //  - OPERATOR/HOD: filter by ContentTarget (targetAudience) for PUBLISHED content
  //    BUT for HOD on DRAFT/REVIEW we use the legacy department-based filter
  //    so HOD can search in all drafts of their perimeter (departments assigned).
  //  - HM/ADMIN/SUPER_ADMIN: legacy department-based filter.
  const isOperator = session.user.role === "OPERATOR";
  const visibilityCondition = isOperator
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "ContentTarget" ct
        WHERE ct."contentId" = c.id
          AND (
            (ct."targetType" = 'ROLE' AND ct."targetRole" = 'OPERATOR')
            OR (ct."targetType" = 'DEPARTMENT' AND ct."targetDepartmentId" = ANY(${departmentFilter}))
          )
      )`
    : Prisma.sql`AND (c."departmentId" IS NULL OR c."departmentId" = ANY(${departmentFilter}))`;

  // Full-text search with PostgreSQL (safe parameterized query)
  const results = await prisma.$queryRaw<
    { id: string; title: string; type: string; snippet: string; rank: number }[]
  >`
    SELECT
      c.id,
      c.title,
      c."type",
      ts_headline('italian', c.body, to_tsquery('italian', ${sanitized}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15'
      ) as snippet,
      ts_rank(to_tsvector('italian', c.title || ' ' || c.body), to_tsquery('italian', ${sanitized})) as rank
    FROM "Content" c
    WHERE c."isDeleted" = false
      ${statusCondition}
      AND c."propertyId" = ANY(${filteredPropertyIds})
      ${visibilityCondition}
      ${typeCondition}
      ${brandBookCondition}
      AND (
        to_tsvector('italian', c.title || ' ' || c.body) @@ to_tsquery('italian', ${sanitized})
        OR c.title ILIKE '%' || ${q} || '%'
      )
    ORDER BY rank DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  // Count total
  const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM "Content" c
    WHERE c."isDeleted" = false
      ${statusCondition}
      AND c."propertyId" = ANY(${filteredPropertyIds})
      ${visibilityCondition}
      ${typeCondition}
      ${brandBookCondition}
      AND (
        to_tsvector('italian', c.title || ' ' || c.body) @@ to_tsquery('italian', ${sanitized})
        OR c.title ILIKE '%' || ${q} || '%'
      )
  `;

  const total = Number(countResult[0]?.count ?? 0);

  return NextResponse.json({
    data: results.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      snippet: r.snippet,
      rank: Number(r.rank),
    })),
    meta: { page, pageSize, total },
  });
}
