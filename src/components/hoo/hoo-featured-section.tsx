"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface FeaturedItem {
  id: string; code: string | null; type: string; title: string;
  publishedAt: string | null; featuredAt?: string | null;
  department: { name: string } | null;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
  MEMO: { label: "Memo", cls: "badge-memo" },
};

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function HooFeaturedSection() {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/content?status=PUBLISHED&featured=true&pageSize=10");
        if (res.ok) { const json = await res.json(); setItems(json.data); }
      } finally { setLoading(false); }
    }
    fetch_();
  }, []);

  if (loading) return <div className="h-32 skeleton" />;
  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading font-medium text-charcoal-dark">In evidenza</h2>
        <Link href="/hoo-sop" className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:opacity-70 transition-opacity">
          Gestisci
        </Link>
      </div>
      <div className="bg-white border border-ivory-dark">
        {items.map((item, index) => {
          const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
          const days = item.publishedAt ? daysAgo(item.publishedAt) : null;
          const detailPath = item.type === "SOP" ? "sop" : "documents";
          return (
            <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="w-1 h-10 bg-terracotta shrink-0" />
              <div className="flex-1 flex flex-col gap-1">
                <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 w-fit ${badge.cls}`}>
                  {badge.label}
                </span>
                <Link href={`/approvals/${item.id}`}
                  className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                  {item.title}
                </Link>
                <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45">
                  {item.code && <span>{item.code}</span>}
                  {item.department && <span>{item.department.name}</span>}
                  {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
                </div>
              </div>
              {days !== null && (
                <span className="text-[11px] font-body italic text-charcoal/40 shrink-0">
                  Da {days} giorn{days === 1 ? "o" : "i"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
