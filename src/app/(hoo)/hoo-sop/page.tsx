"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SopItem {
  id: string; title: string; status: string;
  publishedAt: string | null; createdAt: string;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  REVIEW_HM: "bg-yellow-100 text-yellow-700",
  REVIEW_ADMIN: "bg-orange-100 text-orange-700",
  PUBLISHED: "bg-green-100 text-green-700",
  RETURNED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-gray-200 text-gray-500",
};

export default function HooSopListPage() {
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
        <h1 className="text-xl font-bold text-gray-900">SOP</h1>
        <Link href="/hoo-sop/new" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
          Nuova SOP
        </Link>
      </div>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white">
        <option value="">Tutti gli stati</option>
        {["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED", "RETURNED", "ARCHIVED"].map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Nessuna SOP trovata</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[item.status] || ""}`}>{item.status}</span>
                  <span className="text-xs text-gray-500">{item.property.code}</span>
                  {item.department && <span className="text-xs text-gray-500">{item.department.name}</span>}
                </div>
                <h3 className="font-medium text-gray-900 text-sm">{item.title}</h3>
                <p className="text-xs text-gray-400 mt-1">{new Date(item.createdAt).toLocaleDateString("it-IT")}</p>
              </div>
              <div className="flex gap-2">
                {item.status !== "PUBLISHED" && item.status !== "ARCHIVED" && (
                  <Link href={`/hoo-sop/${item.id}/edit`} className="px-3 py-1.5 text-xs font-ui text-terracotta hover:bg-terracotta/10 rounded-md border border-terracotta/30">
                    Modifica
                  </Link>
                )}
                {(item.status === "REVIEW_ADMIN" || item.status === "REVIEW_HM") && (
                  <Link href={`/approvals/${item.id}`} className="px-3 py-1.5 text-xs font-ui text-sage hover:bg-sage/10 rounded-md border border-sage/30">
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
          <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
