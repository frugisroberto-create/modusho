import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

const OPERATOR_TYPES: NotificationType[] = ["CONTENT_PUBLISHED", "ACK_REMINDER"];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const userId = session.user.id;
  const role = session.user.role;
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(params.get("pageSize") || "20", 10)));

  const typeFilter = role === "OPERATOR" ? { type: { in: OPERATOR_TYPES } } : {};

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...typeFilter },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        url: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId, ...typeFilter } }),
  ]);

  return NextResponse.json({ data: notifications, meta: { page, pageSize, total } });
}
