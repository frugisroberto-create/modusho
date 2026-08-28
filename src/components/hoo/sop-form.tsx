"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { canTargetEveryone, getTargetableDepartmentIds } from "@/lib/target-audience-scope";
import { TargetAudienceSelector, type TargetAudienceState, type TargetRole } from "@/components/shared/target-audience-selector";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { SopEditor } from "@/components/shared/sop-editor";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { UnsavedChangesModal } from "@/components/shared/unsaved-changes-modal";

interface Property {
  id: string; name: string; code: string;
  departments: { id: string; name: string; code: string }[];
}

interface SopFormProps {
  mode: "create" | "edit";
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId: string | null };
  userRole?: string;
  /** Chi sta scrivendo: non compare mai fra i destinatari proponibili. */
  currentUserId: string;
  userDepartmentId?: string | null;
  userDepartmentIds?: string[];
  userTargetDepartmentIds?: string[];
}

export function SopForm({ mode, contentId, initialData, userRole, currentUserId, userDepartmentId, userDepartmentIds, userTargetDepartmentIds }: SopFormProps) {
  const router = useRouter();
  const effectiveRole = userRole || "OPERATOR";

  // Il perimetro dei destinatari, chiesto al modulo che lo definisce.
  // `null` = nessuna restrizione; un array vuoto è una restrizione che non
  // lascia passare nulla, e va tenuto distinto da "nessun filtro".
  const audiencePerimeter = getTargetableDepartmentIds({
    id: currentUserId,
    role: effectiveRole as Role,
    targetDepartmentIds: userTargetDepartmentIds ?? [],
    assignedDepartmentIds: userDepartmentIds ?? [],
  });

  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId || "");
  const [departmentId, setDepartmentId] = useState(initialData?.departmentId || "");
  const [targetAudience, setTargetAudience] = useState<TargetAudienceState>({
    // Nascondere un interruttore acceso lo rende obbligatorio: chi non può
    // usare "Tutti gli operatori" non deve nemmeno partire con quello acceso.
    allDepartments: canTargetEveryone(effectiveRole as Role) && !initialData?.departmentId,
    departmentIds: initialData?.departmentId ? [initialData.departmentId] : [],
    roles: [],
    userIds: [],
  });
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  // ─── Modifiche non salvate: si perdono uscendo senza premere il bottone.
  // Marcato solo da un cambio esplicito dell'utente, mai dal precaricamento
  // dei dati (initialData, auto-selezione struttura/reparto, targetAudience
  // caricata in modifica) — altrimenti l'avviso scatterebbe subito ad ogni
  // apertura della pagina, senza che l'utente abbia scritto nulla.
  const [dirty, setDirty] = useState(false);
  // L'id creato dal salvataggio innescato dal bottone principale: il modal
  // di uscita, invece, dopo aver salvato prosegue verso la destinazione che
  // l'utente aveva già scelto (il link su cui aveva cliccato), non qui.
  const createdWorkflowIdRef = useRef<string | null>(null);

  const isAllProperties = propertyId === "__ALL__";
  const canSelectAllProperties = mode === "create" && (effectiveRole === "ADMIN" || effectiveRole === "SUPER_ADMIN");

  // RACI: coinvolgere HOD?
  const canInvolveHod = effectiveRole === "HOTEL_MANAGER" || effectiveRole === "CORPORATE" || effectiveRole === "ADMIN" || effectiveRole === "SUPER_ADMIN";
  const [involveHod, setInvolveHod] = useState(false);
  const [hodUserId, setHodUserId] = useState("");
  const [hodUsers, setHodUsers] = useState<{ id: string; name: string }[]>([]);

  // Fetch properties
  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (!propertyId && json.data.length > 0) {
          const firstProp = json.data[0];
          setPropertyId(firstProp.id);
          // Auto-select department if only one
          if (firstProp.departments?.length === 1) {
            setDepartmentId(firstProp.departments[0].id);
          }
        }
      }
    }
    fetchProps();
  }, []);

  // Fetch HOD users for the selected property
  const [hodLoading, setHodLoading] = useState(false);
  useEffect(() => {
    if (!canInvolveHod || !propertyId) {
      setHodUsers([]);
      return;
    }
    setHodLoading(true);
    async function fetchHods() {
      try {
        const res = await fetch(`/api/users?role=HOD&propertyId=${propertyId}&pageSize=50`);
        if (res.ok) {
          const json = await res.json();
          let users = json.data || [];
          // CORPORATE: filtra solo HOD dei reparti nel perimetro operativo
          if (effectiveRole === "CORPORATE" && userDepartmentIds?.length) {
            users = users.filter((u: { id: string; name: string; propertyAssignments?: { department?: { id: string } | null }[] }) => {
              return u.propertyAssignments?.some((a) =>
                a.department && userDepartmentIds!.includes(a.department.id)
              );
            });
          }
          setHodUsers(users.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
        }
      } finally {
        setHodLoading(false);
      }
    }
    fetchHods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInvolveHod, propertyId, effectiveRole, userDepartmentIds]);

  // In edit mode, load existing targets (tutti i tipi: ROLE, DEPARTMENT, USER)
  useEffect(() => {
    if (mode === "edit" && contentId) {
      async function loadTargets() {
        const res = await fetch(`/api/content/${contentId}`);
        if (res.ok) {
          const json = await res.json();
          const targets: { targetType: string; targetRole?: string; targetDepartmentId?: string; targetUserId?: string }[] = json.data.targetAudience || [];
          const allDepartments = targets.some(t => t.targetType === "ROLE" && t.targetRole === "OPERATOR");
          const roles = targets
            .filter(t => t.targetType === "ROLE" && t.targetRole && t.targetRole !== "OPERATOR")
            .map(t => t.targetRole as TargetRole);
          const departmentIds = targets
            .filter(t => t.targetType === "DEPARTMENT" && t.targetDepartmentId)
            .map(t => t.targetDepartmentId as string);
          const userIds = targets
            .filter(t => t.targetType === "USER" && t.targetUserId)
            .map(t => t.targetUserId as string);
          setTargetAudience({ allDepartments, departmentIds, roles, userIds });
        }
      }
      loadTargets();
    }
  }, [mode, contentId]);

  const selectedProperty = properties.find(p => p.id === propertyId);
  // Per "Tutte le strutture": mostra i reparti per codice che esistono in almeno una property
  const allDepartments = isAllProperties
    ? (() => {
        const byCode = new Map<string, { id: string; name: string; code: string }>();
        for (const p of properties) {
          for (const d of p.departments) {
            if (!byCode.has(d.code)) byCode.set(d.code, d);
          }
        }
        return Array.from(byCode.values());
      })()
    : selectedProperty?.departments || [];
  // Reparto della SOP: HOD/CORPORATE limitati ai propri reparti. HM/ADMIN: tutti.
  const creatableDepartments = (effectiveRole === "HOD" && userDepartmentId)
    ? allDepartments.filter(d => d.id === userDepartmentId)
    : (effectiveRole === "CORPORATE" && userDepartmentIds?.length)
      ? allDepartments.filter(d => userDepartmentIds.includes(d.id))
      : allDepartments;
  // I destinatari li elenca il selettore, filtrando per `audiencePerimeter`.
  // Qui non si ricalcola nulla: il ripiego che mostrava TUTTI i reparti quando
  // il perimetro non intersecava la struttura è stato tolto — un perimetro
  // vuoto deve chiudere, non aprire.

  const totalTargets =
    (targetAudience.allDepartments ? 1 : 0) +
    targetAudience.departmentIds.length +
    targetAudience.roles.length +
    targetAudience.userIds.length;

  const validateFields = (): boolean => {
    if (!title.trim() || !body.trim() || !propertyId) {
      setError("Titolo, contenuto e struttura sono obbligatori");
      return false;
    }
    if (!departmentId) {
      setError("Seleziona il reparto della SOP");
      return false;
    }
    if (!isAllProperties && totalTargets === 0) {
      setError("Seleziona almeno un destinatario");
      return false;
    }
    if (involveHod && !hodUserId) {
      setError("Seleziona l'HOD da coinvolgere");
      return false;
    }
    return true;
  };

  /**
   * Salva la SOP singola SENZA navigare: la destinazione la decide chi
   * chiama. Il bottone principale va sempre alla stessa pagina; il modal di
   * uscita, invece, dopo aver salvato prosegue verso il link su cui l'utente
   * aveva già cliccato — non qui.
   *
   * La creazione multipla ("Tutte le strutture") resta fuori apposta: ha un
   * proprio avanzamento a video ed è un'azione deliberata, non qualcosa da
   * salvare in automatico nel tentativo di uscire dalla pagina.
   */
  const save = async (): Promise<boolean> => {
    if (isAllProperties) {
      setError("La creazione su più strutture non si salva da sola: completa o annulla prima di uscire.");
      return false;
    }
    if (!validateFields()) return false;

    setLoading(true);
    try {
      if (mode === "create") {
        const payload = {
          title, body, propertyId, departmentId,
          involveHod,
          ...(involveHod && hodUserId ? { hodUserId } : {}),
          targetAllDepartments: targetAudience.allDepartments,
          targetDepartmentIds: targetAudience.departmentIds,
          targetRoles: targetAudience.roles,
          targetUserIds: targetAudience.userIds,
        };
        const res = await fetch("/api/sop-workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const json = await res.json();
          createdWorkflowIdRef.current = json.data.id;
          setDirty(false);
          return true;
        }
        const json = await res.json();
        setError(json.error || "Errore nella creazione");
        return false;
      } else {
        const payload = {
          title, body,
          departmentId: departmentId || null,
          targetAllDepartments: targetAudience.allDepartments,
          targetDepartmentIds: targetAudience.departmentIds,
          targetRoles: targetAudience.roles,
          targetUserIds: targetAudience.userIds,
        };
        const res = await fetch(`/api/content/${contentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setDirty(false);
          return true;
        }
        const json = await res.json();
        setError(json.error || "Errore nel salvataggio");
        return false;
      }
    } finally {
      setLoading(false);
    }
  };

  const guard = useUnsavedChangesGuard(dirty, save);

  const handleSubmit = async () => {
    setError("");
    setBatchProgress(null);
    if (!validateFields()) return;

    if (mode === "create" && isAllProperties) {
      // Batch: crea una SOP per ogni property. Resta qui, fuori da `save()`:
      // non è il salvataggio singolo che il modal di uscita può innescare.
      setLoading(true);
      try {
        const selectedDeptCode = allDepartments.find(d => d.id === departmentId)?.code;
        if (!selectedDeptCode) {
          setError("Reparto non trovato");
          return;
        }

        const errors: string[] = [];
        let done = 0;
        setBatchProgress({ done: 0, total: properties.length, errors: [] });

        for (const prop of properties) {
          const propDept = prop.departments.find(d => d.code === selectedDeptCode);
          if (!propDept) {
            errors.push(`${prop.name}: reparto ${selectedDeptCode} non presente`);
            done++;
            setBatchProgress({ done, total: properties.length, errors: [...errors] });
            continue;
          }

          const payload = {
            title, body, propertyId: prop.id, departmentId: propDept.id,
            involveHod: false,
            targetAllDepartments: true,
            targetDepartmentIds: [] as string[],
            targetRoles: [] as string[],
            targetUserIds: [] as string[],
          };

          const res = await fetch("/api/sop-workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const json = await res.json().catch(() => null);
            errors.push(`${prop.name}: ${json?.error || "errore"}`);
          }

          done++;
          setBatchProgress({ done, total: properties.length, errors: [...errors] });
        }

        if (errors.length === 0) {
          setDirty(false);
          router.push("/approvals");
          router.refresh();
        } else if (errors.length < properties.length) {
          setError(`Creata su ${properties.length - errors.length} strutture. Errori: ${errors.join("; ")}`);
        } else {
          setError(`Nessuna SOP creata. Errori: ${errors.join("; ")}`);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    const ok = await save();
    if (!ok) return;
    if (mode === "create") {
      router.push(`/sop-workflow/${createdWorkflowIdRef.current}`);
    } else {
      router.push("/hoo-sop");
    }
    router.refresh();
  };

  const isValid = title.trim() && body.trim() && propertyId && departmentId && (isAllProperties || totalTargets > 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white border border-ivory-dark p-5 space-y-4">
        {/* Titolo */}
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="w-full" placeholder="Titolo della SOP" />
        </div>

        {/* Struttura */}
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
          <select value={propertyId}
            onChange={(e) => {
              const newPropId = e.target.value;
              setDirty(true);
              setPropertyId(newPropId);
              setTargetAudience({ allDepartments: false, departmentIds: [], roles: [], userIds: [] });
              setInvolveHod(false);
              setHodUserId("");
              if (newPropId === "__ALL__") {
                setDepartmentId("");
              } else {
                // Auto-select department if only one
                const prop = properties.find(p => p.id === newPropId);
                if (prop?.departments?.length === 1) {
                  setDepartmentId(prop.departments[0].id);
                } else {
                  setDepartmentId("");
                }
              }
            }}
            className="w-full">
            <option value="">Seleziona struttura</option>
            {canSelectAllProperties && <option value="__ALL__">Tutte le strutture</option>}
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {isAllProperties && (
            <p className="text-xs font-ui text-terracotta mt-1.5">
              Verra creata una bozza SOP separata per ciascuna struttura ({properties.length}).
              Il reparto selezionato deve esistere in tutte le strutture.
            </p>
          )}
        </div>

        {/* Reparto proprietario della SOP */}
        {propertyId && (
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto proprietario</label>
            <p className="text-xs font-ui text-charcoal/45 mb-2">
              Il reparto che redige e mantiene la SOP. Serve per la generazione del codice (es. PPL-FO-001) e per la tracciabilità —
              <strong className="text-charcoal/60"> non determina la visibilità</strong>, che è governata dai destinatari sotto.
            </p>
            <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setDirty(true); }}
              className="w-full">
              <option value="">Seleziona reparto proprietario</option>
              {creatableDepartments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </div>
        )}

        {/* Coinvolgimento HOD (solo HM/ADMIN/SUPER_ADMIN in creazione, non in batch) */}
        {mode === "create" && canInvolveHod && propertyId && !isAllProperties && (
          <div className="bg-ivory border border-ivory-dark p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={involveHod}
                disabled={hodUsers.length === 0 && !hodLoading}
                onChange={(e) => { setInvolveHod(e.target.checked); if (!e.target.checked) setHodUserId(""); setDirty(true); }}
                className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta disabled:opacity-40" />
              <span className="text-sm font-ui font-medium text-charcoal">Coinvolgi HOD nella redazione</span>
            </label>
            {hodLoading ? (
              <p className="text-xs font-ui text-charcoal/40">Caricamento HOD...</p>
            ) : hodUsers.length === 0 ? (
              <p className="text-xs font-ui text-charcoal/40">Nessun HOD assegnato a questa struttura</p>
            ) : (
              <p className="text-xs font-ui text-charcoal/45">
                {involveHod
                  ? "L'HOD sarà il Responsabile (R) della bozza, tu sarai Consultato (C)"
                  : effectiveRole === "HOTEL_MANAGER"
                    ? "Sarai tu il Responsabile (R) della bozza"
                    : "L'Hotel Manager sarà il Responsabile (R) della bozza"
                }
              </p>
            )}
            {involveHod && hodUsers.length > 0 && (
              <select value={hodUserId} onChange={(e) => { setHodUserId(e.target.value); setDirty(true); }} className="w-full">
                <option value="">Seleziona HOD</option>
                {hodUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Destinatari (nascosti in batch — tutte le strutture usa "tutti gli operatori") */}
      {propertyId && !isAllProperties && (
        <TargetAudienceSelector
          propertyId={propertyId}
          userRole={effectiveRole}
          userDepartmentId={userDepartmentId}
          currentUserId={currentUserId}
          allowedDepartmentIds={audiencePerimeter ?? undefined}
          value={targetAudience}
          onChange={(next) => { setTargetAudience(next); setDirty(true); }}
        />
      )}

      {/* Contenuto */}
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
        <SopEditor
          content={body}
          onChange={(html) => { setBody(html); setDirty(true); }}
          placeholder="Scrivi il contenuto della procedura..."
        />
      </div>

      {/* Allegati (solo in edit, per create si gestiscono nell'editor workflow) */}
      {mode === "edit" && contentId && (
        <AttachmentUploader contentId={contentId} canEdit={true} />
      )}

      {/* Nota: dopo il salvataggio si va nell'editor completo */}
      {mode === "create" && (
        <div className="px-4 py-3 bg-ivory border border-ivory-dark text-xs font-ui text-charcoal/50">
          Dopo il salvataggio verrai portato nell&apos;editor della bozza, dove potrai aggiungere note, allegati e gestire il workflow completo.
        </div>
      )}

      {/* Progresso batch */}
      {batchProgress && (
        <div className="bg-ivory border border-ivory-dark p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-ui font-medium text-charcoal">
              Creazione in corso: {batchProgress.done}/{batchProgress.total}
            </span>
            <span className="text-sm font-ui text-terracotta font-semibold">
              {Math.round((batchProgress.done / batchProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-ivory-dark overflow-hidden">
            <div className="h-full bg-terracotta transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
          </div>
          {batchProgress.errors.length > 0 && (
            <div className="mt-2 text-xs font-ui text-alert-red">
              {batchProgress.errors.map((e, i) => <p key={i}>— {e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Errore */}
      {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

      {/* Validazione inline */}
      {!isValid && (title || body) && (
        <div className="text-xs font-ui text-charcoal/40 space-y-0.5">
          {!title.trim() && <p>— Inserisci un titolo</p>}
          {!body.trim() && <p>— Inserisci il contenuto</p>}
          {!propertyId && <p>— Seleziona una struttura</p>}
          {!departmentId && <p>— Seleziona il reparto della SOP</p>}
          {!isAllProperties && totalTargets === 0 && <p>— Seleziona almeno un destinatario</p>}
        </div>
      )}

      {/* Azioni */}
      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={loading || !isValid}
          className="btn-primary disabled:opacity-50">
          {loading ? (isAllProperties ? "Creazione in corso..." : "Salvataggio...") : mode === "create" ? (isAllProperties ? `Crea bozza su ${properties.length} strutture` : "Crea bozza") : "Salva modifiche"}
        </button>
        <button
          onClick={() => guard.requestNavigation(() => router.back())}
          className="btn-outline"
        >
          Annulla
        </button>
      </div>

      <UnsavedChangesModal guard={guard} />
    </div>
  );
}
