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

interface RowItem {
  id: string; title: string; href: string; code: string | null; meta: string;
  badge: { label: string; cls: string };
}

interface Section {
  title: string; linkAll: string; linkAllLabel: string; items: RowItem[];
}

const TYPE_BADGE = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
  MEMO: { label: "Memo", cls: "badge-memo" },
};

export function LatestByType() {
  const { currentPropertyId } = useOperatorContext();
  const [sections, setSections] = useState<Section[]>([]);
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

      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";

      setSections([
        {
          title: "Ultime SOP", linkAll: "/sop", linkAllLabel: "Vedi tutte",
          items: sopData.map(s => ({
            id: s.id, title: s.title, href: `/sop/${s.id}`, code: s.code || null,
            meta: [s.department?.name, fmtDate(s.publishedAt)].filter(Boolean).join(" · "),
            badge: TYPE_BADGE.SOP,
          })),
        },
        {
          title: "Ultimi Documenti", linkAll: "/documents", linkAllLabel: "Vedi tutti",
          items: docData.map(d => ({
            id: d.id, title: d.title, href: `/documents/${d.id}`, code: null,
            meta: [d.department?.name, fmtDate(d.publishedAt)].filter(Boolean).join(" · "),
            badge: TYPE_BADGE.DOCUMENT,
          })),
        },
        {
          title: "Ultimi Memo", linkAll: "/comunicazioni", linkAllLabel: "Vedi tutti",
          items: memoData.map(m => ({
            id: m.contentId, title: m.title, href: `/comunicazioni?open=${m.id}`, code: null,
            meta: [m.author, fmtDate(m.publishedAt)].filter(Boolean).join(" · "),
            badge: TYPE_BADGE.MEMO,
          })),
        },
      ]);
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-ivory-dark">
            <div className="h-12 bg-ivory border-b border-ivory-dark" />
            <div className="p-4 space-y-3">{[1, 2, 3].map(j => <div key={j} className="h-10 skeleton" />)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {sections.map((sec) => (
        <div key={sec.title} className="bg-white border border-ivory-dark flex flex-col">
          {/* Header pannello — sfondo ivory, titolo Playfair */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-ivory-dark bg-ivory">
            <h3 className="text-base font-heading font-medium text-charcoal-dark">{sec.title}</h3>
            <Link href={sec.linkAll}
              className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:opacity-70 transition-opacity">
              {sec.linkAllLabel}
            </Link>
          </div>
          {/* Righe contenuti */}
          <div className="flex-1">
            {sec.items.length === 0 ? (
              <p className="text-sm font-ui text-charcoal/35 px-5 py-5">Nessun contenuto</p>
            ) : (
              sec.items.map((item, idx) => (
                <Link key={item.id} href={item.href}
                  className={`flex items-center gap-4 px-5 py-3.5 hover:bg-[#FAFAF7] transition-colors ${idx < sec.items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 ${item.badge.cls}`}>
                        {item.badge.label}
                      </span>
                      {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta tracking-wide">{item.code}</span>}
                    </div>
                    <p className="text-[13px] font-ui font-medium text-charcoal-dark leading-snug truncate">{item.title}</p>
                    <p className="text-[11px] font-ui text-charcoal/45 mt-0.5">{item.meta}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
