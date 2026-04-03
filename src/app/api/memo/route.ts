import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, checkAccess, canUserManageContentType } from "@/lib/rbac";
import { sendContentPublishedPush } from "@/lib/push-notification";
import { z } from "zod/v4";

const memoQuerySchema = z.object({
  propertyId: z.string(),
  includeExpired: z.enum(["true", "false"]).optional(),
  status: z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = memoQuerySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { propertyId, includeExpired, status, page, pageSize } = parsed.data;
  const userId = session.user.id;

  // RBAC
  const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
  if (!accessiblePropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const now = new Date();
  const where: Record<string, unknown> = {
    propertyId,
    content: { status: (status || "PUBLISHED") as "PUBLISHED" | "ARCHIVED" },
  };

  // Admin può vedere anche i memo scaduti
  if (includeExpired !== "true") {
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  }

  const [memos, total] = await Promise.all([
    prisma.memo.findMany({
      where,
      include: {
        content: {
          select: {
            id: true,
            title: true,
            body: true,
            publishedAt: true,
            createdBy: { select: { name: true } },
            isFeatured: true,
            acknowledgments: {
              where: { userId },
              select: { acknowledgedAt: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ isPinned: "desc" }, { content: { publishedAt: "desc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.memo.count({ where }),
  ]);

  return NextResponse.json({
    data: memos.map((m) => ({
      id: m.id,
      contentId: m.contentId,
      title: m.content.title,
      body: m.content.body,
      publishedAt: m.content.publishedAt,
      author: m.content.createdBy.name,
      isPinned: m.isPinned,
      expiresAt: m.expiresAt,
      isFeatured: m.content.isFeatured,
      acknowledged: m.content.acknowledgments.length > 0,
      acknowledgedAt: m.content.acknowledgments[0]?.acknowledgedAt ?? null,
    })),
    meta: { page, pageSize, total },
  });
}

// --- POST: Crea memo ---
const createMemoSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  expiresAt: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  if (!session.user.canEdit) {
    return NextResponse.json({ error: "Non hai permessi di modifica" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createMemoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parametri non validi", details: parsed.error.issues }, { status: 400 });

  const { title, body: memoBody, propertyId, expiresAt, isPinned } = parsed.data;

  // Verifica permesso sul tipo MEMO
  const canManageMemo = await canUserManageContentType(session.user.id, "MEMO");
  if (!canManageMemo) {
    return NextResponse.json({ error: "Non hai permesso di creare memo" }, { status: 403 });
  }
  const userId = session.user.id;

  const hasAccess = await checkAccess(userId, "HOTEL_MANAGER", propertyId);
  if (!hasAccess) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  // Crea Content + Memo + StatusHistory in transazione
  const content = await prisma.content.create({
    data: {
      type: "MEMO",
      title,
      body: memoBody,
      status: "PUBLISHED",
      propertyId,
      createdById: userId,
      updatedById: userId,
      publishedAt: new Date(),
    },
  });

  await prisma.memo.create({
    data: {
      contentId: content.id,
      propertyId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isPinned: isPinned ?? false,
    },
  });

  await prisma.contentStatusHistory.create({
    data: {
      contentId: content.id,
      fromStatus: null,
      toStatus: "PUBLISHED",
      changedById: userId,
    },
  });

  // Push notification best-effort (await per Vercel serverless)
  await sendContentPublishedPush({
    contentId: content.id,
    contentTitle: title,
    contentType: "MEMO",
    actorId: userId,
  }).catch(() => {});

  return NextResponse.json({ data: { id: content.id } }, { status: 201 });
}
