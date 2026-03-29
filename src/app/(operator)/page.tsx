import { PropertyHero } from "@/components/operator/property-hero";
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { MemoSection } from "@/components/operator/memo-section";
import { HighlightsSection } from "@/components/operator/highlights-section";

export default function OperatorHome() {
  return (
    <div>
      <section className="flex flex-col items-center pt-16 sm:pt-20 pb-10">
        <PropertyHero />
        <div className="w-full mt-10">
          <SearchBar />
        </div>
      </section>

      <div className="space-y-10 pb-16">
        <PendingReads />
        <MemoSection />
        <HighlightsSection />
      </div>
    </div>
  );
}
