import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * IL DENOMINATORE È UNO SOLO.
 *
 * «Quante persone devono prendere visione di questo contenuto» aveva tre
 * risposte in tre rotte: il cruscotto divideva letture per contenuti (da cui le
 * percentuali a quattro cifre), l'allarme «sotto il 50%» contava tutte le
 * letture sopra i soli operatori del reparto, l'elenco strutture moltiplicava
 * contenuti per operatori. Ora la regola sta in `recipient-set.ts` e chi ne ha
 * bisogno la chiama.
 *
 * Questi controlli leggono il codice sorgente: nel progetto non ci sono prove
 * che montino un handler di Next con sessione e database, e la garanzia che
 * serve qui non è «questa richiesta risponde X» ma «nessuna di queste rotte ha
 * un denominatore proprio». È una domanda sul codice, e va posta al codice.
 *
 * Il comportamento vero è provato in `recipient-set.test.ts` e
 * `recipient-set-db.test.ts`.
 */

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const DASHBOARD = "src/app/api/dashboard/route.ts";
const COMPLIANCE = "src/app/api/compliance/route.ts";
const PROPERTIES = "src/app/api/properties/route.ts";

describe("cruscotto e pagina Presa visione chiamano la stessa regola", () => {
  for (const [nome, path] of Object.entries({ "GET /api/dashboard": DASHBOARD, "GET /api/compliance": COMPLIANCE })) {
    describe(nome, () => {
      const code = source(path);

      it("importa la regola condivisa", () => {
        expect(code).toContain('from "@/lib/recipient-set-db"');
        expect(code).toContain("computeCoverage(");
      });

      it("non espande i destinatari per conto proprio", () => {
        // L'espansione fatta in casa si riconosce dalle query sugli utenti per
        // ruolo: è ciò che il ponte fa una volta per tutti.
        expect(code).not.toContain('role: "OPERATOR"');
        expect(code).not.toContain('role: { in: ["OPERATOR", "HOD"] }');
      });
    });
  }
});

describe("il cruscotto non ha più un'aritmetica sua", () => {
  const code = source(DASHBOARD);

  it("niente conteggio di contenuti spacciato per denominatore", () => {
    expect(code).not.toContain("total_required");
    expect(code).not.toContain("total_acked");
  });

  it("niente lateral che conta gli operatori della struttura", () => {
    expect(code).not.toContain("total_ops");
  });

  it("l'allarme «sotto il 50%» nasce dalla copertura, non da una query", () => {
    const soglia = code.indexOf("r.coverage.done * 2 < r.coverage.required");
    expect(soglia).toBeGreaterThan(-1);
    // e viene dopo il calcolo, non da un'altra fonte
    expect(code.indexOf("await computeCoverage(")).toBeLessThan(soglia);
  });

  it("segnala i contenuti che nessuno può leggere invece di ignorarli", () => {
    expect(code).toContain('r.state === "senza-destinatari"');
    expect(code).toContain("noRecipients:");
  });

  it("mostra il denominatore accanto al tasso", () => {
    expect(code).toContain("ackRequired");
    expect(code).toContain("ackDone");
  });
});

describe("l'elenco strutture non calcola più un terzo tasso", () => {
  const code = source(PROPERTIES);

  it("niente «contenuti per operatori» spacciato per prese visione dovute", () => {
    expect(code).not.toContain("expectedAcks");
    expect(code).not.toContain("contentAcknowledgment.count");
  });

  it("non espone più un ackRate proprio", () => {
    expect(code).not.toContain("ackRate");
  });
});
