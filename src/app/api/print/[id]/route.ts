import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";

const TYPE_LABELS: Record<string, string> = { SOP: "SOP", DOCUMENT: "Documento", MEMO: "Memo" };

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

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>${content.title} — ModusHO</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Cardo:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cardo', Georgia, serif; color: #333; background: #f0efea; }
    .doc { max-width: 700px; margin: 32px auto; padding: 48px 40px; background: white; box-shadow: 0 0 20px rgba(0,0,0,0.08); }
    .hdr { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 2px solid #964733; margin-bottom: 32px; }
    .hdr-left { display: flex; align-items: center; gap: 12px; }
    .badge { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: white; background: #964733; padding: 3px 10px; }
    .code { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #964733; }
    .brand { font-family: 'Playfair Display', Georgia, serif; font-size: 14px; color: #964733; letter-spacing: 3px; text-transform: uppercase; }
    h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 600; color: #141413; margin-bottom: 12px; line-height: 1.3; }
    .meta { display: flex; gap: 16px; font-family: 'Inter', sans-serif; font-size: 12px; color: #666; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #E8E5DC; }
    .meta span + span::before { content: '·'; margin-right: 16px; color: #ccc; }
    .body { font-size: 15px; line-height: 1.8; }
    .body h1,.body h2,.body h3,.body h4 { font-family: 'Playfair Display', serif; color: #141413; margin-top: 24px; margin-bottom: 8px; }
    .body h1 { font-size: 22px; } .body h2 { font-size: 19px; } .body h3 { font-size: 16px; }
    .body p { margin-bottom: 12px; }
    .body ul,.body ol { margin-bottom: 12px; padding-left: 24px; }
    .body li { margin-bottom: 4px; }
    .body table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .body th,.body td { border: 1px solid #E8E5DC; padding: 8px 12px; text-align: left; font-size: 13px; }
    .body th { background: #FAF9F5; font-family: 'Inter', sans-serif; font-weight: 600; }
    .att { font-family: 'Inter', sans-serif; font-size: 12px; color: #999; margin-top: 32px; padding-top: 12px; border-top: 1px solid #E8E5DC; }
    .ftr { display: flex; justify-content: space-between; font-family: 'Inter', sans-serif; font-size: 10px; color: #999; margin-top: 48px; padding-top: 12px; border-top: 1px solid #E8E5DC; }
    .btn-bar { max-width: 700px; margin: 0 auto; padding: 16px 0; text-align: right; }
    .btn-bar button { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #964733; border: 1px solid rgba(150,71,51,0.3); background: transparent; padding: 8px 20px; cursor: pointer; }
    .btn-bar button:hover { background: #964733; color: white; }
    @media print {
      body { background: white; }
      .doc { box-shadow: none; margin: 0; padding: 20px 0; max-width: none; }
      .btn-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="btn-bar"><button onclick="window.print()">Stampa / Salva PDF</button></div>
  <div class="doc">
    <div class="hdr">
      <div class="hdr-left">
        <span class="badge">${typeLabel}</span>
        ${content.code ? `<span class="code">${content.code}</span>` : ""}
      </div>
      <span class="brand">ModusHO</span>
    </div>
    <h1>${content.title}</h1>
    <div class="meta">
      <span>${content.property.name}</span>
      ${content.department ? `<span>${content.department.name}</span>` : ""}
      <span>${publishDate}</span>
    </div>
    <div class="body">${content.body}</div>
    ${content._count.attachments > 0 ? `<p class="att">Allegati presenti: ${content._count.attachments}</p>` : ""}
    <div class="ftr"><span>ModusHO</span><span>Esportato il ${exportDate}</span></div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
