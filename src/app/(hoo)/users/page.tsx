"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  getVisibleRoles,
  getActivationStatus,
  canCreateUsers as roleCanCreateUsers,
  type ActivationStatus,
} from "@/lib/user-scope";
import { performRead } from "@/lib/read-outcome";

interface UserItem {
  id: string; email: string; name: string; role: string; isActive: boolean;
  canView: boolean; canEdit: boolean; canApprove: boolean; canPublish: boolean;
  canCreateUsers: boolean;
  lastLoginAt: string | null;
  activatedAt: string | null;
  lastInviteAt: string | null;
  createdBy: { id: string; name: string; role: string } | null;
  propertyAssignments: { property: { name: string; code: string }; department: { name: string } | null }[];
  contentPermissions: { contentType: string }[];
}

interface Property { id: string; name: string; code: string }

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "HOO", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "HOO", cls: "bg-sage text-white" },
  HOTEL_MANAGER: { label: "Hotel Manager", cls: "bg-terracotta text-white" },
  CORPORATE: { label: "Corporate", cls: "bg-[#5B7B8A] text-white" },
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

/** Pastiglia dello stato di attivazione: verde / arancio / grigio. */
function ActivationBadge({ status }: { status: ActivationStatus }) {
  if (status.state === "ACTIVATED") {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 bg-sage/10 text-sage whitespace-nowrap">
        Attivata
      </span>
    );
  }
  if (status.state === "PENDING") {
    const giorni = status.daysWaiting ?? 0;
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 bg-[#E65100]/10 text-[#E65100] whitespace-nowrap">
        In attesa · {giorni} {giorni === 1 ? "g" : "gg"}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 bg-ivory-dark text-charcoal/60 whitespace-nowrap">
      Mai invitata
    </span>
  );
}

export default function UsersPage() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canCreate = session?.user
    ? roleCanCreateUsers({ role: session.user.role, canCreateUsers: session.user.canCreateUsers })
    : false;

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  // Vista alleggerita per chi governa il proprio perimetro, non i permessi.
  const lightView = role === "HOTEL_MANAGER" || role === "HOD";
  // L'HOD senza flag è in sola lettura: nessuna azione di riga.
  const readOnly = role === "HOD" && !session?.user?.canCreateUsers;

  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("active");
  const [activationFilter, setActivationFilter] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Distinti dallo "zero risultati": un fallimento non è un elenco vuoto.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [propsError, setPropsError] = useState<string | null>(null);
  const pageSize = 20;

  // Il filtro ruoli mostra solo ciò che il ruolo corrente può vedere.
  const selectableRoles = role
    ? getVisibleRoles({ role: role as Parameters<typeof getVisibleRoles>[0]["role"] })
    : [];

  // Il filtro strutture è accessorio: se non si carica lo si dice accanto alla
  // tendina, senza bloccare la pagina.
  useEffect(() => {
    async function fetchProps() {
      setPropsError(null);
      const esito = await performRead<{ data: Property[] }>("/api/properties", "le strutture");
      // Il 401 lo gestisce SessionGuard: qui tacere è corretto.
      if (esito.kind === "session-expired") return;
      if (esito.kind === "error") { setPropsError(esito.message); return; }
      setProperties(esito.data.data);
    }
    fetchProps();
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (roleFilter) params.set("role", roleFilter);
    if (propertyFilter) params.set("propertyId", propertyFilter);
    if (activeFilter === "active") params.set("isActive", "true");
    else if (activeFilter === "inactive") params.set("isActive", "false");
    if (activationFilter) params.set("activation", activationFilter);
    if (search) params.set("search", search);
    try {
      const esito = await performRead<{ data: UserItem[]; meta: { total: number } }>(
        `/api/users?${params}`,
        "l'elenco"
      );
      // Sessione decaduta: l'espulsione è già in corso, non si sovrappone un
      // messaggio che parlerebbe di connessione.
      if (esito.kind === "session-expired") return;
      if (esito.kind === "error") { setLoadError(esito.message); return; }
      setUsers(esito.data.data);
      setTotal(esito.data.meta.total);
    } finally { setLoading(false); }
  }, [page, roleFilter, propertyFilter, activeFilter, activationFilter, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [roleFilter, propertyFilter, activeFilter, activationFilter, search]);

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) fetchUsers();
      else {
        const json = await res.json().catch(() => ({}));
        setFeedback({ id: userId, text: json?.error ?? "Operazione non riuscita", ok: false });
      }
    } finally { setTogglingId(null); }
  };

  const handleResendInvite = async (userId: string) => {
    setInvitingId(userId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/users/${userId}/send-activation`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedback({ id: userId, text: "Invito inviato", ok: true });
        fetchUsers();
      } else {
        setFeedback({ id: userId, text: json?.error ?? "Invito non inviato", ok: false });
      }
    } finally { setInvitingId(null); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Utenti</h1>
        {canCreate && (
          <Link href="/users/new" className="btn-primary">
            Nuovo utente
          </Link>
        )}
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }} className="flex">
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cerca per nome..."
              className="flex-1 text-sm border border-ivory-dark px-3 py-[9px] bg-white font-ui border-r-0" />
            <button type="submit"
              className="px-3 py-[9px] text-xs font-ui font-semibold uppercase tracking-wider bg-terracotta text-white hover:bg-terracotta-light transition-colors">
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
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-sm font-ui border border-ivory-dark px-3 py-[9px] bg-white">
          <option value="">Tutti i ruoli</option>
          {selectableRoles.map(r => (
            <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>
          ))}
        </select>
        <select value={activationFilter} onChange={(e) => setActivationFilter(e.target.value)} className="text-sm font-ui border border-ivory-dark px-3 py-[9px] bg-white">
          <option value="">Attivazione: tutti</option>
          <option value="pending">In attesa</option>
          <option value="activated">Attivati</option>
        </select>
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="text-sm font-ui border border-ivory-dark px-3 py-[9px] bg-white">
          <option value="">Tutte le strutture</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="text-sm font-ui border border-ivory-dark px-3 py-[9px] bg-white">
          <option value="active">Attivi</option>
          <option value="inactive">Disattivati</option>
          <option value="all">Tutti</option>
        </select>
      </div>

      {/* Il filtro strutture non ha potuto caricarsi: la tendina resta vuota,
          ma l'utente sa perché invece di credere che non ci siano strutture. */}
      {propsError && (
        <p role="alert" className="text-xs font-ui text-[#E65100]">{propsError}</p>
      )}

      {/* Tabella — tre stati distinti: caricamento, fallimento, esito vero */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 skeleton" />)}</div>
      ) : loadError ? (
        <div role="alert" className="bg-[#FFF3E0] border-l-4 border-[#E65100] px-4 py-4 text-center">
          <p className="text-sm font-ui text-[#E65100]">{loadError}</p>
          <button onClick={() => fetchUsers()}
            className="mt-3 px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-[#E65100] border border-[#E65100]/40 hover:bg-[#E65100] hover:text-white transition-colors">
            Riprova
          </button>
        </div>
      ) : users.length === 0 ? (
        <p className="text-sage-light font-ui text-sm text-center py-10">Nessun utente trovato</p>
      ) : (
        <div className="bg-ivory-medium border border-ivory-dark  overflow-x-auto">
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Ruolo</th>
                {!lightView && <th className="px-4 py-3">Permessi</th>}
                {!lightView && <th className="px-4 py-3">Strutture</th>}
                <th className="px-4 py-3">Reparti</th>
                {!lightView && <th className="px-4 py-3">Contenuti</th>}
                <th className="px-4 py-3">Attivazione</th>
                <th className="px-4 py-3">Creato da</th>
                <th className="px-4 py-3">Ultimo accesso</th>
                {!readOnly && <th className="px-4 py-3 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const badge = ROLE_BADGE[u.role] || { label: u.role, cls: "bg-ivory-dark text-charcoal" };
                const propNames = [...new Set(u.propertyAssignments.map(a => a.property.code))];
                const deptNames = [...new Set(u.propertyAssignments.filter(a => a.department).map(a => a.department!.name))];
                const hasAllDepts = u.propertyAssignments.some(a => !a.department);
                const ctLabels = u.contentPermissions.map(p => CT_LABELS[p.contentType] || p.contentType);
                const activation = getActivationStatus(
                  { activatedAt: u.activatedAt ? new Date(u.activatedAt) : null },
                  u.lastInviteAt ? new Date(u.lastInviteAt) : null
                );

                return (
                  <tr key={u.id} className={`border-b border-ivory-dark/50 hover:bg-ivory-dark/30 ${i % 2 === 0 ? "bg-ivory" : "bg-ivory-medium"} ${!u.isActive ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      {readOnly ? (
                        <span className="font-medium text-charcoal-dark">{u.name}</span>
                      ) : (
                        <Link href={`/users/${u.id}`} className="font-medium text-charcoal-dark hover:text-terracotta transition-colors">
                          {u.name}
                        </Link>
                      )}
                      <p className="text-xs text-sage-light">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                    </td>
                    {!lightView && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <PermIcon active={u.canView} label="Può vedere" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          <PermIcon active={u.canEdit} label="Può modificare" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          <PermIcon active={u.canApprove} label="Può approvare" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <PermIcon active={u.canPublish} label="Può pubblicare" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </div>
                      </td>
                    )}
                    {!lightView && (
                      <td className="px-4 py-3 text-xs text-charcoal">
                        <TruncList items={propNames} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {hasAllDepts ? <span className="text-sage-light italic">Tutti</span> : <TruncList items={deptNames} />}
                    </td>
                    {!lightView && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {ctLabels.map(ct => (
                            <span key={ct} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ivory-dark text-charcoal">{ct}</span>
                          ))}
                          {ctLabels.length === 0 && <span className="text-sage-light text-xs">—</span>}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <ActivationBadge status={activation} />
                      {feedback?.id === u.id && (
                        <p className={`mt-1 text-[11px] ${feedback.ok ? "text-sage" : "text-alert-red"}`}>
                          {feedback.text}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {u.createdBy ? (
                        <>
                          {u.createdBy.name}
                          <span className="block text-[11px] text-sage-light">
                            {ROLE_BADGE[u.createdBy.role]?.label ?? u.createdBy.role}
                          </span>
                        </>
                      ) : (
                        // Utenti storici, creati prima del registro.
                        <span className="text-sage-light">HOO</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : <span className="text-sage-light italic">Mai</span>}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {activation.state !== "ACTIVATED" && (
                            <button onClick={() => handleResendInvite(u.id)}
                              disabled={invitingId === u.id}
                              className="px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider text-[#E65100] border border-[#E65100]/30 hover:bg-[#E65100] hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap">
                              {invitingId === u.id ? "..." : "Rimanda invito"}
                            </button>
                          )}
                          <Link href={`/users/${u.id}`}
                            className="px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                            Modifica
                          </Link>
                          {isAdmin || role === "HOTEL_MANAGER" ? (
                            <button onClick={() => handleToggleActive(u.id, u.isActive)}
                              disabled={togglingId === u.id}
                              className={`px-2.5 py-1 text-[11px] font-ui font-semibold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                                u.isActive
                                  ? "text-alert-red border-alert-red/30 hover:bg-alert-red hover:text-white"
                                  : "text-sage border-sage/30 hover:bg-sage hover:text-white"
                              }`}>
                              {togglingId === u.id ? "..." : u.isActive ? "Disattiva" : "Riattiva"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )}
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
