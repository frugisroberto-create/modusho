"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Department { id: string; name: string; code: string; sopTotal: number; sopPublished: number }
interface Operator {
  id: string; name: string; email: string; role: string;
  propertyAssignments: { department: { name: string } | null }[];
}
interface PropertyDetail {
  id: string; name: string; code: string; tagline: string | null; city: string;
  address: string | null; description: string | null; website: string | null;
  isActive: boolean; departments: Department[]; operators: Operator[];
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "HOO", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "HOO", cls: "bg-sage text-white" },
  HOTEL_MANAGER: { label: "HM", cls: "bg-terracotta text-white" },
  HOD: { label: "HOD", cls: "bg-mauve text-white" },
  OPERATOR: { label: "Op", cls: "bg-ivory-dark text-charcoal" },
};

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptCode, setEditDeptCode] = useState("");
  const [savingDept, setSavingDept] = useState(false);

  const fetchProperty = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/properties/${id}`);
      if (res.ok) { const json = await res.json(); setProperty(json.data); }
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchProperty(); }, [fetchProperty]);

  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    setAddingDept(true);
    try {
      const res = await fetch(`/api/properties/${id}/departments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeptName }),
      });
      if (res.ok) { setNewDeptName(""); fetchProperty(); }
    } finally { setAddingDept(false); }
  };

  const handleDeleteDept = async (depId: string) => {
    setDeptError("");
    const res = await fetch(`/api/properties/${id}/departments/${depId}`, { method: "DELETE" });
    if (res.ok) {
      fetchProperty();
    } else {
      const json = await res.json().catch(() => null);
      setDeptError(json?.error || "Errore nella rimozione del reparto");
    }
  };

  const handleStartEditDept = (d: Department) => {
    setEditingDeptId(d.id);
    setEditDeptName(d.name);
    setEditDeptCode(d.code);
    setDeptError("");
  };

  const handleSaveDept = async () => {
    if (!editingDeptId || !editDeptName.trim() || !editDeptCode.trim()) return;
    setSavingDept(true);
    setDeptError("");
    try {
      const res = await fetch(`/api/properties/${id}/departments/${editingDeptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDeptName.trim(), code: editDeptCode.trim() }),
      });
      if (res.ok) {
        setEditingDeptId(null);
        fetchProperty();
      } else {
        const json = await res.json().catch(() => null);
        setDeptError(json?.error || "Errore nel salvataggio");
      }
    } finally { setSavingDept(false); }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 skeleton" />)}</div>;
  if (!property) return <p className="text-sage-light font-ui">Struttura non trovata</p>;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {property.tagline && (
            <p className="text-xs font-ui font-medium uppercase tracking-[0.2em] text-sage mb-1">
              {property.tagline}
            </p>
          )}
          <h1 className="text-3xl font-heading font-semibold text-terracotta">{property.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm font-ui text-sage-light">
            <span>{property.city}</span>
            {property.website && (
              <a href={`https://${property.website}`} target="_blank" rel="noopener noreferrer"
                className="text-terracotta hover:underline">{property.website}</a>
            )}
          </div>
          {property.description && (
            <p className="text-sm font-ui text-charcoal/70 mt-3 max-w-xl">{property.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/properties/${id}/edit`}
            className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light  transition-colors">
            Modifica
          </Link>
          <button onClick={() => router.push("/properties")}
            className="px-4 py-2 text-sm font-ui text-sage-light hover:text-charcoal transition-colors">Indietro</button>
        </div>
      </div>

      {/* Reparti */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark mb-4">Reparti</h2>
        {deptError && (
          <div className="text-xs font-ui text-alert-red bg-alert-red/5 border-l-4 border-alert-red px-3 py-2 mb-3">
            {deptError}
          </div>
        )}
        <div className="space-y-2">
          {property.departments.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2.5 px-3 bg-ivory">
              {editingDeptId === d.id ? (
                <>
                  <div className="flex items-center gap-2 flex-1">
                    <input type="text" value={editDeptName} onChange={(e) => setEditDeptName(e.target.value)}
                      className="text-sm font-ui flex-1" placeholder="Nome reparto" />
                    <input type="text" value={editDeptCode} onChange={(e) => setEditDeptCode(e.target.value)}
                      className="text-sm font-ui w-20 uppercase" placeholder="Codice" />
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button onClick={handleSaveDept} disabled={savingDept || !editDeptName.trim() || !editDeptCode.trim()}
                      className="text-xs font-ui font-medium text-sage hover:text-sage-dark disabled:opacity-50 transition-colors">
                      {savingDept ? "..." : "Salva"}
                    </button>
                    <button onClick={() => setEditingDeptId(null)}
                      className="text-xs font-ui text-charcoal/40 hover:text-charcoal transition-colors">
                      Annulla
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-ui font-medium text-charcoal-dark text-sm">{d.name}</span>
                    <span className="text-xs font-ui text-sage-light">{d.code}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-ui text-sage-light">
                      {d.sopPublished}/{d.sopTotal} SOP
                    </span>
                    <button onClick={() => handleStartEditDept(d)}
                      className="text-xs font-ui text-terracotta/50 hover:text-terracotta transition-colors">
                      Modifica
                    </button>
                    <button onClick={() => handleDeleteDept(d.id)}
                      className="text-xs font-ui text-alert-red/50 hover:text-alert-red transition-colors">
                      Rimuovi
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-ivory-dark/50">
          <input type="text" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="Nuovo reparto..." className="flex-1 text-sm" />
          <button onClick={handleAddDept} disabled={addingDept || !newDeptName.trim()}
            className="px-3 py-2 text-sm font-ui font-medium text-white bg-sage hover:bg-sage-dark  disabled:opacity-50 transition-colors">
            Aggiungi
          </button>
        </div>
      </section>

      {/* Operatori */}
      <section className="bg-ivory-medium border border-ivory-dark  p-5">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark mb-4">Utenti assegnati</h2>
        {property.operators.length === 0 ? (
          <p className="text-sm font-ui text-sage-light">Nessun utente assegnato</p>
        ) : (
          <div className="space-y-1">
            {property.operators.map((op) => {
              const badge = ROLE_BADGE[op.role] || { label: op.role, cls: "bg-ivory-dark text-charcoal" };
              const deptName = op.propertyAssignments[0]?.department?.name;
              return (
                <div key={op.id} className="flex items-center justify-between py-2 px-3 bg-ivory ">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-ui font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                    <Link href={`/users/${op.id}`} className="text-sm font-ui font-medium text-charcoal-dark hover:text-terracotta transition-colors">
                      {op.name}
                    </Link>
                  </div>
                  <span className="text-xs font-ui text-sage-light">{deptName || "Tutti i reparti"}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
