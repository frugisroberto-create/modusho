import { HooPropertyHero } from "@/components/hoo/hoo-property-hero";
import { HooSearchBar } from "@/components/hoo/hoo-search-bar";
import { HooHomeStats } from "@/components/hoo/hoo-home-stats";
import { HooFeaturedSection } from "@/components/hoo/hoo-featured-section";
import { HooLatestByType } from "@/components/hoo/hoo-latest-by-type";

export default function HooDashboardPage() {
  return (
    <div className="space-y-10 pb-16">
      <section className="bg-ivory flex flex-col items-center pt-16 pb-10 -mx-6 lg:-mx-10 px-6 lg:px-10">
        <HooPropertyHero />
        <div className="w-full mt-10">
          <HooSearchBar />
        </div>
      </section>
      <HooHomeStats />
      <HooFeaturedSection />
      <HooLatestByType />
    </div>
  );
}
