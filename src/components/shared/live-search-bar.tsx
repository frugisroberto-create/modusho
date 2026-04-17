"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { sanitizeHtml } from "@/lib/sanitize";

interface SearchResult {
  id: string;
  title: string;
  type: string;
  snippet: string;
  rank: number;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
  MEMO: { label: "Memo", cls: "badge-memo" },
  BRAND_BOOK: { label: "Brand Book", cls: "badge-brand-book" },
  STANDARD_BOOK: { label: "Standard Book", cls: "bg-info-blue text-white" },
};

function getDetailPath(type: string): string {
  if (type === "SOP") return "/sop";
  if (type === "MEMO") return "/comunicazioni";
  if (type === "BRAND_BOOK") return "/brand-book";
  if (type === "STANDARD_BOOK") return "/standard-book";
  return "/documents";
}

interface LiveSearchBarProps {
  propertyId?: string;
  contentType?: string;
  placeholder?: string;
}

export function LiveSearchBar({ propertyId, contentType, placeholder }: LiveSearchBarProps) {
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
      const params = new URLSearchParams({ q, pageSize: "8" });
      if (propertyId) params.set("propertyId", propertyId);
      if (contentType) params.set("type", contentType);
      const res = await fetch(`/api/search?${params}`, { cache: "no-store" });
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
  }, [query, propertyId, contentType]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset when filters change
  useEffect(() => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(null);
  }, [propertyId, contentType]);

  return (
    <div ref={containerRef} className="relative w-full">
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
          placeholder={placeholder || "Cerca nel contenuto..."}
          className="min-w-0 flex-1 px-5 py-3 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }}
        />
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="shrink-0 bg-terracotta text-white px-6 py-3 text-[12.6px] font-ui font-semibold uppercase tracking-wider hover:bg-terracotta-dark disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Cerca"}
        </button>
      </form>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-ivory-dark overflow-hidden z-50 max-h-[60vh] overflow-y-auto shadow-lg">
          {results.map((r) => {
            const badge = TYPE_BADGE[r.type] || { label: r.type, cls: "bg-ivory-dark text-charcoal" };
            const href = r.type === "MEMO" ? "/comunicazioni" : `${getDetailPath(r.type)}/${r.id}`;
            return (
              <Link
                key={r.id}
                href={href}
                onClick={() => setOpen(false)}
                className="block px-5 py-3 hover:bg-ivory/50 border-b border-ivory-dark/50 last:border-0 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="font-ui font-medium text-charcoal-dark text-sm">{r.title}</span>
                </div>
                <p
                  className="text-[12px] text-charcoal/50 font-ui line-clamp-2 [&_mark]:bg-terracotta/20 [&_mark]:text-terracotta-dark [&_mark]:rounded-sm [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.snippet) }}
                />
              </Link>
            );
          })}
          {total > results.length && (
            <div className="px-5 py-2 text-[11px] font-ui text-charcoal/40 text-center bg-ivory/50">
              {total} risultati totali
            </div>
          )}
        </div>
      )}

      {open && error && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-alert-red/30 p-6 text-center text-alert-red font-ui z-50 shadow-lg">
          {error}
        </div>
      )}

      {open && !error && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-ivory-dark p-6 text-center text-charcoal/40 font-ui z-50 shadow-lg">
          Nessun risultato per &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
