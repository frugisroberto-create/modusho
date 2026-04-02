"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useHooContext } from "@/components/hoo/hoo-shell";

interface StaticDoc {
  id: string; type: string; title: string; fileUrl: string;
  property: { id: string; name: string; code: string } | null;
  uploadedAt: string;
}

interface ContentDoc {
  id: string; title: string; status: string; publishedAt: string | null; createdAt: string;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
}

interface Property { id: string; name: string; code: string }

const STATIC_TYPE_LABELS: Record<string, string> = {
  BRAND_BOOK: "Brand Book",
  STANDARD_BOOK: "Standard Book",
  DOCUMENT: "Documento",
};

export default function LibraryPage() {
  const { userRole } = useHooContext();
  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const isHm = userRole === "HOTEL_MANAGER";
  const canCreate = isHoo || isHm;

  // Static documents (Brand Book, Standard Book, PDF uploads)
  const [staticDocs, setStaticDocs] = useState<StaticDoc[]>([]);
  const [staticTotal, setStaticTotal] = useState(0);

  // Content documents (type=DOCUMENT, published)
  const [contentDocs, setContentDocs] = useState<ContentDoc[]>([]);
  const [contentTotal, setContentTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("BRAND_BOOK");
  const [uploadPropertyId, setUploadPropertyId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pageSize = 20;

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) { const json = await res.json(); setProperties(json.data); }
    }
    fetchProps();
  }, []);

  // HM: pre-seleziona property
  useEffect(() => {
    if (!isHoo && properties.length > 0) {
      if (!uploadPropertyId) setUploadPropertyId(properties[0].id);
      if (!propertyFilter) setPropertyFilter(properties[0].id);
    }
  }, [isHoo, properties, uploadPropertyId, propertyFilter]);

  const fetchData = useCallback(async () => {
    // Non-HOO: aspetta che propertyFilter sia settato
    if (!isHoo && !propertyFilter) return;

    setLoading(true);
    try {
      // Fetch static documents (Brand Book, Standard Book, PDF uploads)
      const staticParams = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
      if (isHm) staticParams.set("type", "DOCUMENT");
      if (propertyFilter) staticParams.set("propertyId", propertyFilter);
      const staticRes = await fetch(`/api/static-documents?${staticParams}`);
      if (staticRes.ok) {
        const json = await staticRes.json();
        setStaticDocs(json.data);
        setStaticTotal(json.meta.total);
      }

      // Fetch content documents (type=DOCUMENT)
      const contentParams = new URLSearchParams({
        type: "DOCUMENT", status: showArchived ? "ARCHIVED" : "PUBLISHED", page: page.toString(), pageSize: pageSize.toString(),
      });
      if (propertyFilter) contentParams.set("propertyId", propertyFilter);
      const contentRes = await fetch(`/api/content?${contentParams}`);
      if (contentRes.ok) {
        const json = await contentRes.json();
        setContentDocs(json.data);
        setContentTotal(json.meta.total);
      }
    } finally { setLoading(false); }
  }, [page, propertyFilter, showArchived, isHm, isHoo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [propertyFilter, showArchived]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadTitle.trim()) return;
    setUploadError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", uploadTitle);
    formData.append("type", isHm ? "DOCUMENT" : uploadType);
    if (uploadPropertyId) formData.append("propertyId", uploadPropertyId);
    try {
      const res = await fetch("/api/static-documents", { method: "POST", body: formData });
      if (res.ok) {
        setShowUpload(false); setUploadTitle(""); setUploadError("");
        if (fileRef.current) fileRef.current.value = "";
        fetchData();
      } else {
        const json = await res.json();
        setUploadError(json.error || "Errore nel caricamento");
      }
    } finally { setUploading(false); }
  };

  const handleDelete = async (docId: string) => {
    const res = await fetch(`/api/static-documents/${docId}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">Documenti</h1>
        {canCreate && (
          <Link href="/library/new" className="btn-primary">Nuovo documento</Link>
        )}
      </div>

      {/* Filtri */}
      <div className="flex gap-3 items-end">
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
          className="text-sm font-ui border border-ivory-dark px-3 py-2 bg-white">
          {isHoo && <option value="">Tutte le strutture</option>}
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-ivory-dark bg-white cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
          <span className="text-sm font-ui text-charcoal">Archiviati</span>
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}</div>
      ) : (
        <>
          {/* Documenti testuali (Content type DOCUMENT) */}
          {contentDocs.length > 0 && (
            <section>
              <h2 className="text-sm font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-2">Documenti</h2>
              <div className="bg-white border border-ivory-dark">
                {contentDocs.map((doc, index) => (
                  <Link key={doc.id} href={`/documents/${doc.id}`}
                    className={`flex items-center justify-between px-5 py-4 hover:bg-ivory/50 transition-colors ${index < contentDocs.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-[#E3F2FD] text-[#1565C0]">Documento</span>
                        {doc.department && <span className="text-[11px] font-ui text-charcoal/45">{doc.department.name}</span>}
                      </div>
                      <h3 className="font-ui font-medium text-charcoal-dark text-sm">{doc.title}</h3>
                      <div className="text-[11px] font-ui text-charcoal/45 mt-1">
                        {doc.property.name}
                        {doc.publishedAt && <span> &middot; {new Date(doc.publishedAt).toLocaleDateString("it-IT")}</span>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-charcoal/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* File PDF (static documents) */}
          {staticDocs.length > 0 && (
            <section>
              <h2 className="text-sm font-ui font-semibold uppercase tracking-wider text-charcoal/50 mb-2">
                {isHoo ? "Brand Book e Standard Book" : "File PDF"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {staticDocs.map((doc) => (
                  <div key={doc.id} className="bg-white border border-ivory-dark p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${
                        doc.type === "BRAND_BOOK" ? "bg-[#EDE7F6] text-[#5E35B1]" : doc.type === "DOCUMENT" ? "bg-[#E3F2FD] text-[#1565C0]" : "bg-[#E8F5E9] text-[#2E7D32]"
                      }`}>{STATIC_TYPE_LABELS[doc.type] || doc.type}</span>
                      {isHoo && (
                        <button onClick={() => handleDelete(doc.id)} className="text-xs font-ui text-alert-red hover:underline">Elimina</button>
                      )}
                    </div>
                    <div>
                      <h3 className="font-ui font-medium text-charcoal-dark text-sm">{doc.title}</h3>
                      <p className="text-[11px] font-ui text-charcoal/45 mt-1">
                        {doc.property ? doc.property.name : "Tutto il gruppo"} &middot; {new Date(doc.uploadedAt).toLocaleDateString("it-IT")}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <button onClick={() => setPreviewUrl(doc.fileUrl)}
                        className="flex-1 px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors text-center">
                        Visualizza
                      </button>
                      <a href={doc.fileUrl} download
                        className="flex-1 px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/60 border border-ivory-dark hover:bg-ivory-dark transition-colors text-center">
                        Scarica
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {contentDocs.length === 0 && staticDocs.length === 0 && (
            <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessun documento</p>
          )}
        </>
      )}

      {/* PDF Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-6">
          <div className="bg-white w-full max-w-4xl h-[80vh] flex flex-col border border-ivory-dark">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ivory-dark">
              <h3 className="text-sm font-ui font-semibold text-charcoal-dark">Anteprima PDF</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-sm font-ui text-charcoal/50 hover:text-charcoal">Chiudi</button>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full" title="PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
}
