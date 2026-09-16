import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Il perimetro della ricerca vive in una query SQL: non si può montare in un
 * test unitario, ma si può chiedere al codice che la regola sia quella giusta.
 * Il difetto da non far tornare: per un capo reparto la ricerca filtrava per
 * reparto del contenuto, quindi trovava memo non suoi (i memo non hanno
 * reparto) e bozze di chiunque.
 */
const source = readFileSync(join(process.cwd(), "src/app/api/search/route.ts"), "utf8");

describe("perimetro della ricerca", () => {
  it("operatori e capi reparto sono filtrati per destinatari, non per reparto del contenuto", () => {
    const hodBranch = source.slice(source.indexOf('userRole === "HOD"'));
    const legacy = 'c."departmentId" IS NULL OR c."departmentId" = ANY(';
    // Il filtro legacy resta, ma solo nel ramo degli altri ruoli
    expect(source).toContain(legacy);
    expect(hodBranch.indexOf("reachedByTargets")).toBeGreaterThan(-1);
    expect(hodBranch.indexOf("reachedByTargets")).toBeLessThan(hodBranch.indexOf(legacy));
  });

  it("l'operatore trova solo contenuti pubblicati", () => {
    const operatorBranch = source.slice(source.indexOf('userRole === "OPERATOR"\n'), source.indexOf('userRole === "HOD"\n'));
    expect(operatorBranch).toContain("c.status::text = 'PUBLISHED'");
  });

  it("il capo reparto trova le bozze solo se le ha create o se è R, C o A", () => {
    expect(source).toContain('w."responsibleId" = ');
    expect(source).toContain('w."consultedId" = ');
    expect(source).toContain('w."accountableId" = ');
    expect(source).toContain('c."createdById" = ');
    // e mai gli archiviati
    expect(source).toContain("NOT IN ('PUBLISHED', 'ARCHIVED')");
  });

  it("i destinatari per ruolo vengono dalla regola, non da una stringa scritta a mano", () => {
    expect(source).toContain("getRoleTargetsReaching(userRole)");
    expect(source).not.toContain(`ct."targetRole" = 'OPERATOR'`);
  });

  it("i confronti sugli enum passano da ::text (Postgres non fa il cast nei prepared statement)", () => {
    expect(source).toContain('ct."targetType"::text');
    expect(source).toContain('ct."targetRole"::text');
  });
});
