import { redirect } from "next/navigation";
import { getSessionUser, getUserProperties } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { OperatorShell } from "@/components/operator/operator-shell";

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // SUPER_ADMIN vede tutte le property
  let properties;
  if (user.role === "SUPER_ADMIN") {
    properties = await prisma.property.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
  } else {
    properties = await getUserProperties(user.id);
  }

  if (properties.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Nessuna struttura assegnata. Contatta l&apos;amministratore.</p>
      </div>
    );
  }

  const defaultPropertyId = properties[0].id;

  // Conteggio contenuti da visionare (presa visione obbligatoria, non ancora confermata)
  const propertyIds = properties.map((p) => p.id);
  const pendingCount = await prisma.content.count({
    where: {
      status: "PUBLISHED",
      propertyId: { in: propertyIds },
      acknowledgments: {
        none: { userId: user.id },
      },
    },
  });

  return (
    <OperatorShell
      userName={user.name}
      userRole={user.role}
      properties={properties}
      defaultPropertyId={defaultPropertyId}
      pendingCount={pendingCount}
    >
      {children}
    </OperatorShell>
  );
}
