"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";
import { MobileHide } from "@/components/mobile-hide";
import { LiveSearchBar } from "@/components/shared/live-search-bar";

const HOO_CREATE_PATHS: Record<string, string> = {
  STANDARD_BOOK: "/hoo-standard-book/new",
  BRAND_BOOK: "/hoo-brand-book/new",
};

interface BookItem {
  id: string; title: string; publishedAt: string | null;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  acknowledged: boolean;
}

interface Department { id: string; name: string; code: string }

interface BookListProps {
  contentType: "BRAND_BOOK" | "STANDARD_BOOK";
  basePath: string;
  title: string;
}

const HOO_EDIT_PATHS: Record<string, string> = {
  STANDARD_BOOK: "/hoo-standard-book",
  BRAND_BOOK: "/hoo-brand-book",
};

export function BookList({ contentType, basePath, title }: BookListProps) {
  const { currentPropertyId, userRole } = useOperatorContext();
  const needsDeptFilter = contentType === "STANDARD_BOOK" && (userRole === "OPERATOR" || userRole === "HOD");
  const canCreate = (userRole === "ADMIN" || userRole === "SUPER_ADMIN") && HOO_CREATE_PATHS[contentType];
  const canEdit = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const [items, setItems] = useState<BookItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Carica i reparti accessibili per OPERATOR/HOD
  useEffect(() => {
    if (!needsDeptFilter) return;
    async function fetchDepts() {
      const res = await fetch(`/api/my-departments?propertyId=${currentPropertyId}`);
      if (res.ok) { const json = await res.json(); setDepartments(json.data); }
    }
    fetchDepts();
  }, [needsDeptFilter, currentPropertyId]);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: contentType, propertyId: currentPropertyId, status: "PUBLISHED", pageSize: "50",
      });

      // OPERATOR/HOD: filtra per i propri reparti
      if (needsDeptFilter && departments.length > 0) {
        const baseRes = await fetch(`/api/content?${params}`);
        if (baseRes.ok) {
          const json = await baseRes.json();
          const deptIds = new Set(departments.map(d => d.id));
          const filtered = json.data.filter((item: BookItem) =>
            !item.department || deptIds.has(item.department.id)
          );
          setItems(filtered);
        }
      } else {
        const res = await fetch(`/api/content?${params}`);
        if (res.ok) { const json = await res.json(); setItems(json.data); }
      }
    } finally { setLoading(false); }
  }, [contentType, currentPropertyId, needsDeptFilter, departments]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) setItems(prev => prev.filter(i => i.id !== id));
    } finally { setDeleting(null); setConfirmDeleteId(null); }
  };

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">{title}</h1>
        {canCreate && <MobileHide><Link href={HOO_CREATE_PATHS[contentType]} className="btn-primary">Nuova sezione</Link></MobileHide>}
      </div>

      {/* Ricerca full-text con navigazione diretta */}
      <LiveSearchBar
        propertyId={currentPropertyId}
        contentType={contentType}
        placeholder={`Cerca nel ${title.toLowerCase()}...`}
      />

      {items.length === 0 ? (
        <p className="text-sage-light font-ui text-sm text-center py-10">Nessun contenuto disponibile</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-ivory-medium border border-ivory-dark p-5 hover:border-terracotta/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/${basePath}/${item.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-ui font-medium px-2 py-0.5 ${
                      contentType === "BRAND_BOOK" ? "bg-mauve text-white" : "bg-info-blue text-white"
                    }`}>
                      {contentType === "BRAND_BOOK" ? "Brand Book" : "Standard Book"}
                    </span>
                    {item.department && (
                      <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>
                    )}
                    {!item.department && contentType === "STANDARD_BOOK" && (
                      <span className="text-[11px] font-ui text-charcoal/35 italic">Trasversale</span>
                    )}
                    {!item.acknowledged && (
                      <span className="text-xs font-ui font-medium px-2 py-0.5 bg-terracotta/10 text-terracotta">Da leggere</span>
                    )}
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                  <div className="text-xs font-ui text-sage-light mt-1">
                    <span>{item.property.name}</span>
                    {item.publishedAt && <span className="ml-3">{new Date(item.publishedAt).toLocaleDateString("it-IT")}</span>}
                  </div>
                </Link>
                {canEdit ? (
                  <MobileHide><div className="flex items-center gap-2 shrink-0 ml-3">
                    <Link href={`${HOO_EDIT_PATHS[contentType]}/${item.id}/edit`}
                      className="px-3 py-1.5 text-[11px] font-ui font-semibold text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
                      Modifica
                    </Link>
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id}
                          className="px-3 py-1.5 text-[11px] font-ui font-semibold text-white bg-alert-red hover:bg-alert-red/90 transition-colors disabled:opacity-50">
                          {deleting === item.id ? "..." : "Conferma"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 text-[11px] font-ui text-charcoal/50 hover:text-charcoal transition-colors">
                          No
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(item.id)}
                        className="px-3 py-1.5 text-[11px] font-ui font-medium text-alert-red border border-alert-red/30 hover:bg-alert-red hover:text-white transition-colors">
                        Elimina
                      </button>
                    )}
                  </div></MobileHide>
                ) : (
                  <svg className="w-5 h-5 text-sage-light shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
