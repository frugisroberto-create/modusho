"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HelpTip } from "@/components/auth/help-tip";
import { ActivationLinkBox } from "@/components/hoo/activation-link-box";
import type { EditableField } from "@/lib/user-scope";

type RoleOption = "OPERATOR" | "HOD" | "HOTEL_MANAGER" | "CORPORATE" | "ADMIN";
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
  /** Ruolo di chi sta compilando: determina la veste del form. */
  viewerRole: string;
  /** Campi che il server accetterebbe (modalità modifica). */
  editableFields?: EditableField[];
  /** Ruoli assegnabili dall'attore su questo utente (modalità modifica). */
  assignableRoles?: string[];
  /** L'utente ha già completato l'invito (modalità modifica). */
  isActivated?: boolean;
  onSuccess?: () => void;
  initialData?: {
    name: string;
    email: string;
    role: RoleOption;
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canPublish: boolean;
    targetDepartmentIds: string[];
    viewDepartmentIds: string[];
    isActive: boolean;
    assignments: AssignmentEntry[];
    contentTypes: ContentTypeOption[];
  };
}

const ROLE_LABELS: Record<RoleOption, string> = {
  OPERATOR: "Operatore",
  HOD: "Head of Department",
  HOTEL_MANAGER: "Hotel Manager",
  CORPORATE: "Corporate",
  ADMIN: "HOO",
};

/** Etichette in parole povere, per HM e HOD. */
const ROLE_LABELS_PLAIN: Record<string, string> = {
  OPERATOR: "Operatore",
  HOD: "Capo reparto",
};

const ROLE_PRESETS: Record<RoleOption, { canEdit: boolean; canApprove: boolean; canPublish: boolean; contentTypes: ContentTypeOption[] }> = {
  OPERATOR: { canEdit: false, canApprove: false, canPublish: false, contentTypes: [] },
  HOD: { canEdit: true, canApprove: false, canPublish: false, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  HOTEL_MANAGER: { canEdit: true, canApprove: false, canPublish: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
  CORPORATE: { canEdit: false, canApprove: false, canPublish: false, contentTypes: [] },
  ADMIN: { canEdit: true, canApprove: true, canPublish: true, contentTypes: ["SOP", "DOCUMENT", "MEMO"] },
};

const CONTENT_TYPE_LABELS: Record<ContentTypeOption, string> = {
  MEMO: "Memo",
  SOP: "SOP",
  DOCUMENT: "Documenti",
};

export function UserForm({
  mode,
  userId,
  viewerRole,
  editableFields = [],
  assignableRoles = [],
  isActivated = false,
  onSuccess,
  initialData,
}: UserFormProps) {
  const router = useRouter();

  // ─── Veste del form: chi compila determina cosa vede ───
  const veste: "hod" | "hm" | "admin" =
    viewerRole === "HOD" ? "hod" : viewerRole === "HOTEL_MANAGER" ? "hm" : "admin";
  const isCreate = mode === "create";
  const can = (field: EditableField) => editableFields.includes(field);
  // In creazione decide la veste; in modifica decide il server.
  const canEditFlags = isCreate ? veste === "admin" : can("permissionFlags");
  const canEditRole = isCreate ? veste !== "hod" : can("role");
  const canEditEmail = isCreate ? true : can("email");
  const canEditName = isCreate ? true : can("name");

  // Sezione 1 — Anagrafica
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [emailError, setEmailError] = useState("");

  // Sezione 2 — Ruolo
  const [role, setRole] = useState<RoleOption>(
    initialData?.role ?? (veste === "hod" ? "OPERATOR" : "OPERATOR")
  );

  // Sezione 3 — Permessi
  const [canEdit, setCanEdit] = useState(initialData?.canEdit ?? false);
  const [canApprove, setCanApprove] = useState(initialData?.canApprove ?? false);
  const [canPublish, setCanPublish] = useState(initialData?.canPublish ?? false);
  const [targetDepartmentIds, setTargetDepartmentIds] = useState<string[]>(initialData?.targetDepartmentIds ?? []);
  const [viewDepartmentIds, setViewDepartmentIds] = useState<string[]>(initialData?.viewDepartmentIds ?? []);

  // Sezione 4+5 — Strutture e reparti
  const [properties, setProperties] = useState<Property[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>(initialData?.assignments ?? []);
  /** Veste HM/HOD: property e reparto scelti da tendina, non da checkbox. */
  const [simplePropertyId, setSimplePropertyId] = useState("");
  const [simpleDepartmentId, setSimpleDepartmentId] = useState("");

  // Sezione 6 — Tipi contenuto
  const [contentTypes, setContentTypes] = useState<ContentTypeOption[]>(initialData?.contentTypes ?? []);

  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<{
    id: string;
    email: string;
    inviteSent: boolean;
    activationUrl?: string;
    activationExpiresAt?: string;
  } | null>(null);

  // Retrocessione: motivazione obbligatoria
  const [showDemotionModal, setShowDemotionModal] = useState(false);
  const [demotionNote, setDemotionNote] = useState("");

  // Invio link password (modalità modifica)
  const [sendingLink, setSendingLink] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [resentLink, setResentLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const isSimpleVeste = veste !== "admin";

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

  // Veste semplificata in creazione: preseleziona l'unica struttura disponibile.
  useEffect(() => {
    if (!isSimpleVeste || !isCreate || properties.length === 0) return;
    if (!simplePropertyId) setSimplePropertyId(properties[0]!.id);
  }, [isSimpleVeste, isCreate, properties, simplePropertyId]);

  // Veste HOD: reparto fisso, è il suo.
  useEffect(() => {
    if (veste !== "hod" || !isCreate) return;
    const prop = properties.find((p) => p.id === simplePropertyId);
    if (prop && prop.departments.length > 0 && !simpleDepartmentId) {
      setSimpleDepartmentId(prop.departments[0]!.id);
    }
  }, [veste, isCreate, properties, simplePropertyId, simpleDepartmentId]);

  const applyRolePreset = useCallback((newRole: RoleOption) => {
    const preset = ROLE_PRESETS[newRole];
    setCanEdit(preset.canEdit);
    setCanApprove(preset.canApprove);
    setCanPublish(preset.canPublish);
    setContentTypes(preset.contentTypes);
  }, []);

  const handleRoleChange = (newRole: RoleOption) => {
    setRole(newRole);
    applyRolePreset(newRole);
    if (newRole === "OPERATOR" || newRole === "HOD" || newRole === "CORPORATE") {
      setAssignments(prev => prev.map(a =>
        a.departmentId === null ? { ...a, departmentId: "__pending__" as string } : a
      ));
    }
  };

  // Avvisi di coerenza: solo dove i flag sono visibili.
  useEffect(() => {
    if (!canEditFlags) { setWarnings([]); return; }
    const w: string[] = [];
    if (role === "OPERATOR" && (canEdit || canApprove)) {
      w.push("Un Operatore non dovrebbe avere permessi di modifica o approvazione");
    }
    if (role === "HOD" && canApprove) {
      w.push("Un HOD non dovrebbe avere permessi di approvazione");
    }
    if (canApprove && role !== "HOTEL_MANAGER" && role !== "CORPORATE" && role !== "ADMIN") {
      w.push("Il permesso di approvazione richiede almeno il ruolo Hotel Manager");
    }
    if (canApprove) {
      w.push("Questo utente entrerà nel workflow di revisione/approvazione");
    }
    setWarnings(w);
  }, [role, canEdit, canApprove, canEditFlags]);

  useEffect(() => {
    if (!canEdit) setContentTypes([]);
  }, [canEdit]);

  const selectedPropertyIds = [...new Set(assignments.map(a => a.propertyId))];
  const roleRequiresSpecificDepts = role === "OPERATOR" || role === "HOD" || role === "CORPORATE";
  const currentProperty = properties.find((p) => p.id === simplePropertyId);

  const toggleProperty = (propId: string) => {
    if (selectedPropertyIds.includes(propId)) {
      setAssignments(prev => prev.filter(a => a.propertyId !== propId));
    } else {
      if (roleRequiresSpecificDepts) {
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: "__pending__" as string }]);
      } else {
        setAssignments(prev => [...prev, { propertyId: propId, departmentId: null }]);
      }
    }
  };

  const toggleDepartment = (propId: string, deptId: string) => {
    const exists = assignments.some(a => a.propertyId === propId && a.departmentId === deptId);
    if (exists) {
      const remaining = assignments.filter(a => !(a.propertyId === propId && a.departmentId === deptId));
      const hasOtherForProp = remaining.some(a => a.propertyId === propId && a.departmentId !== "__pending__");
      if (!hasOtherForProp) {
        setAssignments([...remaining.filter(a => a.propertyId !== propId), { propertyId: propId, departmentId: "__pending__" as string }]);
      } else {
        setAssignments(remaining);
      }
    } else {
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.propertyId === propId && (a.departmentId === null || a.departmentId === "__pending__")));
        return [...filtered, { propertyId: propId, departmentId: deptId }];
      });
    }
  };

  const toggleAllDepts = (propId: string) => {
    if (roleRequiresSpecificDepts) return;
    const hasAll = assignments.some(a => a.propertyId === propId && a.departmentId === null);
    if (hasAll) {
      setAssignments(prev => {
        const filtered = prev.filter(a => a.propertyId !== propId);
        return [...filtered, { propertyId: propId, departmentId: "__pending__" as string }];
      });
    } else {
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

  /** Invia link di reimpostazione o rimanda l'invito, secondo lo stato. */
  const handleSendLink = async () => {
    if (!userId) return;
    setSendingLink(true);
    setLinkFeedback(null);
    setResentLink(null);
    const endpoint = isActivated ? "send-reset" : "send-activation";
    try {
      const res = await fetch(`/api/users/${userId}/${endpoint}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setLinkFeedback(
        res.ok
          ? { text: isActivated ? "Link di reimpostazione inviato." : "Invito inviato.", ok: true }
          : { text: json?.error ?? "Invio non riuscito", ok: false }
      );
      // Il link esiste solo per chi non si è ancora attivato: su un account
      // attivo l'API non lo restituisce, e qui non lo cerchiamo nemmeno.
      if (!isActivated) {
        const payload = res.ok ? json?.data : json;
        if (payload?.activationUrl && payload?.activationExpiresAt) {
          setResentLink({ url: payload.activationUrl, expiresAt: payload.activationExpiresAt });
        }
      }
    } finally { setSendingLink(false); }
  };

  const submit = async (options: { confirmDuplicateName?: boolean; note?: string } = {}) => {
    setError("");
    setEmailError("");

    if (!name.trim() || !email.trim()) {
      setError("Nome e email sono obbligatori");
      return;
    }

    // Assegnazioni: nella veste semplificata vengono dalle tendine.
    let realAssignments: AssignmentEntry[];
    if (isSimpleVeste && isCreate) {
      if (!simplePropertyId || !simpleDepartmentId) {
        setError("Scegli la struttura e il reparto");
        return;
      }
      realAssignments = [{ propertyId: simplePropertyId, departmentId: simpleDepartmentId }];
    } else {
      realAssignments = assignments.filter(a => a.departmentId !== "__pending__");
      if (realAssignments.length === 0) {
        setError("Seleziona almeno una struttura con reparti assegnati");
        return;
      }
      if (roleRequiresSpecificDepts) {
        const hasNullDept = realAssignments.some(a => a.departmentId === null);
        if (hasNullDept) {
          setError(`Un ${ROLE_LABELS[role]} deve avere reparti specifici, non "Tutti i reparti"`);
          return;
        }
        const propsWithoutDepts = selectedPropertyIds.filter(propId =>
          !realAssignments.some(a => a.propertyId === propId)
        );
        if (propsWithoutDepts.length > 0) {
          setError("Ogni struttura selezionata deve avere almeno un reparto assegnato");
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name, email, role,
        targetDepartmentIds: role === "CORPORATE" ? targetDepartmentIds : [],
        viewDepartmentIds,
        propertyAssignments: realAssignments,
        contentTypes,
      };

      // I flag di potere viaggiano solo se chi compila può toccarli.
      if (canEditFlags) {
        payload.canView = true;
        payload.canEdit = canEdit;
        payload.canApprove = canApprove;
        payload.canPublish = canPublish;
      }

      if (isCreate && options.confirmDuplicateName) {
        payload.confirmDuplicateName = true;
      }
      if (!isCreate) {
        payload.isActive = isActive;
        if (options.note) payload.note = options.note;
      }

      const url = isCreate ? "/api/users" : `/api/users/${userId}`;
      const method = isCreate ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (isCreate) {
          const json = await res.json();
          setCreatedUser({
            id: json.data.id,
            email: json.data.email,
            inviteSent: json.data.inviteSent,
            activationUrl: json.data.activationUrl,
            activationExpiresAt: json.data.activationExpiresAt,
          });
          return;
        }
        if (onSuccess) { onSuccess(); return; }
        router.push(`/users/${userId}`);
        router.refresh();
        return;
      }

      const json = await res.json().catch(() => ({}));

      // Nome simile: avviso giallo, non blocca.
      if (json?.warning?.code === "DUPLICATE_NAME") {
        setDuplicateWarning(json.warning.message);
        return;
      }
      // Email già registrata: errore sotto il campo.
      if (res.status === 409) {
        setEmailError(json?.error ?? "Questa email è già registrata.");
        return;
      }
      setError(json?.error || "Errore nel salvataggio");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    // Retrocessione capo reparto → operatore: serve la motivazione.
    if (!isCreate && initialData?.role === "HOD" && role === "OPERATOR") {
      setShowDemotionModal(true);
      return;
    }
    submit();
  };

  // ─── Esito creazione ───
  if (createdUser) {
    // Mail partita → conferma verde. Mail non partita → avviso arancione: è la
    // stessa veste che il progetto usa ovunque per gli stati di attenzione.
    const boxCls = createdUser.inviteSent
      ? "bg-[#E8F5E9] border border-[#2E7D32]/20"
      : "bg-[#FFF3E0] border border-[#E65100]/30";
    const titleCls = createdUser.inviteSent ? "text-[#2E7D32]" : "text-[#E65100]";

    return (
      <div className="max-w-md mx-auto mt-8 space-y-6">
        <div className={`${boxCls} p-6 space-y-4`}>
          <h2 className={`text-base font-heading font-semibold ${titleCls}`}>Utente creato</h2>
          <p className="text-sm font-ui text-charcoal">
            {createdUser.inviteSent ? (
              <>
                Abbiamo mandato l&apos;invito a <strong>{createdUser.email}</strong>. Se non
                dovesse arrivargli, qui sotto trovi il suo link personale da fargli avere in un
                altro modo.
              </>
            ) : (
              <>
                L&apos;utente è stato creato, ma l&apos;email a <strong>{createdUser.email}</strong> non
                è partita. Usa il link qui sotto per fargliela avere.
              </>
            )}
          </p>

          {createdUser.activationUrl && createdUser.activationExpiresAt && (
            <ActivationLinkBox
              url={createdUser.activationUrl}
              expiresAt={createdUser.activationExpiresAt}
            />
          )}

          <p className="text-xs font-ui text-charcoal/60">
            Finché non si attiva lo vedrai <strong>In attesa</strong> nell&apos;elenco e potrai
            rimandargli l&apos;invito.
          </p>
        </div>
        <button onClick={() => { router.push(`/users/${createdUser.id}`); router.refresh(); }}
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
        <h2 className="text-base font-heading font-semibold text-charcoal-dark">
          {isSimpleVeste ? "Chi stai aggiungendo" : "Anagrafica"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Nome e cognome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              disabled={!canEditName}
              className="w-full disabled:opacity-60" placeholder="Nome e cognome" />
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
              disabled={!canEditEmail}
              className={`w-full disabled:opacity-60 ${emailError ? "!border-alert-red" : ""}`}
              placeholder="email@hotel.com" />
            {emailError && <p className="text-xs font-ui text-alert-red mt-1">{emailError}</p>}
            {!canEditEmail && (
              <p className="text-xs font-ui text-sage-light mt-1">
                Modificabile solo prima dell&apos;attivazione.
              </p>
            )}
            {isSimpleVeste && canEditEmail && (
              <p className="text-xs font-ui text-sage-light mt-1">
                È l&apos;indirizzo dove riceverà l&apos;invito: sarà anche il suo nome utente.
              </p>
            )}
          </div>
        </div>

        {!isCreate && can("isActive") && (
          <label className="flex items-center gap-2 text-sm font-ui text-charcoal">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            Utente attivo
          </label>
        )}

        {/* Password: non si imposta più da qui, si manda un link */}
        {!isCreate && (can("email") || veste === "admin") && (
          <div className="pt-2 border-t border-ivory-dark/60">
            <button type="button" onClick={handleSendLink} disabled={sendingLink}
              className="px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-50">
              {sendingLink ? "..." : isActivated ? "Invia link di reimpostazione" : "Rimanda invito"}
            </button>
            {linkFeedback && (
              <p className={`text-xs font-ui mt-2 ${linkFeedback.ok ? "text-sage" : "text-alert-red"}`}>
                {linkFeedback.text}
              </p>
            )}
            {resentLink && (
              <div className="mt-3">
                <ActivationLinkBox url={resentLink.url} expiresAt={resentLink.expiresAt} />
              </div>
            )}
            <p className="text-xs font-ui text-sage-light mt-2">
              La password la sceglie l&apos;utente: nessuno può vederla o impostarla al posto suo.
            </p>
          </div>
        )}
      </section>

      {/* SEZIONE 2 — Ruolo */}
      {canEditRole && (
        <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Ruolo</h2>
          {isSimpleVeste ? (
            <select value={role} onChange={(e) => handleRoleChange(e.target.value as RoleOption)}
              className="w-full sm:max-w-xs text-sm font-ui border border-ivory-dark px-3 py-2.5 bg-white">
              {(isCreate ? ["OPERATOR", "HOD"] : assignableRoles).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS_PLAIN[r] ?? ROLE_LABELS[r as RoleOption]}</option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(isCreate
                ? (["OPERATOR", "HOD", "HOTEL_MANAGER", "CORPORATE", "ADMIN"] as RoleOption[])
                : (assignableRoles as RoleOption[])
              ).map((r) => (
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
          )}
        </section>
      )}

      {/* Veste HOD in creazione: ruolo implicito, struttura e reparto fissi */}
      {veste === "hod" && isCreate && (
        <section className="bg-ivory-medium border border-ivory-dark p-6 space-y-3">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Dove lavorerà</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-ui">
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-charcoal/45 mb-1">Struttura</span>
              <span className="text-charcoal-dark font-medium">{currentProperty?.name ?? "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-charcoal/45 mb-1">Reparto</span>
              <span className="text-charcoal-dark font-medium">
                {currentProperty?.departments.find(d => d.id === simpleDepartmentId)?.name ?? "—"}
              </span>
            </div>
          </div>
          <p className="text-xs font-ui text-sage-light">
            Sarà un <strong>Operatore</strong> del tuo reparto: legge le procedure e conferma la presa visione.
          </p>
        </section>
      )}

      {/* Veste HM in creazione: struttura e reparto da tendina */}
      {veste === "hm" && isCreate && (
        <section className="bg-ivory-medium border border-ivory-dark p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Dove lavorerà</h2>
          {properties.length > 1 && (
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
              <select value={simplePropertyId}
                onChange={(e) => { setSimplePropertyId(e.target.value); setSimpleDepartmentId(""); }}
                className="w-full sm:max-w-xs text-sm font-ui border border-ivory-dark px-3 py-2.5 bg-white">
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto</label>
            <select value={simpleDepartmentId} onChange={(e) => setSimpleDepartmentId(e.target.value)}
              className="w-full sm:max-w-xs text-sm font-ui border border-ivory-dark px-3 py-2.5 bg-white">
              <option value="">Scegli il reparto</option>
              {currentProperty?.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </section>
      )}

      {/* Abilitazioni nei binari — veste HM: niente flag di potere */}
      {veste === "hm" && isCreate && role === "HOD" && (
        <section className="bg-ivory-medium border border-ivory-dark p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Cosa potrà scrivere</h2>
          <p className="text-xs font-ui text-sage-light">
            Un capo reparto crea contenuti per il suo reparto. Scegli di che tipo.
          </p>
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
          <HelpTip
            question="E i permessi di approvazione?"
            answer="Non si danno da qui. Approvazione e pubblicazione le governa l'Head of Operations: se servono, chiedile a lui."
          />
        </section>
      )}

      {/* Box informativo veste semplificata */}
      {isSimpleVeste && isCreate && (
        <section className="bg-white border-l-4 border-terracotta border-y border-r border-ivory-dark p-5">
          <h3 className="text-sm font-ui font-semibold text-charcoal-dark mb-2">Cosa succede dopo</h3>
          <ul className="text-sm font-ui text-charcoal/75 space-y-1.5 list-disc list-inside">
            <li>Riceverà un&apos;email con il suo link personale per attivarsi e scegliere la password.</li>
            <li>Finché non si attiva lo vedrai <strong>In attesa</strong> nell&apos;elenco.</li>
            <li>Se non gli arriva nulla, potrai rimandargli l&apos;invito.</li>
          </ul>
        </section>
      )}

      {/* SEZIONE 3 — Permessi base (solo veste admin o chi può toccarli) */}
      {canEditFlags && (
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
                <p className="text-xs font-ui text-sage-light">Approvazione formale nel workflow (ruolo A)</p>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-colors ${canApprove ? "bg-sage" : "bg-ivory-dark"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${canApprove ? "right-0.5" : "left-0.5"}`} />
              </div>
            </label>

            <label className="flex items-center justify-between py-2 cursor-pointer" onClick={() => setCanPublish(!canPublish)}>
              <div>
                <span className="text-sm font-ui font-medium text-charcoal">Può pubblicare</span>
                <p className="text-xs font-ui text-sage-light">Pubblicazione diretta senza passare dal workflow</p>
              </div>
              <div className={`w-10 h-6 rounded-full relative transition-colors ${canPublish ? "bg-sage" : "bg-ivory-dark"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${canPublish ? "right-0.5" : "left-0.5"}`} />
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
      )}

      {/* Permessi in sola lettura per chi non li governa (modalità modifica) */}
      {!isCreate && !canEditFlags && (
        <section className="bg-ivory-medium border border-ivory-dark p-6">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark mb-1">Permessi</h2>
          <p className="text-xs font-ui text-sage-light">
            (li governa l&apos;Head of Operations)
          </p>
        </section>
      )}

      {/* SEZIONE 4+5 — Strutture e Reparti (veste admin, o modifica) */}
      {(!isSimpleVeste || !isCreate) && can2ShowAssignments(isSimpleVeste, isCreate, can) && (
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
      )}

      {/* SEZIONE 5b — Reparti destinabili (solo CORPORATE) */}
      {canEditFlags && role === "CORPORATE" && canEdit && selectedPropertyIds.length > 0 && (
        <section className="bg-ivory-medium border border-ivory-dark p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Reparti destinabili</h2>
          <p className="text-xs font-ui text-sage-light">
            Seleziona i reparti a cui questo Corporate può destinare le SOP. Se nessuno è selezionato, potrà destinare a tutti i reparti della struttura.
          </p>
          <div className="space-y-3">
            {selectedPropertyIds.map((propId) => {
              const prop = properties.find(p => p.id === propId);
              if (!prop) return null;
              return (
                <div key={propId} className="border border-ivory-dark p-4 bg-ivory">
                  <p className="text-sm font-ui font-medium text-charcoal-dark mb-2">{prop.name}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {prop.departments.map((dept) => {
                      const isSelected = targetDepartmentIds.includes(dept.id);
                      return (
                        <label key={dept.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => {
                              setTargetDepartmentIds(prev =>
                                isSelected ? prev.filter(id => id !== dept.id) : [...prev, dept.id]
                              );
                            }}
                            className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                          <span className="text-xs font-ui text-charcoal">{dept.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SEZIONE 5c — Reparti visibili (HOD e CORPORATE) */}
      {(role === "HOD" || role === "CORPORATE") && (can("viewDepartmentIds") || isCreate) && selectedPropertyIds.length > 0 && (
        <section className="bg-ivory-medium border border-ivory-dark p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Reparti visibili</h2>
          <p className="text-xs font-ui text-sage-light">
            Seleziona i reparti aggiuntivi di cui questo utente può consultare le procedure (in sola lettura). I reparti operativi sono sempre visibili.
          </p>
          <div className="space-y-3">
            {selectedPropertyIds.map((propId) => {
              const prop = properties.find(p => p.id === propId);
              if (!prop) return null;
              const operativeDeptIds = assignments.filter(a => a.propertyId === propId && a.departmentId && a.departmentId !== "__pending__").map(a => a.departmentId!);
              const availableDepts = prop.departments.filter(d => !operativeDeptIds.includes(d.id));
              if (availableDepts.length === 0) return null;
              return (
                <div key={propId} className="border border-ivory-dark p-4 bg-ivory">
                  <p className="text-sm font-ui font-medium text-charcoal-dark mb-2">{prop.name}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {availableDepts.map((dept) => {
                      const isSelected = viewDepartmentIds.includes(dept.id);
                      return (
                        <label key={dept.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => {
                              setViewDepartmentIds(prev =>
                                isSelected ? prev.filter(id => id !== dept.id) : [...prev, dept.id]
                              );
                            }}
                            className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                          <span className="text-xs font-ui text-charcoal">{dept.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SEZIONE 6 — Tipi di contenuto gestibili (veste admin) */}
      {canEditFlags && (
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
      )}

      {/* Avviso nomi simili — non bloccante */}
      {duplicateWarning && (
        <div className="bg-[#FFF8E1] border-l-4 border-alert-yellow border-y border-r border-ivory-dark p-4">
          <p className="text-sm font-ui text-charcoal">{duplicateWarning}</p>
          <div className="flex gap-3 mt-3">
            <button type="button" disabled={loading}
              onClick={() => { setDuplicateWarning(null); submit({ confirmDuplicateName: true }); }}
              className="px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-white bg-alert-yellow hover:opacity-90 transition-opacity disabled:opacity-50">
              Crea comunque
            </button>
            <button type="button" onClick={() => setDuplicateWarning(null)}
              className="text-[12px] font-ui text-charcoal/60 hover:text-charcoal transition-colors">
              Rivedo i dati
            </button>
          </div>
        </div>
      )}

      {/* Errore + azioni */}
      {error && (
        <p className="text-sm font-ui text-alert-red">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={loading}
          className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
          {loading
            ? "Salvataggio..."
            : isCreate
              ? "Crea e invia l'invito"
              : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">
          Annulla
        </button>
      </div>

      {/* Modale retrocessione: la motivazione è obbligatoria */}
      {showDemotionModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-3">
              Retrocedi {initialData?.name} a Operatore
            </h3>
            <p className="text-sm font-ui text-charcoal/75 mb-4">
              Perderà la possibilità di creare e modificare contenuti. Le SOP di cui è autore
              restano intatte. La motivazione resta a registro, visibile all&apos;Head of Operations.
            </p>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">
              Motivazione (obbligatoria)
            </label>
            <textarea value={demotionNote} onChange={(e) => setDemotionNote(e.target.value)}
              rows={3} className="w-full text-sm font-ui border border-ivory-dark px-3 py-2 bg-white"
              placeholder="Perché questa persona torna a fare l'operatore?" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowDemotionModal(false); setDemotionNote(""); }}
                className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">
                Annulla
              </button>
              <button
                disabled={!demotionNote.trim() || loading}
                onClick={() => { setShowDemotionModal(false); submit({ note: demotionNote }); }}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light disabled:opacity-50 transition-colors">
                {loading ? "..." : "Conferma retrocessione"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Il pannello checkbox di strutture/reparti si mostra a chi governa le
 * assegnazioni: la veste admin sempre, HM e HOD solo in modifica e solo se il
 * server dichiara il campo modificabile.
 */
function can2ShowAssignments(
  isSimpleVeste: boolean,
  isCreate: boolean,
  can: (f: EditableField) => boolean
): boolean {
  if (!isSimpleVeste) return true;
  if (isCreate) return false;
  return can("departments");
}
