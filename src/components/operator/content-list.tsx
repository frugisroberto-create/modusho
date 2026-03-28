"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface ContentItem {
  id: string; type: string; title: string; publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
  property: { id: string; name: string; code: string };
  acknowledged: boolean; acknowledgedAt: string | null;
}

interface Department { id: string; name: string; code: string }

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "bg-sage text-white" },
  DOCUMENT: { label: "Documento", cls: "bg-mauve text-white" },
};

interface ContentListProps {
  contentType: "SOP" | "DOCUMENT";
  detailPath: string;
  title: string;
}

export function ContentList({ contentType, detailPath, title }: ContentListProps) {
  const { currentPropertyId } = useOperatorContext();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [readFilter, setReadFilter] = useState<"" | "true" | "false">("");
  const pageSize = 20;

  useEffect(() => {
    async function fetchDepts() {
      const res = await fetch(`/api/content?type=${contentType}&propertyId=${currentPropertyId}&status=PUBLISHED&pageSize=50`);
      if (res.ok) {
        const json = await res.json();
        const depts = new Map<string, Department>();
        for (const item of json.data) { if (item.department) depts.set(item.department.id, item.department); }
        setDepartments(Array.from(depts.values()));
      }
    }
    fetchDepts();
  }, [contentType, currentPropertyId]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      type: contentType, propertyId: currentPropertyId, status: "PUBLISHED",
      page: page.toString(), pageSize: pageSize.toString(),
    });
    if (departmentFilter) params.set("departmentId", departmentFilter);
    if (readFilter) params.set("acknowledged", readFilter);
    try {
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) { const json = await res.json(); setItems(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [contentType, currentPropertyId, page, departmentFilter, readFilter]);

  useEffect(() => { fetchContent(); }, [fetchContent]);
  useEffect(() => { setPage(1); }, [departmentFilter, readFilter, currentPropertyId]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5 py-6">
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark">{title}</h1>

      <div className="flex flex-wrap gap-3">
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
          className="text-sm font-ui border-ivory-dark rounded-md px-3 py-2 bg-ivory">
          <option value="">Tutti i reparti</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={readFilter} onChange={(e) => setReadFilter(e.target.value as "" | "true" | "false")}
          className="text-sm font-ui border-ivory-dark rounded-md px-3 py-2 bg-ivory">
          <option value="">Tutti</option>
          <option value="false">Da leggere</option>
          <option value="true">Letti</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-20 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-sage-light font-ui">Nessun contenuto trovato</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
            return (
              <Link key={item.id} href={`/${detailPath}/${item.id}`}
                className="block bg-ivory-medium border border-ivory-dark rounded-lg p-4 hover:border-terracotta/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-ui font-medium px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                      {item.department && <span className="text-xs font-ui text-sage-light">{item.department.name}</span>}
                      {!item.acknowledged && (
                        <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-terracotta/10 text-terracotta">Da leggere</span>
                      )}
                    </div>
                    <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                    <div className="text-xs font-ui text-sage-light mt-1">
                      {item.publishedAt && `Pubblicato il ${new Date(item.publishedAt).toLocaleDateString("it-IT")}`}
                      {item.acknowledged && item.acknowledgedAt && (
                        <span className="ml-3 text-sage">Letto il {new Date(item.acknowledgedAt).toLocaleDateString("it-IT")}</span>
                      )}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-sage-light shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm font-ui text-sage-light">{total} risultat{total === 1 ? "o" : "i"} — Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark rounded-md hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Precedente
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark rounded-md hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Successivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
