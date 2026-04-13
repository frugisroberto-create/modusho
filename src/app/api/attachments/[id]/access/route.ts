/**
 * GET /api/attachments/[id]/access
 *
 * Generates a presigned GET URL for secure file access.
 * RBAC is inherited from the content madre — no attachment-level permissions.
 *
 * Flow:
 * 1. Authenticate user
 * 2. Load attachment + content madre
 * 3. Verify RBAC on content madre (same rules as content visibility)
 * 4. Generate presigned GET URL (120s TTL)
 * 5. Return { url, fileName, mimeType }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { getPresignedDownloadUrl } from "@/lib/attachments/storage";

const PRESIGNED_TTL = 120; // seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: attachmentId } = await params;

  // 1. Load attachment with content madre
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      storageKey: true,
      originalFileName: true,
      mimeType: true,
      kind: true,
      contentId: true,
      content: {
        select: {
          id: true,
          status: true,
          propertyId: true,
          departmentId: true,
          createdById: true,
          isDeleted: true,
        },
      },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
  }

  const content = attachment.content;

  // 2. Content deleted check
  if (content.isDeleted) {
    return NextResponse.json({ error: "Contenuto non disponibile" }, { status: 404 });
  }

  // 3. RBAC — same rules as content visibility
  const userId = session.user.id;
  const userRole = session.user.role;

  // Status-based visibility (same as GET /api/content/[id])
  if (content.status !== "PUBLISHED") {
    if (userRole === "OPERATOR") {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }
    // HOD can access attachments of any content in their property/department (checked below)
  }

  // Property/department access
  const hasAccess = await checkAccess(
    userId,
    "OPERATOR",
    content.propertyId,
    content.departmentId ?? undefined
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
  }

  // 4. Determine disposition: inline for images/PDF, attachment for DOCX/XLSX
  const INLINE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const disposition = INLINE_MIMES.includes(attachment.mimeType) ? "inline" : "attachment";

  // 5. Generate presigned GET URL
  try {
    const url = await getPresignedDownloadUrl(
      attachment.storageKey,
      PRESIGNED_TTL,
      disposition,
      attachment.originalFileName
    );

    return NextResponse.json({
      data: {
        url,
        fileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
        expiresIn: PRESIGNED_TTL,
      },
    });
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    return NextResponse.json({ error: "File non disponibile" }, { status: 500 });
  }
}
