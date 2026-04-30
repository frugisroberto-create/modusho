import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { PrintTrigger } from "@/components/shared/print-trigger";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  params: Promise<{ id: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  SOP: "SOP",
  DOCUMENT: "Documento",
  MEMO: "Memo",
};

export default async function PrintContentPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      _count: { select: { attachments: true } },
    },
  });

  if (!content) notFound();

  // Solo contenuti pubblicati
  if (content.status !== "PUBLISHED") notFound();

  // RBAC
  const minRole = user.role === "OPERATOR" ? "OPERATOR" : "HOD";
  const hasAccess = await checkAccess(user.id, minRole, content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) notFound();

  const typeLabel = TYPE_LABELS[content.type] || content.type;
  const publishDate = content.publishedAt
    ? new Date(content.publishedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
    : new Date(content.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const exportDate = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <PrintTrigger />

      <div className="print-document">
        {/* Header */}
        <header className="print-header">
          <div className="print-header-left">
            <span className="print-type-badge">{typeLabel}</span>
            {content.code && <span className="print-code">{content.code}</span>}
          </div>
          <div className="print-header-right">
            <span className="print-brand">{content.property.name}</span>
          </div>
        </header>

        {/* Title */}
        <h1 className="print-title">{content.title}</h1>

        {/* Meta */}
        <div className="print-meta">
          <span>{content.property.name}</span>
          {content.department && <span>{content.department.name}</span>}
          <span>{publishDate}</span>
        </div>

        {/* Body */}
        <article className="print-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body) }} />

        {/* Attachments count */}
        {content._count.attachments > 0 && (
          <p className="print-attachments">
            Allegati presenti: {content._count.attachments}
          </p>
        )}

        {/* Footer */}
        <footer className="print-footer">
          <span>{content.property.name}</span>
          <span>Esportato il {exportDate}</span>
        </footer>
      </div>
    </>
  );
}

const PRINT_STYLES = `
  .print-document {
    max-width: 700px;
    margin: 0 auto;
    padding: 48px 40px;
    font-family: var(--font-body), Georgia, serif;
    color: #333;
  }

  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 2px solid #964733;
    margin-bottom: 32px;
  }

  .print-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .print-type-badge {
    font-family: var(--font-ui), sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: white;
    background: #964733;
    padding: 3px 10px;
  }

  .print-code {
    font-family: var(--font-ui), sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #964733;
    letter-spacing: 0.5px;
  }

  .print-brand {
    font-family: var(--font-heading), Georgia, serif;
    font-size: 14px;
    color: #964733;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .print-title {
    font-family: var(--font-heading), Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    color: #141413;
    margin-bottom: 12px;
    line-height: 1.3;
  }

  .print-meta {
    display: flex;
    gap: 16px;
    font-family: var(--font-ui), sans-serif;
    font-size: 12px;
    color: #666;
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid #E8E5DC;
  }

  .print-meta span + span::before {
    content: '\\00B7';
    margin-right: 16px;
    color: #ccc;
  }

  .print-body {
    font-family: var(--font-body), Georgia, serif;
    font-size: 15px;
    line-height: 1.8;
    color: #333;
  }

  .print-body h1, .print-body h2, .print-body h3, .print-body h4 {
    font-family: var(--font-heading), Georgia, serif;
    color: #141413;
    margin-top: 24px;
    margin-bottom: 8px;
  }

  .print-body h1 { font-size: 22px; }
  .print-body h2 { font-size: 19px; }
  .print-body h3 { font-size: 16px; }

  .print-body p { margin-bottom: 12px; }
  .print-body ul, .print-body ol { margin-bottom: 12px; padding-left: 24px; }
  .print-body li { margin-bottom: 4px; }
  .print-body table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .print-body th, .print-body td { border: 1px solid #E8E5DC; padding: 8px 12px; text-align: left; font-size: 13px; }
  .print-body th { background: #FAF9F5; font-family: var(--font-ui), sans-serif; font-weight: 600; }

  .print-attachments {
    font-family: var(--font-ui), sans-serif;
    font-size: 12px;
    color: #999;
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #E8E5DC;
  }

  .print-footer {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-ui), sans-serif;
    font-size: 10px;
    color: #999;
    margin-top: 48px;
    padding-top: 12px;
    border-top: 1px solid #E8E5DC;
  }

  @media print {
    html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
    /* Hide everything */
    header, nav, footer, aside, [class*="shell"], [class*="header"], [class*="nav"] { display: none !important; }
    /* Show only the print document */
    .print-document {
      padding: 0 !important; max-width: none !important; box-shadow: none !important;
      margin: 0 !important;
    }
    .print-actions { display: none !important; }
  }

  @media screen {
    .print-document {
      box-shadow: 0 0 20px rgba(0,0,0,0.08);
      margin-top: 32px;
      margin-bottom: 32px;
      background: white;
    }
    body { background: #f0efea !important; }
  }
`;
