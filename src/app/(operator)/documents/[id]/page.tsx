import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { SopReadPanel } from "@/components/operator/sop-read-panel";
import { SopReadReceipt } from "@/components/operator/sop-read-receipt";
import { isReadingRecipient, recordContentRead } from "@/lib/content-read-db";
import { isGovernanceRole, showsReadPanel } from "@/lib/sop-read";
import { ContentActions } from "@/components/hoo/content-actions";
import { ContentTimeline } from "@/components/shared/content-timeline";
import { ContentAckRegistry } from "@/components/shared/content-ack-registry";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import { ListBackLink } from "@/components/operator/list-back-link";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props { params: Promise<{ id: string }> }

export default async function DocumentDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
      acknowledgments: { where: { userId: user.id }, select: { acknowledgedAt: true }, take: 1 },
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.status !== "PUBLISHED") notFound();

  const canAccess = await canUserAccessContent(user.id, user.role, {
    propertyId: content.propertyId,
    createdById: content.createdBy.id,
    targetAudience: content.targetAudience,
  });
  if (!canAccess) notFound();

  let acknowledged = content.acknowledgments.length > 0;
  const acknowledgedAt = content.acknowledgments[0]?.acknowledgedAt?.toISOString() ?? null;
  const isGovernance = isGovernanceRole(user.role);

  // Come per le SOP: HM/ADMIN/SUPER_ADMIN leggono aprendo, la lettura si registra da sola.
  if (isGovernance && !acknowledged) {
    await recordContentRead({ contentId: content.id, userId: user.id });
    acknowledged = true;
  }

  // Operatori e capi reparto: pannello «Clicca qui per leggere» solo se destinatari.
  const isRecipient = await isReadingRecipient(
    { id: user.id, role: user.role },
    { propertyId: content.propertyId, targetAudience: content.targetAudience }
  );
  const readPanel = showsReadPanel({ role: user.role, contentStatus: content.status, alreadyRead: acknowledged, isRecipient });

  return (
    <div className="max-w-3xl mx-auto py-6">
      <nav className="flex items-center gap-2 text-sm font-ui text-sage-light mb-6">
        <ListBackLink href="/documents" label="Documenti" />
        <span className="text-ivory-dark">/</span>
        <span className="text-charcoal-dark">{content.title}</span>
      </nav>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-mauve text-white">Documento</span>
          {content.department && (
            <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-ivory-dark text-charcoal">{content.department.name}</span>
          )}
          <span className="text-xs font-ui text-sage-light">v{content.version}</span>
        </div>
        <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{content.title}</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm font-ui text-sage-light">
          <span className="text-terracotta font-medium">{content.property.name}</span>
          <span>Autore: {content.createdBy.name}</span>
          {content.publishedAt && (
            <span>Pubblicato il {new Date(content.publishedAt).toLocaleDateString("it-IT")}</span>
          )}
        </div>
        <div className="mt-3 hidden md:flex items-center gap-2">
          <ContentActions contentId={content.id} contentType={content.type} contentStatus={content.status} userRole={user.role} canEdit={user.canEdit} />
        </div>
      </div>

      {readPanel ? (
        <SopReadPanel
          contentId={content.id}
          title={content.title}
          departmentName={content.department?.name}
          propertyName={content.property.name}
          version={content.version}
          readEndpoint={`/api/content/${content.id}/acknowledge`}
          buttonLabel="Clicca qui per leggere il documento"
        />
      ) : (
        <>
          <article
            className="prose prose-gray max-w-none mb-8 bg-ivory-medium border border-ivory-dark p-4 sm:p-6 font-body"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body) }}
          />

          <AttachmentUploader contentId={content.id} canEdit={false} />

          {/* Lettura registrata — solo OPERATOR/HOD/CORPORATE */}
          {!isGovernance && acknowledged && acknowledgedAt && (
            <div className="mt-6">
              <SopReadReceipt readAt={acknowledgedAt} version={undefined} readLabel="Letto il" />
            </div>
          )}
        </>
      )}

      {/* Registro presa visione: HM+ sempre, HOD solo per i propri contenuti */}
      {(user.role === "HOTEL_MANAGER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN" ||
        (user.role === "HOD" && content.createdBy.id === user.id)) && (
        <ContentAckRegistry contentId={content.id} userRole={user.role} userId={user.id} propertyId={content.propertyId} />
      )}
    </div>
  );
}
