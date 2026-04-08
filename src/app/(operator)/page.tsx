import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { SopActivities } from "@/components/operator/sop-activities";
import { SopExpiryAlert } from "@/components/operator/sop-expiry-alert";
import { PropertyName } from "@/components/operator/property-name";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function OperatorHome({ searchParams }: Props) {
  const user = await getSessionUser();
  const params = await searchParams;

  // ADMIN/SUPER_ADMIN: landing su dashboard (salvo vista hotel esplicita)
  if (user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN") && params.view !== "hotel") {
    redirect("/dashboard");
  }

  return (
    <div>
      {/* ── Hero: nome hotel + tagline + barra ricerca ──
          Con la home minimale (no feed, no sezioni editoriali) l'hero ha spazio
          per respirare — aumentata spaziatura verticale e gap per portare la
          barra di ricerca verso il centro ottico della pagina. */}
      <section className="relative z-10 bg-ivory flex flex-col items-center pt-20 sm:pt-28 md:pt-36 pb-16 sm:pb-20 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <PropertyName />
        <div className="w-full max-w-[520px] mt-16 sm:mt-20">
          <SearchBar />
        </div>
      </section>

      {/* ── Sezioni sotto hero ── */}
      <div className="max-w-[960px] mx-auto space-y-10 pb-16">
        {/* Da prendere visione (condizionale: scompare se vuoto) */}
        <PendingReads />

        {/* Attività SOP — solo HOD/HM/HOO, auto-hide per operatore */}
        <SopActivities />

        {/* Alert scadenza SOP — solo HOD/HM/HOO desktop */}
        <SopExpiryAlert />
      </div>
    </div>
  );
}
