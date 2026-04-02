import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

type RouteParams = { params: Promise<{ id: string }> };

const delegateSchema = z.object({
  hodUserId: z.string().min(1),
});

/**
 * POST: HM delega la redazione a un HOD.
 *
 * - Solo HM (attuale R) può delegare
 * - La SOP deve essere IN_LAVORAZIONE
 * - Non deve essere già sottoposta (submittedToC/A)
 * - HOD diventa R, HM diventa C, A resta invariato
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  const body = await request.json();
  const parsed = delegateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "hodUserId richiesto" }, { status: 400 });
  }

  const { hodUserId } = parsed.data;

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      sopStatus: true,
      responsibleId: true,
      consultedId: true,
      accountableId: true,
      submittedToC: true,
      submittedToA: true,
      content: { select: { status: true, propertyId: true, departmentId: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  const draftStatuses = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];
  if (!draftStatuses.includes(wf.content.status)) {
    return NextResponse.json({ error: "La SOP deve essere in lavorazione" }, { status: 400 });
  }

  // Solo R attuale (HM) o ADMIN/SUPER_ADMIN può delegare
  if (wf.responsibleId !== userId && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo il responsabile attuale può delegare" }, { status: 403 });
  }

  if (wf.submittedToC || wf.submittedToA) {
    return NextResponse.json({ error: "Non è possibile delegare dopo aver sottoposto la bozza" }, { status: 400 });
  }

  // Verify HOD exists and is assigned to the property
  const hodUser = await prisma.user.findUnique({
    where: { id: hodUserId },
    select: { id: true, role: true, isActive: true },
  });

  if (!hodUser || !hodUser.isActive || hodUser.role !== "HOD") {
    return NextResponse.json({ error: "L'utente selezionato non è un HOD attivo" }, { status: 400 });
  }

  const hodAssignment = await prisma.propertyAssignment.findFirst({
    where: { userId: hodUserId, propertyId: wf.content.propertyId },
  });

  if (!hodAssignment) {
    return NextResponse.json({ error: "L'HOD non è assegnato a questa struttura" }, { status: 400 });
  }

  // Delegate: HOD becomes R, current R (HM) becomes C
  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: {
        responsibleId: hodUserId,
        consultedId: userId,
      },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "DRAFT_CREATED",
        actorId: userId,
        note: "Redazione delegata a HOD",
        metadata: { action: "delegate-to-hod", hodUserId, previousResponsibleId: wf.responsibleId },
      },
    }),
  ]);

  return NextResponse.json({ data: { delegated: true } });
}
