import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/**
 * POST: Salva o aggiorna una push subscription.
 * Se l'endpoint esiste già, aggiorna i dati e riassocia all'utente corrente.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  const userId = session.user.id;

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ data: { id: subscription.id } });
}

/**
 * DELETE: Rimuove una push subscription dell'utente corrente.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.user.id },
  });

  return NextResponse.json({ data: { removed: true } });
}
