"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface HighlightContent {
  id: string; type: string; title: string;
  publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
  acknowledged: boolean;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "bg-sage text-white" },
  DOCUMENT: { label: "Documento", cls: "bg-mauve text-white" },
  MEMO: { label: "Memo", cls: "bg-terracotta/20 text-terracotta" },
};

export function HighlightsSection() {
  const { currentPropertyId } = useOperatorContext();
  const [items, setItems] = useState<HighlightContent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHighlights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content?propertyId=${currentPropertyId}&status=PUBLISHED&pageSize=6`);
      if (res.ok) {
        const json = await res.json();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recent = json.data.filter(
          (c: HighlightContent) => c.publishedAt && new Date(c.publishedAt) >= sevenDaysAgo
        );
        setItems(recent.slice(0, 6));
      }
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchHighlights(); }, [fetchHighlights]);

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark">In evidenza</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 skeleton" />)}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark">In evidenza</h2>
        <Link href="/sop" className="text-sm font-ui text-terracotta hover:text-terracotta-light transition-colors">
          Vedi tutti
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
          return (
            <Link
              key={item.id}
              href={`/${item.type === "SOP" ? "sop" : "documents"}/${item.id}`}
              className="bg-ivory-medium border border-ivory-dark rounded-lg p-5 hover:border-terracotta/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`text-xs font-ui font-medium px-2 py-0.5 rounded ${badge.cls}`}>
                  {badge.label}
                </span>
                {!item.acknowledged && (
                  <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-terracotta/10 text-terracotta">
                    Da leggere
                  </span>
                )}
              </div>
              <h3 className="font-ui font-medium text-charcoal-dark text-sm mb-2">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs font-ui text-sage-light">
                {item.department && <span>{item.department.name}</span>}
                {item.publishedAt && (
                  <span>{new Date(item.publishedAt).toLocaleDateString("it-IT")}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
