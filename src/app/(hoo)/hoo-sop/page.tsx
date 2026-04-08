"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";
import { ValidityBadge } from "@/components/shared/validity-badge";
import { getValidityStatus } from "@/lib/sop-workflow";
import Link from "next/link";

interface SopWorkflowItem {
  id: string;
  contentId: string;
  code: string | null;
  title: string;
  contentStatus: string;
  sopStatus?: string; // legacy
  myRole: "R" | "C" | "A" | null;
  submittedToC: boolean;
  submittedToA: boolean;
  needsReview: boolean;
  reviewDueDate: string | null;
  lastSavedAt: string | null;
  textVersionCount: number;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  responsible: { id: string; name: string; role: string };
  consulted: { id: string; name: string; role: string } | null;
  accountable: { id: string; name: string; role: string };
  isImported?: boolean;
}

const DRAFT_STATUSES = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bozza",
  REVIEW_HM: "In revisione HM",
  REVIEW_ADMIN: "In revisione HOO",
  RETURNED: "Restituita",
  PUBLISHED: "Pubblicata",
  ARCHIVED: "Archiviata",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_HM: "bg-mauve/15 text-mauve",
  REVIEW_ADMIN: "bg-terracotta/10 text-terracotta",
  RETURNED: "bg-[#FECACA] text-[#991B1B]",
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  ARCHIVED: "bg-ivory-dark text-charcoal/50",
};

const WF_BADGE = "text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-mauve/15 text-mauve";

export default function HooSopListPage() {
  const { userRole } = useHooContext();
  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const [items, setItems] = useState<SopWorkflowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [validityFilter, setValidityFilter] = useState<"" | "expiring" | "expired">("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pageSize = 20;

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 400);
  };

  const fetchSops = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (statusFilter) {
      params.set("contentStatus", statusFilter);
    }
    if (search) {
      params.set("search", search);
    }
    try {
      const res = await fetch(`/api/sop-workflow?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data || []);
        setTotal(json.meta?.total || 0);
      } else {
        console.error("SOP fetch failed:", res.status, await res.text().catch(() => ""));
      }
    } finally { setLoading(false); }
  }, [page, statusFilter, search]);

  useEffect(() => { fetchSops(); }, [fetchSops]);
  useEffect(() => { setPage(1); }, [statusFilter, search]);

  // Filtro client-side per validità
  const filteredItems = useMemo(() => {
    if (!validityFilter) return items;
    return items.filter((item) => {
      if (item.contentStatus !== "PUBLISHED" || !item.reviewDueDate) return false;
      const status = getValidityStatus(item.reviewDueDate);
      if (validityFilter === "expired") return status === "EXPIRED";
      if (validityFilter === "expiring") return status === "EXPIRING";
      return false;
    });
  }, [items, validityFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">SOP</h1>
        <div className="flex items-center gap-3">
          {isHoo && (
            <Link href="/sop-import" className="btn-outline text-xs px-4 py-2">
              Importa SOP
            </Link>
          )}
          <Link href="/hoo-sop/new" className="btn-primary">Nuova SOP</Link>
        </div>
      </div>

      {/* Search — full-text che filtra la lista */}
      <div className="flex border border-ivory-dark bg-white overflow-hidden">
        <input type="text" value={searchInput} onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cerca nel titolo, codice o contenuto della SOP..."
          className="flex-1 px-5 py-3 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }} />
        {search && (
          <button onClick={() => { setSearch(""); setSearchInput(""); }}
            className="px-4 py-3 text-xs font-ui text-charcoal/50 hover:text-charcoal transition-colors">
            Annulla
          </button>
        )}
      </div>

      {/* Filtri */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Stato</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-ivory-dark px-3 py-2 bg-white font-ui">
            <option value="">Tutti gli stati</option>
            <option value="DRAFT">In lavorazione</option>
            <option value="PUBLISHED">Pubblicata</option>
            <option value="ARCHIVED">Archiviata</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Validità</label>
          <select value={validityFilter} onChange={(e) => setValidityFilter(e.target.value as "" | "expiring" | "expired")}
            className="text-sm border border-ivory-dark px-3 py-2 bg-white font-ui">
            <option value="">Tutte</option>
            <option value="expiring">In scadenza</option>
            <option value="expired">Scadute</option>
          </select>
        </div>
      </div>

      {/* Lista (con filtro validità client-side) */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : filteredItems.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">
          {statusFilter ? "Nessuna SOP trovata con questo stato" : "Nessuna SOP in cui sei coinvolto"}
        </p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {filteredItems.map((item, index) => (
            <div key={item.id} className={`p-4 flex items-center justify-between gap-4 ${index < filteredItems.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="flex-1 min-w-0">
                {/* Riga 1: stato documento + stato workflow + meta */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[item.contentStatus] || ""}`}>
                    {STATUS_LABELS[item.contentStatus] || item.contentStatus}
                  </span>
                  {DRAFT_STATUSES.includes(item.contentStatus) && item.submittedToC && item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta a HM e HOO</span>
                  )}
                  {DRAFT_STATUSES.includes(item.contentStatus) && item.submittedToC && !item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta a HM</span>
                  )}
                  {DRAFT_STATUSES.includes(item.contentStatus) && !item.submittedToC && item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta a HOO</span>
                  )}
                  {item.isImported && (
                    <span className="text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[#E3F2FD] text-[#1565C0]">
                      Importata
                    </span>
                  )}
                  {item.contentStatus === "PUBLISHED" && item.reviewDueDate && (
                    <ValidityBadge reviewDueDate={item.reviewDueDate} />
                  )}
                  {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta">{item.code}</span>}
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                  {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                </div>

                {/* Riga 2: titolo */}
                <Link href={`/sop-workflow/${item.id}`}
                  className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                  {item.title}
                </Link>

                {/* Riga 3: ruolo utente + RACI + versione */}
                <div className="flex items-center gap-3 mt-1 text-[11px] font-ui text-charcoal/35">
                  {item.myRole && (
                    <span className="text-terracotta font-semibold">
                      {item.myRole === "R" ? "Responsabile" : item.myRole === "C" ? "Consultato" : "Accountable"}
                    </span>
                  )}
                  <span>R: {item.responsible.name}</span>
                  {item.consulted && <span>C: {item.consulted.name}</span>}
                  <span>A: {item.accountable.name}</span>
                  {item.textVersionCount > 0 && <span>v{item.textVersionCount}</span>}
                </div>
              </div>

              {/* Azione */}
              <Link href={`/sop-workflow/${item.id}`}
                className="shrink-0 px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                Apri
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-charcoal/45 font-ui">Pagina {page} di {totalPages} ({total} SOP)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border hover:bg-ivory-dark disabled:opacity-50 font-ui">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border hover:bg-ivory-dark disabled:opacity-50 font-ui">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
