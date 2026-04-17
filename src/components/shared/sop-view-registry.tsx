"use client";

import { useState, useEffect, useCallback } from "react";

type ViewStatus = "not_viewed" | "viewed" | "acknowledged" | "needs_reack";

interface RegistryEntry {
  userId: string;
  userName: string;
  userRole: string;
  status: ViewStatus;
  lastViewedAt: string | null;
  lastViewedVersion: number | null;
  acknowledgedAt: string | null;
  acknowledgedVersion: number | null;
}

interface RegistryData {
  currentVersion: number;
  requiresNewAcknowledgment: boolean;
  registry: RegistryEntry[];
  totals: {
    total: number;
    notViewed: number;
    viewed: number;
    acknowledged: number;
    needsReack: number;
  };
}

interface Props {
  contentId: string;
  /** Se specificato, filtra il registro al solo reparto indicato */
  departmentId?: string;
}

const STATUS_CONFIG: Record<ViewStatus, { label: string; cls: string; order: number }> = {
  needs_reack: { label: "Nuova conferma richiesta", cls: "bg-[#FFF3E0] text-[#E65100]", order: 0 },
  not_viewed: { label: "Non visualizzata", cls: "bg-ivory-dark text-charcoal/60", order: 1 },
  viewed: { label: "Vista", cls: "bg-[#E3F2FD] text-[#1565C0]", order: 2 },
  acknowledged: { label: "Confermata", cls: "bg-[#E8F5E9] text-[#2E7D32]", order: 3 },
};

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Operatore",
  HOD: "HOD",
  HOTEL_MANAGER: "Hotel Manager",
  ADMIN: "HOO",
  SUPER_ADMIN: "HOO",
};

type FilterValue = "all" | ViewStatus;

export function SopViewRegistry({ contentId, departmentId }: Props) {
  const [data, setData] = useState<RegistryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("all");

  const fetchRegistry = useCallback(async () => {
    try {
      const params = departmentId ? `?departmentId=${departmentId}` : "";
      const res = await fetch(`/api/sop/${contentId}/view-registry${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  if (loading) {
    return (
      <div className="bg-white border border-ivory-dark">
        <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
            Registro visualizzazioni
          </span>
        </div>
        <div className="p-5">
          <div className="h-20 skeleton" />
        </div>
      </div>
    );
  }

  if (!data || data.registry.length === 0) {
    return (
      <div className="bg-white border border-ivory-dark">
        <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
            Registro visualizzazioni
          </span>
        </div>
        <div className="p-5 text-sm font-ui text-charcoal/40">
          Nessun destinatario trovato per questa SOP.
        </div>
      </div>
    );
  }

  const filtered = filter === "all"
    ? data.registry
    : data.registry.filter((r) => r.status === filter);

  // Ordina: needs_reack prima, poi not_viewed, viewed, acknowledged
  const sorted = [...filtered].sort(
    (a, b) => STATUS_CONFIG[a.status].order - STATUS_CONFIG[b.status].order
  );

  const { totals, currentVersion, requiresNewAcknowledgment } = data;

  return (
    <div className="bg-white border border-ivory-dark">
      {/* Header */}
      <div className="px-5 py-3 bg-ivory border-b border-ivory-dark flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
            Registro visualizzazioni
          </span>
          <span className="text-xs font-ui text-charcoal/40">
            v{currentVersion} — {totals.total} destinatari
          </span>
        </div>
        {requiresNewAcknowledgment && (
          <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-[#FFF3E0] text-[#E65100]">
            Nuova conferma richiesta
          </span>
        )}
        {!requiresNewAcknowledgment && (
          <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-ivory-dark text-charcoal/50">
            Conferma precedente valida
          </span>
        )}
      </div>

      {/* Contatori + filtri */}
      <div className="px-5 py-2.5 border-b border-ivory-dark flex items-center gap-2 flex-wrap">
        <FilterPill
          label={`Tutti (${totals.total})`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {totals.needsReack > 0 && (
          <FilterPill
            label={`Da riconfermare (${totals.needsReack})`}
            active={filter === "needs_reack"}
            onClick={() => setFilter("needs_reack")}
          />
        )}
        <FilterPill
          label={`Non viste (${totals.notViewed})`}
          active={filter === "not_viewed"}
          onClick={() => setFilter("not_viewed")}
        />
        <FilterPill
          label={`Viste (${totals.viewed})`}
          active={filter === "viewed"}
          onClick={() => setFilter("viewed")}
        />
        <FilterPill
          label={`Confermate (${totals.acknowledged})`}
          active={filter === "acknowledged"}
          onClick={() => setFilter("acknowledged")}
        />
      </div>

      {/* Progress bar */}
      <div className="px-5 py-2 border-b border-ivory-dark">
        <div className="flex h-1.5 bg-ivory-dark overflow-hidden">
          {totals.acknowledged > 0 && (
            <div
              className="bg-[#2E7D32] transition-all"
              style={{ width: `${(totals.acknowledged / totals.total) * 100}%` }}
            />
          )}
          {totals.viewed > 0 && (
            <div
              className="bg-[#1565C0] transition-all"
              style={{ width: `${(totals.viewed / totals.total) * 100}%` }}
            />
          )}
          {totals.needsReack > 0 && (
            <div
              className="bg-[#E65100] transition-all"
              style={{ width: `${(totals.needsReack / totals.total) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-ui">
          <thead>
            <tr className="bg-ivory text-charcoal/50 text-[11px] uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 font-semibold">Utente</th>
              <th className="text-left px-3 py-2.5 font-semibold">Ruolo</th>
              <th className="text-left px-3 py-2.5 font-semibold">Stato</th>
              <th className="text-left px-3 py-2.5 font-semibold">Ultima visita</th>
              <th className="text-left px-3 py-2.5 font-semibold">Conferma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory-dark">
            {sorted.map((entry) => (
              <RegistryRow key={entry.userId} entry={entry} currentVersion={currentVersion} />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="px-5 py-4 text-sm font-ui text-charcoal/40">
          Nessun risultato per il filtro selezionato.
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-ui px-2.5 py-1 transition-colors ${
        active
          ? "bg-terracotta text-white font-semibold"
          : "bg-ivory-dark text-charcoal/60 hover:text-charcoal"
      }`}
    >
      {label}
    </button>
  );
}

function RegistryRow({ entry, currentVersion }: { entry: RegistryEntry; currentVersion: number }) {
  const cfg = STATUS_CONFIG[entry.status];

  return (
    <tr className="hover:bg-ivory/50 transition-colors">
      <td className="px-5 py-2.5 text-charcoal-dark font-medium">{entry.userName}</td>
      <td className="px-3 py-2.5 text-charcoal/60">{ROLE_LABELS[entry.userRole] || entry.userRole}</td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${cfg.cls}`}>
          {cfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-charcoal/50">
        {entry.lastViewedAt ? (
          <span>
            {new Date(entry.lastViewedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {entry.lastViewedVersion !== null && entry.lastViewedVersion !== currentVersion && (
              <span className="ml-1 text-[10px] text-charcoal/35">(v{entry.lastViewedVersion})</span>
            )}
          </span>
        ) : (
          <span className="text-charcoal/30">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-charcoal/50">
        {entry.acknowledgedAt ? (
          <span className="text-[#2E7D32]">
            {new Date(entry.acknowledgedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {entry.acknowledgedVersion !== null && entry.acknowledgedVersion !== currentVersion && (
              <span className="ml-1 text-[10px] text-charcoal/35">(v{entry.acknowledgedVersion})</span>
            )}
          </span>
        ) : (
          <span className="text-charcoal/30">—</span>
        )}
      </td>
    </tr>
  );
}
