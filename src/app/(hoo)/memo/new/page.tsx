"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHooContext } from "@/components/hoo/hoo-shell";
import { TargetAudienceSelector, type TargetAudienceState } from "@/components/shared/target-audience-selector";

interface Property { id: string; name: string; code: string }

export default function NewMemoPage() {
  const router = useRouter();
  const { userRole } = useHooContext();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [targetAudience, setTargetAudience] = useState<TargetAudienceState>({
    allDepartments: false,
    departmentIds: [],
    roles: [],
    userIds: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (json.data.length > 0) setPropertyId(json.data[0].id);
      }
    }
    fetchProps();
  }, []);

  const totalTargets =
    (targetAudience.allDepartments ? 1 : 0) +
    targetAudience.departmentIds.length +
    targetAudience.roles.length +
    targetAudience.userIds.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim() || !body.trim() || !propertyId) {
      setError("Titolo, contenuto e struttura sono obbligatori");
      return;
    }
    if (totalTargets === 0) {
      setError("Seleziona almeno un destinatario");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, body, propertyId,
          expiresAt: expiresAt || null,
          isPinned: isFeatured,
          targetAllDepartments: targetAudience.allDepartments,
          targetDepartmentIds: targetAudience.departmentIds,
          targetRoles: targetAudience.roles,
          targetUserIds: targetAudience.userIds,
        }),
      });
      if (res.ok) { router.push("/memo"); router.refresh(); }
      else {
        const j = await res.json();
        setError(j.error || "Errore nella creazione");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-heading font-medium text-charcoal-dark">Nuovo memo</h1>

      {error && (
        <div className="px-3 py-2 text-sm font-ui bg-[#FECACA] border-l-4 border-alert-red text-alert-red">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white border border-ivory-dark p-5 space-y-4">
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui" placeholder="Titolo del memo" />
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
            <select value={propertyId} onChange={(e) => {
                setPropertyId(e.target.value);
                setTargetAudience({ allDepartments: false, departmentIds: [], roles: [], userIds: [] });
              }}
              className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui bg-white">
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required
              className="w-full px-3 py-2 border border-ivory-dark text-sm font-body" placeholder="Testo del memo..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Scadenza (opzionale)</label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm font-ui text-charcoal">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)}
                  className="w-4 h-4 accent-terracotta" />
                Metti in evidenza
              </label>
            </div>
          </div>
        </div>

        {/* Destinatari */}
        {propertyId && (
          <div className="bg-white border border-ivory-dark p-5">
            <TargetAudienceSelector
              propertyId={propertyId}
              userRole={userRole}
              value={targetAudience}
              onChange={setTargetAudience}
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
            {loading ? "Pubblicazione..." : "Pubblica memo"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline">
            Annulla
          </button>
        </div>
      </form>
    </div>
  );
}
