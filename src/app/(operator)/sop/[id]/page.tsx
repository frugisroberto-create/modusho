import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { AcknowledgeButton } from "@/components/operator/acknowledge-button";
import { SopViewTracker } from "@/components/operator/sop-view-tracker";
import { ContentActions } from "@/components/hoo/content-actions";
import { SopViewRegistry } from "@/components/shared/sop-view-registry";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import { MobileHide } from "@/components/mobile-hide";
import { ValidityBadge } from "@/components/shared/validity-badge";
import Link from "next/link";

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
      createdBy: { select: { name: true } },
      sopWorkflow: { select: { id: true, requiresNewAcknowledgment: true, reviewDueDate: true } },
      sopViewRecords: {
        where: { userId: user.id },
        orderBy: { contentVersion: "desc" },
        take: 10,
        select: { contentVersion: true, viewedAt: true, acknowledgedAt: true },
      },
      acknowledgments: { where: { userId: user.id }, select: { acknowledgedAt: true }, take: 1 },
    },
  });

  if (!content || content.status !== "PUBLISHED") notFound();

  const hasAccess = await checkAccess(user.id, "OPERATOR", content.propertyId, content.departmentId ?? undefined);
  if (!hasAccess) notFound();

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
  const acknowledged = acknowledgedCurrentVersion || (!requiresNewAck && anyPreviousAck != null);
  const acknowledgedAt = acknowledgedCurrentVersion
    ? currentVersionRecord!.acknowledgedAt!.toISOString()
    : (!requiresNewAck && anyPreviousAck != null)
      ? anyPreviousAck.acknowledgedAt!.toISOString()
      : null;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <SopViewTracker contentId={content.id} />

      <nav className="flex items-center gap-2 text-sm font-ui text-sage-light mb-6">
        <Link href="/sop" className="hover:text-terracotta transition-colors">SOP</Link>
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
              <ContentActions contentId={content.id} contentType={content.type} contentStatus={content.status} userRole={user.role} isFeatured={content.isFeatured} sopWorkflowId={content.sopWorkflow?.id} />
            ) : canExportPdf ? (
              <ExportPdfButton contentId={content.id} />
            ) : null}
          </div>
        </MobileHide>
      </div>

      {/* ── Corpo SOP ── */}
      <article
        className="prose prose-gray max-w-none mb-8 bg-ivory-medium border border-ivory-dark p-4 sm:p-6 font-body"
        dangerouslySetInnerHTML={{ __html: content.body }}
      />

      {/* ── Blocco personale presa visione — OPERATOR, HOD, HM ── */}
      {(isOperator || isHod || user.role === "HOTEL_MANAGER") && (
        <div className="bg-white border border-ivory-dark">
          <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
            <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
              Presa visione
            </span>
          </div>
          <div className="px-5 py-5 space-y-4">
            {/* Stato personale */}
            {acknowledged ? (
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#2E7D32] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="text-sm font-ui font-medium text-[#2E7D32]">
                    Presa visione confermata
                  </p>
                  <p className="text-xs font-ui text-charcoal/50 mt-0.5">
                    {acknowledgedAt && new Date(acknowledgedAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" "}— versione {acknowledgedCurrentVersion ? currentVersion : anyPreviousAck?.contentVersion}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#E65100] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-ui font-medium text-[#E65100]">
                      È richiesta la tua conferma di presa visione per questa versione
                    </p>
                    <p className="text-xs font-ui text-charcoal/50 mt-0.5">
                      Versione corrente: v{currentVersion}
                    </p>
                  </div>
                </div>
                <AcknowledgeButton
                  contentId={content.id}
                  acknowledged={false}
                  acknowledgedAt={null}
                  useSopEndpoint
                />
              </div>
            )}
          </div>
        </div>
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
    </div>
  );
}
