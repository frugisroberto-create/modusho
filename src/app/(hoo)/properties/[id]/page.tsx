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
  address: string | null; description: string | null; website: string | null; logoUrl: string | null;
  isActive: boolean; departments: Department[]; operators: Operator[];
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "SA", cls: "bg-charcoal-dark text-white" },
  ADMIN: { label: "Admin", cls: "bg-sage text-white" },
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
    const res = await fetch(`/api/properties/${id}/departments/${depId}`, { method: "DELETE" });
    if (res.ok) fetchProperty();
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
            className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light rounded-lg transition-colors">
            Modifica
          </Link>
          <button onClick={() => router.push("/properties")}
            className="px-4 py-2 text-sm font-ui text-sage-light hover:text-charcoal transition-colors">Indietro</button>
        </div>
      </div>

      {/* Reparti */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-5">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark mb-4">Reparti</h2>
        <div className="space-y-2">
          {property.departments.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2.5 px-3 bg-ivory rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-ui font-medium text-charcoal-dark text-sm">{d.name}</span>
                <span className="text-xs font-ui text-sage-light">{d.code}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-ui text-sage-light">
                  {d.sopPublished}/{d.sopTotal} SOP
                </span>
                <button onClick={() => handleDeleteDept(d.id)}
                  className="text-xs font-ui text-alert-red/50 hover:text-alert-red transition-colors">
                  Rimuovi
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-ivory-dark/50">
          <input type="text" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="Nuovo reparto..." className="flex-1 text-sm" />
          <button onClick={handleAddDept} disabled={addingDept || !newDeptName.trim()}
            className="px-3 py-2 text-sm font-ui font-medium text-white bg-sage hover:bg-sage-dark rounded-lg disabled:opacity-50 transition-colors">
            Aggiungi
          </button>
        </div>
      </section>

      {/* Operatori */}
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-5">
        <h2 className="text-base font-heading font-semibold text-charcoal-dark mb-4">Utenti assegnati</h2>
        {property.operators.length === 0 ? (
          <p className="text-sm font-ui text-sage-light">Nessun utente assegnato</p>
        ) : (
          <div className="space-y-1">
            {property.operators.map((op) => {
              const badge = ROLE_BADGE[op.role] || { label: op.role, cls: "bg-ivory-dark text-charcoal" };
              const deptName = op.propertyAssignments[0]?.department?.name;
              return (
                <div key={op.id} className="flex items-center justify-between py-2 px-3 bg-ivory rounded-lg">
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
