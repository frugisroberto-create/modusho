import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";

const TYPE_LABELS: Record<string, string> = { SOP: "SOP", DOCUMENT: "Documento", MEMO: "Memo" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
      _count: { select: { attachments: true } },
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

  const parts: string[] = [];

  parts.push('<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>' + esc(content.title) + ' — ' + esc(content.property.name) + '</title>');
  // System fonts only — no external fonts, guaranteed to work in Safari print
  parts.push('<style>');
  parts.push(`
    @page { margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 14px; line-height: 1.7; color: #333;
      background: white; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page {
      max-width: 680px; margin: 0 auto; padding: 40px 32px;
    }
    /* ── Header ── */
    .hdr { padding-bottom: 14px; border-bottom: 2px solid #964733; margin-bottom: 28px; }
    .hdr-row { display: table; width: 100%; }
    .hdr-left { display: table-cell; vertical-align: middle; }
    .hdr-right { display: table-cell; vertical-align: middle; text-align: right; }
    .badge {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
      color: white; background: #964733; padding: 3px 10px; display: inline-block;
    }
    .code {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 12px; font-weight: 600; color: #964733; margin-left: 10px;
    }
    .brand { font-size: 13px; color: #964733; letter-spacing: 3px; text-transform: uppercase; }
    /* ── Title & Meta ── */
    .title { font-size: 26px; font-weight: 600; color: #141413; margin-bottom: 10px; line-height: 1.3; }
    .meta {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11px; color: #888; margin-bottom: 28px; padding-bottom: 14px;
      border-bottom: 1px solid #ddd;
    }
    /* ── Body ── */
    .body h1,.body h2,.body h3,.body h4 { color: #141413; margin-top: 22px; margin-bottom: 8px; }
    .body h1 { font-size: 20px; } .body h2 { font-size: 18px; } .body h3 { font-size: 16px; }
    .body p { margin-bottom: 10px; }
    .body ul,.body ol { margin-bottom: 10px; padding-left: 22px; }
    .body li { margin-bottom: 3px; }
    .body table { width: 100%; border-collapse: collapse; margin: 14px 0; }
    .body th,.body td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 12px; }
    .body th {
      background: #f5f5f0;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-weight: 600;
    }
    .body blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid #964733; background: #faf9f5; }
    .body hr { border: none; border-top: 1px solid #ddd; margin: 18px 0; }
    /* ── Footer ── */
    .att {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 11px; color: #999; margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd;
    }
    .ftr {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 9px; color: #aaa; margin-top: 40px; padding-top: 10px; border-top: 1px solid #ddd;
    }
    .ftr-row { display: table; width: 100%; }
    .ftr-left { display: table-cell; }
    .ftr-right { display: table-cell; text-align: right; }
    /* ── Print button ── */
    .no-print {
      max-width: 680px; margin: 12px auto; padding: 0 32px; text-align: right;
    }
    .no-print button {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
      color: #964733; border: 1px solid rgba(150,71,51,0.3); background: white;
      padding: 8px 20px; cursor: pointer;
    }
    .no-print button:hover { background: #964733; color: white; }
    @media print {
      .no-print { display: none; }
      .page { max-width: none; padding: 0; margin: 0; }
      h1,h2,h3,h4 { page-break-after: avoid; }
      table,img { page-break-inside: avoid; }
      p { orphans: 3; widows: 3; }
    }
  `);
  parts.push('</style></head><body>');

  // Print button (hidden when printing)
  parts.push('<div class="no-print"><button onclick="window.print()">Stampa / Salva PDF</button></div>');

  // Page content
  parts.push('<div class="page">');

  // Header — use display:table instead of flexbox (Safari print safe)
  parts.push('<div class="hdr"><div class="hdr-row">');
  parts.push('<div class="hdr-left">');
  parts.push('<span class="badge">' + esc(typeLabel) + '</span>');
  if (content.code) parts.push('<span class="code">' + esc(content.code) + '</span>');
  parts.push('</div>');
  parts.push('<div class="hdr-right"><span class="brand">' + esc(content.property.name) + '</span></div>');
  parts.push('</div></div>');

  // Title
  parts.push('<div class="title">' + esc(content.title) + '</div>');

  // Meta
  const metaParts = [esc(content.property.name)];
  if (content.department) metaParts.push(esc(content.department.name));
  if (publishDate) metaParts.push(esc(publishDate));
  parts.push('<div class="meta">' + metaParts.join(' &middot; ') + '</div>');

  // Body
  parts.push('<div class="body">');
  parts.push(content.body);
  parts.push('</div>');

  // Attachments
  if (content._count.attachments > 0) {
    parts.push('<div class="att">Allegati presenti: ' + content._count.attachments + '</div>');
  }

  // Footer — display:table instead of flexbox
  parts.push('<div class="ftr"><div class="ftr-row">');
  parts.push('<div class="ftr-left">' + esc(content.property.name) + '</div>');
  parts.push('<div class="ftr-right">Esportato il ' + esc(exportDate) + '</div>');
  parts.push('</div></div>');

  parts.push('</div>'); // .page
  parts.push('</body></html>');

  return new NextResponse(parts.join("\n"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
