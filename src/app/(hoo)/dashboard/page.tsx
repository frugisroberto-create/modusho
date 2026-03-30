import { HooHomeStats } from "@/components/hoo/hoo-home-stats";
import { HooFeaturedSection } from "@/components/hoo/hoo-featured-section";
import { HooLatestByType } from "@/components/hoo/hoo-latest-by-type";

export default function HooDashboardPage() {
  return (
    <div className="space-y-10 pb-16">
      <HooHomeStats />
      <HooFeaturedSection />
      <HooLatestByType />
    </div>
  );
}
