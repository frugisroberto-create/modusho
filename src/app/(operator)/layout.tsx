import { Suspense } from "react";
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

  // Verifica che l'utente esista ancora nel DB (dopo reset DB il JWT è stale)
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!dbUser) redirect("/api/auth/signout");

  // SUPER_ADMIN e ADMIN vedono tutte le property attive
  let properties;
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    properties = await prisma.property.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, tagline: true },
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

  return (
    <Suspense>
      <OperatorShell
        userName={user.name}
        userRole={user.role}
        properties={properties}
        defaultPropertyId={defaultPropertyId}
      >
        {children}
      </OperatorShell>
    </Suspense>
  );
}
