"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface PendingContent {
  id: string;
  code: string | null;
  type: string;
  title: string;
  publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
  MEMO: { label: "Memo", cls: "badge-memo" },
  BRAND_BOOK: { label: "Brand Book", cls: "badge-brand-book" },
  STANDARD_BOOK: { label: "Standard Book", cls: "badge-standard-book" },
};

function getDetailPath(type: string): string {
  if (type === "SOP") return "sop";
  if (type === "MEMO") return "comunicazioni";
  if (type === "BRAND_BOOK") return "brand-book";
  if (type === "STANDARD_BOOK") return "standard-book";
  return "documents";
}

export function PendingReads() {
  const { currentPropertyId } = useOperatorContext();
  const [items, setItems] = useState<PendingContent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/content?propertyId=${currentPropertyId}&status=PUBLISHED&acknowledged=false&pageSize=50`
      );
      if (res.ok) {
        const json = await res.json();
        setItems(json.data.filter((c: PendingContent) => c.type !== "BRAND_BOOK" && c.type !== "STANDARD_BOOK"));
      }
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  if (loading) {
    return (
      <section>
        <h2 className="text-xl font-heading font-medium text-charcoal-dark mb-4">Da prendere visione</h2>
        <div className="space-y-0">{[1, 2].map((i) => <div key={i} className="h-16 skeleton" />)}</div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-heading font-medium text-charcoal-dark">Da prendere visione</h2>
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-alert-red text-white text-[10px] font-ui font-bold">
          {items.length}
        </span>
      </div>
      <div className="bg-white border border-ivory-dark">
        {items.map((item, index) => {
          const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
          const detailPath = getDetailPath(item.type);
          const href = item.type === "MEMO" ? "/comunicazioni" : `/${detailPath}/${item.id}`;
          return (
            <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="w-2.5 h-2.5 rounded-full bg-terracotta shrink-0" />
              <div className="flex-1 flex flex-col gap-1">
                <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 w-fit ${badge.cls}`}>
                  {badge.label}
                </span>
                <Link href={href}
                  className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                  {item.title}
                </Link>
                <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45">
                  {item.code && <span>{item.code}</span>}
                  {item.department && <span>{item.department.name}</span>}
                  {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString("it-IT")}</span>}
                </div>
              </div>
              <Link href={href}
                className="shrink-0 px-3.5 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
                Leggi
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
