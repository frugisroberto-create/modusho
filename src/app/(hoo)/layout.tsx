import { redirect } from "next/navigation";
import { getSessionUser, getUserProperties } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HooShell } from "@/components/hoo/hoo-shell";
import { loadAudienceActor } from "@/lib/target-audience-scope-db";
import { getTargetableDepartmentIds, hasRestrictedAudience } from "@/lib/target-audience-scope";

export default async function HooLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Il perimetro dei destinatari serve a tre moduli di creazione, e si risolve
  // qui una volta per tutta la shell. Ma lo si paga SOLO a chi ce l'ha: per gli
  // altri ruoli è sempre "nessuna restrizione", e chiederlo al database
  // significherebbe una lettura in più su ogni pagina della zona per non
  // sapere nulla.
  //
  // E dove serve, quella lettura non si aggiunge: sostituisce. La riga
  // dell'attore è la stessa che verifica che l'account esista ancora, quindi
  // ogni ruolo paga esattamente una lettura, come prima di questa modifica.
  const audienceActor = hasRestrictedAudience(user.role)
    ? await loadAudienceActor(user.id)
    : null;

  const accountStillExists = hasRestrictedAudience(user.role)
    ? audienceActor !== null
    : (await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } })) !== null;
  if (!accountStillExists) redirect("/api/auth/signout");

  if (user.role !== "HOD" && user.role !== "HOTEL_MANAGER" && user.role !== "CORPORATE" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  // Carica le property accessibili — solo SUPER_ADMIN vede tutto
  let properties;
  if (user.role === "SUPER_ADMIN") {
    properties = await prisma.property.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });
  } else {
    properties = await getUserProperties(user.id);
  }

  // Ciò che i moduli di creazione passano al selettore: l'elenco che si vede è
  // esattamente quello che le rotte accetteranno.
  const targetableDepartmentIds = audienceActor
    ? getTargetableDepartmentIds(audienceActor)
    : null;

  return (
    <HooShell
      userName={user.name}
      userRole={user.role}
      userId={user.id}
      targetableDepartmentIds={targetableDepartmentIds}
      canEdit={user.canEdit}
      properties={properties}
    >
      {children}
    </HooShell>
  );
}
