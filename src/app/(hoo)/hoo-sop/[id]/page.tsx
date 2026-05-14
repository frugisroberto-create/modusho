import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { ContentActions } from "@/components/hoo/content-actions";
import { ValidityBadge } from "@/components/shared/validity-badge";
import { ContentTimeline } from "@/components/shared/content-timeline";
import { SopViewRegistry } from "@/components/shared/sop-view-registry";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HooSopDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      sopWorkflow: { select: { reviewDueDate: true } },
    },
  });

  if (!content) notFound();

  const hasAccess = await checkAccess(user.id, "HOTEL_MANAGER", content.propertyId);
  if (!hasAccess) notFound();

  const STATUS_BADGE: Record<string, string> = {
    PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
    DRAFT: "bg-ivory-medium text-charcoal/60",
    REVIEW_HM: "bg-mauve/15 text-mauve",
    REVIEW_ADMIN: "bg-terracotta/10 text-terracotta",
    RETURNED: "bg-[#FECACA] text-[#991B1B]",
    ARCHIVED: "bg-ivory-dark text-charcoal/50",
  };

  return (
    <div className="max-w-4xl space-y-6">
      <nav className="flex items-center gap-2 text-sm font-ui text-charcoal/45">
        <Link href="/hoo-sop" className="hover:text-terracotta transition-colors">SOP</Link>
        <span>/</span>
        <span className="text-charcoal-dark">{content.title}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[content.status] || "bg-ivory-dark text-charcoal"}`}>
              {content.status}
            </span>
            {content.code && <span className="text-xs font-ui font-semibold text-terracotta tracking-wide">{content.code}</span>}
            <span className="text-xs font-ui text-charcoal/45">{content.property.code}</span>
            {content.department && <span className="text-xs font-ui text-charcoal/45">{content.department.name}</span>}
            <span className="text-xs font-ui text-charcoal/45">v{content.version}</span>
            {content.status === "PUBLISHED" && content.sopWorkflow?.reviewDueDate && (
              <ValidityBadge reviewDueDate={content.sopWorkflow.reviewDueDate.toISOString()} showDate />
            )}
          </div>
          <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{content.title}</h1>
          <div className="flex gap-3 mt-2 text-sm font-ui text-charcoal/45">
            <span>Autore: {content.createdBy.name}</span>
            {content.publishedAt && <span>Pubblicato il {new Date(content.publishedAt).toLocaleDateString("it-IT")}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {content.status === "PUBLISHED" && <ExportPdfButton contentId={content.id} />}
          <ContentActions contentId={content.id} contentType={content.type} contentStatus={content.status} userRole={user.role} />
        </div>
      </div>

      <article className="prose prose-gray max-w-none bg-ivory border border-ivory-dark p-6 font-body"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body) }} />

      <AttachmentUploader contentId={content.id} canEdit={content.status !== "ARCHIVED"} />

      {content.status === "PUBLISHED" && (
        <SopViewRegistry contentId={content.id} />
      )}

      <ContentTimeline contentId={content.id} />
    </div>
  );
}
