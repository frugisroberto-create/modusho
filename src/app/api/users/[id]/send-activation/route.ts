/**
 * POST /api/users/[id]/send-activation — solo ADMIN e SUPER_ADMIN.
 *
 * Genera un token di attivazione e invia l'email di invito. È il motore del
 * futuro "Rimanda invito" e serve al collaudo di questa sessione.
 *
 * Scope: l'ADMIN può invitare solo utenti che condividono almeno una property
 * con lui. SUPER_ADMIN non ha questo vincolo (override globale).
 *
 * Guard anti-abuso: massimo un invio al minuto per utente destinatario.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth-tokens";
import { buildActivationEmail, sendEmail, getAppUrl } from "@/lib/email";
import { getAccessiblePropertyIds } from "@/lib/rbac";

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

  const actorRole = session.user.role;
  if (actorRole !== "ADMIN" && actorRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      propertyAssignments: {
        select: {
          propertyId: true,
          property: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  if (!target.isActive) {
    return NextResponse.json(
      { error: "L'utente è disattivato: riattivalo prima di mandargli l'invito." },
      { status: 400 }
    );
  }

  // Scope property: l'ADMIN opera solo dove è assegnato.
  if (actorRole === "ADMIN") {
    const actorProperties = await getAccessiblePropertyIds(session.user.id);
    const shares = target.propertyAssignments.some((a) =>
      actorProperties.includes(a.propertyId)
    );
    if (!shares) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  }

  // Guard: un solo invito al minuto per destinatario.
  const recent = await prisma.authToken.findFirst({
    where: {
      userId: target.id,
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
    userId: target.id,
    type: "ACTIVATION",
    createdById: session.user.id,
  });

  const assignment = target.propertyAssignments[0];
  const activationUrl = `${getAppUrl()}/attiva/${token}`;

  const result = await sendEmail(
    buildActivationEmail({
      name: target.name,
      email: target.email,
      activationUrl,
      propertyName: assignment?.property?.name ?? null,
      departmentName: assignment?.department?.name ?? null,
    })
  );

  if (!result.ok) {
    console.error(`[auth] INVITO invio fallito userId=${target.id} — ${result.error}`);
    return NextResponse.json(
      { error: "Non siamo riusciti a inviare l'email. Riprova tra poco." },
      { status: 502 }
    );
  }

  console.log(
    `[auth] INVITO inviato userId=${target.id} da=${session.user.id} adapter=${result.adapter}`
  );

  return NextResponse.json({
    data: { sent: true, adapter: result.adapter, expiresAt },
  });
}
