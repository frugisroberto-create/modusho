import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  notificationId: z.string().optional(),
  markAll: z.boolean().optional(),
});

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const userId = session.user.id;
  const now = new Date();

  if (parsed.data.markAll) {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
  } else if (parsed.data.notificationId) {
    await prisma.notification.updateMany({
      where: { id: parsed.data.notificationId, userId },
      data: { readAt: now },
    });
  } else {
    return NextResponse.json({ error: "Specificare notificationId o markAll" }, { status: 400 });
  }

  return NextResponse.json({ data: { success: true } });
}
