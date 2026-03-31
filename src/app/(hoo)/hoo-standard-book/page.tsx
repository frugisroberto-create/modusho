"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface ContentItem {
  id: string; title: string; status: string; publishedAt: string | null;
  property: { name: string; code: string };
  department: { name: string; code: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_ADMIN: "bg-[#FFF3E0] text-[#E65100]",
};

export default function HooStandardBookListPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const canCreate = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const canEdit = canCreate; // solo chi può creare può anche editare
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content?type=STANDARD_BOOK&pageSize=50");
      if (res.ok) { const json = await res.json(); setItems(json.data); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">Standard Book</h1>
          <p className="text-[13px] font-ui text-charcoal/50 mt-1">Sezioni operative per reparto</p>
        </div>
        {canCreate && <Link href="/hoo-standard-book/new" className="btn-primary">Nuova sezione</Link>}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessuna sezione Standard Book</p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, idx) => (
            <Link key={item.id} href={canEdit ? `/hoo-standard-book/${item.id}/edit` : `/standard-book/${item.id}`}
              className={`flex items-center justify-between p-4 hover:bg-ivory transition-colors ${idx < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[item.status] || "bg-ivory-dark text-charcoal"}`}>{item.status}</span>
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                  {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                  {!item.department && <span className="text-[11px] font-ui text-charcoal/35 italic">Trasversale</span>}
                </div>
                <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
              </div>
              <svg className="w-5 h-5 text-charcoal/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
