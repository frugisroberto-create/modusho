"use client";

export function PrintTrigger() {
  return (
    <div className="print-actions" style={{ textAlign: "right", padding: "16px 40px 0", maxWidth: 700, margin: "0 auto" }}>
      <button
        onClick={() => window.print()}
        style={{
          fontFamily: "var(--font-ui), sans-serif",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: 1,
          color: "#964733",
          border: "1px solid rgba(150,71,51,0.3)",
          background: "transparent",
          padding: "8px 20px",
          cursor: "pointer",
        }}
      >
        Stampa / Salva PDF
      </button>
      <style dangerouslySetInnerHTML={{ __html: `@media print { .print-actions { display: none !important; } }` }} />
    </div>
  );
}
