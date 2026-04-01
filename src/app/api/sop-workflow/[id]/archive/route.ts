import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: Archivia una SOP pubblicata.
 *
 * - Solo HM, ADMIN, SUPER_ADMIN possono archiviare
 * - La SOP deve essere PUBBLICATA
 * - Transizione: PUBBLICATA → ARCHIVIATA
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const role = session.user.role;

  if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Non hai permessi per archiviare" }, { status: 403 });
  }

  const wf = await prisma.sopWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      contentId: true,
      sopStatus: true,
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "SOP non trovata" }, { status: 404 });
  }

  if (wf.sopStatus !== "PUBBLICATA") {
    return NextResponse.json({ error: "Solo le SOP pubblicate possono essere archiviate" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.sopWorkflow.update({
      where: { id: wf.id },
      data: { sopStatus: "ARCHIVIATA" },
    }),
    prisma.content.update({
      where: { id: wf.contentId },
      data: {
        status: "ARCHIVED",
        updatedById: userId,
      },
    }),
    prisma.sopWorkflowEvent.create({
      data: {
        sopWorkflowId: wf.id,
        eventType: "ARCHIVED",
        actorId: userId,
      },
    }),
    prisma.contentStatusHistory.create({
      data: {
        contentId: wf.contentId,
        fromStatus: "PUBLISHED",
        toStatus: "ARCHIVED",
        changedById: userId,
        note: "Archiviata",
      },
    }),
  ]);

  return NextResponse.json({ data: { archived: true } });
}
