/**
 * POST /api/users/[id]/send-activation
 *
 * (Ri)manda l'invito di attivazione. Il perimetro è quello della matrice:
 * ADMIN e HM nel proprio raggio, HOD col flag solo sugli utenti che ha creato
 * lui e che non si sono ancora attivati.
 *
 * Il link viene SEMPRE generato e restituito a chi lo richiede — attivato o no,
 * prima o millesima volta. Quando l'email non arriva, il link consegnato a mano
 * è l'unica via, e un utente con l'indirizzo sbagliato sarebbe altrimenti
 * irrecuperabile dall'interno dell'applicazione.
 *
 * Guard anti-abuso: massimo un INVIO di email al minuto per destinatario. Dentro
 * quella finestra la richiesta riesce comunque e il link esce, ma l'email non
 * viene rispedita: il campo `emailSent` lo dichiara e `notice` lo spiega.
 *
 * Ogni generazione lascia un evento in UserAuditEvent — chi, per chi, quando —
 * con `targetWasActive` a marcare i casi in cui il link permette di entrare come
 * l'interessato. Il valore del token non finisce mai né nel registro né nei log.
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

  // Il cooldown non blocca più la richiesta: sopprime il solo INVIO dell'email.
  // Il link viene generato e restituito comunque — è la via di riserva, e negarla
  // proprio nel minuto in cui ci si accorge che l'indirizzo è sbagliato la
  // renderebbe inutile.
  const recent = await prisma.authToken.findFirst({
    where: {
      userId: recipient.id,
      type: "ACTIVATION",
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { createdAt: true },
  });
  const emailSuppressed = Boolean(recent);

  const { token, expiresAt } = await issueToken({
    userId: recipient.id,
    type: "ACTIVATION",
    createdById: actor.id,
  });

  const assignment = recipient.propertyAssignments[0];
  const activationUrl = `${getAppUrl()}/attiva/${token}`;

  // Decisione ratificata: il link si mostra SEMPRE a chi lo genera, attivato o
  // no. Chi ha già attivato riceve, accanto al link, l'avviso che consente di
  // entrare come lui — vedi l'interfaccia. Qui si registra soltanto il fatto.
  const targetWasActive = Boolean(target.activatedAt);

  const result = emailSuppressed
    ? null
    : await sendEmail(
        buildActivationEmail({
          name: recipient.name,
          email: recipient.email,
          activationUrl,
          propertyName: assignment?.property?.name ?? null,
          departmentName: assignment?.department?.name ?? null,
        })
      );

  // Il token in chiaro non entra MAI qui: si registra l'evento, non la credenziale.
  await recordUserAudit({
    userId: recipient.id,
    actorId: actor.id,
    action: "INVITE_SENT",
    meta: {
      reason: "resend",
      emailSent: result?.ok ?? false,
      emailSuppressed,
      // Su un utente già attivo il link permette di impostare una password e
      // quindi di entrare come lui: la traccia è l'unica rilevabilità rimasta.
      targetWasActive,
      ...(result ? { adapter: result.adapter, ok: result.ok } : {}),
      ...(result?.reason ? { failure: result.reason } : {}),
    },
  });

  const linkPayload = {
    activationUrl,
    activationExpiresAt: expiresAt.toISOString(),
    targetWasActive,
  };

  if (result && !result.ok) {
    console.error(
      `[auth] INVITO invio fallito userId=${recipient.id} motivo=${result.reason ?? "-"}`
    );
    return NextResponse.json(
      {
        error: "Non siamo riusciti a inviare l'email. Riprova tra poco.",
        // La mail non è partita: il link è l'unico modo di consegnare l'invito.
        ...linkPayload,
      },
      { status: 502 }
    );
  }

  console.log(
    emailSuppressed
      ? `[auth] INVITO link rigenerato senza invio userId=${recipient.id} da=${actor.id}`
      : `[auth] INVITO inviato userId=${recipient.id} da=${actor.id} adapter=${result?.adapter}`
  );

  return NextResponse.json({
    data: {
      // `sent` dice se l'email è partita davvero, non se la richiesta è riuscita.
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
