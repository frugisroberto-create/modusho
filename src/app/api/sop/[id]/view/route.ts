import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Registra visualizzazione SOP (version-aware).
 * Upsert: un record per (contentId, userId, contentVersion).
 * Se rivisto, aggiorna viewedAt.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;

  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: { id: true, type: true, status: true, version: true },
  });

  if (!content || content.type !== "SOP" || content.status !== "PUBLISHED") {
    return NextResponse.json({ error: "SOP non trovata o non pubblicata" }, { status: 404 });
  }

  const now = new Date();

  const record = await prisma.sopViewRecord.upsert({
    where: {
      contentId_userId_contentVersion: {
        contentId,
        userId,
        contentVersion: content.version,
      },
    },
    update: { viewedAt: now },
    create: {
      contentId,
      userId,
      contentVersion: content.version,
      viewedAt: now,
    },
  });

  return NextResponse.json({
    data: {
      contentId: record.contentId,
      contentVersion: record.contentVersion,
      viewedAt: record.viewedAt,
      acknowledgedAt: record.acknowledgedAt,
    },
  });
}
