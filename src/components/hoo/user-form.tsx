"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type RoleOption = "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "ADMIN";
type ContentTypeOption = "SOP" | "DOCUMENT" | "MEMO";

interface Property {
  id: string; name: string; code: string; city?: string;
  departments: { id: string; name: string; code: string }[];
}

interface AssignmentEntry {
  propertyId: string;
  departmentId: string | null;
}

interface UserFormProps {
  mode: "create" | "edit";
  userId?: string;
  initialData?: {
    name: string;
    email: string;
    role: RoleOption;
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
    isActive: boolean;
    assignments: AssignmentEntry[];
    contentTypes: ContentTypeOption[];
  };
}

const ROLE_LABELS: Record<RoleOption, string> = {
  OPERATOR: "Operatore",
  HOD: "Head of Department",
  HOTEL_MANAGER: "Hotel Manager",
  ADMIN: "Admin",
};

const ROLE_PRESETS: Record<RoleOption, { canEdit: boolean; canApprove: boolean; contentTypes: ContentTypeOption[] }> = {
  OPERATOR: { canEdit: false, canApprove: false, contentTypes: [] },
  HOD: { canEdit: true, canApprove: false, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  HOTEL_MANAGER: { canEdit: true, canApprove: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  ADMIN: { canEdit: true, canApprove: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
};

const CONTENT_TYPE_LABELS: Record<ContentTypeOption, string> = {
  MEMO: "Memo",
  SOP: "SOP",
  DOCUMENT: "Documenti",
};

export function UserForm({ mode, userId, initialData }: UserFormProps) {
  const router = useRouter();

  // Sezione 1 — Anagrafica
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [password, setPassword] = useState("");

  // Sezione 2 — Ruolo
  const [role, setRole] = useState<RoleOption>(initialData?.role ?? "OPERATOR");

  // Sezione 3 — Permessi
  const [canEdit, setCanEdit] = useState(initialData?.canEdit ?? false);
  const [canApprove, setCanApprove] = useState(initialData?.canApprove ?? false);

  // Sezione 4+5 — Strutture e reparti
  const [properties, setProperties] = useState<Property[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>(initialData?.assignments ?? []);

  // Sezione 6 — Tipi contenuto
  const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>(initialData?.contentTypes ?? []);

  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  // Fetch properties
  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
      }
    }
    fetchProps();
  }, []);

  // Preset on role change
  const applyRolePreset = useCallback((newRole: RoleOption) => {
    const preset = ROLE_PRESETS[newRole];
    setCanEdit(preset.canEdit);
    setCanApprove(preset.canApprove);
    setContentTypes(preset.contentTypes);
  }, []);

  const handleRoleChange = (newRole: RoleOption) => {
    setRole(newRole);
    applyRolePreset(newRole);
  };

  // Validate warnings
  useEffect(() => {
    const w: string[] = [];
    if (role === "OPERATOR" && (canEdit || canApprove)) {
      w.push("Un Operatore non dovrebbe avere permessi di modifica o approvazione");
    }
    if (role === "HOD" && canApprove) {
      w.push("Un HOD non dovrebbe avere permessi di approvazione");
    }
    if (canApprove && role !== "HOTEL_MANAGER" && role !== "ADMIN") {
      w.push("Il permesso di approvazione richiede almeno il ruolo Hotel Manager");
    }
    if (canApprove) {
      w.push("Questo utente entrerà nel workflow di revisione/approvazione");
    }
    setWarnings(w);
  }, [role, canEdit, canApprove]);

  // When canEdit is turned off, clear content types
  useEffect(() => {
    if (!canEdit) setContentTypes([]);
  }, [canEdit]);

  // Selected property IDs
  const selectedPropertyIds = [...new Set(assignments.map(a => a.propertyId))];

  const toggleProperty = (propId: string) => {
    if (selectedPropertyIds.includes(propId)) {
      // Remove property and its assignments
      setAssignments(prev => prev.filter(a => a.propertyId !== propId));
    } else {
      // Add property — for HM add without dept (all depts), for others add empty
      if (role === "HOTEL_MANAGER" || role === "ADMIN") {
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: null }]);
      } else {
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: null }]);
      }
    }
  };

  const toggleDepartment = (propId: string, deptId: string) => {
    const exists = assignments.some(a => a.propertyId === propId && a.departmentId === deptId);
    if (exists) {
      setAssignments(prev => prev.filter(a => !(a.propertyId === propId && a.departmentId === deptId)));
    } else {
      // Remove the "all depts" entry for this property if it exists, add specific dept
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.propertyId === propId && a.departmentId === null));
        return [...filtered, { propertyId: propId, departmentId: deptId }];
      });
    }
  };

  const toggleAllDepts = (propId: string) => {
    const hasAll = assignments.some(a => a.propertyId === propId && a.departmentId === null);
    if (hasAll) {
      // Switch to no depts selected
      setAssignments(prev => prev.filter(a => a.propertyId !== propId));
      // Re-add property to keep it selected but with no dept
      setAssignments(prev => [...prev, { propertyId: propId, departmentId: null }]);
    } else {
      // Set to all depts
      setAssignments(prev => {
        const filtered = prev.filter(a => a.propertyId !== propId);
        return [...filtered, { propertyId: propId, departmentId: null }];
      });
    }
  };

  const toggleContentType = (ct: ContentTypeOption) => {
    setContentTypes(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    );
  };

  const handleSubmit = async () => {
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Nome e email sono obbligatori");
      return;
    }
    if (mode === "create" && password.length < 6) {
      setError("La password deve avere almeno 6 caratteri");
      return;
    }
    if (assignments.length === 0) {
      setError("Seleziona almeno una struttura");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name, role,
        canView: true, canEdit, canApprove,
        propertyAssignments: assignments,
        contentTypes,
      };

      if (mode === "create") {
        payload.email = email;
        payload.password = password;
      }
      if (mode === "edit") {
        payload.isActive = isActive;
      }

      const url = mode === "create" ? "/api/users" : `/api/users/${userId}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (mode === "create") {
          const json = await res.json();
          router.push(`/users/${json.data.id}`);
        } else {
          router.push("/users");
        }
        router.refresh();
      } else {
        const json = await res.json();
        setError(json.error || "Errore nel salvataggio");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* SEZIONE 1 — Anagrafica */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Anagrafica</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full" placeholder="Nome e cognome" />
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              disabled={mode === "edit"}
              className="w-full disabled:opacity-50 disabled:cursor-not-allowed" placeholder="email@hotel.com" />
          </div>
        </div>
        {mode === "create" && (
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Password iniziale</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full" placeholder="Min. 6 caratteri" />
          </div>
        )}
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm font-ui text-charcoal">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            Utente attivo
          </label>
        )}
      </section>

      {/* SEZIONE 2 — Ruolo */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Ruolo</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["OPERATOR", "HOD", "HOTEL_MANAGER", "ADMIN"] as RoleOption[]).map((r) => (
            <button key={r} type="button" onClick={() => handleRoleChange(r)}
              className={`px-3 py-2.5 text-sm font-ui font-medium rounded-lg border transition-colors ${
                role === r
                  ? "bg-terracotta text-white border-terracotta"
                  : "bg-ivory text-charcoal border-ivory-dark hover:border-terracotta/40"
              }`}>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </section>

      {/* SEZIONE 3 — Permessi base */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Permessi</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm font-ui font-medium text-charcoal">Può vedere</span>
              <p className="text-xs font-ui text-sage-light">Accesso in lettura ai contenuti</p>
            </div>
            <div className="w-10 h-6 bg-sage rounded-full relative cursor-not-allowed opacity-75">
              <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full" />
            </div>
          </label>

          <label className="flex items-center justify-between py-2 cursor-pointer" onClick={() => setCanEdit(!canEdit)}>
            <div>
              <span className="text-sm font-ui font-medium text-charcoal">Può modificare</span>
              <p className="text-xs font-ui text-sage-light">Creazione e modifica contenuti</p>
            </div>
            <div className={`w-10 h-6 rounded-full relative transition-colors ${canEdit ? "bg-sage" : "bg-ivory-dark"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${canEdit ? "right-0.5" : "left-0.5"}`} />
            </div>
          </label>

          <label className="flex items-center justify-between py-2 cursor-pointer" onClick={() => setCanApprove(!canApprove)}>
            <div>
              <span className="text-sm font-ui font-medium text-charcoal">Può approvare</span>
              <p className="text-xs font-ui text-sage-light">Revisione e approvazione nel workflow</p>
            </div>
            <div className={`w-10 h-6 rounded-full relative transition-colors ${canApprove ? "bg-sage" : "bg-ivory-dark"}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${canApprove ? "right-0.5" : "left-0.5"}`} />
            </div>
          </label>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1 pt-2">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs font-ui text-alert-yellow flex items-start gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {w}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* SEZIONE 4+5 — Strutture e Reparti */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Strutture e reparti</h2>
        <div className="space-y-3">
          {properties.map((prop) => {
            const isSelected = selectedPropertyIds.includes(prop.id);
            const propAssignments = assignments.filter(a => a.propertyId === prop.id);
            const hasAllDepts = propAssignments.some(a => a.departmentId === null);

            return (
              <div key={prop.id} className={`border rounded-lg overflow-hidden transition-colors ${isSelected ? "border-terracotta/40 bg-ivory" : "border-ivory-dark"}`}>
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleProperty(prop.id)}
                    className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                  <div>
                    <span className="text-sm font-ui font-medium text-charcoal-dark">{prop.name}</span>
                    {prop.city && <span className="text-xs font-ui text-sage-light ml-2">{prop.city}</span>}
                  </div>
                </label>

                {isSelected && (
                  <div className="px-4 pb-3 pt-1 border-t border-ivory-dark/50">
                    <label className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <input type="checkbox" checked={hasAllDepts}
                        onChange={() => toggleAllDepts(prop.id)}
                        className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                      <span className="text-xs font-ui text-sage-light italic">Tutti i reparti</span>
                    </label>
                    {!hasAllDepts && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1">
                        {prop.departments.map((dept) => {
                          const isDeptSelected = propAssignments.some(a => a.departmentId === dept.id);
                          return (
                            <label key={dept.id} className="flex items-center gap-2 py-1 cursor-pointer">
                              <input type="checkbox" checked={isDeptSelected}
                                onChange={() => toggleDepartment(prop.id, dept.id)}
                                className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                              <span className="text-xs font-ui text-charcoal">{dept.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SEZIONE 6 — Tipi di contenuto gestibili */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Tipi di contenuto gestibili</h2>
        {canEdit ? (
          <div className="space-y-2">
            {(["MEMO", "SOP", "DOCUMENT"] as ContentTypeOption[]).map((ct) => (
              <label key={ct} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="checkbox" checked={contentTypes.includes(ct)}
                  onChange={() => toggleContentType(ct)}
                  className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                <span className="text-sm font-ui text-charcoal">{CONTENT_TYPE_LABELS[ct]}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm font-ui text-sage-light">
            L&apos;utente non ha permessi di modifica — i tipi di contenuto non sono applicabili.
          </p>
        )}
      </section>

      {/* Errore + azioni */}
      {error && (
        <p className="text-sm font-ui text-alert-red">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={loading}
          className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light rounded-lg disabled:opacity-50 transition-colors">
          {loading ? "Salvataggio..." : mode === "create" ? "Crea utente" : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()}
          className="px-6 py-3 text-sm font-ui text-charcoal hover:bg-ivory-dark rounded-lg transition-colors">
          Annulla
        </button>
      </div>
    </div>
  );
}
