import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentStatus, Role } from "@prisma/client";
import { decidePrintAccess, type PrintAccessInput } from "../print-access";

/**
 * «Stampa» deve esserci sulle SOP sia in vista Hotel sia nella dashboard. Nella
 * dashboard le SOP si aprono nel workflow, quasi sempre ancora in lavorazione:
 * la stampa deve servire anche le bozze, a chi le può vedere, e dichiararle.
 */

const R = "user-r", C = "user-c", A = "user-a", ESTRANEO = "user-x";

function input(over: Partial<PrintAccessInput> = {}): PrintAccessInput {
  const status: ContentStatus = over.status ?? "DRAFT";
  return {
    status,
    userId: ESTRANEO,
    role: "HOD",
    canSeePublished: false,
    hasPropertyAccess: true,
    workflow: {
      contentStatus: status,
      responsibleId: R,
      consultedId: C,
      accountableId: A,
      submittedToC: false,
      submittedToA: false,
    },
    ...over,
  };
}

describe("contenuti pubblicati", () => {
  it("stampa chi può vederli, e la stampa non è una bozza", () => {
    expect(decidePrintAccess(input({ status: "PUBLISHED", canSeePublished: true }))).toEqual({ allowed: true, draft: false });
  });

  it("chi non li vede non li stampa", () => {
    expect(decidePrintAccess(input({ status: "PUBLISHED", canSeePublished: false }))).toEqual({ allowed: false });
  });

  it("vale anche per memo e documenti, che un workflow non l'hanno", () => {
    expect(decidePrintAccess(input({ status: "PUBLISHED", canSeePublished: true, workflow: null }))).toEqual({ allowed: true, draft: false });
  });
});

describe("bozze nel workflow", () => {
  const stati: ContentStatus[] = ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED"];

  for (const status of stati) {
    it(`${status}: R, C e A la stampano, marcata come bozza`, () => {
      for (const userId of [R, C, A]) {
        expect(decidePrintAccess(input({ status, userId }))).toEqual({ allowed: true, draft: true });
      }
    });
  }

  it("Hotel Manager, Corporate, Admin e Super Admin della struttura la stampano anche senza ruolo RACI", () => {
    const governo: Role[] = ["HOTEL_MANAGER", "CORPORATE", "ADMIN", "SUPER_ADMIN"];
    for (const role of governo) {
      expect(decidePrintAccess(input({ status: "REVIEW_HM", role }))).toEqual({ allowed: true, draft: true });
    }
  });

  it("un capo reparto che non è nel RACI non stampa la bozza di un altro", () => {
    expect(decidePrintAccess(input({ role: "HOD", userId: ESTRANEO }))).toEqual({ allowed: false });
  });

  it("un operatore non stampa mai una bozza, neanche se fosse nel RACI", () => {
    expect(decidePrintAccess(input({ role: "OPERATOR", userId: R }))).toEqual({ allowed: false });
  });

  it("fuori dalla propria struttura non si stampa niente, neanche da Hotel Manager", () => {
    expect(decidePrintAccess(input({ role: "HOTEL_MANAGER", hasPropertyAccess: false }))).toEqual({ allowed: false });
  });

  it("una bozza senza workflow — memo o documento — non si stampa", () => {
    expect(decidePrintAccess(input({ role: "ADMIN", workflow: null }))).toEqual({ allowed: false });
  });

  it("vedere il pubblicato non basta per stampare una bozza", () => {
    expect(decidePrintAccess(input({ role: "HOD", userId: ESTRANEO, canSeePublished: true }))).toEqual({ allowed: false });
  });
});

describe("contenuti archiviati", () => {
  it("non si stampano, per nessuno: una procedura sostituita su carta si applica ancora", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "HOTEL_MANAGER"] as Role[]) {
      expect(decidePrintAccess(input({ status: "ARCHIVED", role, canSeePublished: true, userId: A }))).toEqual({ allowed: false });
    }
  });
});

/**
 * Dove sta il tasto. Sono domande sul codice, e vanno poste al codice: nel
 * progetto non ci sono prove che montino le pagine con sessione e database.
 */
function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("il tasto «Stampa»", () => {
  it("la rotta di stampa decide con la regola condivisa, e marca le bozze", () => {
    const code = source("src/app/api/print/[id]/route.ts");
    expect(code).toContain("decidePrintAccess(");
    expect(code).not.toContain('content.status !== "PUBLISHED"');
    expect(code).toContain('class="draft-watermark"');
    expect(code).toContain("Bozza non approvata");
  });

  it("nei comandi di gestione non dipende dal permesso di modifica", () => {
    const code = source("src/components/hoo/content-actions.tsx");
    // Prima era `if (!canAct) return null;`: senza canEdit sparivano anche «Stampa»
    expect(code).not.toContain("if (!canAct) return null;");
    expect(code).toContain("if (!canAct) return printButton;");
  });

  it("c'è nel workflow della dashboard", () => {
    const code = source("src/components/hoo/sop-workflow-editor.tsx");
    expect(code).toContain("<ExportPdfButton contentId={wf.contentId} />");
  });

  it("c'è in vista Hotel, per chi governa e per i capi reparto", () => {
    const code = source("src/app/(operator)/sop/[id]/page.tsx");
    expect(code).toContain("<ContentActions");
    expect(code).toContain("<ExportPdfButton contentId={content.id} />");
  });

  it("nel dettaglio SOP della dashboard compare una volta sola", () => {
    const code = source("src/app/(hoo)/hoo-sop/[id]/page.tsx");
    expect(code).not.toContain("<ExportPdfButton");
    expect(code).toContain("<ContentActions");
  });
});
