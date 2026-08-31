// @vitest-environment jsdom

/**
 * Le parole che restano dopo la lettura. Il collaudo è sulla frase esatta:
 * deve dire che la procedura è stata letta, e non deve dire che qualcuno ha
 * confermato o firmato qualcosa.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SopReadReceipt } from "../sop-read-receipt";

afterEach(cleanup);

describe("SopReadReceipt", () => {
  it("dice Letta il, con data e versione", () => {
    render(<SopReadReceipt readAt="2026-08-31T08:05:00.000Z" version={3} />);
    const testo = screen.getByText(/Letta il/).textContent ?? "";
    expect(testo).toMatch(/^Letta il \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} — versione 3$/);
  });

  it("non contiene più nessuna parola di conferma", () => {
    const { container } = render(<SopReadReceipt readAt="2026-08-31T08:05:00.000Z" version={3} />);
    const testo = (container.textContent ?? "").toLowerCase();
    for (const parola of ["confermata", "confermato", "conferma", "presa visione"]) {
      expect(testo).not.toContain(parola);
    }
  });

  it("il titoletto del riquadro è Lettura", () => {
    render(<SopReadReceipt readAt="2026-08-31T08:05:00.000Z" version={1} />);
    expect(screen.getByText("Lettura")).toBeTruthy();
  });

  it("porta la versione a cui la lettura si riferisce, anche se non è quella corrente", () => {
    render(<SopReadReceipt readAt="2026-08-31T08:05:00.000Z" version={2} />);
    expect((screen.getByText(/Letta il/).textContent ?? "")).toContain("versione 2");
  });
});
