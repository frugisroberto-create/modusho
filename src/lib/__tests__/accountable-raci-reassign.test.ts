import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La riassegnazione RACI aveva due rose diverse per l'Accountable: alla
 * creazione valeva accountable-scope.ts (filtrata per reparto), alla
 * riassegnazione una validazione più larga che guardava solo l'assegnazione
 * alla struttura — un utente assegnato alla property ma senza canApprove sul
 * reparto giusto passava. Il filtro per reparto era quindi aggirabile dal
 * passaggio successivo.
 *
 * Queste prove leggono il codice sorgente, come già `target-audience-routes.test.ts`
 * per lo stesso motivo dichiarato lì: nel progetto non esistono prove che
 * montino un handler di Next con sessione e database. La domanda qui è "la
 * rotta e il pannello chiamano la stessa rosa della creazione?", ed è una
 * domanda sul codice.
 *
 * Il comportamento vero e proprio della rosa — chi è candidato, chi viene
 * rifiutato e perché, compreso il caso "assegnato alla struttura ma non
 * competente sul reparto" — è provato in `accountable-scope.test.ts`.
 */

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("PUT /api/sop-workflow/[id]/raci — l'Accountable usa la rosa condivisa", () => {
  const path = "src/app/api/sop-workflow/[id]/raci/route.ts";
  const code = source(path);

  it("importa e chiama validateAccountableProposal, non riscrive la regola", () => {
    expect(code).toContain('from "@/lib/accountable-scope-db"');
    expect(code).toContain("validateAccountableProposal");
    expect(code).toContain("await validateAccountableProposal(");
  });

  it("la validazione dell'Accountable avviene PRIMA della scrittura", () => {
    const verdict = code.indexOf("await validateAccountableProposal(");
    const write = code.indexOf("prisma.$transaction([");
    expect(verdict).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(verdict).toBeLessThan(write);
  });

  it("un verdetto negativo blocca la riassegnazione con un messaggio leggibile, non un 200", () => {
    expect(code).toContain("if (!accountableVerdict.allowed)");
    expect(code).toContain("accountableVerdict.reason");
  });

  // R e C: il blocco generico esistente (esistenza, attivo, assegnato alla
  // property) resta testualmente identico. Non è stata tolta né aggiunta
  // alcuna condizione per loro — solo un vincolo IN PIÙ per A, sopra.
  it("R e C restano sulla sola verifica di assegnazione alla property, invariata", () => {
    expect(code).toContain("const userIds = [responsibleId, accountableId];");
    expect(code).toContain("if (consultedId) userIds.push(consultedId);");
    expect(code).toContain('error: "Uno o più utenti non sono validi o attivi"');
    expect(code).toContain('error: "Uno o più utenti non sono assegnati a questa struttura"');
  });

  it("non ha un filtro per ruolo scritto in casa per l'Accountable (niente più elezione automatica qui)", () => {
    const homeMade = code
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => line.includes("CORPORATE") || line.includes('role: { in: ["ADMIN"'));
    expect(homeMade).toEqual([]);
  });

  it("chi può riassegnare resta HM/ADMIN/SUPER_ADMIN, gli stati permessi restano DRAFT/REVIEW_HM/RETURNED", () => {
    expect(code).toContain('role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN"');
    expect(code).toContain('const allowedStatuses = ["DRAFT", "REVIEW_HM", "RETURNED"];');
  });
});

describe("RaciReassignPanel — la tendina Accountable usa la stessa rosa della creazione", () => {
  const path = "src/components/hoo/sop-workflow-editor.tsx";
  const code = source(path);

  it("interroga la stessa rotta usata dal modulo di creazione", () => {
    expect(code).toContain("/api/sop-workflow/accountable-candidates");
  });

  it("eligibleA non è più un filtro per ruolo su `users`: viene dalla rosa condivisa", () => {
    expect(code).toContain("const eligibleA = accountableCandidates;");
    expect(code).not.toContain('const eligibleA = users.filter(u => ["ADMIN", "SUPER_ADMIN"].includes(u.role));');
  });

  // R e C: stesse due righe di prima, stessi ruoli eleggibili — non toccate.
  it("eligibleR e eligibleC restano invariati", () => {
    expect(code).toContain('const eligibleR = users.filter(u => ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(u.role));');
    expect(code).toContain('const eligibleC = users.filter(u => ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(u.role));');
  });
});
