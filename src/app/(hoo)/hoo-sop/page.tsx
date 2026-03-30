"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface SopItem {
  id: string; title: string; status: string;
  publishedAt: string | null; createdAt: string;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_ADMIN: "bg-[#FFF3E0] text-[#E65100]",
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  RETURNED: "bg-[#FECACA] text-[#991B1B]",
  ARCHIVED: "bg-ivory-dark text-charcoal/50",
};

export default function HooSopListPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const canEditPublished = ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);
  const [items, setItems] = useState<SopItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;

  const fetchSops = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: "SOP", page: page.toString(), pageSize: pageSize.toString() });
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) { const json = await res.json(); setItems(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { fetchSops(); }, [fetchSops]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">SOP</h1>
        <Link href="/hoo-sop/new" className="btn-primary">
          Nuova SOP
        </Link>
      </div>

      <div>
        <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Stato</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-ivory-dark px-3 py-2 bg-white font-ui">
          <option value="">Tutti gli stati</option>
          {["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED", "RETURNED", "ARCHIVED"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessuna SOP trovata</p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, index) => (
            <div key={item.id} className={`p-4 flex items-center justify-between ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[item.status] || ""}`}>{item.status}</span>
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                  {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                </div>
                <Link href={`/hoo-sop/${item.id}`} className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                  {item.title}
                </Link>
                <p className="text-[11px] font-ui text-charcoal/35 mt-1">{new Date(item.createdAt).toLocaleDateString("it-IT")}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {(item.status !== "ARCHIVED" && (item.status !== "PUBLISHED" || canEditPublished)) && (
                  <Link href={`/hoo-sop/${item.id}/edit`} className="px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                    Modifica
                  </Link>
                )}
                {(item.status === "REVIEW_ADMIN" || item.status === "REVIEW_HM") && (
                  <Link href={`/approvals/${item.id}`} className="px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-sage border border-sage/30 hover:bg-sage hover:text-white transition-colors">
                    Review
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-charcoal/45">Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border  hover:bg-ivory-dark disabled:opacity-50">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border  hover:bg-ivory-dark disabled:opacity-50">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
