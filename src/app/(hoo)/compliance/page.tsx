"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useHooContext } from "@/components/hoo/hoo-shell";

interface ComplianceItem {
  id: string;
  code: string | null;
  type: string;
  title: string;
  department: { id: string; name: string; code: string } | null;
  property: { id: string; name: string; code: string };
  targetCount: number;
  ackedCount: number;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Property {
  id: string;
  name: string;
  code: string;
  departments?: Department[];
}

type ContentTypeFilter = "" | "SOP" | "DOCUMENT" | "MEMO" | "STANDARD_BOOK";

const TYPE_LABELS: Record<string, string> = {
  SOP: "SOP",
  DOCUMENT: "Documento",
  MEMO: "Memo",
  STANDARD_BOOK: "Standard Book",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  SOP: "badge-sop",
  DOCUMENT: "badge-document",
  MEMO: "badge-memo",
  STANDARD_BOOK: "bg-[#E3F2FD] text-[#1565C0] text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5",
};

function getDetailHref(item: ComplianceItem): string {
  switch (item.type) {
    case "SOP": return `/sop/${item.id}`;
    case "DOCUMENT": return `/documents/${item.id}`;
    case "MEMO": return `/comunicazioni?open=${item.id}`;
    case "STANDARD_BOOK": return `/standard-book/${item.id}`;
    default: return `/sop/${item.id}`;
  }
}

function TypeBadge({ type }: { type: string }) {
  const badgeClass = TYPE_BADGE_CLASSES[type];
  const label = TYPE_LABELS[type] ?? type;

  if (type === "STANDARD_BOOK") {
    return <span className={badgeClass}>{label}</span>;
  }

  return (
    <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${badgeClass}`}>
      {label}
    </span>
  );
}

export default function CompliancePage() {
  const { userRole } = useHooContext();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>("");
  const pageSize = 20;

  useEffect(() => {
    async function fetchProperties() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (json.data.length === 1) setPropertyFilter(json.data[0].id);
      }
    }
    fetchProperties();
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (propertyFilter) params.set("propertyId", propertyFilter);
      if (departmentFilter) params.set("departmentId", departmentFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/compliance?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
        setTotal(json.meta.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, propertyFilter, departmentFilter, typeFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [propertyFilter, departmentFilter, typeFilter]);

  const totalPages = Math.ceil(total / pageSize);

  const selectedProperty = properties.find((p) => p.id === propertyFilter);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-heading font-medium text-charcoal-dark">Presa visione</h1>

      {/* Filtri */}
      <div className="flex items-end gap-4 flex-wrap">
        {properties.length > 1 && (
          <div>
            <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">
              Struttura
            </label>
            <select
              value={propertyFilter}
              onChange={(e) => { setPropertyFilter(e.target.value); setDepartmentFilter(""); }}
              className="text-sm font-ui border border-ivory-dark px-3 py-2 bg-white"
            >
              <option value="">Tutte le strutture</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">
            Reparto
          </label>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={`text-sm font-ui border border-ivory-dark px-3 py-2 bg-white ${!propertyFilter ? "text-charcoal/35" : ""}`}
            disabled={!propertyFilter}
          >
            <option value="">Tutti i reparti</option>
            {selectedProperty?.departments?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">
            Tipo
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ContentTypeFilter)}
            className="text-sm font-ui border border-ivory-dark px-3 py-2 bg-white"
          >
            <option value="">Tutti i tipi</option>
            <option value="SOP">SOP</option>
            <option value="DOCUMENT">Documento</option>
            <option value="MEMO">Memo</option>
            <option value="STANDARD_BOOK">Standard Book</option>
          </select>
        </div>
      </div>

      {/* Tabella */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-heading text-charcoal-dark mb-2">Tutte le prese visione sono complete</p>
          <p className="text-sm font-ui text-charcoal/40">Nessun contenuto con presa visione incompleta.</p>
        </div>
      ) : (
        <div className="bg-white border border-ivory-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ivory border-b border-ivory-dark text-left">
                <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45">
                  Codice
                </th>
                <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45">
                  Tipo
                </th>
                <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45">
                  Titolo
                </th>
                <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45">
                  Reparto
                </th>
                {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && properties.length > 1 && (
                  <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45">
                    Struttura
                  </th>
                )}
                <th className="py-3 px-4 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/45 text-right">
                  Letti
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const isEven = index % 2 === 0;
                const href = getDetailHref(item);
                const pct = item.targetCount > 0
                  ? Math.round((item.ackedCount / item.targetCount) * 100)
                  : 0;

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-ivory-dark/50 hover:bg-ivory-dark/30 transition-colors ${
                      isEven ? "bg-ivory/50" : "bg-ivory-medium/40"
                    }`}
                  >
                    <td className="py-3 px-4">
                      {item.code ? (
                        <span className="text-[11px] font-ui font-semibold text-terracotta">
                          {item.code}
                        </span>
                      ) : (
                        <span className="text-[11px] font-ui text-charcoal/30">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <TypeBadge type={item.type} />
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={href}
                        className="font-ui font-medium text-charcoal-dark hover:text-terracotta transition-colors"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[12px] font-ui text-charcoal/60">
                        {item.department?.name ?? "—"}
                      </span>
                    </td>
                    {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && properties.length > 1 && (
                      <td className="py-3 px-4">
                        <span className="text-[11px] font-ui text-charcoal/50">
                          {item.property.code}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-ivory-dark overflow-hidden hidden sm:block">
                          <div
                            className={`h-full transition-all ${pct >= 100 ? "bg-sage" : pct >= 50 ? "bg-[#D4A017]" : "bg-terracotta"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[12px] font-ui font-semibold text-charcoal-dark tabular-nums">
                          {item.ackedCount} / {item.targetCount}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-charcoal/45 font-ui">
            Pagina {page} di {totalPages} ({total} risultati)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 font-ui"
            >
              Precedente
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 font-ui"
            >
              Successivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
