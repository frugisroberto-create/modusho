"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";
import { sanitizeHtml } from "@/lib/sanitize";

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
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&propertyId=${currentPropertyId}&pageSize=8`,
        { cache: "no-store" }
      );
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setError("Errore nella ricerca. Riprova.");
        setResults([]);
        setTotal(0);
        setOpen(true);
        return;
      }
      const json = await res.json();
      setResults(json.data);
      setTotal(json.meta.total);
      setOpen(true);
    } catch {
      setError("Errore di connessione. Riprova.");
      setResults([]);
      setTotal(0);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [query, currentPropertyId]);

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
    <div ref={containerRef} className="relative w-full max-w-[520px] mx-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex border border-ivory-dark bg-white"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Cerca SOP, documenti, memo..."
          className="min-w-0 flex-1 px-5 py-3.5 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }}
        />
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="shrink-0 bg-terracotta text-white px-6 py-3.5 text-[12.6px] font-ui font-semibold uppercase tracking-wider hover:bg-terracotta-dark disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Cerca"}
        </button>
      </form>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-ivory-medium border border-ivory-dark overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {results.map((r) => {
            const badge = TYPE_BADGE[r.type] || { label: r.type, cls: "bg-ivory-dark text-charcoal" };
            return (
              <Link
                key={r.id}
                href={
                  r.type === "MEMO" ? `/comunicazioni?open=${r.id}` :
                  r.type === "SOP" ? `/sop/${r.id}` :
                  r.type === "BRAND_BOOK" ? `/brand-book/${r.id}` :
                  r.type === "STANDARD_BOOK" ? `/standard-book/${r.id}` :
                  `/documents/${r.id}`
                }
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
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.snippet) }}
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

      {open && error && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-ivory-medium border border-alert-red/30 p-6 text-center text-alert-red font-ui z-50">
          {error}
        </div>
      )}

      {open && !error && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-ivory-medium border border-ivory-dark p-8 text-center text-sage-light font-ui z-50">
          Nessun risultato per &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
