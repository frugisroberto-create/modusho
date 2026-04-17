import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canUserAccessContent } from "@/lib/rbac";
import { stripEnColumnFromStandardBook } from "@/lib/standard-book";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";

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
      targetAudience: {
        select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
      },
    },
  });

  if (!content || content.status !== "PUBLISHED" || content.type !== "STANDARD_BOOK") notFound();

  const canAccess = await canUserAccessContent(user.id, user.role, {
    propertyId: content.propertyId,
    createdById: content.createdBy.id,
    targetAudience: content.targetAudience,
  });
  if (!canAccess) notFound();

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

      {/* Tabella standard — larghezza piena, stili inline preservati (no prose reset).
          La colonna "Standard (EN)" viene rimossa server-side per migliorare la
          leggibilità (specialmente su mobile) — era un duplicato della colonna IT. */}
      <div className="overflow-x-auto mb-8 border border-ivory-dark bg-white"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(stripEnColumnFromStandardBook(content.body)) }} />
    </div>
  );
}
