"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface BookItem {
  id: string; title: string; publishedAt: string | null;
  property: { id: string; name: string; code: string };
  acknowledged: boolean;
}

interface BookListProps {
  contentType: "BRAND_BOOK" | "STANDARD_BOOK";
  basePath: string;
  title: string;
}

export function BookList({ contentType, basePath, title }: BookListProps) {
  const { currentPropertyId } = useOperatorContext();
  const [items, setItems] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content?type=${contentType}&propertyId=${currentPropertyId}&status=PUBLISHED&pageSize=50`);
      if (res.ok) { const json = await res.json(); setItems(json.data); }
    } finally { setLoading(false); }
  }, [contentType, currentPropertyId]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  if (loading) {
    return (
      <div className="py-6 space-y-4">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">{title}</h1>
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}</div>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-5">
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark">{title}</h1>
      {items.length === 0 ? (
        <p className="text-sage-light font-ui text-sm text-center py-10">Nessun contenuto disponibile</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/${basePath}/${item.id}`}
              className="block bg-ivory-medium border border-ivory-dark p-5 hover:border-terracotta/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-ui font-medium px-2 py-0.5 rounded ${
                      contentType === "BRAND_BOOK" ? "bg-mauve text-white" : "bg-info-blue text-white"
                    }`}>
                      {contentType === "BRAND_BOOK" ? "Brand Book" : "Standard Book"}
                    </span>
                    {!item.acknowledged && (
                      <span className="text-xs font-ui font-medium px-2 py-0.5 rounded bg-terracotta/10 text-terracotta">Da leggere</span>
                    )}
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                  <div className="text-xs font-ui text-sage-light mt-1">
                    <span>{item.property.name}</span>
                    {item.publishedAt && <span className="ml-3">{new Date(item.publishedAt).toLocaleDateString("it-IT")}</span>}
                  </div>
                </div>
                <svg className="w-5 h-5 text-sage-light shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
