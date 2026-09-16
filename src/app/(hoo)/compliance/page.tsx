"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useHooContext } from "@/components/hoo/hoo-shell";
import {
  applyDepartment,
  applyPage,
  applyProperty,
  applyState,
  applyType,
  buildComplianceApiQuery,
  buildComplianceQuery,
  COMPLIANCE_STATES,
  COMPLIANCE_STATE_LABELS,
  parseComplianceState,
  reconcileDepartment,
  type ComplianceStateName,
  type ComplianceTypeFilter,
  type ComplianceUrlState,
} from "@/lib/compliance-url-state";

interface ComplianceItem {
  id: string;
  code: string | null;
  type: string;
  title: string;
  department: { id: string; name: string; code: string } | null;
  property: { id: string; name: string; code: string };
  targetCount: number;
  ackedCount: number;
  state: ComplianceStateName;
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

type StateCounts = Record<ComplianceStateName, number>;

const EMPTY_COUNTS: StateCounts = { aperta: 0, completata: 0, "senza-destinatari": 0 };

const TYPE_LABELS: Record<string, string> = {
  SOP: "SOP",
  DOCUMENT: "Documento",
  MEMO: "Memo",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  SOP: "badge-sop",
  DOCUMENT: "badge-document",
  MEMO: "badge-memo",
};

/** Cosa dice la pagina quando un elenco è vuoto: il motivo, non solo il fatto. */
const EMPTY_MESSAGES: Record<ComplianceStateName, { title: string; detail: string }> = {
  aperta: {
    title: "Tutte le prese visione sono complete",
    detail: "Nessun contenuto in attesa di essere letto. Le righe chiuse sono in «Completate».",
  },
  completata: {
    title: "Nessuna presa visione completata",
    detail: "Nessun contenuto è stato letto da tutti i suoi destinatari.",
  },
  "senza-destinatari": {
    title: "Nessun contenuto senza destinatari",
    detail: "Ogni contenuto pubblicato ha almeno una persona che può prenderne visione.",
  },
};

function getDetailHref(item: ComplianceItem): string {
  switch (item.type) {
    case "SOP": return `/sop/${item.id}`;
    case "DOCUMENT": return `/documents/${item.id}`;
    case "MEMO": return `/comunicazioni?open=${item.id}`;
    default: return `/sop/${item.id}`;
  }
}

function TypeBadge({ type }: { type: string }) {
  const badgeClass = TYPE_BADGE_CLASSES[type];
  const label = TYPE_LABELS[type] ?? type;

  return (
    <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${badgeClass}`}>
      {label}
    </span>
  );
}

export default function CompliancePage() {
  const { userRole } = useHooContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Stato dei filtri ──────────────────────────────────────────────────────
  // Seminato UNA VOLTA dall'indirizzo (initializer lazy). Da qui in poi la
  // direzione è unica, stato → URL: l'indirizzo non rialimenta mai lo stato.
  const [state, setState] = useState<ComplianceUrlState>(() => parseComplianceState(searchParams));

  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [counts, setCounts] = useState<StateCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const pageSize = 20;

  // ── Unico punto che scrive l'indirizzo ────────────────────────────────────
  // `replaceState` sostituisce la voce di cronologia invece di aggiungerne una:
  // dopo dieci filtraggi il tasto indietro esce dalla pagina in un colpo solo.
  useEffect(() => {
    const query = buildComplianceQuery(state);
    const url = query ? `${pathname}?${query}` : pathname;
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [state, pathname]);

  // Le strutture accessibili. Chi ne ha una sola non deve sceglierla.
  const propertiesLoaded = useRef(false);
  useEffect(() => {
    async function fetchProperties() {
      const res = await fetch("/api/properties");
      if (!res.ok) return;
      const json = await res.json();
      setProperties(json.data);
      if (propertiesLoaded.current) return;
      propertiesLoaded.current = true;
      setState((s) => {
        const seeded = json.data.length === 1 ? applyProperty(s, json.data[0].id) : s;
        const departmentIds: string[] = (json.data as Property[])
          .filter((p) => !seeded.propertyId || p.id === seeded.propertyId)
          .flatMap((p) => p.departments?.map((d) => d.id) ?? []);
        return reconcileDepartment(seeded, departmentIds);
      });
    }
    fetchProperties();
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compliance?${buildComplianceApiQuery(state, pageSize)}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
        setTotal(json.meta.total);
        setCounts(json.meta.counts ?? EMPTY_COUNTS);
      }
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalPages = Math.ceil(total / pageSize);
  const selectedProperty = properties.find((p) => p.id === state.propertyId);
  const showPropertyColumn =
    (userRole === "ADMIN" || userRole === "SUPER_ADMIN") && properties.length > 1;
  const empty = EMPTY_MESSAGES[state.state];

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">Presa visione</h1>
        {/* La riga che toglie il sospetto che archiviare cancelli qualcosa */}
        <p className="text-sm font-ui text-charcoal/45 mt-1">
          Ogni contenuto pubblicato resta in elenco. Le righe non spariscono: cambiano stato.
        </p>
      </div>

      {/* Linguette di stato: i conteggi valgono per i filtri scelti, e mostrano
          che le righe chiuse ci sono ancora */}
      <div className="flex gap-1 bg-ivory border border-ivory-dark p-0.5 w-fit flex-wrap">
        {COMPLIANCE_STATES.map((name) => (
          <button
            key={name}
            onClick={() => setState((s) => applyState(s, name))}
            className={`px-3 py-1.5 text-sm font-ui transition-colors ${
              state.state === name ? "bg-charcoal-dark text-white" : "text-charcoal hover:bg-ivory-dark"
            }`}
          >
            {COMPLIANCE_STATE_LABELS[name]}
            <span className={`ml-2 tabular-nums ${state.state === name ? "text-white/70" : "text-charcoal/45"}`}>
              {counts[name]}
            </span>
          </button>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex items-end gap-4 flex-wrap">
        {properties.length > 1 && (
          <div>
            <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">
              Struttura
            </label>
            <select
              value={state.propertyId}
              onChange={(e) => setState((s) => applyProperty(s, e.target.value))}
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
            value={state.departmentId}
            onChange={(e) => setState((s) => applyDepartment(s, e.target.value))}
            className={`text-sm font-ui border border-ivory-dark px-3 py-2 bg-white ${!state.propertyId ? "text-charcoal/35" : ""}`}
            disabled={!state.propertyId}
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
            value={state.type}
            onChange={(e) => setState((s) => applyType(s, e.target.value as ComplianceTypeFilter))}
            className="text-sm font-ui border border-ivory-dark px-3 py-2 bg-white"
          >
            <option value="">Tutti i tipi</option>
            <option value="SOP">SOP</option>
            <option value="DOCUMENT">Documento</option>
            <option value="MEMO">Memo</option>
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
          <p className="text-lg font-heading text-charcoal-dark mb-2">{empty.title}</p>
          <p className="text-sm font-ui text-charcoal/40">{empty.detail}</p>
        </div>
      ) : (
        <div className="bg-white border border-ivory-dark overflow-hidden">
          {state.state === "senza-destinatari" && (
            <p className="px-4 py-3 text-[12px] font-ui text-charcoal bg-[#FDF3D7] border-b border-ivory-dark">
              Questi contenuti sono pubblicati ma non hanno nessuna persona fra i destinatari: nessuno
              può prenderne visione. Succede quando un reparto resta senza personale attivo, o quando i
              destinatari non sono mai stati scelti. Si risolve sul contenuto, scegliendo i destinatari.
            </p>
          )}
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
                {showPropertyColumn && (
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
                    {showPropertyColumn && (
                      <td className="py-3 px-4">
                        <span className="text-[11px] font-ui text-charcoal/50">
                          {item.property.code}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      {item.targetCount === 0 ? (
                        <span className="text-[12px] font-ui text-alert-red">Nessun destinatario</span>
                      ) : (
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
                      )}
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
            Pagina {state.page} di {totalPages} ({total} risultati)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setState((s) => applyPage(s, s.page - 1))}
              disabled={state.page <= 1}
              className="px-3 py-1.5 text-sm border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 font-ui"
            >
              Precedente
            </button>
            <button
              onClick={() => setState((s) => applyPage(s, Math.min(totalPages, s.page + 1)))}
              disabled={state.page >= totalPages}
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
