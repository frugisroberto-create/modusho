"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface SearchResult {
  id: string;
  title: string;
  type: string;
  snippet: string;
  rank: number;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "bg-sage text-white" },
  DOCUMENT: { label: "Documento", cls: "bg-mauve text-white" },
  MEMO: { label: "Memo", cls: "bg-terracotta/20 text-terracotta" },
};

export function SearchBar() {
  const { currentPropertyId } = useOperatorContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setTotal(0);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&propertyId=${currentPropertyId}&pageSize=8`
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.data);
          setTotal(json.meta.total);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [currentPropertyId]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(val), 300);
    },
    [search]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-[600px] mx-auto">
      <div className="relative">
        <svg
          className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-sage-light"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Cerca procedure, documenti, memo..."
          style={{ paddingLeft: 56 }}
          className="w-full h-[52px] pr-6 text-base font-body border border-ivory-dark rounded-full bg-ivory focus:border-terracotta focus:shadow-none"
        />
        {loading && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-ivory-dark border-t-terracotta rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-ivory-medium rounded-xl border border-ivory-dark overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {results.map((r) => {
            const badge = TYPE_BADGE[r.type] || { label: r.type, cls: "bg-ivory-dark text-charcoal" };
            return (
              <Link
                key={r.id}
                href={r.type === "MEMO" ? `/#comunicazioni` : `/${r.type.toLowerCase() === "sop" ? "sop" : "documents"}/${r.id}`}
                onClick={() => setOpen(false)}
                className="block px-5 py-3.5 hover:bg-ivory-dark/50 border-b border-ivory-dark/50 last:border-0 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-ui font-medium px-2 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="font-ui font-medium text-charcoal-dark text-sm">{r.title}</span>
                </div>
                <p
                  className="text-sm text-sage-light font-ui line-clamp-2 [&_mark]:bg-terracotta/20 [&_mark]:text-terracotta-dark [&_mark]:rounded-sm [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              </Link>
            );
          })}
          {total > results.length && (
            <div className="px-5 py-2.5 text-sm font-ui text-sage-light text-center bg-ivory-dark/30">
              {total} risultati totali
            </div>
          )}
        </div>
      )}

      {open && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-ivory-medium rounded-xl border border-ivory-dark p-8 text-center text-sage-light font-ui z-50">
          Nessun risultato per &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
