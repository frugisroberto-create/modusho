import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LA PAGINA PRESA VISIONE NON NASCONDE NIENTE.
 *
 * Prima ne teneva fuori tre categorie, tutte in silenzio: i contenuti letti da
 * tutti (spariti per sempre, senza una linguetta che dicesse dove erano finiti),
 * i documenti (non erano nel filtro predefinito) e i contenuti senza
 * destinatari salvati (esclusi dalla query). Su 93 contenuti pubblicati, 35 non
 * erano raggiungibili da questa pagina.
 *
 * Questi controlli leggono il codice sorgente: nel progetto non ci sono prove
 * che montino un handler di Next con sessione e database, e la domanda —
 * «questa rotta esclude ancora qualcosa?» — è una domanda sul codice.
 */

const ROUTE = "src/app/api/compliance/route.ts";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("GET /api/compliance", () => {
  const code = source(ROUTE);

  it("non esclude più i contenuti senza righe destinatario: sono quelli da vedere", () => {
    expect(code).not.toContain("targetAudience: { some: {} }");
  });

  it("i documenti sono nell'elenco predefinito, come le SOP e i memo", () => {
    expect(code).toContain('where.type = { in: ["SOP", "DOCUMENT", "MEMO"] }');
  });

  it("filtra per stato invece di scartare in silenzio le righe complete", () => {
    expect(code).toContain('state: z.enum(["aperta", "completata", "senza-destinatari"])');
    expect(code).toContain(".filter((row) => row.state === state)");
    // il vecchio svuotamento automatico non c'è più
    expect(code).not.toContain("if (ackedCount >= targetCount) continue");
    expect(code).not.toContain("if (targetCount === 0) continue");
  });

  it("conta le righe di ogni stato prima di filtrare, così la pagina può mostrarle", () => {
    const counts = code.indexOf("const counts = {");
    const filtro = code.indexOf(".filter((row) => row.state === state)");
    expect(counts).toBeGreaterThan(-1);
    expect(counts).toBeLessThan(filtro);
    expect(code).toContain("counts }");
  });

  it("dice a chi guarda in che stato è ogni riga", () => {
    expect(code).toContain("state: row.state");
  });
});

describe("la pagina Presa visione", () => {
  const code = source("src/app/(hoo)/compliance/page.tsx");

  it("tiene i filtri nell'indirizzo, così la vista si ricarica e si condivide", () => {
    expect(code).toContain('from "@/lib/compliance-url-state"');
    expect(code).toContain("parseComplianceState(searchParams)");
    expect(code).toContain("window.history.replaceState");
  });

  it("non tiene più un filtro per conto proprio", () => {
    expect(code).not.toContain("setPropertyFilter");
    expect(code).not.toContain("setTypeFilter");
  });

  it("dice che le righe non spariscono", () => {
    expect(code).toContain("cambiano stato");
  });
});
