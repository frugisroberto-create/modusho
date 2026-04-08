import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess, getAccessibleDepartmentIds } from "@/lib/rbac";
import { AcknowledgeButton } from "@/components/operator/acknowledge-button";
import Link from "next/link";

interface Props { params: Promise<{ id: string }> }

export default async function StandardBookDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
      acknowledgments: { where: { userId: user.id }, select: { acknowledgedAt: true }, take: 1 },
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.status !== "PUBLISHED" || content.type !== "STANDARD_BOOK") notFound();

  // RBAC coarse: property access (no departmentId).
  const hasAccess = await checkAccess(user.id, "OPERATOR", content.propertyId);
  if (!hasAccess) notFound();

  // RBAC fine per OPERATOR/HOD: match su targetAudience.
  if (user.role === "OPERATOR" || user.role === "HOD") {
    const accessibleDepts = await getAccessibleDepartmentIds(user.id, content.propertyId);
    const isInTarget = content.targetAudience.some((t) => {
      if (t.targetType === "ROLE" && t.targetRole === "OPERATOR") return true;
      if (t.targetType === "ROLE" && t.targetRole === user.role) return true;
      if (t.targetType === "USER" && t.targetUserId === user.id) return true;
      if (t.targetType === "DEPARTMENT" && t.targetDepartmentId && accessibleDepts.includes(t.targetDepartmentId)) return true;
      return false;
    });
    if (!isInTarget && !(user.role === "HOD" && content.createdBy.id === user.id)) {
      notFound();
    }
  }

  const acknowledged = content.acknowledgments.length > 0;
  const acknowledgedAt = content.acknowledgments[0]?.acknowledgedAt?.toISOString() ?? null;

  const sourceBadge = content.standardSource === "LQA"
    ? { label: "LQA Standards", bg: "#E3F2FD", color: "#1565C0" }
    : content.standardSource === "HO_BRAND"
    ? { label: "HO Brand Standards", bg: "#F3E5F5", color: "#6A1B9A" }
    : null;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4">
      <nav className="flex items-center gap-2 text-sm font-ui text-sage-light mb-6">
        <Link href="/standard-book" className="hover:text-terracotta transition-colors">Standard Book</Link>
        <span className="text-ivory-dark">/</span>
        <span className="text-charcoal-dark">{content.title}</span>
      </nav>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {sourceBadge && (
            <span className="text-xs font-ui font-semibold px-2 py-0.5"
              style={{ background: sourceBadge.bg, color: sourceBadge.color }}>
              {sourceBadge.label}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{content.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm font-ui text-sage-light">
          <span className="text-terracotta font-medium">{content.property.name}</span>
          {content.publishedAt && (
            <span>Pubblicato il {new Date(content.publishedAt).toLocaleDateString("it-IT")}</span>
          )}
        </div>
      </div>

      {/* Tabella standard — larghezza piena, stili inline preservati (no prose reset) */}
      <div className="overflow-x-auto mb-8 border border-ivory-dark bg-white"
        dangerouslySetInnerHTML={{ __html: content.body }} />

      {user.role === "OPERATOR" && (
        <div className="border-t border-ivory-dark pt-6">
          <AcknowledgeButton contentId={content.id} acknowledged={acknowledged} acknowledgedAt={acknowledgedAt} />
        </div>
      )}
    </div>
  );
}
