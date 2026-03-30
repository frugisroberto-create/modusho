/**
 * POST /api/attachments/prepare-upload
 *
 * Prepares a client-side direct upload to the S3/R2 bucket.
 *
 * Flow:
 * 1. Client sends metadata (contentId, fileName, mimeType, fileSize, isInline)
 * 2. Server validates: RBAC, file type, size, content exists
 * 3. Server creates Attachment record (status: pending key generated)
 * 4. Server generates presigned PUT URL
 * 5. Returns { attachmentId, uploadUrl, storageKey } to client
 * 6. Client uploads directly to bucket using uploadUrl
 * 7. Client calls /api/attachments/confirm-upload to finalize
 *
 * The attachment inherits RBAC from the content (property/department/status).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { validateFile } from "@/lib/attachments/validation";
import { buildStorageKey, getBucketName, getPresignedUploadUrl } from "@/lib/attachments/storage";

const prepareUploadSchema = z.object({
  contentId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  isInline: z.boolean().optional().default(false),
  caption: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export async function POST(request: Request) {
  try {
    // 1. Auth
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // 2. Parse & validate input
    const body = await request.json();
    const parsed = prepareUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dati non validi", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { contentId, fileName, mimeType, fileSize, isInline, caption, sortOrder } = parsed.data;

    // 3. File validation (MIME + size)
    const fileCheck = validateFile({ fileName, mimeType, fileSize });
    if (!fileCheck.valid || !fileCheck.kind) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 });
    }

    // 4. Content exists and user has access
    const content = await prisma.content.findUnique({
      where: { id: contentId, isDeleted: false },
      select: {
        id: true,
        type: true,
        status: true,
        propertyId: true,
        departmentId: true,
        createdById: true,
        property: { select: { code: true } },
      },
    });

    if (!content) {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }

    // 5. RBAC: check access to the content's property
    // Only users who can edit the content can attach files
    const minRole = user.role === "OPERATOR" ? null : user.role;
    if (user.role === "OPERATOR") {
      return NextResponse.json({ error: "Operatori non possono caricare file" }, { status: 403 });
    }

    const hasAccess = await checkAccess(user.id, "HOD", content.propertyId, content.departmentId ?? undefined);
    if (!hasAccess) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    // HOD can only attach to own content
    if (user.role === "HOD" && content.createdById !== user.id) {
      return NextResponse.json({ error: "Puoi allegare file solo ai tuoi contenuti" }, { status: 403 });
    }

    // 6. Create Attachment record (generates ID for storage key)
    const attachment = await prisma.attachment.create({
      data: {
        contentId: content.id,
        contentType: content.type,
        kind: fileCheck.kind,
        originalFileName: fileName,
        storedFileName: "", // will be set after key generation
        mimeType,
        fileSize,
        storageKey: "", // will be set after key generation
        storageBucket: getBucketName(),
        uploadedById: user.id,
        sortOrder,
        isInline,
        caption: caption ?? null,
      },
    });

    // 7. Generate storage key using the attachment ID
    const storageKey = buildStorageKey({
      propertyCode: content.property.code,
      contentType: content.type,
      contentId: content.id,
      kind: fileCheck.kind,
      attachmentId: attachment.id,
      originalFileName: fileName,
    });

    // Extract stored filename from the key
    const storedFileName = storageKey.split("/").pop() || attachment.id;

    // 8. Update attachment with final storage key
    await prisma.attachment.update({
      where: { id: attachment.id },
      data: { storageKey, storedFileName },
    });

    // 9. Generate presigned upload URL
    const uploadUrl = await getPresignedUploadUrl(storageKey, mimeType, fileSize);

    // 10. Return to client
    return NextResponse.json({
      data: {
        attachmentId: attachment.id,
        uploadUrl,
        storageKey,
        kind: fileCheck.kind,
      },
    });
  } catch (error) {
    console.error("prepare-upload error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
