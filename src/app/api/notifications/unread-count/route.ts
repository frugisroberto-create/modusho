import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

const OPERATOR_TYPES: NotificationType[] = ["CONTENT_PUBLISHED", "ACK_REMINDER"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const typeFilter = session.user.role === "OPERATOR" ? { type: { in: OPERATOR_TYPES } } : {};

  const count = await prisma.notification.count({
    where: { userId: session.user.id, readAt: null, ...typeFilter },
  });

  return NextResponse.json({ data: { count } });
}
