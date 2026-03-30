import { PropertyHero } from "@/components/operator/property-hero";
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { FeaturedSection } from "@/components/operator/featured-section";
import { QuickStats } from "@/components/operator/quick-stats";
import { LatestByType } from "@/components/operator/latest-by-type";

export default function OperatorHome() {
  return (
    <div>
      <section className="bg-ivory flex flex-col items-center pt-16 sm:pt-20 pb-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <PropertyHero />
        <div className="w-full mt-10">
          <SearchBar />
        </div>
      </section>

      <div className="space-y-10 pb-16">
        <PendingReads />
        <FeaturedSection />
        <QuickStats />
        <LatestByType />
      </div>
    </div>
  );
}
