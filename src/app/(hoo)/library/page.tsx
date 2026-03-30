"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface StaticDoc {
  id: string; type: string; title: string; fileUrl: string;
  property: { id: string; name: string; code: string } | null;
  uploadedAt: string;
}

interface Property { id: string; name: string; code: string }

export default function LibraryPage() {
  const [docs, setDocs] = useState<StaticDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("BRAND_BOOK");
  const [uploadPropertyId, setUploadPropertyId] = useState("");
  const [uploading, setUploading] = useState(false);
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

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (typeFilter) params.set("type", typeFilter);
    if (propertyFilter) params.set("propertyId", propertyFilter);
    try {
      const res = await fetch(`/api/static-documents?${params}`);
      if (res.ok) { const json = await res.json(); setDocs(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [page, typeFilter, propertyFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => { setPage(1); }, [typeFilter, propertyFilter]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadTitle.trim()) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", uploadTitle);
    formData.append("type", uploadType);
    if (uploadPropertyId) formData.append("propertyId", uploadPropertyId);
    try {
      const res = await fetch("/api/static-documents", { method: "POST", body: formData });
      if (res.ok) {
        setShowUpload(false);
        setUploadTitle("");
        if (fileRef.current) fileRef.current.value = "";
        fetchDocs();
      }
    } finally { setUploading(false); }
  };

  const handleDelete = async (docId: string) => {
    const res = await fetch(`/api/static-documents/${docId}`, { method: "DELETE" });
    if (res.ok) fetchDocs();
  };

  const totalPages = Math.ceil(total / pageSize);
  const typeLabels: Record<string, string> = { BRAND_BOOK: "Brand Book", STANDARD_BOOK: "Standard Book" };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Libreria</h1>
        <button onClick={() => setShowUpload(!showUpload)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 ">
          Carica documento
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white  border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Nuovo documento</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Titolo</label>
              <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
                className="w-full px-3 py-2 border  text-sm" placeholder="Titolo del documento" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tipo</label>
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                className="w-full px-3 py-2 border  text-sm bg-white">
                <option value="BRAND_BOOK">Brand Book</option>
                <option value="STANDARD_BOOK">Standard Book</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Struttura (opzionale)</label>
              <select value={uploadPropertyId} onChange={(e) => setUploadPropertyId(e.target.value)}
                className="w-full px-3 py-2 border  text-sm bg-white">
                <option value="">Tutto il gruppo</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">File PDF</label>
              <input type="file" accept=".pdf" ref={fileRef}
                className="w-full px-3 py-1.5 border  text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleUpload} disabled={uploading || !uploadTitle.trim()}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700  disabled:opacity-50">
              {uploading ? "Caricamento..." : "Carica"}
            </button>
            <button onClick={() => setShowUpload(false)} className="px-4 py-2 text-sm text-gray-500">Annulla</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-300  px-3 py-2 bg-white">
          <option value="">Tutti i tipi</option>
          <option value="BRAND_BOOK">Brand Book</option>
          <option value="STANDARD_BOOK">Standard Book</option>
        </select>
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
          className="text-sm border border-gray-300  px-3 py-2 bg-white">
          <option value="">Tutte le strutture</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Documents grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200  animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Nessun documento nella libreria</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <div key={doc.id} className="bg-white  border border-gray-200 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    doc.type === "BRAND_BOOK" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"
                  }`}>{typeLabels[doc.type] || doc.type}</span>
                </div>
                <button onClick={() => handleDelete(doc.id)} className="text-xs text-red-400 hover:text-red-600">Elimina</button>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 text-sm">{doc.title}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {doc.property ? doc.property.name : "Tutto il gruppo"} &middot; {new Date(doc.uploadedAt).toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex gap-2 mt-auto">
                <button onClick={() => setPreviewUrl(doc.fileUrl)}
                  className="flex-1 px-3 py-1.5 text-xs text-center text-blue-600 border border-blue-200  hover:bg-blue-50">
                  Visualizza
                </button>
                <a href={doc.fileUrl} download
                  className="flex-1 px-3 py-1.5 text-xs text-center text-gray-600 border border-gray-200  hover:bg-gray-50">
                  Scarica
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border  hover:bg-gray-50 disabled:opacity-50">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border  hover:bg-gray-50 disabled:opacity-50">Successivo</button>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white  shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-900">Anteprima PDF</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-sm text-gray-500 hover:text-gray-700">Chiudi</button>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full" title="PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
}
