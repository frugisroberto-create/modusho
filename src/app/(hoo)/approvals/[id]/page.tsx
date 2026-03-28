import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { ApprovalActions } from "@/components/hoo/approval-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApprovalDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });

  if (!content) notFound();

  const hasAccess = await checkAccess(user.id, "ADMIN", content.propertyId);
  if (!hasAccess) notFound();

  const canReview = content.status === "REVIEW_ADMIN" || content.status === "REVIEW_HM";

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            content.status === "REVIEW_ADMIN" ? "bg-orange-100 text-orange-700" :
            content.status === "RETURNED" ? "bg-red-100 text-red-700" :
            content.status === "PUBLISHED" ? "bg-green-100 text-green-700" :
            "bg-gray-100 text-gray-700"
          }`}>{content.status}</span>
          <span className="text-xs text-gray-500">{content.property.code}</span>
          {content.department && <span className="text-xs text-gray-500">{content.department.name}</span>}
          <span className="text-xs text-gray-400">v{content.version}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{content.title}</h1>
        <div className="flex gap-3 mt-2 text-sm text-gray-500">
          <span>Autore: {content.createdBy.name}</span>
          <span>Ultimo editor: {content.updatedBy.name}</span>
        </div>
      </div>

      {/* Body */}
      <article
        className="prose prose-gray max-w-none bg-white rounded-lg border border-gray-200 p-6"
        dangerouslySetInnerHTML={{ __html: content.body }}
      />

      {/* Azioni */}
      {canReview && <ApprovalActions contentId={content.id} currentStatus={content.status} />}

      {/* Storico completo */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Storico workflow</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {content.statusHistory.map((h) => (
            <div key={h.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {h.fromStatus && (
                    <>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{h.fromStatus}</span>
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">{h.toStatus}</span>
                  <span className="text-sm text-gray-600">da {h.changedBy.name}</span>
                </div>
                <span className="text-xs text-gray-400">{new Date(h.changedAt).toLocaleString("it-IT")}</span>
              </div>
              {h.note && <p className="text-sm text-gray-500 mt-1 pl-2 border-l-2 border-gray-200">{h.note}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Review precedenti */}
      {content.reviews.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Review</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {content.reviews.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      r.action === "APPROVED" ? "bg-green-100 text-green-700" :
                      r.action === "RETURNED" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{r.action}</span>
                    <span className="text-sm text-gray-600">{r.reviewer.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString("it-IT")}</span>
                </div>
                {r.note && <p className="text-sm text-gray-500 mt-1 pl-2 border-l-2 border-gray-200">{r.note}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
