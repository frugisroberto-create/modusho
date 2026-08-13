import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mock dei soli moduli esterni (next/*, next-auth). La logica sotto test
//    è quella vera di operator-shell.tsx e operator-header.tsx.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sop",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { href: string; children?: unknown }) =>
      h("a", { href: String(props.href) }, props.children as never),
  };
});

vi.mock("next-auth/react", () => ({ signOut: () => Promise.resolve() }));

import { OperatorShell, resolvePropertyId } from "../operator-shell";
import { OperatorHeader } from "../operator-header";

const HO1 = { id: "cmnc28yap00004nixlerjfcfq", name: "The Nicolaus Hotel", code: "HO1", tagline: null };
const HO3 = { id: "cmnc28ydk00024nixrpo0s301", name: "Patria Palace Hotel", code: "HO3", tagline: null };
const PROPERTIES = [HO1, HO3];

const CHILD_MARKER = "__figli-montati__";

function renderShell(defaultPropertyId: string) {
  return renderToStaticMarkup(
    createElement(
      OperatorShell,
      {
        userName: "Tester Tester",
        userRole: "ADMIN",
        properties: PROPERTIES,
        defaultPropertyId,
        children: createElement("div", null, CHILD_MARKER),
      }
    )
  );
}

/**
 * GUARDIA — invariante: il valore MOSTRATO dalla tendina non può divergere
 * dal valore APPLICATO alla query.
 *
 * Il difetto originale nasceva perché il server rendeva la tendina con
 * properties[0] mentre il client, dopo l'idratazione, applicava alla query il
 * valore letto da localStorage. React non riallinea il DOM di un <select>
 * controllato in idratazione (value/selected sono esclusi da
 * diffHydratedProperties), quindi i due valori restavano divergenti.
 *
 * L'invariante si regge su due fatti, uno per test:
 *  - T1: quando la tendina È renderizzata, il valore marcato `selected` è
 *        esattamente currentPropertyId, cioè lo stesso valore che i consumatori
 *        mettono in query. Displayed == applied per costruzione.
 *  - T2: prima della risoluzione del contesto la shell NON rende la tendina e
 *        NON monta i figli. Non esiste quindi un valore server-side su cui
 *        client e server possano divergere, né un fetch che parta prima.
 * Se una delle due cade, la divergenza torna possibile.
 */
describe("guardia: valore mostrato == valore applicato", () => {
  it("T1 — quando la tendina è renderizzata, `selected` cade sul valore applicato", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorHeader, {
        userName: "Tester Tester",
        userRole: "ADMIN",
        properties: PROPERTIES,
        currentPropertyId: HO3.id,
        onPropertyChange: () => {},
      })
    );

    expect(html).toContain("<select");
    // L'opzione marcata `selected` deve essere quella del valore applicato…
    expect(html).toMatch(new RegExp(`<option[^>]*value="${HO3.id}"[^>]*selected`));
    // …e nessun'altra.
    expect(html).not.toMatch(new RegExp(`<option[^>]*value="${HO1.id}"[^>]*selected`));
  });

  it("T2 — prima della risoluzione la shell non espone né tendina né figli", () => {
    const html = renderShell(HO1.id);

    // Nessuna tendina: è l'elemento su cui React non ripara l'idratazione.
    expect(html).not.toContain("<select");

    // Nessun valore derivato dalla struttura nel markup del server.
    for (const p of PROPERTIES) {
      expect(html).not.toContain(p.id);
      expect(html).not.toContain(p.code);
      expect(html).not.toContain(p.name);
    }

    // I figli non sono montati: nessun fetch a /api/content prima della risoluzione.
    expect(html).not.toContain(CHILD_MARKER);

    // È lo scheletro del progetto (globals.css:144), non una pagina vuota.
    expect(html).toContain("skeleton");
  });

  it("T2b — il markup pre-risoluzione non dipende dal defaultPropertyId", () => {
    // Se il server rendesse un valore di struttura, cambiare il default
    // cambierebbe il markup: è esattamente la condizione che apriva la divergenza.
    expect(renderShell(HO1.id)).toBe(renderShell(HO3.id));
  });
});

/**
 * Precedenza e validazione della risoluzione: ?propertyId= → localStorage →
 * defaultPropertyId, scartando gli id non più accessibili.
 */
describe("resolvePropertyId", () => {
  const propertyIds = PROPERTIES.map((p) => p.id);

  it("il parametro di query vince su localStorage e sul default", () => {
    expect(
      resolvePropertyId({
        paramPropertyId: HO3.id,
        storedPropertyId: HO1.id,
        defaultPropertyId: HO1.id,
        propertyIds,
      })
    ).toBe(HO3.id);
  });

  it("localStorage vince sul default quando non c'è il parametro", () => {
    expect(
      resolvePropertyId({
        paramPropertyId: null,
        storedPropertyId: HO3.id,
        defaultPropertyId: HO1.id,
        propertyIds,
      })
    ).toBe(HO3.id);
  });

  it("senza parametro né localStorage si usa il default", () => {
    expect(
      resolvePropertyId({
        paramPropertyId: null,
        storedPropertyId: null,
        defaultPropertyId: HO1.id,
        propertyIds,
      })
    ).toBe(HO1.id);
  });

  it("un id non più accessibile viene scartato: si ricade sul default", () => {
    expect(
      resolvePropertyId({
        paramPropertyId: "property-revocata",
        storedPropertyId: "property-revocata",
        defaultPropertyId: HO1.id,
        propertyIds,
      })
    ).toBe(HO1.id);
  });

  it("un parametro non accessibile non oscura un localStorage valido", () => {
    expect(
      resolvePropertyId({
        paramPropertyId: "property-revocata",
        storedPropertyId: HO3.id,
        defaultPropertyId: HO1.id,
        propertyIds,
      })
    ).toBe(HO3.id);
  });
});
