/**
 * POST /api/auth/activate — pubblica.
 *
 * Completa l'invito: valida il token ACTIVATION, applica la policy password,
 * imposta la password scelta dall'utente e marca l'account come attivato.
 *
 * Il login automatico avviene lato client: la pagina chiama signIn() con le
 * credenziali appena impostate. NextAuth resta l'unico emettitore di sessioni.
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

// Messaggio neutro: non rivela se il token non esiste, è scaduto o è già usato.
const INVALID_TOKEN_MESSAGE =
  "Questo link non è più valido. Chiedi al tuo responsabile di rimandarti l'invito.";

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

  // Verifica prima di consumare: serve l'utente per la risposta e per l'email.
  const owner = await findValidToken(token, "ACTIVATION", now);
  if (!owner) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  }

  // Consumo atomico: se un'altra richiesta ha già usato il token, qui fallisce.
  const consumed = await consumeToken(token, "ACTIVATION", now);
  if (!consumed.ok) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash,
      activatedAt: now,
      mustChangePassword: false,
    },
  });

  console.log(`[auth] ACTIVATED userId=${consumed.userId} ip=${ip}`);

  // L'email serve al client per il signIn immediato.
  return NextResponse.json({ data: { email: owner.email, name: owner.name } });
}
