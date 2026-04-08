"use client";

import { useState, useEffect, useRef } from "react";

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
  userDepartmentId?: string | null;
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
  userDepartmentId: _userDepartmentId,
  value,
  onChange,
}: TargetAudienceSelectorProps) {
  void _userDepartmentId; // legacy prop kept for backward compat
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
          setDepartments(j.data || []);
        }
        if (usersRes.ok) {
          const j = await usersRes.json();
          setUsers(j.data || []);
        }
        if (myDeptsRes.ok) {
          const j = await myDeptsRes.json();
          setMyDepartments(j.data || []);
        }
      } finally { setLoading(false); }
    }
    if (propertyId) load();
  }, [propertyId]);

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
            <p className="text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5">
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

  if (loading) return <div className="text-sm text-charcoal/40 font-ui">Caricamento destinatari...</div>;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-ui font-medium text-charcoal">Destinatari</label>
      <p className="text-xs text-charcoal/45 -mt-3">
        Seleziona uno o più tipi di destinatari. Il contenuto sarà visibile a chi corrisponde ad almeno una delle scelte.
      </p>

      {/* SEZIONE 1 — Tutti gli operatori */}
      <div>
        <label className="flex items-center gap-3 py-2.5 px-3 border border-ivory-dark cursor-pointer hover:bg-ivory-medium/30 transition-colors">
          <input type="checkbox" checked={value.allDepartments} onChange={toggleAllDepartments} className="w-4 h-4 accent-terracotta" />
          <div>
            <span className="text-sm font-ui font-medium text-charcoal">Tutti gli operatori</span>
            <p className="text-xs text-charcoal/45">Visibile a ogni operatore della struttura</p>
          </div>
        </label>
      </div>

      {/* SEZIONE 2 — Reparti specifici */}
      <div>
        <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5">Reparti</p>
        <div className="border border-ivory-dark divide-y divide-ivory-dark/50 max-h-[200px] overflow-y-auto">
          {departments.map((dept) => {
            const coveredByAll = value.allDepartments;
            return (
              <label key={dept.id} className={`flex items-center gap-3 py-2 px-3 transition-colors ${coveredByAll ? "opacity-50 cursor-not-allowed bg-ivory-medium/30" : "cursor-pointer hover:bg-ivory-medium/30"}`}>
                <input type="checkbox"
                  checked={coveredByAll || value.departmentIds.includes(dept.id)}
                  disabled={coveredByAll}
                  onChange={() => toggleDepartment(dept.id)}
                  className="w-4 h-4 accent-terracotta disabled:opacity-50" />
                <span className="text-sm font-ui text-charcoal">{dept.name}</span>
                {coveredByAll && (
                  <span className="text-[10px] font-ui text-charcoal/40 italic ml-1">già incluso in &quot;Tutti gli operatori&quot;</span>
                )}
                <span className="text-xs text-charcoal/40 ml-auto font-ui">{dept.code}</span>
              </label>
            );
          })}
          {departments.length === 0 && (
            <p className="px-3 py-2 text-xs font-ui text-charcoal/40 italic">Nessun reparto configurato</p>
          )}
        </div>
      </div>

      {/* SEZIONE 3 — Ruoli trasversali */}
      <div>
        <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5">Ruoli trasversali</p>
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

      {/* SEZIONE 4 — Utenti specifici */}
      <div>
        <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/55 mb-1.5">Utenti specifici</p>
        <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Cerca per nome o email..."
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
