"use client";

export function ExportPdfButton({ contentId }: { contentId: string }) {
  return (
    <button
      onClick={() => window.open(`/api/print/${contentId}`, "_blank")}
      className="btn-outline-sm hidden sm:inline-flex"
    >
      Stampa
    </button>
  );
}
