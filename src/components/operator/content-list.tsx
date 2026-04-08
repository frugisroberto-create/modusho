"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";
import { MobileHide } from "@/components/mobile-hide";
import { LiveSearchBar } from "@/components/shared/live-search-bar";

interface ContentItem {
  id: string; code: string | null; type: string; title: string; publishedAt: string | null;
  department: { id: string; name: string; code: string } | null;
  property: { id: string; name: string; code: string };
  acknowledged: boolean | null; acknowledgedAt: string | null;
}

interface Department { id: string; name: string; code: string }

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
};

interface ContentListProps {
  contentType: "SOP" | "DOCUMENT";
  detailPath: string;
  title: string;
  description?: string;
  createPath?: string;
  createLabel?: string;
  searchPlaceholder?: string;
}

export function ContentList({ contentType, detailPath, title, description, createPath, createLabel, searchPlaceholder }: ContentListProps) {
  const { currentPropertyId, userRole } = useOperatorContext();
  // HOD può creare DOCUMENT/MEMO direttamente (limitato al proprio reparto)
  // e può creare SOP attraverso il workflow RACI
  const canCreate = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [deptsLoaded, setDeptsLoaded] = useState(false);
  const [readFilter, setReadFilter] = useState<"" | "true" | "false">("");
  const pageSize = 20;

  const roleRequiresSpecificDept = userRole === "OPERATOR" || userRole === "HOD";

  // Load accessible departments (RBAC-filtered)
  useEffect(() => {
    async function fetchDepts() {
      const res = await fetch(`/api/my-departments?propertyId=${currentPropertyId}`);
      if (res.ok) {
        const json = await res.json();
        const depts: Department[] = json.data;
        setDepartments(depts);
        // OPERATOR/HOD with single dept: pre-select and lock
        if (roleRequiresSpecificDept && depts.length === 1) {
          setDepartmentFilter(depts[0].id);
        }
      }
      setDeptsLoaded(true);
    }
    setDepartmentFilter("");
    setDeptsLoaded(false);
    fetchDepts();
  }, [currentPropertyId, roleRequiresSpecificDept]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      type: contentType, propertyId: currentPropertyId, status: "PUBLISHED",
      page: page.toString(), pageSize: pageSize.toString(),
    });
    if (departmentFilter) params.set("departmentId", departmentFilter);
    if (readFilter) params.set("acknowledged", readFilter);
    try {
      // cache: no-store — la lista dipende da targetAudience e ack dell'utente corrente;
      // Safari iOS tende a cachare aggressivamente le GET JSON senza header espliciti.
      const res = await fetch(`/api/content?${params}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
        setTotal(json.meta.total);
      } else if (res.status === 401) {
        // Sessione scaduta: non mostrare un muto "Nessun contenuto" ma rimanda al login.
        window.location.href = "/login";
      }
    } finally { setLoading(false); }
  }, [contentType, currentPropertyId, page, departmentFilter, readFilter]);

  useEffect(() => { fetchContent(); }, [fetchContent]);
  useEffect(() => { setPage(1); }, [departmentFilter, readFilter, currentPropertyId]);

  // Safari iOS bfcache: quando l'utente torna indietro con il tasto back,
  // la pagina viene restaurata dalla memoria senza re-eseguire gli useEffect.
  // Il listener pageshow con event.persisted = true ci permette di rifetchare.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) fetchContent();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [fetchContent]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5 py-6">
      {/* Header: titolo + bottone */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">{title}</h1>
          {description && <p className="text-[13px] font-ui text-charcoal/50 mt-1">{description}</p>}
        </div>
        {canCreate && createPath && (
          <MobileHide>
            <Link href={createPath} className="btn-primary">
              {createLabel || "Nuovo"}
            </Link>
          </MobileHide>
        )}
      </div>

      {/* Search bar — full-text con dropdown live */}
      <LiveSearchBar
        propertyId={currentPropertyId}
        contentType={contentType}
        placeholder={searchPlaceholder || (contentType === "SOP" ? "Cerca una procedura..." : "Cerca un documento...")}
      />

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Reparto</label>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
            className="text-sm font-ui border-ivory-dark px-3 py-2 bg-white"
            disabled={roleRequiresSpecificDept && departments.length <= 1}>
            {!roleRequiresSpecificDept && <option value="">Tutti i reparti</option>}
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Stato</label>
          <select value={readFilter} onChange={(e) => setReadFilter(e.target.value as "" | "true" | "false")}
            className="text-sm font-ui border-ivory-dark px-3 py-2 bg-white">
            <option value="">Tutti gli stati</option>
            <option value="false">Da leggere</option>
            <option value="true">Letti</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-20 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-charcoal/40 font-ui">Nessun contenuto trovato</div>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, index) => {
            const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
            return (
              <Link key={item.id} href={`/${detailPath}/${item.id}`}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-ivory transition-colors ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 ${badge.cls}`}>{badge.label}</span>
                    {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                    {item.acknowledged === false && (
                      <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-terracotta/10 text-terracotta">Da leggere</span>
                    )}
                    {item.acknowledged === true && (
                      <span className="text-[10px] font-ui uppercase tracking-wider px-2 py-0.5 bg-[#E8F5E9] text-[#2E7D32]">Letto</span>
                    )}
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                  <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45 mt-1">
                    {item.code && <span className="font-semibold text-terracotta">{item.code}</span>}
                    {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    {item.acknowledged && item.acknowledgedAt && (
                      <span className="text-[#2E7D32]">Letto il {new Date(item.acknowledgedAt).toLocaleDateString("it-IT")}</span>
                    )}
                  </div>
                </div>
                <svg className="w-5 h-5 text-charcoal/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
          <p className="text-sm font-ui text-charcoal/45">{total} risultat{total === 1 ? "o" : "i"} — Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Precedente
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">
              Successivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
