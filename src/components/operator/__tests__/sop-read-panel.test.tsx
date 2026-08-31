// @vitest-environment jsdom

/**
 * Il pannello montato davvero, perché quello che deve cambiare è in buona
 * parte un'assenza: niente triangolo di pericolo, niente "richiede", niente
 * richiesta di conferma. Un'assenza non si verifica leggendo il codice, si
 * verifica guardando cosa arriva sullo schermo.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SopReadPanel } from "../sop-read-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/shared/push-permission-banner", () => ({ incrementAckCount: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montaPannello() {
  return render(
    <SopReadPanel
      contentId="sop-1"
      title="Prenotazione e pre-arrival"
      departmentName="Front Office"
      propertyName="Patria Palace Hotel"
      version={3}
    />
  );
}

describe("SopReadPanel", () => {
  it("mostra il titolo della procedura e una riga di contesto", () => {
    montaPannello();
    expect(screen.getByText("Prenotazione e pre-arrival")).toBeTruthy();
    expect(screen.getByText("Front Office · Patria Palace Hotel · versione 3")).toBeTruthy();
  });

  it("ha un solo pulsante, e dice di leggere", () => {
    montaPannello();
    const pulsanti = screen.getAllByRole("button");
    expect(pulsanti).toHaveLength(1);
    expect(pulsanti[0].textContent).toBe("Clicca qui per leggere la procedura");
  });

  it("il pulsante è verde: usa il token della lettura, non un esadecimale sparso", () => {
    montaPannello();
    expect(screen.getByRole("button").className).toContain("bg-green-read");
  });

  it("non c'è nessuna icona di avviso", () => {
    const { container } = montaPannello();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("non compare nessuna parola di intimazione o di firma", () => {
    const { container } = montaPannello();
    const testo = (container.textContent ?? "").toLowerCase();
    for (const parola of ["richiede", "richiesta", "presa visione", "confermo", "conferma"]) {
      expect(testo).not.toContain(parola);
    }
  });

  it("il titoletto del riquadro è Lettura", () => {
    montaPannello();
    expect(screen.getByText("Lettura")).toBeTruthy();
  });

  it("senza reparto la riga di contesto non lascia separatori vuoti", () => {
    render(
      <SopReadPanel contentId="sop-2" title="Procedura trasversale" departmentName={null} propertyName="Hi Hotel Bari" version={1} />
    );
    expect(screen.getByText("Hi Hotel Bari · versione 1")).toBeTruthy();
  });
});
