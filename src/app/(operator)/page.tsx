import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { SopActivities } from "@/components/operator/sop-activities";
import { LatestByType } from "@/components/operator/latest-by-type";
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
      {/* ── BLOCCO 1+2: Header minimale + Search bar ── */}
      <section className="bg-ivory flex flex-col items-center pt-14 sm:pt-20 pb-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <PropertyName />
        <div className="w-full max-w-[520px] mt-10">
          <SearchBar />
        </div>
      </section>

      {/* ── Sezioni sotto hero ── */}
      <div className="max-w-[960px] mx-auto space-y-10 pb-16">
        {/* BLOCCO 3: Da prendere visione (condizionale) */}
        <PendingReads />

        {/* BLOCCO 4: Attività SOP — solo HOD/HM/HOO, non operatore */}
        <SopActivities />

        {/* BLOCCO 5: Ultimi contenuti — 3 pannelli */}
        <LatestByType />
      </div>
    </div>
  );
}
