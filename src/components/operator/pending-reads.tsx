"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface PendingContent {
  id: string;
  type: string;
  title: string;
  publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "bg-sage text-white" },
  DOCUMENT: { label: "Documento", cls: "bg-mauve text-white" },
};

export function PendingReads() {
  const { currentPropertyId } = useOperatorContext();
  const [items, setItems] = useState<PendingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/content?propertyId=${currentPropertyId}&status=PUBLISHED&acknowledged=false&pageSize=50`
      );
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPropertyId]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleAcknowledge = async (contentId: string) => {
    setAcknowledging(contentId);
    try {
      const res = await fetch(`/api/content/${contentId}/acknowledge`, { method: "POST" });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== contentId));
    } finally { setAcknowledging(null); }
  };

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark">Da leggere</h2>
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-24 skeleton" />)}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section id="da-leggere" className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark">Da leggere</h2>
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-terracotta text-white text-xs font-ui font-bold">
          {items.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
          return (
            <div key={item.id} className="bg-ivory-medium border border-ivory-dark rounded-lg p-5 flex flex-col gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-ui font-medium px-2 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs font-ui px-2 py-0.5 rounded bg-terracotta/10 text-terracotta font-medium">
                    Presa visione richiesta
                  </span>
                </div>
                <Link href={`/${item.type === "SOP" ? "sop" : "documents"}/${item.id}`}
                  className="font-ui font-medium text-charcoal-dark hover:text-terracotta text-sm transition-colors">
                  {item.title}
                </Link>
                <div className="flex items-center gap-2 mt-1 text-xs font-ui text-sage-light">
                  {item.department && <span>{item.department.name}</span>}
                  {item.publishedAt && (
                    <span>{new Date(item.publishedAt).toLocaleDateString("it-IT")}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleAcknowledge(item.id)}
                disabled={acknowledging === item.id}
                className="self-start px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta rounded-md hover:bg-terracotta-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {acknowledging === item.id ? "Conferma..." : "Confermo presa visione"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
