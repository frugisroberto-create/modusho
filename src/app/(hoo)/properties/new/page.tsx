"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_DEPTS = [
  { name: "Front Office", code: "FO", checked: true },
  { name: "Room Division", code: "RM", checked: true },
  { name: "F&B", code: "FB", checked: true },
  { name: "Maintenance", code: "MT", checked: true },
  { name: "Spa/Wellness", code: "SP", checked: true },
  { name: "Back of House", code: "QA", checked: true },
];

export default function NewPropertyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [depts, setDepts] = useState(DEFAULT_DEPTS.map(d => ({ ...d })));
  const [customDeptName, setCustomDeptName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleDept = (idx: number) => {
    setDepts(prev => prev.map((d, i) => i === idx ? { ...d, checked: !d.checked } : d));
  };

  const addCustomDept = () => {
    if (!customDeptName.trim()) return;
    setDepts(prev => [...prev, { name: customDeptName, code: customDeptName.substring(0, 3).toUpperCase(), checked: true }]);
    setCustomDeptName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !city.trim()) {
      setError("Nome e città sono obbligatori");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, tagline: tagline || undefined,
          city, address: address || undefined, description: description || undefined,
          website: website || undefined,
          departmentCodes: depts.filter(d => d.checked).map(d => ({ name: d.name, code: d.code })),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        router.push(`/properties/${json.data.id}`);
      } else {
        const json = await res.json();
        setError(json.error || "Errore nella creazione");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">Nuova struttura</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info base */}
        <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Informazioni</h2>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Nome *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full" placeholder="The Nicolaus Hotel" />
            <p className="text-xs font-ui text-sage-light mt-1">Il codice struttura verrà generato automaticamente</p>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Tagline</label>
            <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} className="w-full" placeholder="Your business destination" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Città *</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} required className="w-full" placeholder="Bari" />
            </div>
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Sito web</label>
              <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full" placeholder="thenicolaushotel.com" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Indirizzo</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full" placeholder="Via Cardinale Agostino Ciasca, 27" />
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Descrizione</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full" placeholder="Descrizione della struttura..." />
          </div>
        </section>

        {/* Reparti */}
        <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
          <h2 className="text-base font-heading font-semibold text-charcoal-dark">Reparti iniziali</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {depts.map((d, i) => (
              <label key={i} className="flex items-center gap-2 py-1.5 cursor-pointer">
                <input type="checkbox" checked={d.checked} onChange={() => toggleDept(i)}
                  className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
                <span className="text-sm font-ui text-charcoal">{d.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-ivory-dark/50">
            <input type="text" value={customDeptName} onChange={(e) => setCustomDeptName(e.target.value)}
              placeholder="Reparto personalizzato..." className="flex-1 text-sm" />
            <button type="button" onClick={addCustomDept}
              className="px-3 py-2 text-sm font-ui text-sage hover:bg-sage/10  transition-colors">
              Aggiungi
            </button>
          </div>
        </section>

        {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
            {loading ? "Creazione..." : "Salva"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-outline">
            Annulla
          </button>
        </div>
      </form>
    </div>
  );
}
