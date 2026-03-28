"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserItem {
  id: string; email: string; name: string; role: string; isActive: boolean;
  canView: boolean; canEdit: boolean; canApprove: boolean;
  propertyAssignments: { property: { name: string; code: string }; department: { name: string } | null }[];
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-mauve text-white",
  ADMIN: "bg-terracotta text-white",
  HOTEL_MANAGER: "bg-sage text-white",
  HOD: "bg-info-blue text-white",
  OPERATOR: "bg-ivory-dark text-charcoal",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HOTEL_MANAGER: "Hotel Manager",
  HOD: "HOD",
  OPERATOR: "Operatore",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (roleFilter) params.set("role", roleFilter);
    try {
      const res = await fetch(`/api/users?${params}`);
      if (res.ok) { const json = await res.json(); setUsers(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [page, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [roleFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Utenti</h1>
        <Link href="/users/new" className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light rounded-lg transition-colors">
          Nuovo utente
        </Link>
      </div>

      <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
        className="text-sm font-ui">
        <option value="">Tutti i ruoli</option>
        {["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
        ))}
      </select>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : (
        <div className="bg-ivory-medium border border-ivory-dark rounded-lg overflow-hidden">
          <table className="w-full text-sm font-ui">
            <thead><tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
              <th className="px-4 py-3">Nome</th><th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Ruolo</th><th className="px-4 py-3">Permessi</th>
              <th className="px-4 py-3">Assegnazioni</th><th className="px-4 py-3">Stato</th>
            </tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-ivory-dark hover:bg-ivory-dark/40 ${i % 2 === 0 ? "bg-ivory" : "bg-ivory-medium"}`}>
                  <td className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="font-medium text-terracotta hover:text-terracotta-light transition-colors">{u.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-charcoal">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[u.role] || ""}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-sage-light">
                    {[u.canView && "V", u.canEdit && "E", u.canApprove && "A"].filter(Boolean).join(" ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-sage-light">
                    {u.propertyAssignments.length === 0 ? "—" :
                      u.propertyAssignments.map(a => `${a.property.code}${a.department ? `/${a.department.name}` : ""}`).join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`w-2 h-2 inline-block rounded-full ${u.isActive ? "bg-sage" : "bg-ivory-dark"}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-ui text-sage-light">Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark rounded-md hover:bg-ivory-dark disabled:opacity-50 transition-colors">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark rounded-md hover:bg-ivory-dark disabled:opacity-50 transition-colors">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
