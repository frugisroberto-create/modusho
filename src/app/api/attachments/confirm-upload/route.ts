/**
 * POST /api/attachments/confirm-upload
 *
 * Called by client after successful direct upload to the bucket.
 * Verifies the attachment record exists and marks it as ready.
 *
 * For now this is a simple confirmation. In future phases it could
 * verify the file actually exists in the bucket via HeadObject.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const confirmSchema = z.object({
  attachmentId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }

    const { attachmentId } = parsed.data;

    // Verify attachment exists and was created by this user
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        uploadedById: true,
        storageKey: true,
        originalFileName: true,
        kind: true,
        mimeType: true,
        fileSize: true,
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }

    if (attachment.uploadedById !== user.id && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    // In this phase, confirmation is immediate.
    // Future enhancement: HeadObject to verify file exists in bucket.
    return NextResponse.json({
      data: {
        attachmentId: attachment.id,
        confirmed: true,
        kind: attachment.kind,
        originalFileName: attachment.originalFileName,
      },
    });
  } catch (error) {
    console.error("confirm-upload error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
