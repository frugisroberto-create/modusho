"use client";

import { useOperatorContext } from "./operator-shell";

export function PropertyHero() {
  const { currentPropertyId, properties } = useOperatorContext();
  const property = properties.find((p) => p.id === currentPropertyId);

  if (!property) return null;

  return (
    <div className="flex flex-col items-center">
      <h1 className="text-3xl sm:text-4xl font-heading font-semibold text-terracotta text-center leading-tight">
        {property.name}
      </h1>
      {property.tagline && (
        <p className="text-sm font-ui font-medium uppercase tracking-[0.2em] text-terracotta mt-2">
          {property.tagline}
        </p>
      )}
    </div>
  );
}
