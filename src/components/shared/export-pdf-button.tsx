"use client";

export function ExportPdfButton({ contentId }: { contentId: string }) {
  return (
    <button
      onClick={() => window.open(`/api/print/${contentId}`, "_blank")}
      className="btn-outline-sm"
    >
      Stampa
    </button>
  );
}
