"use client";

import { useState, useEffect, useCallback } from "react";

interface RegistryEntry {
  userId: string;
  userName: string;
  userRole: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

interface Props {
  contentId: string;
  userRole?: string;
  userId?: string;
  propertyId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Operatore",
  HOD: "HOD",
};

export function ContentAckRegistry({ contentId, userRole, userId, propertyId }: Props) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [totals, setTotals] = useState<{ total: number; acknowledged: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "acknowledged" | "pending">("all");

  const fetchRegistry = useCallback(async () => {
    try {
      // HOD: fetch own department first, then pass as filter
      let deptParam = "";
      if (userRole === "HOD" && userId && propertyId) {
        const deptRes = await fetch(`/api/my-departments?propertyId=${propertyId}`);
        if (deptRes.ok) {
          const deptJson = await deptRes.json();
          if (deptJson.data?.length > 0) {
            deptParam = `?departmentId=${deptJson.data[0].id}`;
          }
        }
      }
      const res = await fetch(`/api/content/${contentId}/ack-registry${deptParam}`);
      if (res.ok) {
        const json = await res.json();
        setRegistry(json.data.registry);
        setTotals(json.data.totals);
      }
    } finally { setLoading(false); }
  }, [contentId, userRole, userId, propertyId]);

  useEffect(() => { fetchRegistry(); }, [fetchRegistry]);

  if (loading) {
    return (
      <div className="bg-white border border-ivory-dark mt-6">
        <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">Registro presa visione</span>
        </div>
        <div className="p-5"><div className="h-20 skeleton" /></div>
      </div>
    );
  }

  if (!totals || registry.length === 0) {
    return (
      <div className="bg-white border border-ivory-dark mt-6">
        <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
          <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">Registro presa visione</span>
        </div>
        <div className="p-5 text-sm font-ui text-charcoal/40">Nessun destinatario trovato.</div>
      </div>
    );
  }

  const filtered = filter === "all" ? registry
    : filter === "acknowledged" ? registry.filter((r) => r.acknowledged)
    : registry.filter((r) => !r.acknowledged);

  const sorted = [...filtered].sort((a, b) => {
    if (a.acknowledged === b.acknowledged) return a.userName.localeCompare(b.userName);
    return a.acknowledged ? 1 : -1;
  });

  const pct = totals.total > 0 ? Math.round((totals.acknowledged / totals.total) * 100) : 0;

  return (
    <div className="bg-white border border-ivory-dark mt-6">
      <div className="px-5 py-3 bg-ivory border-b border-ivory-dark flex items-center justify-between">
        <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
          Registro presa visione
        </span>
        <span className="text-xs font-ui text-charcoal/40">
          {totals.acknowledged}/{totals.total} ({pct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-2 border-b border-ivory-dark">
        <div className="flex h-1.5 bg-ivory-dark overflow-hidden">
          <div className="bg-[#2E7D32] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Filtri */}
      <div className="px-5 py-2.5 border-b border-ivory-dark flex items-center gap-2">
        {(["all", "pending", "acknowledged"] as const).map((f) => {
          const label = f === "all" ? `Tutti (${totals.total})`
            : f === "pending" ? `Da leggere (${totals.pending})`
            : `Letti (${totals.acknowledged})`;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] font-ui px-2.5 py-1 transition-colors ${
                filter === f ? "bg-terracotta text-white font-semibold" : "bg-ivory-dark text-charcoal/60 hover:text-charcoal"
              }`}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-ui">
          <thead>
            <tr className="bg-ivory text-charcoal/50 text-[11px] uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 font-semibold">Utente</th>
              <th className="text-left px-3 py-2.5 font-semibold">Ruolo</th>
              <th className="text-left px-3 py-2.5 font-semibold">Stato</th>
              <th className="text-left px-3 py-2.5 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory-dark">
            {sorted.map((entry) => (
              <tr key={entry.userId} className="hover:bg-ivory/50 transition-colors">
                <td className="px-5 py-2.5 text-charcoal-dark font-medium">{entry.userName}</td>
                <td className="px-3 py-2.5 text-charcoal/60">{ROLE_LABELS[entry.userRole] || entry.userRole}</td>
                <td className="px-3 py-2.5">
                  {entry.acknowledged ? (
                    <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-[#E8F5E9] text-[#2E7D32]">Letto</span>
                  ) : (
                    <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-ivory-dark text-charcoal/60">Da leggere</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-charcoal/50">
                  {entry.acknowledgedAt ? (
                    <span className="text-[#2E7D32]">
                      {new Date(entry.acknowledgedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : (
                    <span className="text-charcoal/30">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
