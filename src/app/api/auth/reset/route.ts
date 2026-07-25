/**
 * POST /api/auth/reset — pubblica.
 *
 * Come /activate ma con token RESET. Imposta anche `passwordChangedAt`, che
 * fa decadere le sessioni aperte altrove: se qualcuno era entrato con la
 * vecchia password, da questo momento è fuori.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { consumeToken, findValidToken } from "@/lib/auth-tokens";
import { passwordSchema } from "@/lib/password-policy";
import { checkRateLimit, recordFailedAttempt, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const INVALID_TOKEN_MESSAGE =
  "Questo link non è più valido. Richiedine uno nuovo dalla pagina di accesso.";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const ipCheck = await checkRateLimit(ip);
  if (!ipCheck.allowed) {
    const retryMin = Math.ceil(ipCheck.retryAfterMs / 60000);
    return NextResponse.json(
      { error: `Troppi tentativi. Riprova tra ${retryMin} minuti.` },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dati non validi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const now = new Date();

  const owner = await findValidToken(token, "RESET", now);
  if (!owner) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  }

  const consumed = await consumeToken(token, "RESET", now);
  if (!consumed.ok) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
    },
  });

  console.log(`[auth] RESET completato userId=${consumed.userId} ip=${ip}`);

  return NextResponse.json({ data: { email: owner.email, name: owner.name } });
}
