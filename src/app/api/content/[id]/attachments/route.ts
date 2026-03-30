/**
 * GET /api/content/[id]/attachments
 *
 * Returns all attachments for a content item.
 * RBAC: inherits from the content (if you can't see the content, you can't see its attachments).
 *
 * Query params:
 *   kind=IMAGE|DOCUMENT  — filter by kind (optional)
 *   page=1               — pagination (optional)
 *   pageSize=20          — items per page (optional, max 50)
 *
 * DELETE /api/content/[id]/attachments
 *
 * Deletes a specific attachment.
 * Body: { attachmentId: string }
 * Only the uploader, ADMIN, or SUPER_ADMIN can delete.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { deleteFromStorage } from "@/lib/attachments/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: contentId } = await params;

    // Verify content exists and user has access
    const content = await prisma.content.findUnique({
      where: { id: contentId, isDeleted: false },
      select: {
        id: true,
        status: true,
        propertyId: true,
        departmentId: true,
        createdById: true,
      },
    });

    if (!content) {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }

    // RBAC: same rules as content visibility
    if (user.role === "OPERATOR" && content.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }

    if (user.role === "HOD" && content.status !== "PUBLISHED" && content.createdById !== user.id) {
      return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
    }

    const hasAccess = await checkAccess(user.id, "OPERATOR", content.propertyId, content.departmentId ?? undefined);
    if (!hasAccess) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const kindFilter = searchParams.get("kind");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

    const where: Record<string, unknown> = { contentId };
    if (kindFilter === "IMAGE" || kindFilter === "DOCUMENT") {
      where.kind = kindFilter;
    }

    const [attachments, total] = await Promise.all([
      prisma.attachment.findMany({
        where,
        select: {
          id: true,
          kind: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          sortOrder: true,
          isInline: true,
          caption: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.attachment.count({ where }),
    ]);

    return NextResponse.json({
      data: attachments,
      meta: { page, pageSize, total },
    });
  } catch (error) {
    console.error("content attachments GET error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: contentId } = await params;
    const body = await request.json();
    const attachmentId = body?.attachmentId;

    if (!attachmentId || typeof attachmentId !== "string") {
      return NextResponse.json({ error: "attachmentId richiesto" }, { status: 400 });
    }

    // Find attachment and verify it belongs to this content
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        contentId: true,
        storageKey: true,
        uploadedById: true,
      },
    });

    if (!attachment || attachment.contentId !== contentId) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }

    // Only uploader, ADMIN, or SUPER_ADMIN can delete
    const canDelete =
      attachment.uploadedById === user.id ||
      user.role === "ADMIN" ||
      user.role === "SUPER_ADMIN";

    if (!canDelete) {
      return NextResponse.json({ error: "Non autorizzato a eliminare questo allegato" }, { status: 403 });
    }

    // Delete from bucket
    try {
      await deleteFromStorage(attachment.storageKey);
    } catch (storageErr) {
      console.error("Failed to delete from storage:", storageErr);
      // Continue with DB deletion even if storage delete fails
    }

    // Delete from database
    await prisma.attachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("content attachments DELETE error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
