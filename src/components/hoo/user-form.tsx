"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type RoleOption = "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "PRO" | "ADMIN";
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
  onSuccess?: () => void;
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
  PRO: "PRO",
  ADMIN: "HOO",
};

const ROLE_PRESETS: Record<RoleOption, { canEdit: boolean; canApprove: boolean; contentTypes: ContentTypeOption[] }> = {
  OPERATOR: { canEdit: false, canApprove: false, contentTypes: [] },
  HOD: { canEdit: true, canApprove: false, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  HOTEL_MANAGER: { canEdit: true, canApprove: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  PRO: { canEdit: false, canApprove: false, contentTypes: [] },
  ADMIN: { canEdit: true, canApprove: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
};

const CONTENT_TYPE_LABELS: Record<ContentTypeOption, string> = {
  MEMO: "Memo",
  SOP: "SOP",
  DOCUMENT: "Documenti",
};

export function UserForm({ mode, userId, onSuccess, initialData }: UserFormProps) {
  const router = useRouter();

  // Sezione 1 — Anagrafica
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);

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
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

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
    // If switching to a role that requires specific depts, convert any null departmentIds to pending
    if (newRole === "PRO") {
      // PRO: toggle diventa disabilitato per modifica e approvazione
      setCanEdit(false);
      setCanApprove(false);
    }
    if (newRole === "OPERATOR" || newRole === "HOD") {
      setAssignments(prev => prev.map(a =>
        a.departmentId === null ? { ...a, departmentId: "__pending__" as string } : a
      ));
    }
  };

  // Validate warnings
  useEffect(() => {
    const w: string[] = [];
    if (role === "OPERATOR" && (canEdit || canApprove)) {
      w.push("Un Operatore non dovrebbe avere permessi di modifica o approvazione");
    }
    if (role === "PRO" && (canEdit || canApprove)) {
      w.push("Un profilo PRO non può avere permessi di modifica o approvazione");
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

  const roleRequiresSpecificDepts = role === "OPERATOR" || role === "HOD";

  const toggleProperty = (propId: string) => {
    if (selectedPropertyIds.includes(propId)) {
      // Remove property and all its assignments
      setAssignments(prev => prev.filter(a => a.propertyId !== propId));
    } else {
      if (roleRequiresSpecificDepts) {
        // OPERATOR / HOD: add property placeholder without any dept — user must pick specific depts
        // We use a temporary marker: propertyId present but no assignment yet
        // Just add nothing — the property will show as selected via the next dept toggle
        // Actually we need at least one entry to mark the property as selected,
        // so we add a "pending" entry that won't be submitted (departmentId = undefined placeholder)
        // Better approach: for these roles, just show the property expanded, user must pick depts
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: "__pending__" as string }]);
      } else {
        // HM / ADMIN: default to all depts (departmentId = null)
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: null }]);
      }
    }
  };

  const toggleDepartment = (propId: string, deptId: string) => {
    const exists = assignments.some(a => a.propertyId === propId && a.departmentId === deptId);
    if (exists) {
      // Remove this dept; if it was the last specific dept, add pending marker to keep property selected
      const remaining = assignments.filter(a => !(a.propertyId === propId && a.departmentId === deptId));
      const hasOtherForProp = remaining.some(a => a.propertyId === propId && a.departmentId !== "__pending__");
      if (!hasOtherForProp) {
        setAssignments([...remaining.filter(a => a.propertyId !== propId), { propertyId: propId, departmentId: "__pending__" as string }]);
      } else {
        setAssignments(remaining);
      }
    } else {
      // Remove "all depts" (null) and pending marker for this property, add specific dept
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.propertyId === propId && (a.departmentId === null || a.departmentId === "__pending__")));
        return [...filtered, { propertyId: propId, departmentId: deptId }];
      });
    }
  };

  const toggleAllDepts = (propId: string) => {
    // Only HM/ADMIN can toggle "all departments"
    if (roleRequiresSpecificDepts) return;

    const hasAll = assignments.some(a => a.propertyId === propId && a.departmentId === null);
    if (hasAll) {
      // Deselect "all depts" — remove all assignments for this property, keep property selected with pending marker
      setAssignments(prev => {
        const filtered = prev.filter(a => a.propertyId !== propId);
        return [...filtered, { propertyId: propId, departmentId: "__pending__" as string }];
      });
    } else {
      // Set to all depts (replace all specific depts with null)
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
    if (mode === "create") {
      if (password.length < 6) {
        setError("La password deve avere almeno 6 caratteri");
        return;
      }
      if (password !== passwordConfirm) {
        setError("Le password non coincidono");
        return;
      }
    }
    if (mode === "edit" && changePassword) {
      if (password.length < 6) {
        setError("La nuova password deve avere almeno 6 caratteri");
        return;
      }
      if (password !== passwordConfirm) {
        setError("Le password non coincidono");
        return;
      }
    }

    // Filter out pending markers — only keep real assignments
    const realAssignments = assignments.filter(a => a.departmentId !== "__pending__");

    if (realAssignments.length === 0) {
      setError("Seleziona almeno una struttura con reparti assegnati");
      return;
    }

    // Validate role-department coherence
    if (roleRequiresSpecificDepts) {
      const hasNullDept = realAssignments.some(a => a.departmentId === null);
      if (hasNullDept) {
        setError(`Un ${ROLE_LABELS[role]} deve avere reparti specifici, non "Tutti i reparti"`);
        return;
      }
      // Check every selected property has at least one specific dept
      const propsWithoutDepts = selectedPropertyIds.filter(propId =>
        !realAssignments.some(a => a.propertyId === propId)
      );
      if (propsWithoutDepts.length > 0) {
        setError("Ogni struttura selezionata deve avere almeno un reparto assegnato");
        return;
      }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name, email, role,
        canView: true, canEdit, canApprove,
        propertyAssignments: realAssignments,
        contentTypes,
      };

      if (mode === "create") {
        payload.password = password;
      }
      if (mode === "edit") {
        payload.isActive = isActive;
        if (changePassword && password) {
          payload.password = password;
        }
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
          setCreatedUserId(json.data.id);
          setCreatedPassword(password);
          return; // Show password dialog before navigating
        } else if (onSuccess) {
          onSuccess();
          return; // evita setLoading(false) dopo che il parent ha smontato il form
        } else {
          router.push(`/users/${userId}`);
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

  // Dialog post-creazione: mostra password in chiaro
  if (createdUserId && createdPassword) {
    return (
      <div className="max-w-md mx-auto mt-8 space-y-6">
        <div className="bg-[#E8F5E9] border border-[#2E7D32]/20 p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-[#2E7D32]">Utente creato con successo</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Nome</label>
              <p className="text-sm font-ui font-medium text-charcoal-dark">{name}</p>
            </div>
            <div>
              <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Email</label>
              <p className="text-sm font-ui font-medium text-charcoal-dark">{email}</p>
            </div>
            <div>
              <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Password</label>
              <div className="flex items-center gap-2 bg-white border border-ivory-dark px-3 py-2">
                <code className="text-sm font-mono text-terracotta flex-1 select-all">{createdPassword}</code>
                <button type="button"
                  onClick={() => { navigator.clipboard.writeText(createdPassword); }}
                  className="text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/50 hover:text-terracotta transition-colors shrink-0">
                  Copia
                </button>
              </div>
              <p className="text-[11px] font-ui text-charcoal/40 mt-1">Comunica queste credenziali all&apos;utente. La password non sarà più visibile.</p>
            </div>
          </div>
        </div>
        <button onClick={() => { router.push(`/users/${createdUserId}`); router.refresh(); }}
          className="btn-primary w-full">
          Vai al profilo utente
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* SEZIONE 1 — Anagrafica */}
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
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
              className="w-full" placeholder="email@hotel.com" />
          </div>
        </div>
        {mode === "create" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-10" placeholder="Min. 6 caratteri" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal transition-colors"
                  tabIndex={-1}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Conferma password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                  className={`w-full pr-10 ${passwordConfirm && password !== passwordConfirm ? "!border-alert-red" : ""}`}
                  placeholder="Ripeti la password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal transition-colors"
                  tabIndex={-1}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-xs font-ui text-alert-red mt-1">Le password non coincidono</p>
              )}
            </div>
          </div>
        )}
        {mode === "edit" && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-ui text-charcoal cursor-pointer">
              <input type="checkbox" checked={changePassword} onChange={(e) => { setChangePassword(e.target.checked); if (!e.target.checked) { setPassword(""); setPasswordConfirm(""); } }}
                className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
              Cambia password
            </label>
            {changePassword && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Nuova password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full pr-10" placeholder="Min. 6 caratteri" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal transition-colors"
                      tabIndex={-1}>
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Conferma nuova password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                      className={`w-full pr-10 ${passwordConfirm && password !== passwordConfirm ? "!border-alert-red" : ""}`}
                      placeholder="Ripeti la password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal transition-colors"
                      tabIndex={-1}>
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {passwordConfirm && password !== passwordConfirm && (
                    <p className="text-xs font-ui text-alert-red mt-1">Le password non coincidono</p>
                  )}
                </div>
              </div>
            )}
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
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Ruolo</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(["OPERATOR", "HOD", "HOTEL_MANAGER", "PRO", "ADMIN"] as RoleOption[]).map((r) => (
            <button key={r} type="button" onClick={() => handleRoleChange(r)}
              className={`px-3 py-2.5 text-sm font-ui font-medium  border transition-colors ${
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
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
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
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">Strutture e reparti</h2>
        <div className="space-y-3">
          {properties.map((prop) => {
            const isSelected = selectedPropertyIds.includes(prop.id);
            const propAssignments = assignments.filter(a => a.propertyId === prop.id);
            const hasAllDepts = propAssignments.some(a => a.departmentId === null);

            return (
              <div key={prop.id} className={`border  overflow-hidden transition-colors ${isSelected ? "border-terracotta/40 bg-ivory" : "border-ivory-dark"}`}>
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
                    {!roleRequiresSpecificDepts && (
                      <label className="flex items-center gap-2 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={hasAllDepts}
                          onChange={() => toggleAllDepts(prop.id)}
                          className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                        <span className="text-xs font-ui text-sage-light italic">Tutti i reparti</span>
                      </label>
                    )}
                    {roleRequiresSpecificDepts && (
                      <p className="text-xs font-ui text-sage-light py-1.5">Seleziona uno o più reparti:</p>
                    )}
                    {(roleRequiresSpecificDepts || !hasAllDepts) && (
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
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
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
          className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
          {loading ? "Salvataggio..." : mode === "create" ? "Crea utente" : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
