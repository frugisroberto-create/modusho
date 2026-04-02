import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const confirmSchema = z.object({
  note: z.string().optional(),
});

/**
 * POST: C conferma la consultazione sulla versione corrente della bozza.
 *
 * Regole:
 * - solo C puo' confermare
 * - la SOP deve essere sottoposta a C (submittedToC = true)
 * - la consultazione non deve essere gia' confermata per la versione corrente
 * - la conferma e' legata alla versione corrente (textVersionCount)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
  }

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      sopStatus: true,
      consultedId: true,
      submittedToC: true,
      textVersionCount: true,
      consultedConfirmedVersion: true,
      content: { select: { status: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  // Solo C puo' confermare
  if (userId !== wf.consultedId) {
    return NextResponse.json({ error: "Solo il consultato (C) puo' confermare la consultazione" }, { status: 403 });
  }

  // Deve essere in stato draft (non pubblicata/archiviata)
  const draftStatuses = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  if (!draftStatuses.includes(wf.content.status)) {
    return NextResponse.json({ error: "La SOP non e' in lavorazione" }, { status: 400 });
  }

  // Deve essere sottoposta a C
  if (!wf.submittedToC) {
    return NextResponse.json({ error: "La bozza non e' stata sottoposta a C" }, { status: 400 });
  }

  // Non deve essere gia' confermata per questa versione
  if (wf.consultedConfirmedVersion === wf.textVersionCount) {
    return NextResponse.json({ error: "Consultazione gia' confermata per questa versione" }, { status: 409 });
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: {
        consultedConfirmedAt: now,
        consultedConfirmedById: userId,
        consultedConfirmedVersion: wf.textVersionCount,
        consultedConfirmedNote: parsed.data.note || null,
      },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "C_CONSULTATION_CONFIRMED",
        actorId: userId,
        metadata: {
          version: wf.textVersionCount,
          ...(parsed.data.note ? { note: parsed.data.note } : {}),
        },
      },
    }),
  ]);

  return NextResponse.json({
    data: { confirmedAt: now, version: wf.textVersionCount },
  });
}
