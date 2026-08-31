import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { SopReadPanel } from "@/components/operator/sop-read-panel";
import { SopReadReceipt } from "@/components/operator/sop-read-receipt";
import { SopViewTracker } from "@/components/operator/sop-view-tracker";
import { ContentActions } from "@/components/hoo/content-actions";
import { SopViewRegistry } from "@/components/shared/sop-view-registry";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { MobileHide } from "@/components/mobile-hide";
import { ValidityBadge } from "@/components/shared/validity-badge";
import { ContentTimeline } from "@/components/shared/content-timeline";
import { ListBackLink } from "@/components/operator/list-back-link";
import { sanitizeHtml } from "@/lib/sanitize";
import { showsReadPanel } from "@/lib/sop-read";
import { recordSopRead } from "@/lib/sop-read-db";

interface Props { params: Promise<{ id: string }> }

export default async function SopDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
      sopWorkflow: { select: { id: true, requiresNewAcknowledgment: true, reviewDueDate: true } },
      sopViewRecords: {
        where: { userId: user.id },
        orderBy: { contentVersion: "desc" },
        take: 10,
        select: { contentVersion: true, viewedAt: true, acknowledgedAt: true },
      },
      acknowledgments: { where: { userId: user.id }, select: { acknowledgedAt: true }, take: 1 },
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content) notFound();

  // OPERATOR: solo PUBLISHED. HOD+: qualsiasi stato (consultazione read-only).
  if (content.status !== "PUBLISHED" && user.role === "OPERATOR") notFound();

  const canAccess = await canUserAccessContent(user.id, user.role, {
    propertyId: content.propertyId,
    createdById: content.createdBy.id,
    targetAudience: content.targetAudience,
  });
  if (!canAccess) notFound();

  const isOperator = user.role === "OPERATOR";
  const isHod = user.role === "HOD";
  const canExportPdf = !isOperator; // HOD+ può esportare PDF
  const isFullGovernance = !isOperator && !isHod; // HM, ADMIN, SUPER_ADMIN: registro completo

  // Per HOD: trova il reparto assegnato (per filtrare il registro)
  let hodDepartmentId: string | null = null;
  if (isHod) {
    const assignment = await prisma.propertyAssignment.findFirst({
      where: { userId: user.id, propertyId: content.propertyId, departmentId: { not: null } },
      select: { departmentId: true },
    });
    hodDepartmentId = assignment?.departmentId ?? null;
  }

  // Version-aware acknowledgment status per SOP
  const currentVersion = content.version;
  const requiresNewAck = content.sopWorkflow?.requiresNewAcknowledgment ?? true;
  const currentVersionRecord = content.sopViewRecords.find(r => r.contentVersion === currentVersion);
  const acknowledgedCurrentVersion = currentVersionRecord?.acknowledgedAt != null;
  const anyPreviousAck = content.sopViewRecords.find(r => r.acknowledgedAt != null);
  let acknowledged = acknowledgedCurrentVersion || (!requiresNewAck && anyPreviousAck != null);
  const acknowledgedAt = acknowledgedCurrentVersion
    ? currentVersionRecord!.acknowledgedAt!.toISOString()
    : (!requiresNewAck && anyPreviousAck != null)
      ? anyPreviousAck.acknowledgedAt!.toISOString()
      : null;

  // HM/ADMIN/SUPER_ADMIN: aprire la SOP vale come lettura, si registra da sola.
  // Stesso scrittore del pulsante di OPERATOR/HOD — una sola forma per due gesti.
  if (isFullGovernance && !acknowledged) {
    await recordSopRead({
      contentId: content.id,
      userId: user.id,
      contentVersion: currentVersion,
      now: new Date(),
    });
    acknowledged = true;
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <SopViewTracker contentId={content.id} />

      <nav className="flex items-center gap-2 text-sm font-ui text-sage-light mb-6">
        <ListBackLink href="/sop" label="SOP" />
        <span className="text-ivory-dark">/</span>
        <span className="text-charcoal-dark">{content.title}</span>
      </nav>

      {/* ── Testata ── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-sage text-white">SOP</span>
          {content.department && (
            <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-ivory-dark text-charcoal">{content.department.name}</span>
          )}
          <span className="text-xs font-ui text-sage-light">v{content.version}</span>
          <ValidityBadge reviewDueDate={content.sopWorkflow?.reviewDueDate?.toISOString() ?? null} showDate />
        </div>
        <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{content.title}</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm font-ui text-sage-light">
          <span className="text-terracotta font-medium">{content.property.name}</span>
          <span>Autore: {content.createdBy.name}</span>
          {content.publishedAt && (
            <span>Pubblicato il {new Date(content.publishedAt).toLocaleDateString("it-IT")}</span>
          )}
        </div>
        {/* Export PDF + Content Actions — solo desktop, solo HOD+/HM+ */}
        <MobileHide>
          <div className="mt-3 flex items-center gap-2">
            {isFullGovernance ? (
              <ContentActions contentId={content.id} contentType={content.type} contentStatus={content.status} userRole={user.role} canEdit={user.canEdit} sopWorkflowId={content.sopWorkflow?.id} />
            ) : canExportPdf ? (
              <ExportPdfButton contentId={content.id} />
            ) : null}
          </div>
        </MobileHide>
      </div>

      {/* ── Pannello di lettura: OPERATOR/HOD su SOP pubblicate. HM+ vede sempre il contenuto ── */}
      {showsReadPanel({ role: user.role, contentStatus: content.status, alreadyRead: acknowledged }) ? (
        <SopReadPanel
          contentId={content.id}
          title={content.title}
          departmentName={content.department?.name}
          propertyName={content.property.name}
          version={currentVersion}
        />
      ) : (
        <>
          {/* ── Corpo SOP ── */}
          <article
            className="prose prose-gray max-w-none mb-8 bg-ivory-medium border border-ivory-dark p-4 sm:p-6 font-body"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.body) }}
          />

          {/* ── Allegati ── */}
          <AttachmentUploader contentId={content.id} canEdit={false} />

          {/* ── Lettura registrata — solo OPERATOR/HOD ── */}
          {!isFullGovernance && acknowledged && acknowledgedAt && (
            <SopReadReceipt
              readAt={acknowledgedAt}
              version={acknowledgedCurrentVersion ? currentVersion : anyPreviousAck?.contentVersion}
            />
          )}
        </>
      )}

      {/* ── Registro visualizzazioni — solo desktop ── */}
      <MobileHide>
        {isHod && hodDepartmentId && (
          <SopViewRegistry contentId={content.id} departmentId={hodDepartmentId} />
        )}
        {isFullGovernance && (
          <SopViewRegistry contentId={content.id} />
        )}
      </MobileHide>

      {/* ── Cronologia e note — HOD+ ── */}
      {!isOperator && (
        <ContentTimeline contentId={content.id} />
      )}
    </div>
  );
}
