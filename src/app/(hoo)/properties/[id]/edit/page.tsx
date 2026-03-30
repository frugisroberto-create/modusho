"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface PropertyData {
  id: string; name: string; code: string; tagline: string | null; city: string;
  address: string | null; description: string | null; website: string | null;
  logoUrl: string | null; isActive: boolean;
}

export default function EditPropertyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetch_() {
      const res = await fetch(`/api/properties/${id}`);
      if (res.ok) {
        const json = await res.json();
        const p = json.data;
        setProperty(p);
        setName(p.name); setTagline(p.tagline || ""); setCity(p.city);
        setAddress(p.address || ""); setDescription(p.description || "");
        setWebsite(p.website || ""); setIsActive(p.isActive);
      }
      setLoading(false);
    }
    fetch_();
  }, [id]);

  const handleSave = async () => {
    setError("");
    if (!name.trim() || !city.trim()) { setError("Nome e città obbligatori"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, tagline: tagline || null, city, address: address || null,
          description: description || null, website: website || null, isActive,
        }),
      });
      if (res.ok) { router.push(`/properties/${id}`); router.refresh(); }
      else { const json = await res.json(); setError(json.error || "Errore"); }
    } finally { setSaving(false); }
  };

  if (loading) return <div className="h-40 skeleton" />;
  if (!property) return <p className="text-sage-light font-ui">Struttura non trovata</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">Modifica — {property.name}</h1>
      <div className="space-y-6">
        <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Nome</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Codice</label>
              <input type="text" value={property.code} disabled className="w-full opacity-50 cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Tagline</label>
            <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} className="w-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Città</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Sito web</label>
              <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Indirizzo</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Descrizione</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full" />
          </div>
          <label className="flex items-center gap-2 text-sm font-ui text-charcoal pt-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            Struttura attiva
          </label>
        </section>

        {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
          <button onClick={() => router.back()}
            className="px-6 py-3 text-sm font-ui text-charcoal hover:bg-ivory-dark  transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
