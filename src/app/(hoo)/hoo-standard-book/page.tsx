"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";
import Link from "next/link";

interface Department { id: string; name: string; code: string }

interface ContentItem {
  id: string;
  title: string;
  status: string;
  publishedAt: string | null;
  standardSource: string | null;
  property: { id: string; name: string; code: string };
  targetAudience: { targetType: string; targetRole: string | null; targetDepartmentId: string | null; targetDepartment: { id: string; name: string; code: string } | null }[];
}

interface TargetState {
  allDepartments: boolean;
  departments: Department[];
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_ADMIN: "bg-[#FFF3E0] text-[#E65100]",
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Pubblicato",
  DRAFT: "Bozza",
  REVIEW_HM: "In revisione",
  REVIEW_ADMIN: "In approvazione",
};

const SOURCE_BADGE: Record<string, string> = {
  LQA: "bg-[#E3F2FD] text-[#1565C0]",
  HO_BRAND: "bg-[#F3E5F5] text-[#6A1B9A]",
};

const SOURCE_LABEL: Record<string, string> = {
  LQA: "LQA",
  HO_BRAND: "HO Brand",
};

function DeptPills({ item }: { item: ContentItem }) {
  const allDepts = item.targetAudience.some(t => t.targetType === "ROLE");
  const depts = item.targetAudience.filter(t => t.targetType === "DEPARTMENT" && t.targetDepartment);

  if (allDepts) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-ui font-medium bg-[#E8F5E9] text-[#2E7D32] uppercase tracking-wider">
        Tutti i reparti
      </span>
    );
  }
  if (depts.length === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-ui italic text-charcoal/35">
        Nessun reparto assegnato
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {depts.map(t => (
        <span key={t.targetDepartmentId} className="inline-flex items-center px-2 py-0.5 text-[10px] font-ui font-medium bg-ivory-dark text-charcoal/70 uppercase tracking-wider">
          {t.targetDepartment!.code}
        </span>
      ))}
    </div>
  );
}

function DeptManager({
  item,
  propertyId,
  onClose,
  onSaved,
}: {
  item: ContentItem;
  propertyId: string;
  onClose: () => void;
  onSaved: (targets: TargetState) => void;
}) {
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allDepartments, setAllDepartments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [propRes, tgtRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}`),
        fetch(`/api/content/${item.id}/targets`),
      ]);
      if (propRes.ok) {
        const j = await propRes.json();
        setAllDepts(j.data.departments || []);
      }
      if (tgtRes.ok) {
        const j = await tgtRes.json();
        setAllDepartments(j.data.allDepartments);
        setSelected(new Set(j.data.departments.map((d: Department) => d.id)));
      }
      setLoading(false);
    }
    load();
  }, [item.id, propertyId]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/content/${item.id}/targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allDepartments,
          departmentIds: allDepartments ? [] : Array.from(selected),
        }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
      const newTargets: TargetState = {
        allDepartments,
        departments: allDepts.filter(d => selected.has(d.id)),
      };
      onSaved(newTargets);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-ivory-dark bg-[#FAFAF8] px-5 py-4">
      {loading ? (
        <p className="text-xs font-ui text-charcoal/50">Caricamento reparti...</p>
      ) : (
        <>
          <p className="text-xs font-ui font-semibold text-charcoal uppercase tracking-wider mb-3">Reparti che possono vedere questa sezione</p>

          {/* Toggle tutti i reparti */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={allDepartments}
              onChange={e => { setAllDepartments(e.target.checked); if (e.target.checked) setSelected(new Set()); }}
              className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta"
            />
            <span className="text-sm font-ui font-medium text-charcoal group-hover:text-terracotta transition-colors">
              Tutti i reparti
            </span>
          </label>

          {/* Lista reparti specifici */}
          {!allDepartments && (
            <div className="space-y-2 ml-1 mb-3">
              {allDepts.map(dept => (
                <label key={dept.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.has(dept.id)}
                    onChange={() => toggle(dept.id)}
                    className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta"
                  />
                  <span className="text-sm font-ui text-charcoal group-hover:text-terracotta transition-colors">
                    <span className="font-mono text-[11px] text-charcoal/50 mr-1">{dept.code}</span>
                    {dept.name}
                  </span>
                </label>
              ))}
              {allDepts.length === 0 && (
                <p className="text-xs font-ui text-charcoal/40 italic">Nessun reparto configurato per questa struttura</p>
              )}
            </div>
          )}

          {error && <p className="text-xs font-ui text-alert-red mb-2">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light disabled:opacity-50 transition-colors"
            >
              {saving ? "Salvataggio..." : "Salva assegnazione"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-ui text-charcoal/60 hover:text-charcoal transition-colors"
            >
              Annulla
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function HooStandardBookListPage() {
  const { userRole, currentPropertyId } = useHooContext();
  const canCreate = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const canEdit = canCreate;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDraft, setShowDraft] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [managingDeptFor, setManagingDeptFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(val), 400);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = showArchived
        ? ["ARCHIVED"]
        : showDraft
        ? ["PUBLISHED", "DRAFT"]
        : ["PUBLISHED"];

      const allItems: ContentItem[] = [];
      for (const status of statuses) {
        const params = new URLSearchParams({ type: "STANDARD_BOOK", status, pageSize: "50" });
        if (currentPropertyId) params.set("propertyId", currentPropertyId);
        if (searchTerm.trim().length >= 2) params.set("search", searchTerm.trim());
        const res = await fetch(`/api/content?${params}`);
        if (res.ok) {
          const json = await res.json();
          allItems.push(...json.data);
        }
      }
      // Dedup e ordina: prima pubblicati, poi bozze; poi per titolo
      const seen = new Set<string>();
      const deduped = allItems.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      deduped.sort((a, b) => {
        if (a.status === "PUBLISHED" && b.status !== "PUBLISHED") return -1;
        if (a.status !== "PUBLISHED" && b.status === "PUBLISHED") return 1;
        return a.title.localeCompare(b.title, "it");
      });
      setItems(deduped);
    } finally { setLoading(false); }
  }, [showDraft, showArchived, searchTerm, currentPropertyId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) setItems(prev => prev.filter(i => i.id !== id));
    } finally { setDeleting(null); setConfirmDeleteId(null); }
  };

  const handleTargetsSaved = (itemId: string, targets: TargetState) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const newTargetAudience = targets.allDepartments
        ? [{ targetType: "ROLE", targetRole: "OPERATOR", targetDepartmentId: null, targetDepartment: null }]
        : targets.departments.map(d => ({
            targetType: "DEPARTMENT",
            targetRole: null,
            targetDepartmentId: d.id,
            targetDepartment: d,
          }));
      return { ...i, targetAudience: newTargetAudience };
    }));
  };

  const handlePublish = async (id: string) => {
    const res = await fetch(`/api/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishDirectly: true }),
    });
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: "PUBLISHED" } : i));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">Standard Book</h1>
          <p className="text-[13px] font-ui text-charcoal/50 mt-1">Gestione sezioni operative per reparto</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 px-3 py-2 border border-ivory-dark bg-white cursor-pointer">
            <input type="checkbox" checked={showDraft} onChange={(e) => setShowDraft(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            <span className="text-xs font-ui text-charcoal">Bozze</span>
          </label>
          <label className="flex items-center gap-1.5 px-3 py-2 border border-ivory-dark bg-white cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            <span className="text-xs font-ui text-charcoal">Archiviati</span>
          </label>
          {canCreate && (
            <Link href="/hoo-standard-book/new" className="btn-primary">Nuova sezione</Link>
          )}
        </div>
      </div>

      {/* Ricerca */}
      <div className="flex border border-ivory-dark bg-white overflow-hidden">
        <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cerca nello standard book..."
          className="flex-1 px-5 py-3 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }} />
        {searchTerm && (
          <button onClick={() => { setSearchQuery(""); setSearchTerm(""); }}
            className="px-4 py-3 text-xs font-ui text-charcoal/50 hover:text-charcoal transition-colors">
            Annulla
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessuna sezione Standard Book</p>
      ) : (
        <div className="bg-white border border-ivory-dark divide-y divide-ivory-medium">
          {items.map((item) => (
            <div key={item.id}>
              <div className="flex items-start gap-4 p-4 hover:bg-[#FAFAF8] transition-colors">
                {/* Colonna sinistra: badges + titolo + reparti */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[item.status] || "bg-ivory-dark text-charcoal"}`}>
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                    {item.standardSource && (
                      <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${SOURCE_BADGE[item.standardSource] || "bg-ivory-dark text-charcoal"}`}>
                        {SOURCE_LABEL[item.standardSource] || item.standardSource}
                      </span>
                    )}
                    <span className="text-[11px] font-ui text-charcoal/45">{item.property.name}</span>
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm mb-2">{item.title}</h3>
                  {/* Reparti assegnati */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-ui text-charcoal/40 uppercase tracking-wider">Visibile a:</span>
                    <DeptPills item={item} />
                  </div>
                </div>

                {/* Colonna destra: azioni */}
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {/* Pubblica se è bozza */}
                    {item.status === "DRAFT" && (
                      <button
                        onClick={() => handlePublish(item.id)}
                        className="px-3 py-1.5 text-[11px] font-ui font-semibold text-white bg-[#4E564F] hover:bg-[#3d4440] transition-colors"
                        title="Pubblica questa sezione"
                      >
                        Pubblica
                      </button>
                    )}

                    {/* Gestisci reparti */}
                    <button
                      onClick={() => setManagingDeptFor(managingDeptFor === item.id ? null : item.id)}
                      className={`px-3 py-1.5 text-[11px] font-ui font-semibold border transition-colors ${
                        managingDeptFor === item.id
                          ? "bg-terracotta text-white border-terracotta"
                          : "text-terracotta border-terracotta hover:bg-terracotta hover:text-white"
                      }`}
                    >
                      {managingDeptFor === item.id ? "Chiudi" : "Gestisci reparti"}
                    </button>

                    {/* Modifica */}
                    <Link href={`/hoo-standard-book/${item.id}/edit`}
                      className="px-3 py-1.5 text-[11px] font-ui font-medium text-charcoal/60 border border-ivory-dark hover:bg-ivory-dark transition-colors">
                      Modifica
                    </Link>

                    {/* Elimina */}
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id}
                          className="px-3 py-1.5 text-[11px] font-ui font-semibold text-white bg-alert-red disabled:opacity-50 transition-colors">
                          {deleting === item.id ? "..." : "Conferma"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 text-[11px] font-ui text-charcoal/50 hover:text-charcoal transition-colors">
                          No
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(item.id)}
                        className="px-2 py-1.5 text-[11px] font-ui text-alert-red/60 hover:text-alert-red transition-colors">
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Pannello gestione reparti — inline sotto la riga */}
              {managingDeptFor === item.id && (
                <DeptManager
                  item={item}
                  propertyId={item.property.id}
                  onClose={() => setManagingDeptFor(null)}
                  onSaved={(targets) => handleTargetsSaved(item.id, targets)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 pt-2">
        {Object.entries(SOURCE_BADGE).map(([key, cls]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${cls}`}>{SOURCE_LABEL[key]}</span>
            <span className="text-[11px] font-ui text-charcoal/40">{key === "LQA" ? "Standard LQA 2026-2028" : "Standard HO Collection"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
