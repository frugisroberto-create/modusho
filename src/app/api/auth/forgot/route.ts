/**
 * POST /api/auth/forgot — pubblica.
 *
 * Anti-enumerazione: la risposta è SEMPRE la stessa, con lo stesso testo e lo
 * stesso tempo di risposta, che l'email esista o no. Chi prova indirizzi a caso
 * non deve poter distinguere un account esistente da uno inesistente, né dal
 * corpo della risposta né da quanto ci mette ad arrivare.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { issueToken } from "@/lib/auth-tokens";
import { buildResetEmail, sendEmail, getAppUrl } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email-normalize";
import { findUserForReset } from "@/lib/login-lookup-db";

const bodySchema = z.object({
  email: z.string().min(1).max(320),
});

const NEUTRAL_MESSAGE =
  "Se l'indirizzo è registrato in ModusHO riceverai un'email entro pochi minuti. Controlla anche la posta indesiderata.";

/** Pavimento di durata: livella il tempo di risposta fra i due rami. */
const MIN_RESPONSE_MS = 800;

async function neutralResponse(startedAt: number): Promise<NextResponse> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }
  return NextResponse.json({ data: { message: NEUTRAL_MESSAGE } });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
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
  // Anche un body malformato riceve la risposta neutra: nessun segnale utile.
  if (!parsed.success) return neutralResponse(startedAt);

  const email = normalizeEmail(parsed.data.email);

  // Stessa ricerca del login (case-insensitive, vedi login-lookup-db.ts):
  // copre anche un indirizzo salvato con maiuscole, digitato qui in
  // minuscolo. Se più righe idonee corrispondono (indirizzi che differiscono
  // solo per maiuscole/minuscole), non si sceglie: nessuna email, come per
  // qualunque altro caso non idoneo — l'ambiguità non deve mai diventare
  // visibile dall'esterno.
  const lookup = await findUserForReset(email);

  if (lookup.kind === "ambiguous") {
    console.error(
      `[auth] ANOMALIA-EMAIL-DUPLICATA ip=${ip} email=${email} — ${lookup.count} account corrispondono, nessun reset inviato. Richiede pulizia manuale.`
    );
    return neutralResponse(startedAt);
  }

  // Nessuna email a chi non esiste, è disattivato o non ha mai attivato
  // l'account (per quel caso serve un nuovo invito, non un reset).
  if (lookup.kind === "not_found") {
    console.log(`[auth] FORGOT ignorata ip=${ip} — nessun destinatario idoneo`);
    return neutralResponse(startedAt);
  }

  const user = lookup.user;

  const { token } = await issueToken({ userId: user.id, type: "RESET" });
  const resetUrl = `${getAppUrl()}/reimposta/${token}`;

  const result = await sendEmail(
    buildResetEmail({ name: user.name, email: user.email, resetUrl })
  );

  if (!result.ok) {
    // L'utente riceve comunque la risposta neutra: il problema è nostro,
    // ma resta tracciato nei log per il collaudo.
    console.error(`[auth] FORGOT invio fallito userId=${user.id} — ${result.error}`);
  } else {
    console.log(`[auth] FORGOT inviata userId=${user.id} adapter=${result.adapter}`);
  }

  return neutralResponse(startedAt);
}
