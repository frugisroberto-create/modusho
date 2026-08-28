"use client";

import { useState, useEffect, useRef } from "react";
import type { Role } from "@prisma/client";
import {
  canTargetEveryone,
  canTargetRoles,
  filterTargetableUsers,
  hasRestrictedAudience,
} from "@/lib/target-audience-scope";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface User {
  id: string;
  name: string;
  role: string;
  email: string;
  /** Reparti su cui l'utente è assegnato — servono a giudicarne la destinabilità. */
  departmentIds: string[];
}

/** La forma con cui gli utenti arrivano da /api/users. */
interface ApiUser {
  id: string;
  name: string;
  role: string;
  email: string;
  propertyAssignments?: { department?: { id: string } | null }[];
}

export type TargetRole = "OPERATOR" | "HOD" | "HOTEL_MANAGER";

export interface TargetAudienceState {
  allDepartments: boolean;            // ROLE/OPERATOR su tutta la property
  departmentIds: string[];            // DEPARTMENT/<id>
  roles: TargetRole[];                // ROLE/<role>
  userIds: string[];                  // USER/<id>
}

interface TargetAudienceSelectorProps {
  propertyId: string;
  userRole: string;                   // ruolo dell'utente che sta creando
  /** Chi sta scrivendo: non compare mai fra i destinatari proponibili. */
  currentUserId: string;
  userDepartmentId?: string | null;
  /**
   * Il perimetro dei reparti destinabili, già risolto da
   * `target-audience-scope`. Un array VUOTO è una restrizione che non lascia
   * passare nulla: non si ripiega sull'elenco completo, si dice che non c'è
   * niente da destinare.
   *
   * Vale SOLO per i ruoli che un perimetro ce l'hanno. Su tutti gli altri
   * questa prop viene ignorata di proposito — vedi sotto.
   */
  allowedDepartmentIds?: string[];
  value: TargetAudienceState;
  onChange: (value: TargetAudienceState) => void;
}

const ROLE_LABELS: Record<TargetRole, string> = {
  OPERATOR: "Tutti gli operatori",
  HOD: "Tutti gli HOD (Head of Department)",
  HOTEL_MANAGER: "Hotel Manager",
};

export function TargetAudienceSelector({
  propertyId,
  userRole,
  currentUserId,
  userDepartmentId: _userDepartmentId,
  allowedDepartmentIds,
  value,
  onChange,
}: TargetAudienceSelectorProps) {
  void _userDepartmentId; // legacy prop kept for backward compat
  // Chi è ristretto lo decide il ruolo, non ciò che arriva dalle prop.
  //
  // Questo componente è uno solo per tutti i ruoli, e sta sul percorso di
  // tutti: un perimetro passato per sbaglio a un Hotel Manager gli toglierebbe
  // dei reparti senza dire niente, e un'assenza non la segnala nessuno. Quindi
  // la prop non ha il potere di restringere chi il perimetro non ce l'ha: su
  // quei ruoli viene ignorata.
  //
  // Distinguere l'array vuoto da "nessun filtro" resta l'altro cardine: prima
  // un perimetro vuoto veniva letto come "mostra tutto".
  const role = userRole as Role;
  const restricted = hasRestrictedAudience(role);
  const perimeter: string[] | null = restricted ? (allowedDepartmentIds ?? []) : null;
  const showEveryone = canTargetEveryone(role);
  const showRoles = canTargetRoles(role);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [myDepartments, setMyDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const hodPresetApplied = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [deptRes, usersRes, myDeptsRes] = await Promise.all([
          fetch(`/api/properties/${propertyId}/departments`),
          fetch(`/api/users?propertyId=${propertyId}&isActive=true&pageSize=50`),
          fetch(`/api/my-departments?propertyId=${propertyId}`),
        ]);
        if (deptRes.ok) {
          const j = await deptRes.json();
          const allDepts: Department[] = j.data || [];
          setDepartments(perimeter === null
            ? allDepts
            : allDepts.filter((d) => perimeter.includes(d.id))
          );
        }
        if (usersRes.ok) {
          const j = await usersRes.json();
          const apiUsers: ApiUser[] = j.data || [];
          const candidates: User[] = apiUsers.map((u) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            email: u.email,
            departmentIds: (u.propertyAssignments ?? [])
              .map((a) => a.department?.id)
              .filter((id): id is string => Boolean(id)),
          }));
          // Chi scrive esce sempre dall'elenco; il perimetro, quando c'è,
          // toglie anche chi lavora fuori dai reparti di competenza.
          setUsers(filterTargetableUsers(currentUserId, candidates, perimeter));
        }
        if (myDeptsRes.ok) {
          const j = await myDeptsRes.json();
          setMyDepartments(j.data || []);
        }
      } finally { setLoading(false); }
    }
    if (propertyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, currentUserId, allowedDepartmentIds?.join(",")]);

  // HOD: ruolo limitato — può creare contenuti solo per i propri reparti accessibili.
  // Auto-preseleziona tutti i suoi reparti la prima volta.
  useEffect(() => {
    if (userRole === "HOD" && myDepartments.length > 0 && !hodPresetApplied.current && value.departmentIds.length === 0) {
      hodPresetApplied.current = true;
      onChange({
        allDepartments: false,
        departmentIds: myDepartments.map(d => d.id),
        roles: [],
        userIds: [],
      });
    }
  }, [userRole, myDepartments, value.departmentIds.length, onChange]);

  if (userRole === "HOD") {
    const toggleMyDept = (deptId: string) => {
      const isSelected = value.departmentIds.includes(deptId);
      const next = isSelected
        ? value.departmentIds.filter(id => id !== deptId)
        : [...value.departmentIds, deptId];
      onChange({ ...value, departmentIds: next, allDepartments: false, roles: [], userIds: [] });
    };
    return (
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Destinatari</label>
        <p className="text-xs font-ui text-charcoal/45 mb-2">
          Come Capo Reparto puoi pubblicare solo per gli operatori dei reparti che gestisci.
          {myDepartments.length > 1 && " Sotto sono elencati i tuoi reparti — seleziona quelli a cui vuoi inviare il contenuto."}
        </p>
        {loading ? (
          <p className="text-xs font-ui text-charcoal/40">Caricamento...</p>
        ) : myDepartments.length === 0 ? (
          <p className="text-xs font-ui text-alert-red">Nessun reparto assegnato — contatta l&apos;amministratore.</p>
        ) : (
          <>
            <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/70 mb-1.5">
              {myDepartments.length === 1 ? "Il tuo reparto" : `I tuoi reparti (${myDepartments.length})`}
            </p>
            <div className="border border-ivory-dark divide-y divide-ivory-dark/50">
              {myDepartments.map(dept => (
                <label key={dept.id} className="flex items-center gap-3 py-2 px-3 cursor-pointer hover:bg-ivory-medium/30 transition-colors">
                  <input type="checkbox"
                    checked={value.departmentIds.includes(dept.id)}
                    onChange={() => toggleMyDept(dept.id)}
                    disabled={myDepartments.length === 1}
                    className="w-4 h-4 accent-terracotta disabled:opacity-50" />
                  <span className="text-sm font-ui text-charcoal">{dept.name}</span>
                  <span className="text-xs text-charcoal/40 ml-auto font-ui">{dept.code}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const toggleAllDepartments = () => {
    onChange({ ...value, allDepartments: !value.allDepartments });
  };

  const toggleDepartment = (deptId: string) => {
    const isSelected = value.departmentIds.includes(deptId);
    const next = isSelected
      ? value.departmentIds.filter((id) => id !== deptId)
      : [...value.departmentIds, deptId];
    onChange({ ...value, departmentIds: next });
  };

  const toggleRole = (role: TargetRole) => {
    const isSelected = value.roles.includes(role);
    const next = isSelected
      ? value.roles.filter((r) => r !== role)
      : [...value.roles, role];
    onChange({ ...value, roles: next });
  };

  const toggleUser = (userId: string) => {
    const isSelected = value.userIds.includes(userId);
    const next = isSelected
      ? value.userIds.filter((id) => id !== userId)
      : [...value.userIds, userId];
    onChange({ ...value, userIds: next });
  };

  const filteredUsers = userSearch.trim().length >= 2
    ? users.filter((u) =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const totalSelected =
    (value.allDepartments ? 1 : 0) +
    value.departmentIds.length +
    value.roles.length +
    value.userIds.length;

  // Un contenuto già esistente può portarsi dietro destinatari che chi lo sta
  // aprendo non potrebbe più scegliere (li ha messi un ADMIN, o li ha lasciati
  // il difetto che questa modifica chiude). Non si toccano da soli: si mostrano
  // per quello che sono, con il modo di levarli. Cambiare i destinatari di una
  // SOP alle spalle di chi la apre sarebbe peggio del difetto.
  const strandedEveryone = value.allDepartments && !showEveryone;
  const strandedRoles = showRoles ? [] : value.roles;
  const strandedDepartments = perimeter === null
    ? []
    : value.departmentIds.filter((id) => !perimeter.includes(id));
  const hasStranded = strandedEveryone || strandedRoles.length > 0 || strandedDepartments.length > 0;

  const dropEveryone = () => onChange({ ...value, allDepartments: false });
  const dropRoles = () => onChange({ ...value, roles: [] });
  const dropStrandedDepartments = () =>
    onChange({ ...value, departmentIds: value.departmentIds.filter((id) => !strandedDepartments.includes(id)) });

  if (loading) return <div className="text-sm text-charcoal/40 font-ui">Caricamento destinatari...</div>;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-ui font-medium text-charcoal">Destinatari</label>
      <p className="text-xs text-charcoal/45 -mt-3">
        Seleziona uno o più tipi di destinatari. Il contenuto sarà visibile a chi corrisponde ad almeno una delle scelte.
      </p>

      {/* Le due sezioni che mancano si dicono, non si lasciano mancare in
          silenzio. Un'assenza non la segnala nessuno: la si aggira, o si pensa
          di aver capito male. Una frase sbagliata, invece, si vede subito — e
          se questa comparisse a un Hotel Manager sarebbe palesemente falsa. */}
      {restricted && (
        <p className="text-xs font-ui text-charcoal/55 border-l-2 border-terracotta/40 pl-2.5">
          Come referente corporate ti rivolgi ai reparti di tua competenza e alle persone che
          vi lavorano. «Tutti gli operatori» e i ruoli trasversali non sono fra le tue scelte:
          per questo qui sotto non li trovi.
        </p>
      )}

      {/* Destinatari che questo contenuto ha ma che chi lo apre non può scegliere */}
      {hasStranded && (
        <div className="border-l-4 border-alert-red bg-ivory-medium/50 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-ui text-charcoal">
            Questo contenuto è rivolto anche a destinatari fuori dai reparti di tua competenza.
            Finché restano, il salvataggio verrà rifiutato. Toglili qui sotto, oppure chiedi a un
            amministratore di intervenire se devono rimanere.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {strandedEveryone && (
              <button type="button" onClick={dropEveryone}
                className="text-[11px] font-ui font-medium px-2 py-1 bg-alert-red/10 text-alert-red rounded hover:bg-alert-red/20 transition-colors">
                Tutti gli operatori ×
              </button>
            )}
            {strandedRoles.length > 0 && (
              <button type="button" onClick={dropRoles}
                className="text-[11px] font-ui font-medium px-2 py-1 bg-alert-red/10 text-alert-red rounded hover:bg-alert-red/20 transition-colors">
                {strandedRoles.length === 1 ? "Ruolo trasversale" : `${strandedRoles.length} ruoli trasversali`} ×
              </button>
            )}
            {strandedDepartments.length > 0 && (
              <button type="button" onClick={dropStrandedDepartments}
                className="text-[11px] font-ui font-medium px-2 py-1 bg-alert-red/10 text-alert-red rounded hover:bg-alert-red/20 transition-colors">
                {strandedDepartments.length === 1 ? "1 reparto" : `${strandedDepartments.length} reparti`} fuori competenza ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selection summary — always visible */}
      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-ivory-dark">
          {value.allDepartments && (
            <span className="text-[11px] font-ui font-medium px-2 py-1 bg-terracotta/10 text-terracotta rounded">
              Tutti gli operatori
            </span>
          )}
          {value.departmentIds.map(dId => {
            const dept = departments.find(d => d.id === dId);
            return dept ? (
              <span key={dId} className="text-[11px] font-ui font-medium px-2 py-1 bg-ivory-dark text-charcoal rounded">
                {dept.name}
              </span>
            ) : null;
          })}
          {value.roles.map(r => (
            <span key={r} className="text-[11px] font-ui font-medium px-2 py-1 bg-mauve/15 text-mauve rounded">
              {r === "OPERATOR" ? "Operatori" : r === "HOD" ? "HOD" : "Hotel Manager"}
            </span>
          ))}
          {value.userIds.length > 0 && (
            <span className="text-[11px] font-ui font-medium px-2 py-1 bg-sage/15 text-sage rounded">
              {value.userIds.length} utente/i
            </span>
          )}
        </div>
      )}

      {/* SEZIONE 1 — Tutti gli operatori (chi ha perimetro ristretto non ce l'ha) */}
      {showEveryone && (
        <div>
          <label className="flex items-center gap-3 py-2.5 px-3 border border-ivory-dark cursor-pointer hover:bg-ivory-medium/30 transition-colors">
            <input type="checkbox" checked={value.allDepartments} onChange={toggleAllDepartments} className="w-4 h-4 accent-terracotta" />
            <div>
              <span className="text-sm font-ui font-medium text-charcoal">Tutti gli operatori</span>
              <p className="text-xs text-charcoal/45">Visibile a ogni operatore della struttura</p>
            </div>
          </label>
        </div>
      )}

      {/* SEZIONE 2 — Reparti specifici */}
      <div>
        <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/70 mb-1.5">Reparti</p>
        {restricted && (
          <p className="text-xs font-ui text-charcoal/45 mb-1.5">
            Sono elencati soltanto i reparti di tua competenza.
          </p>
        )}
        <div className="border border-ivory-dark divide-y divide-ivory-dark/50 max-h-[200px] overflow-y-auto">
          {departments.map((dept) => {
            const coveredByAll = value.allDepartments;
            return (
              <label key={dept.id} className={`flex items-center gap-3 py-2 px-3 transition-colors ${coveredByAll ? "cursor-not-allowed bg-ivory-medium/30" : "cursor-pointer hover:bg-ivory-medium/30"}`}>
                <input type="checkbox"
                  checked={coveredByAll || value.departmentIds.includes(dept.id)}
                  disabled={coveredByAll}
                  onChange={() => toggleDepartment(dept.id)}
                  className={`w-4 h-4 accent-terracotta disabled:opacity-40 ${coveredByAll ? "opacity-40" : ""}`} />
                <span className={`text-sm font-ui text-charcoal ${coveredByAll ? "opacity-40" : ""}`}>{dept.name}</span>
                {coveredByAll && (
                  <span className="text-[11px] font-ui text-charcoal/40 ml-1">già incluso in &quot;Tutti gli operatori&quot;</span>
                )}
                <span className={`text-xs text-charcoal/40 ml-auto font-ui ${coveredByAll ? "opacity-40" : ""}`}>{dept.code}</span>
              </label>
            );
          })}
          {departments.length === 0 && (
            <p className="px-3 py-2 text-xs font-ui text-charcoal/40 italic">
              {restricted
                ? "In questa struttura non hai reparti di tua competenza: chiedi all'amministratore di assegnarteli."
                : "Nessun reparto configurato"}
            </p>
          )}
        </div>
      </div>

      {/* SEZIONE 3 — Ruoli trasversali (chi ha perimetro ristretto non li ha) */}
      {showRoles && (
        <div>
          <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/70 mb-1.5">Ruoli trasversali</p>
          <div className="border border-ivory-dark divide-y divide-ivory-dark/50">
            {(["HOD", "HOTEL_MANAGER"] as TargetRole[]).map((role) => (
              <label key={role} className="flex items-center gap-3 py-2 px-3 cursor-pointer hover:bg-ivory-medium/30 transition-colors">
                <input type="checkbox"
                  checked={value.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="w-4 h-4 accent-terracotta" />
                <span className="text-sm font-ui text-charcoal">{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* SEZIONE 4 — Utenti specifici */}
      <div>
        <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/70 mb-1.5">Utenti specifici</p>
        <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Cerca per nome o email (min. 2 caratteri)..."
          className="w-full px-3 py-2 text-sm font-ui border border-ivory-dark mb-1.5" />
        <div className="border border-ivory-dark divide-y divide-ivory-dark/50 max-h-[180px] overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="px-3 py-2 text-xs font-ui text-charcoal/40 italic">Nessun utente trovato</p>
          ) : (
            filteredUsers.map((u) => {
              // Verifica se l'utente è già "coperto" da una selezione più ampia
              const coveredByAllOps = value.allDepartments && u.role === "OPERATOR";
              const coveredByRole =
                (u.role === "HOD" && value.roles.includes("HOD")) ||
                (u.role === "HOTEL_MANAGER" && value.roles.includes("HOTEL_MANAGER"));
              const covered = coveredByAllOps || coveredByRole;
              const coverageLabel = coveredByAllOps
                ? "già incluso in \"Tutti gli operatori\""
                : coveredByRole
                  ? `già incluso in "${ROLE_LABELS[u.role as TargetRole]}"`
                  : "";
              return (
                <label key={u.id} className={`flex items-center gap-3 py-2 px-3 transition-colors ${covered ? "opacity-50 cursor-not-allowed bg-ivory-medium/30" : "cursor-pointer hover:bg-ivory-medium/30"}`}>
                  <input type="checkbox"
                    checked={covered || value.userIds.includes(u.id)}
                    disabled={covered}
                    onChange={() => toggleUser(u.id)}
                    className="w-4 h-4 accent-terracotta disabled:opacity-50" />
                  <span className="text-sm font-ui text-charcoal">{u.name}</span>
                  {covered && (
                    <span className="text-[10px] font-ui text-charcoal/40 italic ml-1">{coverageLabel}</span>
                  )}
                  <span className="text-[10px] font-ui text-charcoal/40 ml-auto uppercase tracking-wider">{u.role}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {totalSelected === 0 && (
        <p className="text-xs text-alert-red font-ui">Seleziona almeno un destinatario</p>
      )}
      {totalSelected > 0 && (
        <p className="text-xs text-charcoal/40 font-ui">
          {totalSelected} {totalSelected === 1 ? "selezione" : "selezioni"} attiva/e
        </p>
      )}
    </div>
  );
}
