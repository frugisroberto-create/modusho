import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: contentId } = await params;
  const userId = session.user.id;

  // Verifica che il contenuto esista e sia PUBLISHED
  const content = await prisma.content.findUnique({
    where: { id: contentId, isDeleted: false },
    select: { id: true, status: true, propertyId: true, departmentId: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  if (content.status !== "PUBLISHED") {
    return NextResponse.json(
      { error: "Il contenuto non è pubblicato" },
      { status: 400 }
    );
  }

  // RBAC: verifica accesso
  const hasAccess = await checkAccess(
    userId,
    "OPERATOR",
    content.propertyId,
    content.departmentId ?? undefined
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Idempotente: se già confermato, ritorna il record esistente
  const existing = await prisma.contentAcknowledgment.findUnique({
    where: { contentId_userId: { contentId, userId } },
  });

  if (existing) {
    return NextResponse.json({
      data: {
        contentId: existing.contentId,
        acknowledgedAt: existing.acknowledgedAt,
        alreadyAcknowledged: true,
      },
    });
  }

  const acknowledgment = await prisma.contentAcknowledgment.create({
    data: {
      contentId,
      userId,
      required: true,
    },
  });

  // Invalida la home operatore e la lista comunicazioni in modo che
  // "Da prendere visione" e "In evidenza" rimuovano subito il contenuto appena visionato.
  revalidatePath("/");
  revalidatePath("/comunicazioni");

  return NextResponse.json({
    data: {
      contentId: acknowledgment.contentId,
      acknowledgedAt: acknowledgment.acknowledgedAt,
      alreadyAcknowledged: false,
    },
  });
}
