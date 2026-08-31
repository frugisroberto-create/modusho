import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Un solo scrittore, due presentazioni.
 *
 * La registrazione automatica di HM/ADMIN/SUPER_ADMIN e il pulsante di
 * OPERATOR/HOD devono lasciare righe identiche. L'unico modo per cui possano
 * divergere è che qualcuno riscriva a mano una delle due upsert in uno dei due
 * punti — e allora i numeri della presa visione comincerebbero a dipendere da
 * chi ha aperto la SOP.
 *
 * Questa guardia serve proprio a quello: non verifica un comportamento, verifica
 * che il comportamento continui ad avere una sola fonte.
 */

const SORGENTI = [
  "src/app/(operator)/sop/[id]/page.tsx",
  "src/app/api/sop/[id]/acknowledge/route.ts",
];

function leggi(percorso: string): string {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

describe("la lettura di una SOP ha un solo scrittore", () => {
  for (const percorso of SORGENTI) {
    it(`${percorso} registra la lettura passando da recordSopRead`, () => {
      expect(leggi(percorso)).toContain("recordSopRead(");
    });

    it(`${percorso} non scrive per conto proprio nei due registri`, () => {
      const sorgente = leggi(percorso);
      expect(sorgente).not.toContain("sopViewRecord.upsert");
      expect(sorgente).not.toContain("contentAcknowledgment.upsert");
      expect(sorgente).not.toContain("sopViewRecord.create");
      expect(sorgente).not.toContain("contentAcknowledgment.create");
    });
  }
});
