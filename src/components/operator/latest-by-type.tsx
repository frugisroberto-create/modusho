"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface ContentItem {
  id: string; code: string | null; type: string; title: string;
  publishedAt: string | null;
  department: { name: string } | null;
}

interface MemoItem {
  id: string; contentId: string; title: string;
  publishedAt: string | null; author: string;
}

interface ColumnItem {
  id: string; title: string; href: string; code: string | null; metaNoCode: string;
}

interface Column {
  title: string; linkAll: string; linkAllLabel: string; items: ColumnItem[];
}

export function LatestByType() {
  const { currentPropertyId } = useOperatorContext();
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const [sopRes, docRes, memoRes] = await Promise.all([
        fetch(`/api/content?propertyId=${currentPropertyId}&type=SOP&status=PUBLISHED&pageSize=3`),
        fetch(`/api/content?propertyId=${currentPropertyId}&type=DOCUMENT&status=PUBLISHED&pageSize=3`),
        fetch(`/api/memo?propertyId=${currentPropertyId}&pageSize=3`),
      ]);

      const sopData: ContentItem[] = sopRes.ok ? (await sopRes.json()).data : [];
      const docData: ContentItem[] = docRes.ok ? (await docRes.json()).data : [];
      const memoData: MemoItem[] = memoRes.ok ? (await memoRes.json()).data : [];

      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : null;

      setColumns([
        {
          title: "Ultime SOP", linkAll: "/sop", linkAllLabel: "Vedi tutte",
          items: sopData.map(s => ({
            id: s.id, title: s.title, href: `/sop/${s.id}`, code: s.code || null,
            metaNoCode: [s.department?.name, fmtDate(s.publishedAt)].filter(Boolean).join(" · "),
          })),
        },
        {
          title: "Ultimi Documenti", linkAll: "/documents", linkAllLabel: "Vedi tutti",
          items: docData.map(d => ({
            id: d.id, title: d.title, href: `/documents/${d.id}`, code: null,
            metaNoCode: [d.department?.name, fmtDate(d.publishedAt)].filter(Boolean).join(" · "),
          })),
        },
        {
          title: "Ultimi Memo", linkAll: "/", linkAllLabel: "Vedi tutti",
          items: memoData.map(m => ({
            id: m.contentId, title: m.title, href: "/", code: null,
            metaNoCode: [m.author, fmtDate(m.publishedAt)].filter(Boolean).join(" · "),
          })),
        },
      ]);
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        {[1,2,3].map(i => <div key={i} className="h-48 skeleton" />)}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {columns.map((col) => (
        <div key={col.title} className="bg-white border border-ivory-dark flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-dark bg-ivory">
            <h3 className="text-base font-heading font-medium text-charcoal-dark">{col.title}</h3>
            <Link href={col.linkAll}
              className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:opacity-70 transition-opacity">
              {col.linkAllLabel}
            </Link>
          </div>
          <div className="flex-1">
            {col.items.length === 0 ? (
              <p className="text-sm font-ui text-charcoal/45 px-5 py-4">Nessun contenuto</p>
            ) : (
              col.items.map((item, idx) => (
                <Link key={item.id} href={item.href}
                  className={`block px-5 py-3.5 hover:bg-ivory transition-colors ${idx < col.items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-ui font-medium text-charcoal-dark leading-snug">{item.title}</p>
                    {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta tracking-wide shrink-0">{item.code}</span>}
                  </div>
                  <p className="text-[11px] font-ui text-charcoal/45 mt-1">{item.metaNoCode}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
