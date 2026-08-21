/**
 * POST /api/users/[id]/send-reset
 *
 * Manda il link di reimpostazione password a un utente GIÀ attivato. Serve a
 * chi si è perso la password e non riesce a usare "Password dimenticata?".
 *
 * Perimetro: ADMIN e HM nel proprio raggio. Chi non si è ancora attivato non
 * riceve un reset ma un invito (rotta diversa): il messaggio lo dice.
 *
 * Il link viene SEMPRE generato e restituito a chi lo richiede: quando l'email
 * non arriva è l'unica via. Chi lo riceve può impostare una nuova password e
 * quindi entrare come l'interessato — l'avviso all'operatore sta nell'interfaccia,
 * la traccia in UserAuditEvent.
 *
 * Guard anti-abuso: massimo un INVIO di email al minuto per destinatario. Dentro
 * quella finestra la richiesta riesce comunque e il link esce, ma l'email non
 * viene rispedita: il campo `emailSent` lo dichiara e `notice` lo spiega.
 *
 * Il valore del token non finisce mai né nel registro né nei log.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth-tokens";
import { buildResetEmail, sendEmail, getAppUrl } from "@/lib/email";
import { recordUserAudit } from "@/lib/user-audit";
import { loadActor, loadTarget } from "@/lib/user-scope-db";
import { canSendReset } from "@/lib/user-scope";

const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;

  const actor = await loadActor(session.user.id);
  if (!actor) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  const verdict = canSendReset(actor, target);
  if (!verdict.allowed) {
    // "Non ancora attivato" è una condizione dell'utente, non un divieto.
    const status = target.activatedAt === null ? 400 : 403;
    return NextResponse.json({ error: verdict.reason }, { status });
  }

  const recipient = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  if (!recipient.isActive) {
    return NextResponse.json(
      { error: "L'utente è disattivato: riattivalo prima di mandargli il link." },
      { status: 400 }
    );
  }

  // Il cooldown sopprime il solo INVIO dell'email, non la generazione del link:
  // vedi la nota gemella in send-activation.
  const recent = await prisma.authToken.findFirst({
    where: {
      userId: recipient.id,
      type: "RESET",
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { createdAt: true },
  });
  const emailSuppressed = Boolean(recent);

  const { token, expiresAt } = await issueToken({
    userId: recipient.id,
    type: "RESET",
    createdById: actor.id,
  });

  const resetUrl = `${getAppUrl()}/reimposta/${token}`;

  // Questa rotta agisce per definizione su utenti già attivati (canSendReset lo
  // impone), quindi il link consente sempre di entrare come l'interessato.
  const targetWasActive = Boolean(target.activatedAt);

  const result = emailSuppressed
    ? null
    : await sendEmail(
        buildResetEmail({
          name: recipient.name,
          email: recipient.email,
          resetUrl,
        })
      );

  // Il token in chiaro non entra MAI qui: si registra l'evento, non la credenziale.
  await recordUserAudit({
    userId: recipient.id,
    actorId: actor.id,
    action: "RESET_SENT",
    meta: {
      emailSent: result?.ok ?? false,
      emailSuppressed,
      targetWasActive,
      ...(result ? { adapter: result.adapter, ok: result.ok } : {}),
      ...(result?.reason ? { failure: result.reason } : {}),
    },
  });

  const linkPayload = {
    activationUrl: resetUrl,
    activationExpiresAt: expiresAt.toISOString(),
    targetWasActive,
  };

  if (result && !result.ok) {
    console.error(`[auth] RESET invio fallito userId=${recipient.id} motivo=${result.reason ?? "-"}`);
    return NextResponse.json(
      {
        error: "Non siamo riusciti a inviare l'email. Riprova tra poco.",
        ...linkPayload,
      },
      { status: 502 }
    );
  }

  console.log(
    emailSuppressed
      ? `[auth] RESET link rigenerato senza invio userId=${recipient.id} da=${actor.id}`
      : `[auth] RESET inviato userId=${recipient.id} da=${actor.id} adapter=${result?.adapter}`
  );

  return NextResponse.json({
    data: {
      sent: !emailSuppressed,
      emailSent: !emailSuppressed,
      adapter: result?.adapter ?? null,
      expiresAt,
      ...(emailSuppressed
        ? {
            notice:
              "L'email non è stata rispedita: ne è già partita una meno di un minuto fa. Usa il link qui sotto per consegnare l'accesso a mano.",
          }
        : {}),
      ...linkPayload,
    },
  });
}
