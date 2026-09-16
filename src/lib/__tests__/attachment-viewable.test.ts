import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getViewMode,
  isConvertible,
  isSpreadsheet,
  isViewable,
  isWordDocument,
  MAX_CONVERTED_HTML_BYTES,
} from "../attachments/viewable";

/**
 * Un documento su ModusHO è quasi sempre un file: il corpo ha poche righe e la
 * sostanza sta nell'allegato. Queste prove tengono ferma la promessa che ogni
 * allegato previsto si possa leggere a schermo, senza scaricarlo.
 */

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("getViewMode", () => {
  it("PDF e immagini li mostra il browser", () => {
    expect(getViewMode(PDF)).toBe("file");
    expect(getViewMode("image/jpeg")).toBe("file");
    expect(getViewMode("image/png")).toBe("file");
    expect(getViewMode("image/webp")).toBe("file");
  });

  it("Word ed Excel passano dalla conversione", () => {
    expect(getViewMode(DOCX)).toBe("converted");
    expect(getViewMode(XLSX_MIME)).toBe("converted");
  });

  it("ciò che non è previsto si scarica e basta", () => {
    expect(getViewMode("application/zip")).toBe("download");
    expect(getViewMode("")).toBe("download");
  });
});

describe("ogni tipo che si può allegare si può anche leggere a schermo", () => {
  // La promessa vale per la lista dei tipi ammessi, non per qualche caso
  // scelto a mano: se domani si accetta un formato nuovo, questa prova chiede
  // di decidere anche come si guarda.
  const ammessi = [PDF, DOCX, XLSX_MIME, "image/jpeg", "image/png", "image/webp"];

  for (const mime of ammessi) {
    it(mime, () => expect(isViewable(mime)).toBe(true));
  }
});

describe("isConvertible", () => {
  it("vale solo per ciò che la rotta di conversione sa trattare", () => {
    expect(isConvertible(DOCX)).toBe(true);
    expect(isConvertible(XLSX_MIME)).toBe(true);
    expect(isConvertible(PDF)).toBe(false);
    expect(isConvertible("image/png")).toBe(false);
  });

  it("distingue Word da Excel: la conversione è diversa", () => {
    expect(isWordDocument(DOCX)).toBe(true);
    expect(isWordDocument(XLSX_MIME)).toBe(false);
    expect(isSpreadsheet(XLSX_MIME)).toBe(true);
    expect(isSpreadsheet(DOCX)).toBe(false);
  });
});

describe("il limite alla vista", () => {
  it("resta nell'ordine dei megabyte: oltre, la pagina sarebbe più lenta del download", () => {
    expect(MAX_CONVERTED_HTML_BYTES).toBeGreaterThan(512 * 1024);
    expect(MAX_CONVERTED_HTML_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

/**
 * Il permesso di vedere un allegato è quello del contenuto a cui appartiene.
 * Le rotte sono due — l'indirizzo firmato e la vista a schermo — e la regola
 * deve restare una. È una domanda sul codice, e va posta al codice.
 */
describe("le due rotte sugli allegati chiedono lo stesso permesso", () => {
  const ROUTES = {
    "GET /api/attachments/[id]/access": "src/app/api/attachments/[id]/access/route.ts",
    "GET /api/attachments/[id]/view": "src/app/api/attachments/[id]/view/route.ts",
  };

  for (const [nome, path] of Object.entries(ROUTES)) {
    describe(nome, () => {
      const code = readFileSync(join(process.cwd(), path), "utf8");

      it("chiama il permesso condiviso", () => {
        expect(code).toContain('from "@/lib/attachments/access-db"');
        expect(code).toContain("await loadAccessibleAttachment(");
      });

      it("non tiene una regola di perimetro propria", () => {
        expect(code).not.toContain("canUserAccessContent");
        expect(code).not.toContain("prisma.attachment.findUnique");
      });

      it("chiede il permesso PRIMA di toccare il file", () => {
        const permesso = code.indexOf("await loadAccessibleAttachment(");
        const file = Math.min(
          ...[code.indexOf("getPresignedDownloadUrl("), code.indexOf("downloadFromStorage(")]
            .filter((i) => i > -1)
            .concat([Number.MAX_SAFE_INTEGER])
        );
        expect(permesso).toBeGreaterThan(-1);
        expect(permesso).toBeLessThan(file);
      });
    });
  }

  it("la vista a schermo non prova a convertire ciò che non sa convertire", () => {
    const code = readFileSync(join(process.cwd(), "src/app/api/attachments/[id]/view/route.ts"), "utf8");
    expect(code).toContain("if (!word && !sheet)");
  });
});
