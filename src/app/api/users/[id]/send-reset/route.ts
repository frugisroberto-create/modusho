/**
 * POST /api/users/[id]/send-reset
 *
 * Manda il link di reimpostazione password a un utente GIÀ attivato. Serve a
 * chi si è perso la password e non riesce a usare "Password dimenticata?".
 *
 * Perimetro: ADMIN e HM nel proprio raggio. Chi non si è ancora attivato non
 * riceve un reset ma un invito (rotta diversa): il messaggio lo dice.
 *
 * Guard anti-abuso: massimo un invio al minuto per utente destinatario.
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

  const recent = await prisma.authToken.findFirst({
    where: {
      userId: recipient.id,
      type: "RESET",
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { createdAt: true },
  });

  if (recent) {
    return NextResponse.json(
      { error: "Link già inviato poco fa. Riprova tra un minuto." },
      { status: 429 }
    );
  }

  const { token, expiresAt } = await issueToken({
    userId: recipient.id,
    type: "RESET",
    createdById: actor.id,
  });

  const result = await sendEmail(
    buildResetEmail({
      name: recipient.name,
      email: recipient.email,
      resetUrl: `${getAppUrl()}/reimposta/${token}`,
    })
  );

  await recordUserAudit({
    userId: recipient.id,
    actorId: actor.id,
    action: "RESET_SENT",
    meta: { adapter: result.adapter, ok: result.ok },
  });

  if (!result.ok) {
    console.error(`[auth] RESET invio fallito userId=${recipient.id} — ${result.error}`);
    return NextResponse.json(
      { error: "Non siamo riusciti a inviare l'email. Riprova tra poco." },
      { status: 502 }
    );
  }

  console.log(
    `[auth] RESET inviato userId=${recipient.id} da=${actor.id} adapter=${result.adapter}`
  );

  return NextResponse.json({
    data: { sent: true, adapter: result.adapter, expiresAt },
  });
}
