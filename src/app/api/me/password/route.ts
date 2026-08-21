/**
 * POST /api/me/password — autenticata, disponibile a TUTTI i ruoli.
 *
 * Cambio password volontario o forzato (mustChangePassword). Richiede la
 * password attuale: senza quella, chi trovasse una sessione aperta potrebbe
 * prendersi l'account.
 *
 * Imposta `passwordChangedAt`, quindi le sessioni aperte su altri dispositivi
 * decadono. La sessione corrente viene rinnovata dal client con un signIn
 * silenzioso subito dopo la risposta (NextAuth resta l'unico emettitore).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/password-policy";
import {
  checkEmailRateLimit,
  recordFailedAttempt,
  resetAttempts,
  getClientIp,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  // Facoltativa SOLO nel primo cambio forzato (mustChangePassword a true sul
  // record utente): lì l'utente ha appena fatto login e la pagina bloccante
  // chiede due soli campi. In ogni altro caso è obbligatoria e viene verificata.
  currentPassword: z.string().optional(),
  newPassword: passwordSchema,
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const email = session.user.email;

  // Rate limiting sui tentativi falliti: stesso meccanismo del login.
  const emailCheck = await checkEmailRateLimit(email);
  if (!emailCheck.allowed) {
    const retryMin = Math.ceil(emailCheck.retryAfterMs / 60000);
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

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true, isActive: true, mustChangePassword: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Il primo cambio forzato non richiede la password attuale: la fonte di
  // verità è il flag sul record utente, mai quello che dichiara il client.
  const isForcedFirstChange = user.mustChangePassword === true;

  if (!isForcedFirstChange) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Inserisci la password attuale." }, { status: 400 });
    }

    const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentValid) {
      await recordFailedAttempt(ip, email);
      console.warn(`[auth] CAMBIO-PASSWORD password attuale errata userId=${user.id} ip=${ip}`);
      return NextResponse.json({ error: "La password attuale non è corretta." }, { status: 400 });
    }
  }

  const sameAsBefore = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsBefore) {
    return NextResponse.json(
      { error: "La nuova password deve essere diversa da quella attuale." },
      { status: 400 }
    );
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
    },
  });

  await resetAttempts(ip, email);
  console.log(`[auth] CAMBIO-PASSWORD ok userId=${user.id} ip=${ip}`);

  return NextResponse.json({ data: { email: user.email } });
}
