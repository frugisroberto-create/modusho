"use client";

import { useState, useEffect } from "react";

interface Property {
  id: string;
  name: string;
  tagline: string | null;
}

export function HooPropertyHero() {
  const [property, setProperty] = useState<Property | null>(null);

  useEffect(() => {
    async function fetchProperty() {
      try {
        const res = await fetch("/api/properties");
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            setProperty(json.data[0]);
          }
        }
      } catch {}
    }
    fetchProperty();
  }, []);

  if (!property) return null;

  return (
    <div className="flex flex-col items-center">
      {property.tagline && (
        <p className="text-xs font-ui uppercase tracking-[0.08em] text-charcoal/50 mb-3">
          {property.tagline}
        </p>
      )}
      <h1 className="text-[50px] font-heading font-medium text-terracotta text-center leading-[1.1]">
        {property.name}
      </h1>
    </div>
  );
}
