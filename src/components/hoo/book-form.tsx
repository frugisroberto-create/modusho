"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SopEditor } from "@/components/shared/sop-editor";
import { TargetAudienceSelector, type TargetAudienceState, type TargetRole } from "@/components/shared/target-audience-selector";

interface Property { id: string; name: string; code: string; departments: { id: string; name: string; code: string }[] }

interface BookFormProps {
  mode: "create" | "edit";
  contentType: "BRAND_BOOK" | "STANDARD_BOOK";
  backPath: string;
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId?: string | null };
  canDelete?: boolean;
  userRole?: string;
}

export function BookForm({ mode, contentType, backPath, contentId, initialData, canDelete, userRole = "ADMIN" }: BookFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId ?? "");
  const [departmentId, setDepartmentId] = useState(initialData?.departmentId ?? "");
  const [targetAudience, setTargetAudience] = useState<TargetAudienceState>({
    allDepartments: false,
    departmentIds: initialData?.departmentId ? [initialData.departmentId] : [],
    roles: [],
    userIds: [],
  });
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveNote, setArchiveNote] = useState("");

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (!initialData?.propertyId && json.data.length > 0) {
          setPropertyId(json.data[0].id);
        }
      }
    }
    fetchProps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In edit mode: load existing targetAudience
  useEffect(() => {
    if (mode === "edit" && contentId) {
      async function loadTargets() {
        const res = await fetch(`/api/content/${contentId}`);
        if (res.ok) {
          const json = await res.json();
          const targets: { targetType: string; targetRole?: string; targetDepartmentId?: string; targetUserId?: string }[] = json.data.targetAudience || [];
          setTargetAudience({
            allDepartments: targets.some(t => t.targetType === "ROLE" && t.targetRole === "OPERATOR"),
            roles: targets
              .filter(t => t.targetType === "ROLE" && t.targetRole && t.targetRole !== "OPERATOR")
              .map(t => t.targetRole as TargetRole),
            departmentIds: targets
              .filter(t => t.targetType === "DEPARTMENT" && t.targetDepartmentId)
              .map(t => t.targetDepartmentId as string),
            userIds: targets
              .filter(t => t.targetType === "USER" && t.targetUserId)
              .map(t => t.targetUserId as string),
          });
        }
      }
      loadTargets();
    }
  }, [mode, contentId]);

  const totalTargets =
    (targetAudience.allDepartments ? 1 : 0) +
    targetAudience.departmentIds.length +
    targetAudience.roles.length +
    targetAudience.userIds.length;

  const handleSubmit = async (publish: boolean) => {
    if (!title.trim() || !body.trim() || !propertyId) { setError("Titolo, contenuto e struttura obbligatori"); return; }
    if (totalTargets === 0) { setError("Seleziona almeno un destinatario"); return; }
    setLoading(true); setError("");
    try {
      if (mode === "create") {
        const res = await fetch("/api/content", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: contentType, title, body, propertyId,
            ...(contentType === "STANDARD_BOOK" && departmentId ? { departmentId } : {}),
            targetAllDepartments: targetAudience.allDepartments,
            targetDepartmentIds: targetAudience.departmentIds,
            targetRoles: targetAudience.roles,
            targetUserIds: targetAudience.userIds,
            ...(publish ? { publishDirectly: true } : { sendToReview: false }),
          }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
        router.push(backPath);
      } else {
        const res = await fetch(`/api/content/${contentId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, body,
            targetAllDepartments: targetAudience.allDepartments,
            targetDepartmentIds: targetAudience.departmentIds,
            targetRoles: targetAudience.roles,
            targetUserIds: targetAudience.userIds,
          }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
        router.push(backPath);
      }
      router.refresh();
    } finally { setLoading(false); }
  };

  const handleArchive = async () => {
    if (!contentId || archiveNote.length < 5) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/content/${contentId}/archive`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: archiveNote }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || "Errore durante l'archiviazione"); return; }
      router.push(backPath);
      router.refresh();
    } finally { setLoading(false); setConfirmArchive(false); setArchiveNote(""); }
  };

  const handleDelete = async () => {
    if (!contentId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/content/${contentId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error || "Errore durante l'eliminazione"); return; }
      router.push(backPath);
      router.refresh();
    } finally { setLoading(false); setConfirmDelete(false); }
  };

  const typeLabel = contentType === "BRAND_BOOK" ? "Brand Book" : "Standard Book";

  return (
    <div className="max-w-3xl space-y-6">
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full" placeholder={`Titolo del ${typeLabel}`} />
        </div>
        {mode === "create" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
              <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setDepartmentId(""); }} className="w-full">
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {contentType === "STANDARD_BOOK" && (
              <div>
                <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full">
                  <option value="">Trasversale (tutti i reparti)</option>
                  {(properties.find(p => p.id === propertyId)?.departments || []).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
          <SopEditor content={body} onChange={setBody} placeholder="Scrivi il contenuto..." editable={true} />
        </div>
      </section>

      {/* Destinatari */}
      {propertyId && (
        <section className="bg-ivory-medium border border-ivory-dark p-6">
          <TargetAudienceSelector
            propertyId={propertyId}
            userRole={userRole}
            value={targetAudience}
            onChange={setTargetAudience}
          />
        </section>
      )}

      {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

      <div className="flex gap-3">
        {mode === "create" && (
          <>
            <button onClick={() => handleSubmit(false)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-medium text-charcoal bg-ivory border border-ivory-dark hover:bg-ivory-dark  disabled:opacity-50 transition-colors">
              {loading ? "..." : "Salva bozza"}
            </button>
            <button onClick={() => handleSubmit(true)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
              {loading ? "..." : "Pubblica"}
            </button>
          </>
        )}
        {mode === "edit" && (
          <button onClick={() => handleSubmit(false)} disabled={loading}
            className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
            {loading ? "..." : "Salva modifiche"}
          </button>
        )}
        <button onClick={() => router.back()} className="btn-outline">
          Annulla
        </button>
        {mode === "edit" && canDelete && (
          <div className="ml-auto flex items-center gap-3">
            {!confirmArchive ? (
              <button onClick={() => setConfirmArchive(true)} disabled={loading}
                className="px-5 py-2.5 text-sm font-ui font-medium text-charcoal hover:bg-ivory-dark transition-colors disabled:opacity-50">
                Archivia
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input type="text" value={archiveNote} onChange={(e) => setArchiveNote(e.target.value)}
                  placeholder="Motivo (min 5 caratteri)" className="text-sm w-48" />
                <button onClick={handleArchive} disabled={loading || archiveNote.length < 5}
                  className="px-4 py-2 text-sm font-ui font-semibold text-white bg-sage hover:bg-sage-dark transition-colors disabled:opacity-50">
                  {loading ? "..." : "Conferma"}
                </button>
                <button onClick={() => { setConfirmArchive(false); setArchiveNote(""); }}
                  className="px-3 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark transition-colors">
                  Annulla
                </button>
              </div>
            )}
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} disabled={loading}
                className="px-5 py-2.5 text-sm font-ui font-medium text-alert-red hover:bg-alert-red/10 transition-colors disabled:opacity-50">
                Elimina
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-ui text-alert-red">Confermi?</span>
                <button onClick={handleDelete} disabled={loading}
                  className="px-4 py-2 text-sm font-ui font-semibold text-white bg-alert-red hover:bg-alert-red/90 transition-colors disabled:opacity-50">
                  {loading ? "..." : "Sì, elimina"}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark transition-colors">
                  No
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
