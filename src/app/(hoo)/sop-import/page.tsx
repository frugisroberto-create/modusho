"use client";

import { useState, useRef } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";
import { redirect } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";

interface ManifestRow {
  titolo: string;
  file: string;
  struttura: string;
  reparto: string;
}

interface ImportResult {
  imported: number;
  errors: { row: number; file: string; error: string }[];
  warnings: { row: number; message: string }[];
  mode?: string;
}

export default function SopImportPage() {
  const { userRole } = useHooContext();

  if (userRole && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
    redirect("/hoo-sop");
  }

  const [manifestRows, setManifestRows] = useState<ManifestRow[]>([]);
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Detect import mode ──
  const fileExtensions = new Set(
    uploadedFiles.map((f) => f.name.split(".").pop()?.toLowerCase())
  );
  const hasMixedExtensions = fileExtensions.size > 1;
  const detectedMode: "html" | "docx" | null = uploadedFiles.length === 0
    ? null
    : fileExtensions.has("html") ? "html" : "docx";

  // ── Handle manifest upload ──
  const handleManifest = async (file: File) => {
    setManifestFile(file);
    setResult(null);
    setClientErrors([]);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setClientErrors(["Il manifest non contiene fogli"]); return; }
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
      setManifestRows(
        rows.map((r) => ({
          titolo: (r["titolo"] || "").trim(),
          file: (r["file"] || "").trim(),
          struttura: (r["struttura"] || "").trim(),
          reparto: (r["reparto"] || "").trim(),
        }))
      );
    } catch {
      setClientErrors(["Errore nella lettura del file Excel"]);
    }
  };

  // ── Handle file upload ──
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setUploadedFiles(Array.from(files));
    setResult(null);
  };

  // ── Client-side validation ──
  const fileNames = new Set(uploadedFiles.map((f) => f.name.toLowerCase()));
  const missingFiles = manifestRows
    .filter((r) => r.file && !fileNames.has(r.file.toLowerCase()))
    .map((r) => r.file);
  const validRows = manifestRows.filter((r) => r.titolo && r.file && r.struttura && r.reparto);
  const matchedFiles = validRows.filter((r) => fileNames.has(r.file.toLowerCase())).length;

  const canImport = manifestFile && uploadedFiles.length > 0 && validRows.length > 0
    && missingFiles.length === 0 && !hasMixedExtensions;

  // ── Import ──
  const handleImport = async () => {
    if (!manifestFile || !canImport) return;
    setImporting(true);
    setResult(null);
    setClientErrors([]);

    try {
      const formData = new FormData();
      formData.append("manifest", manifestFile);
      for (const f of uploadedFiles) {
        formData.append("files", f);
      }
      const res = await fetch("/api/sop-import", { method: "POST", body: formData });
      const json = await res.json();
      if (res.ok) {
        setResult(json.data);
      } else {
        setClientErrors([json.error || "Errore durante l'importazione"]);
      }
    } catch {
      setClientErrors(["Errore di rete durante l'importazione"]);
    } finally {
      setImporting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">Importa SOP</h1>
        <Link href="/hoo-sop" className="text-sm font-ui text-charcoal/50 hover:text-charcoal transition-colors">
          Torna alla lista
        </Link>
      </div>

      {/* ── Step 1: Template ── */}
      <div className="bg-ivory border border-ivory-dark p-5 space-y-2">
        <h2 className="text-sm font-ui font-semibold text-charcoal-dark">1. Template Word</h2>
        <p className="text-xs font-ui text-charcoal/50">
          Scarica il template Word standard per la redazione delle SOP.
        </p>
        <a href="/templates/template-sop.docx" download
          className="inline-block text-xs font-ui font-semibold text-terracotta border border-terracotta/30 px-4 py-2 hover:bg-terracotta hover:text-white transition-colors">
          Scarica template
        </a>
      </div>

      {/* ── Step 2: Manifest ── */}
      <div className="bg-white border border-ivory-dark p-5 space-y-3">
        <h2 className="text-sm font-ui font-semibold text-charcoal-dark">2. Carica manifest Excel</h2>
        <p className="text-xs font-ui text-charcoal/50">
          File <code className="bg-ivory px-1">.xlsx</code> con colonne: <strong>titolo</strong>, <strong>file</strong>, <strong>struttura</strong>, <strong>reparto</strong>
        </p>
        <input type="file" accept=".xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && handleManifest(e.target.files[0])}
          className="text-sm font-ui" />

        {/* Anteprima manifest */}
        {manifestRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-ui">
              <thead>
                <tr className="bg-ivory border-b border-ivory-dark text-left">
                  <th className="px-3 py-2 text-charcoal/50">#</th>
                  <th className="px-3 py-2 text-charcoal/50">Titolo</th>
                  <th className="px-3 py-2 text-charcoal/50">File</th>
                  <th className="px-3 py-2 text-charcoal/50">Struttura</th>
                  <th className="px-3 py-2 text-charcoal/50">Reparto</th>
                </tr>
              </thead>
              <tbody>
                {manifestRows.map((r, i) => (
                  <tr key={i} className="border-b border-ivory-medium">
                    <td className="px-3 py-2 text-charcoal/40">{i + 2}</td>
                    <td className="px-3 py-2 text-charcoal-dark">{r.titolo || <span className="text-alert-red">mancante</span>}</td>
                    <td className="px-3 py-2 text-charcoal">{r.file || <span className="text-alert-red">mancante</span>}</td>
                    <td className="px-3 py-2 text-charcoal">{r.struttura || <span className="text-alert-red">mancante</span>}</td>
                    <td className="px-3 py-2 text-charcoal">{r.reparto || <span className="text-alert-red">mancante</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Step 3: Files ── */}
      <div className="bg-white border border-ivory-dark p-5 space-y-3">
        <h2 className="text-sm font-ui font-semibold text-charcoal-dark">3. Carica file SOP</h2>
        <p className="text-xs font-ui text-charcoal/50">
          Seleziona i file <code className="bg-ivory px-1">.docx</code> o <code className="bg-ivory px-1">.html</code> referenziati nel manifest. Tutti i file devono avere la stessa estensione.
        </p>
        <input ref={fileInputRef} type="file" multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="text-sm font-ui" />

        {uploadedFiles.length > 0 && (
          <div className="space-y-1">
            {uploadedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-ui text-charcoal/70">
                <span className="text-charcoal-dark">{f.name}</span>
                <span className="text-charcoal/40">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Mode badge */}
        {uploadedFiles.length > 0 && !hasMixedExtensions && detectedMode && (
          <div className="inline-block text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-1 bg-[#E3F2FD] text-[#1565C0]">
            Modalità: {detectedMode === "html" ? "HTML (import diretto)" : "DOCX (conversione automatica)"}
          </div>
        )}

        {/* Mixed extensions error */}
        {hasMixedExtensions && (
          <div className="text-xs font-ui px-3 py-2 border-l-4 border-l-alert-red bg-alert-red/5 text-alert-red">
            Errore: tutti i file devono avere la stessa estensione (.docx o .html)
          </div>
        )}

        {/* Validation summary */}
        {manifestRows.length > 0 && uploadedFiles.length > 0 && !hasMixedExtensions && (
          <div className={`text-xs font-ui px-3 py-2 border-l-4 ${missingFiles.length > 0 ? "border-l-alert-red bg-alert-red/5 text-alert-red" : "border-l-sage bg-sage/5 text-sage"}`}>
            {missingFiles.length > 0 ? (
              <>
                <p className="font-semibold">File mancanti:</p>
                {missingFiles.map((f, i) => <p key={i}>— {f}</p>)}
              </>
            ) : (
              <p>{validRows.length} SOP da importare, {matchedFiles} file trovati</p>
            )}
          </div>
        )}
      </div>

      {/* ── Errors ── */}
      {clientErrors.length > 0 && (
        <div className="text-sm font-ui text-alert-red space-y-1">
          {clientErrors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* ── Import button ── */}
      {!result && (
        <>
          <button onClick={handleImport} disabled={!canImport || importing}
            className="btn-primary disabled:opacity-50">
            {importing ? "Importazione in corso..." : "Importa SOP"}
          </button>
          {!canImport && (manifestFile || uploadedFiles.length > 0) && (
            <div className="text-xs font-ui text-charcoal/40 space-y-0.5">
              {!manifestFile && <p>— Carica il manifest Excel</p>}
              {uploadedFiles.length === 0 && <p>— Carica i file SOP</p>}
              {validRows.length === 0 && manifestRows.length > 0 && <p>— Nessuna riga valida nel manifest</p>}
              {missingFiles.length > 0 && <p>— {missingFiles.length} file referenziati nel manifest non trovati tra i caricati</p>}
              {hasMixedExtensions && <p>— I file hanno estensioni diverse (.docx e .html mescolati)</p>}
            </div>
          )}
        </>
      )}

      {/* ── Result ── */}
      {result && (
        <div className="space-y-4">
          <div className={`px-5 py-4 border-l-4 ${result.imported > 0 ? "border-l-sage bg-sage/5" : "border-l-alert-red bg-alert-red/5"}`}>
            <p className="text-sm font-ui font-semibold text-charcoal-dark">
              {result.imported} SOP importate con successo
              {result.mode && <span className="text-charcoal/50 font-normal"> (modalità {result.mode})</span>}
            </p>
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-[#FFF8E1] border border-[#FFE082] p-4 space-y-1">
              <p className="text-xs font-ui font-semibold text-[#F57F17]">Warning ({result.warnings.length})</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs font-ui text-[#F57F17]/80">
                  Riga {w.row}: {w.message}
                </p>
              ))}
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="bg-alert-red/5 border border-alert-red/20 p-4 space-y-1">
              <p className="text-xs font-ui font-semibold text-alert-red">Errori ({result.errors.length})</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs font-ui text-alert-red/80">
                  Riga {e.row} ({e.file}): {e.error}
                </p>
              ))}
            </div>
          )}

          <Link href="/hoo-sop"
            className="inline-block text-sm font-ui font-semibold text-terracotta border border-terracotta/30 px-5 py-2.5 hover:bg-terracotta hover:text-white transition-colors">
            Vai alla lista SOP
          </Link>
        </div>
      )}
    </div>
  );
}
