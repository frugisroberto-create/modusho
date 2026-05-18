import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { getPresignedDownloadUrl } from "@/lib/attachments/storage";

const TYPE_LABELS: Record<string, string> = { SOP: "SOP", DOCUMENT: "Documento", MEMO: "Memo" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new NextResponse("Non autenticato", { status: 401 });
  }

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { name: true, code: true } },
      department: { select: { name: true } },
      createdBy: { select: { id: true, name: true } },
      attachments: {
        select: { id: true, storageKey: true, originalFileName: true, mimeType: true, fileSize: true, kind: true },
        orderBy: { sortOrder: "asc" },
      },
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.status !== "PUBLISHED") {
    return new NextResponse("Contenuto non trovato", { status: 404 });
  }

  const canAccess = await canUserAccessContent(session.user.id, session.user.role, {
    propertyId: content.propertyId,
    createdById: content.createdBy.id,
    targetAudience: content.targetAudience,
  });
  if (!canAccess) {
    return new NextResponse("Contenuto non trovato", { status: 404 });
  }

  const typeLabel = TYPE_LABELS[content.type] || content.type;
  const publishDate = content.publishedAt
    ? new Date(content.publishedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  const exportDate = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  // Separate images from document attachments, generate presigned URLs for images
  const images = content.attachments.filter(a => a.kind === "IMAGE");
  const documents = content.attachments.filter(a => a.kind === "DOCUMENT");

  const imageUrls: { fileName: string; url: string }[] = [];
  for (const img of images) {
    try {
      const url = await getPresignedDownloadUrl(img.storageKey, 300, "inline");
      imageUrls.push({ fileName: img.originalFileName, url });
    } catch {
      // skip if presigned URL fails
    }
  }

  // Build HTML — everything inline, no external resources, Safari-safe
  const p: string[] = [];

  p.push('<!DOCTYPE html>');
  p.push('<html lang="it">');
  p.push('<head>');
  p.push('<meta charset="utf-8">');
  p.push('<title>' + esc(content.title) + '</title>');
  p.push('<style>');
  p.push('@page { margin: 15mm 12mm; }');
  p.push('</style>');
  p.push('</head>');
  p.push('<body style="font-family:Georgia,serif;color:#333;margin:0;padding:20px 30px;font-size:14px;line-height:1.7;">');

  // Header line
  p.push('<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #964733;padding-bottom:12px;margin-bottom:24px;">');
  p.push('<tr>');
  p.push('<td>');
  p.push('<span style="font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:white;background:#964733;padding:3px 10px;">' + esc(typeLabel) + '</span>');
  if (content.code) {
    p.push(' <span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;color:#964733;">' + esc(content.code) + '</span>');
  }
  p.push('</td>');
  p.push('<td style="text-align:right;font-size:13px;color:#964733;letter-spacing:2px;text-transform:uppercase;">' + esc(content.property.name) + '</td>');
  p.push('</tr></table>');

  // Title
  p.push('<h1 style="font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#141413;margin:0 0 12px 0;line-height:1.3;">' + esc(content.title) + '</h1>');

  // Meta
  const metaParts = [esc(content.property.name)];
  if (content.department) metaParts.push(esc(content.department.name));
  if (publishDate) metaParts.push(esc(publishDate));
  p.push('<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#888;margin:0 0 24px 0;padding-bottom:12px;border-bottom:1px solid #ddd;">' + metaParts.join(' &middot; ') + '</p>');

  // Body — raw HTML content
  p.push('<div style="font-size:14px;line-height:1.7;">');
  p.push(content.body);
  p.push('</div>');

  // Images — inline in the document
  if (imageUrls.length > 0) {
    p.push('<div style="margin-top:28px;padding-top:14px;border-top:1px solid #ddd;">');
    p.push('<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px 0;">Allegati immagine</p>');
    for (const img of imageUrls) {
      p.push('<div style="margin-bottom:16px;">');
      p.push('<img src="' + esc(img.url) + '" alt="' + esc(img.fileName) + '" style="max-width:100%;height:auto;border:1px solid #ddd;" />');
      p.push('<p style="font-family:Helvetica,Arial,sans-serif;font-size:10px;color:#999;margin:4px 0 0 0;">' + esc(img.fileName) + '</p>');
      p.push('</div>');
    }
    p.push('</div>');
  }

  // Document attachments — listed by name
  if (documents.length > 0) {
    p.push('<div style="margin-top:28px;padding-top:14px;border-top:1px solid #ddd;">');
    p.push('<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px 0;">Documenti allegati</p>');
    for (const doc of documents) {
      p.push('<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#555;margin:0 0 4px 0;">');
      p.push('&#128196; ' + esc(doc.originalFileName) + ' <span style="color:#999;">(' + formatSize(doc.fileSize) + ')</span>');
      p.push('</p>');
    }
    p.push('</div>');
  }

  // Footer
  p.push('<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:36px;padding-top:10px;border-top:1px solid #ddd;">');
  p.push('<tr>');
  p.push('<td style="font-family:Helvetica,Arial,sans-serif;font-size:9px;color:#aaa;">' + esc(content.property.name) + '</td>');
  p.push('<td style="font-family:Helvetica,Arial,sans-serif;font-size:9px;color:#aaa;text-align:right;">Esportato il ' + esc(exportDate) + '</td>');
  p.push('</tr></table>');

  p.push('</body></html>');

  return new NextResponse(p.join("\n"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
