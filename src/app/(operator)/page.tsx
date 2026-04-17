import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

  // ADMIN/SUPER_ADMIN su desktop: landing su approvazioni.
  // Su mobile: resta sulla home hotel (le approvazioni sono raggiungibili
  // via sub-nav, ma la landing mobile privilegia la consultazione rapida).
  if (user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN") && params.view !== "hotel") {
    const ua = (await headers()).get("user-agent") ?? "";
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    if (!isMobile) {
      redirect("/approvals");
    }
  }

  return (
    <div>
      {/* ── Hero: nome hotel + tagline + barra ricerca ──
          min-h: l'hero occupa ~55% dell'altezza viewport e centra il suo
          contenuto verticalmente (justify-center). In questo modo, anche con
          la home "inbox zero" e senza contenuto sotto, nome hotel + tagline +
          search rimangono sempre al centro ottico dello schermo, indipendente
          dalla taglia del viewport (iPhone piccolo, iPhone Pro Max, desktop). */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[55vh] sm:min-h-[60vh] py-12">
        <PropertyName />
        <div className="w-full max-w-[520px] mt-12 sm:mt-14">
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
