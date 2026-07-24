"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useOperatorContext } from "@/components/operator/operator-shell";

const SafeHtml = dynamic(
  () => import("@/components/shared/safe-html").then((m) => m.SafeHtml),
  { ssr: false }
);

interface OnboardingSection {
  id: string;
  type: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  contentId: string | null;
  sortOrder: number;
  requiresAck: boolean;
  viewedAt: string | null;
  acknowledgedAt: string | null;
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

const SECTION_LABELS: Record<string, string> = {
  WELCOME: "Benvenuto",
  RULES: "Regole",
  JOB_DESCRIPTION: "Job Description",
  DOCUMENT: "Documento",
  SOP: "SOP",
};

export default function OnboardingPage() {
  const { currentPropertyId } = useOperatorContext();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAck = async (section: OnboardingSection) => {
    if (!data) return;
    setAcking(section.id);
    try {
      const res = await fetch(
        `/api/onboarding/assignments/${data.assignmentId}/sections/${section.id}/ack`,
        { method: "POST" }
      );
      if (res.ok) {
        fetchData();
      }
    } finally {
      setAcking(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[700px] mx-auto py-12">
        <div className="h-8 w-64 bg-ivory-dark animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-ivory-dark animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[700px] mx-auto py-12 text-center">
        <p className="text-charcoal/50 font-ui text-sm mb-3">Nessun percorso di onboarding attivo.</p>
        <Link href="/" className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:underline">
          Torna alla home
        </Link>
      </div>
    );
  }

  const isComplete = data.percentage === 100;

  return (
    <div className="max-w-[700px] mx-auto py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-[11px] font-ui text-charcoal/40 hover:text-terracotta uppercase tracking-wider">
          ← Home
        </Link>
        <h1 className="text-2xl font-heading font-medium text-charcoal-dark mt-2">
          Il tuo percorso di onboarding
        </h1>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-ui text-charcoal/50">
              {data.acknowledgedSections} di {data.requiredSections} completate
            </span>
            <span className="text-sm font-ui font-semibold text-terracotta">{data.percentage}%</span>
          </div>
          <div className="w-full h-2.5 bg-ivory-dark overflow-hidden">
            <div
              className="h-full bg-terracotta transition-all duration-500"
              style={{ width: `${data.percentage}%` }}
            />
          </div>
        </div>

        {isComplete && (
          <div className="mt-4 bg-sage-dark/10 border border-sage-dark/20 px-4 py-3">
            <p className="text-sm font-ui text-sage-dark font-medium">
              Onboarding completato! Hai preso visione di tutte le sezioni.
            </p>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {data.sections.map((section, index) => {
          const isDone = !!section.acknowledgedAt;
          const isExpanded = expandedId === section.id;
          const isSop = section.type === "SOP";
          const hasContent = !!section.body || !!section.fileUrl;

          return (
            <div key={section.id} className={`bg-white border ${isDone ? "border-ivory-dark" : "border-terracotta/30"}`}>
              {/* Section header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : section.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
              >
                <span className={`w-7 h-7 flex items-center justify-center text-sm shrink-0 ${
                  isDone ? "bg-sage-dark/10 text-sage-dark" : "bg-terracotta/10 text-terracotta"
                }`}>
                  {isDone ? "✓" : index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider ${
                    isDone ? "text-sage-dark/50" : "text-terracotta/60"
                  }`}>
                    {SECTION_LABELS[section.type] ?? section.type}
                  </span>
                  <p className={`font-ui font-medium text-sm truncate ${
                    isDone ? "text-charcoal/50" : "text-charcoal-dark"
                  }`}>
                    {section.title}
                  </p>
                </div>

                <span className="text-charcoal/30 text-xs shrink-0">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-ivory-medium px-5 py-5">
                  {isSop && section.contentId ? (
                    <div className="space-y-3">
                      <p className="text-sm font-ui text-charcoal/60">
                        Leggi questa procedura e conferma la presa visione.
                      </p>
                      <Link
                        href={`/sop/${section.contentId}`}
                        className="inline-block px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors"
                      >
                        Apri SOP
                      </Link>
                      {isDone && (
                        <p className="text-[11px] font-ui text-sage-dark">
                          Confermata il {new Date(section.acknowledgedAt!).toLocaleDateString("it-IT")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {section.body && (
                        <div className="prose-sm prose-body font-body text-charcoal leading-relaxed">
                          <SafeHtml html={section.body} />
                        </div>
                      )}

                      {section.fileUrl && (
                        <a
                          href={section.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-ui text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors"
                        >
                          📄 Scarica documento
                        </a>
                      )}

                      {!isDone && section.requiresAck && (
                        <button
                          onClick={() => handleAck(section)}
                          disabled={acking === section.id}
                          className="px-5 py-2.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
                        >
                          {acking === section.id ? "Conferma in corso..." : "Confermo presa visione"}
                        </button>
                      )}

                      {isDone && (
                        <p className="text-[11px] font-ui text-sage-dark">
                          Confermata il {new Date(section.acknowledgedAt!).toLocaleDateString("it-IT")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
