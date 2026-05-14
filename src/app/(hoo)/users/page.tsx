"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserItem {
  id: string; email: string; name: string; role: string; isActive: boolean;
  canView: boolean; canEdit: boolean; canApprove: boolean;
  lastLoginAt: string | null;
  propertyAssignments: { property: { name: string; code: string }; department: { name: string } | null }[];
  contentPermissions: { contentType: string }[];
}

interface Property { id: string; name: string; code: string }

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "HOO", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "HOO", cls: "bg-sage text-white" },
  HOTEL_MANAGER: { label: "Hotel Manager", cls: "bg-terracotta text-white" },
  HOD: { label: "HOD", cls: "bg-mauve text-white" },
  OPERATOR: { label: "Operatore", cls: "bg-ivory-dark text-charcoal" },
};

const CT_LABELS: Record<string, string> = { SOP: "SOP", DOCUMENT: "Doc", MEMO: "Memo" };

function PermIcon({ active, label, d }: { active: boolean; label: string; d: string }) {
  return (
    <svg className={`w-4 h-4 ${active ? "text-sage" : "text-ivory-dark"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label={label}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
    </svg>
  );
}

function TruncList({ items, max = 2 }: { items: string[]; max?: number }) {
  if (items.length === 0) return <span className="text-sage-light">—</span>;
  const visible = items.slice(0, max);
  const rest = items.length - max;
  return (
    <span>
      {visible.join(", ")}
      {rest > 0 && <span className="text-sage-light ml-1">+{rest}</span>}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("active");
  const [properties, setProperties] = useState<Property[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const pageSize = 20;

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) { const json = await res.json(); setProperties(json.data); }
    }
    fetchProps();
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (roleFilter) params.set("role", roleFilter);
    if (propertyFilter) params.set("propertyId", propertyFilter);
    if (activeFilter === "active") params.set("isActive", "true");
    else if (activeFilter === "inactive") params.set("isActive", "false");
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/users?${params}`);
      if (res.ok) { const json = await res.json(); setUsers(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [page, roleFilter, propertyFilter, activeFilter, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [roleFilter, propertyFilter, activeFilter, search]);

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) fetchUsers();
    } finally { setTogglingId(null); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Utenti</h1>
        <Link href="/users/new" className="btn-primary">
          Nuovo utente
        </Link>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }} className="flex">
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cerca per nome..."
              className="flex-1 text-sm border border-ivory-dark px-3 py-[7px] bg-white font-ui border-r-0" />
            <button type="submit"
              className="px-3 py-[7px] text-xs font-ui font-semibold uppercase tracking-wider bg-terracotta text-white hover:bg-terracotta-light transition-colors">
              Cerca
            </button>
          </form>
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setSearchInput(""); }}
            className="text-xs font-ui text-charcoal/50 hover:text-charcoal transition-colors">
            Annulla
          </button>
        )}
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-sm font-ui">
          <option value="">Tutti i ruoli</option>
          {["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].map(r => (
            <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>
          ))}
        </select>
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="text-sm font-ui">
          <option value="">Tutte le strutture</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="text-sm font-ui">
          <option value="active">Attivi</option>
          <option value="inactive">Disattivati</option>
          <option value="all">Tutti</option>
        </select>
      </div>

      {/* Tabella */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 skeleton" />)}</div>
      ) : users.length === 0 ? (
        <p className="text-sage-light font-ui text-sm text-center py-10">Nessun utente trovato</p>
      ) : (
        <div className="bg-ivory-medium border border-ivory-dark  overflow-x-auto">
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Ruolo</th>
                <th className="px-4 py-3">Permessi</th>
                <th className="px-4 py-3">Strutture</th>
                <th className="px-4 py-3">Reparti</th>
                <th className="px-4 py-3">Contenuti</th>
                <th className="px-4 py-3">Ultimo accesso</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const badge = ROLE_BADGE[u.role] || { label: u.role, cls: "bg-ivory-dark text-charcoal" };
                const propNames = [...new Set(u.propertyAssignments.map(a => a.property.code))];
                const deptNames = [...new Set(u.propertyAssignments.filter(a => a.department).map(a => a.department!.name))];
                const hasAllDepts = u.propertyAssignments.some(a => !a.department);
                const ctLabels = u.contentPermissions.map(p => CT_LABELS[p.contentType] || p.contentType);

                return (
                  <tr key={u.id} className={`border-b border-ivory-dark/50 hover:bg-ivory-dark/30 ${i % 2 === 0 ? "bg-ivory" : "bg-ivory-medium"} ${!u.isActive ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/users/${u.id}`} className="font-medium text-charcoal-dark hover:text-terracotta transition-colors">
                        {u.name}
                      </Link>
                      <p className="text-xs text-sage-light">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <PermIcon active={u.canView} label="Può vedere" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        <PermIcon active={u.canEdit} label="Può modificare" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        <PermIcon active={u.canApprove} label="Può approvare" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      <TruncList items={propNames} />
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {hasAllDepts ? <span className="text-sage-light italic">Tutti</span> : <TruncList items={deptNames} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {ctLabels.map(ct => (
                          <span key={ct} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ivory-dark text-charcoal">{ct}</span>
                        ))}
                        {ctLabels.length === 0 && <span className="text-sage-light text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : <span className="text-sage-light italic">Mai</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/users/${u.id}`}
                          className="px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                          Modifica
                        </Link>
                        <button onClick={() => handleToggleActive(u.id, u.isActive)}
                          disabled={togglingId === u.id}
                          className={`px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                            u.isActive
                              ? "text-alert-red border-alert-red/30 hover:bg-alert-red hover:text-white"
                              : "text-sage border-sage/30 hover:bg-sage hover:text-white"
                          }`}>
                          {togglingId === u.id ? "..." : u.isActive ? "Disattiva" : "Riattiva"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-ui text-sage-light">Pagina {page} di {totalPages} ({total} utenti)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark  hover:bg-ivory-dark disabled:opacity-50 transition-colors">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark  hover:bg-ivory-dark disabled:opacity-50 transition-colors">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
