"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface OnboardingSection {
  id: string;
  type: string;
  title: string;
  sortOrder: number;
  requiresAck: boolean;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  contentId: string | null;
}

interface OnboardingData {
  assignmentId: string;
  totalSections: number;
  requiredSections: number;
  acknowledgedSections: number;
  percentage: number;
  sections: OnboardingSection[];
}

const SECTION_ICONS: Record<string, string> = {
  WELCOME: "👋",
  RULES: "📋",
  JOB_DESCRIPTION: "💼",
  DOCUMENT: "📄",
  SOP: "📝",
};

export function OnboardingProgress() {
  const { currentPropertyId } = useOperatorContext();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOnboarding = useCallback(async () => {
    if (!currentPropertyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/my?propertyId=${currentPropertyId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPropertyId]);

  useEffect(() => { fetchOnboarding(); }, [fetchOnboarding]);

  if (loading) return null;
  if (!data) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-heading font-medium text-charcoal-dark">
          Il tuo percorso di onboarding
        </h2>
        <span className="text-[11px] font-ui font-bold text-terracotta">
          {data.percentage}%
        </span>
      </div>

      <div className="bg-white border border-ivory-dark">
        {/* Progress bar */}
        <div className="px-5 pt-4 pb-3">
          <div className="w-full h-2 bg-ivory-dark overflow-hidden">
            <div
              className="h-full bg-terracotta transition-all duration-500"
              style={{ width: `${data.percentage}%` }}
            />
          </div>
          <p className="text-[11px] font-ui text-charcoal/40 mt-1.5">
            {data.acknowledgedSections} di {data.requiredSections} sezioni completate
          </p>
        </div>

        {/* Section list (max 5 visible, then "Vedi tutto") */}
        <div className="border-t border-ivory-medium">
          {data.sections.slice(0, 5).map((section) => {
            const isDone = !!section.acknowledgedAt;
            const isSop = section.type === "SOP";
            const href = isSop && section.contentId
              ? `/sop/${section.contentId}`
              : `/onboarding`;

            return (
              <div
                key={section.id}
                className={`flex items-center gap-4 px-5 py-3 border-b border-ivory-medium last:border-b-0 ${
                  isDone ? "opacity-50" : ""
                }`}
              >
                <span className="text-sm shrink-0">{isDone ? "✓" : SECTION_ICONS[section.type] ?? "?"}</span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={href}
                    className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors truncate block"
                  >
                    {section.title}
                  </Link>
                </div>
                {!isDone && (
                  <Link
                    href={href}
                    className="shrink-0 px-3 py-1 text-[10px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors"
                  >
                    {isSop ? "Leggi" : "Apri"}
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {data.sections.length > 5 && (
          <div className="border-t border-ivory-medium px-5 py-3 text-center">
            <Link
              href="/my-onboarding"
              className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:underline"
            >
              Vedi percorso completo ({data.sections.length} sezioni)
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
