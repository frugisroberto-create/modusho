"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TargetAudienceSelector, type TargetAudienceState, type TargetRole } from "@/components/shared/target-audience-selector";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { SopEditor } from "@/components/shared/sop-editor";

interface Property {
  id: string; name: string; code: string;
  departments: { id: string; name: string; code: string }[];
}

interface SopFormProps {
  mode: "create" | "edit";
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId: string | null };
  userRole?: string;
  userDepartmentId?: string | null;
}

export function SopForm({ mode, contentId, initialData, userRole, userDepartmentId }: SopFormProps) {
  const router = useRouter();
  const effectiveRole = userRole || "OPERATOR";

  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId || "");
  const [departmentId, setDepartmentId] = useState(initialData?.departmentId || "");
  const [targetAudience, setTargetAudience] = useState<TargetAudienceState>({
    allDepartments: !initialData?.departmentId,
    departmentIds: initialData?.departmentId ? [initialData.departmentId] : [],
    roles: [],
    userIds: [],
  });
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // RACI: coinvolgere HOD?
  const canInvolveHod = effectiveRole === "HOTEL_MANAGER" || effectiveRole === "ADMIN" || effectiveRole === "SUPER_ADMIN";
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
          const users = json.data || [];
          setHodUsers(users.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
        }
      } finally {
        setHodLoading(false);
      }
    }
    fetchHods();
  }, [canInvolveHod, propertyId]);

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
  const departments = selectedProperty?.departments || [];

  const totalTargets =
    (targetAudience.allDepartments ? 1 : 0) +
    targetAudience.departmentIds.length +
    targetAudience.roles.length +
    targetAudience.userIds.length;

  const handleSubmit = async () => {
    setError("");
    if (!title.trim() || !body.trim() || !propertyId) {
      setError("Titolo, contenuto e struttura sono obbligatori");
      return;
    }
    if (!departmentId) {
      setError("Seleziona il reparto della SOP");
      return;
    }
    if (totalTargets === 0) {
      setError("Seleziona almeno un destinatario");
      return;
    }
    if (involveHod && !hodUserId) {
      setError("Seleziona l'HOD da coinvolgere");
      return;
    }

    setLoading(true);
    try {
      if (mode === "create") {
        // Usa il nuovo workflow RACI
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
          // Redirect al workflow editor dove note/allegati/versioni sono disponibili
          router.push(`/sop-workflow/${json.data.id}`);
          router.refresh();
        } else {
          const json = await res.json();
          setError(json.error || "Errore nella creazione");
        }
      } else {
        // Edit mode: aggiorna via content API esistente
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
          router.push("/hoo-sop");
          router.refresh();
        } else {
          const json = await res.json();
          setError(json.error || "Errore nel salvataggio");
        }
      }
    } finally { setLoading(false); }
  };

  const isValid = title.trim() && body.trim() && propertyId && departmentId && totalTargets > 0;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Titolo */}
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full" placeholder="Titolo della SOP" />
      </div>

      {/* Struttura */}
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
        <select value={propertyId}
          onChange={(e) => {
            const newPropId = e.target.value;
            setPropertyId(newPropId);
            setTargetAudience({ allDepartments: false, departmentIds: [], roles: [], userIds: [] });
            setInvolveHod(false);
            setHodUserId("");
            // Auto-select department if only one
            const prop = properties.find(p => p.id === newPropId);
            if (prop?.departments?.length === 1) {
              setDepartmentId(prop.departments[0].id);
            } else {
              setDepartmentId("");
            }
          }}
          disabled={mode === "edit"} className="w-full disabled:opacity-50">
          <option value="">Seleziona struttura</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Reparto proprietario della SOP */}
      {propertyId && (
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto proprietario</label>
          <p className="text-xs font-ui text-charcoal/45 mb-2">
            Il reparto che redige e mantiene la SOP. Serve per la generazione del codice (es. PPL-FO-001) e per la tracciabilità —
            <strong className="text-charcoal/60"> non determina la visibilità</strong>, che è governata dai destinatari sotto.
          </p>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
            disabled={mode === "edit"} className="w-full disabled:opacity-50">
            <option value="">Seleziona reparto proprietario</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </div>
      )}

      {/* Coinvolgimento HOD (solo HM/ADMIN/SUPER_ADMIN in creazione) */}
      {mode === "create" && canInvolveHod && propertyId && (
        <div className="bg-ivory border border-ivory-dark p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={involveHod}
              disabled={hodUsers.length === 0 && !hodLoading}
              onChange={(e) => { setInvolveHod(e.target.checked); if (!e.target.checked) setHodUserId(""); }}
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
            <select value={hodUserId} onChange={(e) => setHodUserId(e.target.value)} className="w-full">
              <option value="">Seleziona HOD</option>
              {hodUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Destinatari */}
      {propertyId && (
        <TargetAudienceSelector
          propertyId={propertyId}
          userRole={effectiveRole}
          userDepartmentId={userDepartmentId}
          value={targetAudience}
          onChange={setTargetAudience}
        />
      )}

      {/* Contenuto */}
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
        <SopEditor
          content={body}
          onChange={setBody}
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

      {/* Errore */}
      {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

      {/* Validazione inline */}
      {!isValid && (title || body) && (
        <div className="text-xs font-ui text-charcoal/40 space-y-0.5">
          {!title.trim() && <p>— Inserisci un titolo</p>}
          {!body.trim() && <p>— Inserisci il contenuto</p>}
          {!propertyId && <p>— Seleziona una struttura</p>}
          {!departmentId && <p>— Seleziona il reparto della SOP</p>}
          {totalTargets === 0 && <p>— Seleziona almeno un destinatario</p>}
        </div>
      )}

      {/* Azioni */}
      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={loading || !isValid}
          className="btn-primary disabled:opacity-50">
          {loading ? "Salvataggio..." : mode === "create" ? "Crea bozza" : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">
          Annulla
        </button>
      </div>
    </div>
  );
}
