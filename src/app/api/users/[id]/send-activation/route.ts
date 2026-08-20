/**
 * POST /api/users/[id]/send-activation
 *
 * (Ri)manda l'invito di attivazione. Il perimetro è quello della matrice:
 * ADMIN e HM nel proprio raggio, HOD col flag solo sugli utenti che ha creato
 * lui e che non si sono ancora attivati.
 *
 * Guard anti-abuso: massimo un invio al minuto per utente destinatario.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth-tokens";
import { buildActivationEmail, sendEmail, getAppUrl } from "@/lib/email";
import { recordUserAudit } from "@/lib/user-audit";
import { loadActor, loadTarget } from "@/lib/user-scope-db";
import { canSendActivation } from "@/lib/user-scope";

/** Intervallo minimo fra due inviti allo stesso utente. */
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

  const verdict = canSendActivation(actor, target);
  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.reason }, { status: 403 });
  }

  const recipient = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      propertyAssignments: {
        select: {
          property: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  if (!recipient.isActive) {
    return NextResponse.json(
      { error: "L'utente è disattivato: riattivalo prima di mandargli l'invito." },
      { status: 400 }
    );
  }

  const recent = await prisma.authToken.findFirst({
    where: {
      userId: recipient.id,
      type: "ACTIVATION",
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { createdAt: true },
  });

  if (recent) {
    return NextResponse.json(
      { error: "Invito già inviato poco fa. Riprova tra un minuto." },
      { status: 429 }
    );
  }

  const { token, expiresAt } = await issueToken({
    userId: recipient.id,
    type: "ACTIVATION",
    createdById: actor.id,
  });

  const assignment = recipient.propertyAssignments[0];
  const activationUrl = `${getAppUrl()}/attiva/${token}`;

  const result = await sendEmail(
    buildActivationEmail({
      name: recipient.name,
      email: recipient.email,
      activationUrl,
      propertyName: assignment?.property?.name ?? null,
      departmentName: assignment?.department?.name ?? null,
    })
  );

  await recordUserAudit({
    userId: recipient.id,
    actorId: actor.id,
    action: "INVITE_SENT",
    meta: {
      adapter: result.adapter,
      ok: result.ok,
      reason: "resend",
      ...(result.reason ? { failure: result.reason } : {}),
    },
  });

  if (!result.ok) {
    console.error(
      `[auth] INVITO invio fallito userId=${recipient.id} motivo=${result.reason ?? "-"}`
    );
    return NextResponse.json(
      {
        error: "Non siamo riusciti a inviare l'email. Riprova tra poco.",
        // Anche quando la mail non parte il link serve, purché il destinatario
        // non si sia già attivato: è il solo modo di consegnare l'invito a mano.
        ...(target.activatedAt === null ? { activationUrl, activationExpiresAt: expiresAt.toISOString() } : {}),
      },
      { status: 502 }
    );
  }

  console.log(
    `[auth] INVITO inviato userId=${recipient.id} da=${actor.id} adapter=${result.adapter}`
  );

  return NextResponse.json({
    data: {
      sent: true,
      adapter: result.adapter,
      expiresAt,
      // Il link esce SOLO per chi non si è ancora attivato. Su un account già
      // attivo l'unica via è la reimpostazione, che arriva alla sua casella.
      ...(target.activatedAt === null
        ? { activationUrl, activationExpiresAt: expiresAt.toISOString() }
        : {}),
    },
  });
}
