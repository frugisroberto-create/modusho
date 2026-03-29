"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PropertyItem {
  id: string; name: string; code: string; tagline: string | null; city: string;
  logoUrl: string | null; sopTotal: number; sopPublished: number; ackRate: number | null;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      const res = await fetch("/api/properties");
      if (res.ok) { const json = await res.json(); setProperties(json.data); }
      setLoading(false);
    }
    fetch_();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Strutture</h1>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-52 skeleton" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Strutture</h1>
        <Link href="/properties/new"
          className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light rounded-lg transition-colors">
          Aggiungi struttura
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`}
            className="group bg-ivory border border-sage/20 rounded-xl p-6 hover:border-terracotta/40 transition-all flex flex-col">
            {/* Tagline + Nome stile hocollection.com */}
            <div className="mb-4">
              {p.tagline && (
                <p className="text-[11px] font-ui font-medium uppercase tracking-[0.2em] text-sage mb-1.5">
                  {p.tagline}
                </p>
              )}
              <h2 className="text-2xl font-heading font-semibold text-terracotta leading-tight group-hover:text-terracotta-light transition-colors">
                {p.name}
              </h2>
            </div>

            {/* Città */}
            <p className="text-sm font-ui text-sage-light mb-4">{p.city}</p>

            {/* KPI */}
            <div className="mt-auto pt-4 border-t border-ivory-dark space-y-2">
              <div className="flex items-center justify-between text-sm font-ui">
                <span className="text-sage-light">SOP</span>
                <span className="text-charcoal-dark font-medium">{p.sopPublished}/{p.sopTotal}</span>
              </div>
              {p.ackRate !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-ui">
                    <span className="text-sage-light">Presa visione</span>
                    <span className="text-charcoal font-medium">{p.ackRate}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-ivory-dark rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${p.ackRate}%` }} />
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
