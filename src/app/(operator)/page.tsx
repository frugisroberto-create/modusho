/* eslint-disable @next/next/no-img-element */
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { MemoSection } from "@/components/operator/memo-section";
import { HighlightsSection } from "@/components/operator/highlights-section";

export default function OperatorHome() {
  return (
    <div>
      <section className="flex flex-col items-center pt-16 sm:pt-20 pb-10">
        <img
          src="/images/ho-logo-verticale.png"
          alt="HO Collection"
          style={{ maxWidth: 300 }}
          className="mb-8"
        />
        <div className="w-full">
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
