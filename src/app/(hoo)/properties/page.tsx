import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/rbac";

export default async function PropertiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const propertyIds = await getAccessiblePropertyIds(user.id);

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, isActive: true },
    include: {
      _count: { select: { contents: true, departments: true } },
    },
  });

  // Get stats per property
  const stats = await Promise.all(
    properties.map(async (p) => {
      const [sopTotal, sopPublished, sopInReview, ackCount, publishedContentCount] = await Promise.all([
        prisma.content.count({ where: { propertyId: p.id, type: "SOP" } }),
        prisma.content.count({ where: { propertyId: p.id, type: "SOP", status: "PUBLISHED" } }),
        prisma.content.count({ where: { propertyId: p.id, type: "SOP", status: { in: ["REVIEW_HM", "REVIEW_ADMIN"] } } }),
        prisma.contentAcknowledgment.count({ where: { content: { propertyId: p.id } } }),
        prisma.content.count({ where: { propertyId: p.id, status: "PUBLISHED" } }),
      ]);
      return {
        ...p,
        sopTotal,
        sopPublished,
        sopInReview,
        ackRate: publishedContentCount > 0 ? Math.round((ackCount / publishedContentCount) * 100) : null,
      };
    })
  );

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Strutture</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`}
            className="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all">
            <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
            <p className="text-xs text-gray-500 mb-3">{p.city} &middot; {p._count.departments} reparti</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">SOP totali:</span> <span className="font-medium">{p.sopTotal}</span></div>
              <div><span className="text-gray-500">Pubblicate:</span> <span className="font-medium text-green-600">{p.sopPublished}</span></div>
              <div><span className="text-gray-500">In review:</span> <span className="font-medium text-orange-600">{p.sopInReview}</span></div>
              <div><span className="text-gray-500">Presa visione:</span> <span className="font-medium">{p.ackRate != null ? `${p.ackRate}%` : "n/d"}</span></div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
