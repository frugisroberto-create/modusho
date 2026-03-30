"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ContentItem {
  id: string; code: string | null; type: string; title: string; status: string;
  publishedAt: string | null;
  department: { name: string } | null;
  property: { name: string; code: string };
}

interface MemoItem {
  id: string; contentId: string; title: string;
  publishedAt: string | null; author: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PUBLISHED: { label: "Pubblicata", cls: "bg-[#E8F5E9] text-[#2E7D32]" },
  REVIEW_HM: { label: "In revisione", cls: "bg-[#FFF3E0] text-[#E65100]" },
  REVIEW_ADMIN: { label: "In revisione", cls: "bg-[#FFF3E0] text-[#E65100]" },
  DRAFT: { label: "Bozza", cls: "bg-ivory-medium text-charcoal/60" },
  RETURNED: { label: "Restituita", cls: "bg-[#FECACA] text-[#991B1B]" },
};

interface ColumnItem {
  id: string; title: string; href: string; code: string | null; meta: string; statusBadge: { label: string; cls: string } | null;
}

interface Column { title: string; linkAll: string; linkAllLabel: string; items: ColumnItem[] }

export function HooLatestByType() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const [sopRes, docRes, memoRes] = await Promise.all([
          fetch("/api/content?type=SOP&pageSize=3"),
          fetch("/api/content?type=DOCUMENT&pageSize=3"),
          fetch("/api/content?type=MEMO&status=PUBLISHED&pageSize=3"),
        ]);
        const sopData: ContentItem[] = sopRes.ok ? (await sopRes.json()).data : [];
        const docData: ContentItem[] = docRes.ok ? (await docRes.json()).data : [];
        const memoData: ContentItem[] = memoRes.ok ? (await memoRes.json()).data : [];

        const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";

        setColumns([
          {
            title: "Ultime SOP", linkAll: "/hoo-sop", linkAllLabel: "Vedi tutte",
            items: sopData.map(s => ({
              id: s.id, title: s.title, href: `/approvals/${s.id}`, code: s.code,
              meta: [s.department?.name, s.property.code, fmtDate(s.publishedAt)].filter(Boolean).join(" · "),
              statusBadge: STATUS_BADGE[s.status] || null,
            })),
          },
          {
            title: "Ultimi Documenti", linkAll: "/hoo-sop", linkAllLabel: "Vedi tutti",
            items: docData.map(d => ({
              id: d.id, title: d.title, href: `/approvals/${d.id}`, code: null,
              meta: [d.property.code, fmtDate(d.publishedAt)].filter(Boolean).join(" · "),
              statusBadge: STATUS_BADGE[d.status] || null,
            })),
          },
          {
            title: "Ultimi Memo", linkAll: "/memo", linkAllLabel: "Vedi tutti",
            items: memoData.map(m => ({
              id: m.id, title: m.title, href: "/memo", code: null,
              meta: [m.property?.code, fmtDate(m.publishedAt)].filter(Boolean).join(" · "),
              statusBadge: { label: "Pubblicato", cls: "bg-[#E8F5E9] text-[#2E7D32]" },
            })),
          },
        ]);
      } finally { setLoading(false); }
    }
    fetch_();
  }, []);

  if (loading) {
    return <div className="grid gap-6 lg:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-48 skeleton" />)}</div>;
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
                    <div className="flex items-center gap-2 shrink-0">
                      {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta tracking-wide">{item.code}</span>}
                      {item.statusBadge && (
                        <span className={`text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 ${item.statusBadge.cls}`}>
                          {item.statusBadge.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] font-ui text-charcoal/45 mt-1">{item.meta}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
