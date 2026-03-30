"use client";

import { useOperatorContext } from "./operator-shell";

export function PropertyHero() {
  const { currentPropertyId, properties } = useOperatorContext();
  const property = properties.find((p) => p.id === currentPropertyId);

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
