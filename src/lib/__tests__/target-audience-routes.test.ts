import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Le quattro rotte da cui un CORPORATE scrive `ContentTarget` devono CHIAMARE
 * il perimetro, non riscriverlo.
 *
 * Questi controlli leggono il codice sorgente. È una scelta deliberata: nel
 * progetto non esistono prove che montino un handler di Next con sessione e
 * database, e la garanzia che serve qui non è "questa richiesta risponde 403"
 * ma "nessuna di queste quattro rotte ha una regola di perimetro propria". È
 * una domanda sul codice, e va posta al codice.
 *
 * Il comportamento vero e proprio — che il perimetro conceda tutto a HOD,
 * Hotel Manager, ADMIN e SUPER_ADMIN e morda solo il CORPORATE — è provato in
 * `target-audience-scope.test.ts` e `target-audience-scope-db.test.ts`.
 */

const ROUTES = {
  "POST /api/sop-workflow": "src/app/api/sop-workflow/route.ts",
  "POST /api/content": "src/app/api/content/route.ts",
  "PUT /api/content/[id]": "src/app/api/content/[id]/route.ts",
  "POST /api/memo": "src/app/api/memo/route.ts",
} as const;

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("le rotte chiamano il perimetro, non lo riscrivono", () => {
  for (const [route, path] of Object.entries(ROUTES)) {
    describe(route, () => {
      const code = source(path);

      it("importa il perimetro condiviso", () => {
        expect(code).toContain('from "@/lib/target-audience-scope-db"');
        expect(code).toContain("checkAudienceForUser");
      });

      it("non tiene una regola di perimetro propria per il CORPORATE", () => {
        // Una riga che nomina insieme il ruolo CORPORATE e i destinatari è una
        // regola scritta in casa: è esattamente ciò che non deve esistere qui.
        const homeMade = code
          .split("\n")
          .filter((line) => !line.trim().startsWith("//"))
          .filter((line) => line.includes("CORPORATE") && /target/i.test(line));
        expect(homeMade).toEqual([]);
      });

      it("non legge i reparti destinabili dell'attore: quelli li carica il ponte", () => {
        expect(code).not.toContain("targetDepartmentIds: true");
      });

      it("giudica PRIMA di scrivere", () => {
        // La chiamata, non la riga di import: quella sta in cima sempre e
        // non proverebbe nulla.
        const verdict = code.indexOf("await checkAudienceForUser(");
        expect(verdict).toBeGreaterThan(-1);

        const writes = [
          "contentTarget.createMany",
          "contentTarget.create(",
          "content.create(",
          "content.update(",
        ]
          .map((needle) => code.indexOf(needle))
          .filter((index) => index > -1);

        expect(writes.length).toBeGreaterThan(0);
        for (const write of writes) {
          expect(verdict).toBeLessThan(write);
        }
      });
    });
  }
});

describe("le regole degli altri ruoli restano dove sono sempre state", () => {
  it("POST /api/memo conserva intatta la restrizione dell'HOD", () => {
    const code = source(ROUTES["POST /api/memo"]);
    expect(code).toContain('if (role === "HOD") {');
    expect(code).toContain(
      "Come HOD puoi targettare solo i tuoi reparti — non sono ammessi ruoli trasversali, utenti specifici o 'tutti gli operatori'"
    );
    expect(code).toContain("getAccessibleDepartmentIds");
  });

  it("PUT /api/content/[id] conserva intatti i cancelli di stato per HM e ADMIN", () => {
    const code = source(ROUTES["PUT /api/content/[id]"]);
    expect(code).toContain('if (role !== "HOTEL_MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN")');
    expect(code).toContain('Solo ADMIN può modificare contenuti in attesa di approvazione finale');
  });

  it("PUT /api/content/[id] giudica il perimetro solo sul ramo DRAFT/RETURNED", () => {
    const code = source(ROUTES["PUT /api/content/[id]"]);
    const verdict = code.indexOf("checkAudienceForUser(");
    const branch = code.lastIndexOf('content.status === "DRAFT" || content.status === "RETURNED"', verdict);
    expect(branch).toBeGreaterThan(-1);
    // Fra la guardia di stato e la chiamata non c'è spazio per altro:
    // il perimetro non tocca PUBLISHED, REVIEW_HM, REVIEW_ADMIN, ARCHIVED.
    expect(verdict - branch).toBeLessThan(200);
  });

  it("la shell HOO non fa pagare il perimetro a chi non ce l'ha", () => {
    // Il layout copre ogni pagina della zona: una lettura incondizionata
    // sarebbe una query in più su ogni schermata, per quattro ruoli su cinque,
    // per scoprire che non c'è nessuna restrizione.
    const code = source("src/app/(hoo)/layout.tsx");
    const gate = code.indexOf("hasRestrictedAudience(user.role)");
    const load = code.indexOf("loadAudienceActor(user.id)");
    expect(gate).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(gate);
    expect(load - gate).toBeLessThan(120);
  });

  it("la shell HOO legge la riga utente una volta sola, per ogni ruolo", () => {
    // Dove il perimetro serve, la sua lettura È la verifica che l'account
    // esista: le due letture non devono tornare a essere due.
    const code = source("src/app/(hoo)/layout.tsx");
    const reads = code.split("prisma.user.findUnique").length - 1;
    expect(reads).toBe(1);
    expect(code).toContain("accountStillExists");
  });

  it("POST /api/sop-workflow conserva intatto il divieto all'HOD di coinvolgere un altro HOD", () => {
    const code = source(ROUTES["POST /api/sop-workflow"]);
    expect(code).toContain('if (role === "HOD" && data.involveHod)');
  });
});

describe("il selettore dei destinatari è uno solo per tutti i ruoli", () => {
  const SELECTOR = "src/components/shared/target-audience-selector.tsx";

  it("decide chi è ristretto dal ruolo, non da ciò che gli passano", () => {
    // Un perimetro passato per errore a un Hotel Manager gli toglierebbe dei
    // reparti in silenzio. Il componente non deve avere quel potere: la prop
    // vale solo su chi un perimetro ce l'ha davvero.
    const code = source(SELECTOR);
    expect(code).toContain("const restricted = hasRestrictedAudience(role);");
    expect(code).toContain(
      "const perimeter: string[] | null = restricted ? (allowedDepartmentIds ?? []) : null;"
    );
  });

  it("non nasconde niente in silenzio: dice perché le sezioni mancano", () => {
    // Un'assenza non la segnala nessuno. Una frase, se comparisse al ruolo
    // sbagliato, sarebbe palesemente falsa e verrebbe riferita subito.
    const code = source(SELECTOR);
    expect(code).toContain("Come referente corporate ti rivolgi ai reparti di tua competenza");
    expect(code).toContain("per questo qui sotto non li trovi");
  });

  it("le sezioni riservate le governa il perimetro, non un confronto scritto a mano", () => {
    const code = source(SELECTOR);
    expect(code).toContain("const showEveryone = canTargetEveryone(role);");
    expect(code).toContain("const showRoles = canTargetRoles(role);");
    const handWritten = code
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter((line) => line.includes('"CORPORATE"'));
    expect(handWritten).toEqual([]);
  });
});
