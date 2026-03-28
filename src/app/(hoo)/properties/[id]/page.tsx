import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");

  const { id } = await params;

  const property = await prisma.property.findUnique({
    where: { id },
    include: { departments: { orderBy: { name: "asc" } } },
  });

  if (!property) notFound();

  const hasAccess = await checkAccess(user.id, "ADMIN", property.id);
  if (!hasAccess) notFound();

  // Department breakdown
  const deptStats = await Promise.all(
    property.departments.map(async (dept) => {
      const [total, published, inReview] = await Promise.all([
        prisma.content.count({ where: { propertyId: id, departmentId: dept.id, type: "SOP" } }),
        prisma.content.count({ where: { propertyId: id, departmentId: dept.id, type: "SOP", status: "PUBLISHED" } }),
        prisma.content.count({ where: { propertyId: id, departmentId: dept.id, type: "SOP", status: { in: ["REVIEW_HM", "REVIEW_ADMIN"] } } }),
      ]);
      return { ...dept, sopTotal: total, sopPublished: published, sopInReview: inReview };
    })
  );

  // Operatori e presa visione
  const operators = await prisma.user.findMany({
    where: {
      role: "OPERATOR",
      isActive: true,
      propertyAssignments: { some: { propertyId: id } },
    },
    include: {
      propertyAssignments: {
        where: { propertyId: id },
        include: { department: { select: { name: true } } },
      },
      acknowledgments: {
        where: { content: { propertyId: id, status: "PUBLISHED" } },
        select: { contentId: true },
      },
    },
  });

  const publishedCount = await prisma.content.count({
    where: { propertyId: id, status: "PUBLISHED", type: { in: ["SOP", "DOCUMENT"] } },
  });

  // SOP della property
  const sops = await prisma.content.findMany({
    where: { propertyId: id, type: "SOP" },
    select: {
      id: true, title: true, status: true, publishedAt: true,
      department: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700", REVIEW_HM: "bg-yellow-100 text-yellow-700",
    REVIEW_ADMIN: "bg-orange-100 text-orange-700", PUBLISHED: "bg-green-100 text-green-700",
    RETURNED: "bg-red-100 text-red-700", ARCHIVED: "bg-gray-200 text-gray-500",
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{property.name}</h1>
        <p className="text-sm text-gray-500">{property.city} &middot; {property.code}</p>
      </div>

      {/* Breakdown per reparto */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Reparti</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-2">Reparto</th><th className="px-4 py-2">SOP totali</th>
            <th className="px-4 py-2">Pubblicate</th><th className="px-4 py-2">In review</th>
          </tr></thead>
          <tbody>
            {deptStats.map(d => (
              <tr key={d.id} className="border-b border-gray-50">
                <td className="px-4 py-2 font-medium">{d.name}</td>
                <td className="px-4 py-2">{d.sopTotal}</td>
                <td className="px-4 py-2 text-green-600">{d.sopPublished}</td>
                <td className="px-4 py-2 text-orange-600">{d.sopInReview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Operatori e presa visione */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Operatori — Presa visione</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-2">Nome</th><th className="px-4 py-2">Reparto</th>
            <th className="px-4 py-2">Letture</th><th className="px-4 py-2">% completamento</th>
          </tr></thead>
          <tbody>
            {operators.map(op => {
              const deptName = op.propertyAssignments[0]?.department?.name || "Tutti";
              const ackCount = op.acknowledgments.length;
              const pct = publishedCount > 0 ? Math.round((ackCount / publishedCount) * 100) : 0;
              return (
                <tr key={op.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium">{op.name}</td>
                  <td className="px-4 py-2 text-gray-600">{deptName}</td>
                  <td className="px-4 py-2">{ackCount}/{publishedCount}</td>
                  <td className="px-4 py-2">
                    <span className={`font-medium ${pct < 50 ? "text-red-600" : pct < 80 ? "text-yellow-600" : "text-green-600"}`}>
                      {pct}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* SOP della property */}
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">SOP</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {sops.map(sop => (
            <div key={sop.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[sop.status] || ""}`}>{sop.status}</span>
                  <span className="text-sm font-medium text-gray-900">{sop.title}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{sop.department?.name || "Trasversale"}</p>
              </div>
              {sop.publishedAt && <span className="text-xs text-gray-400">{new Date(sop.publishedAt).toLocaleDateString("it-IT")}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
