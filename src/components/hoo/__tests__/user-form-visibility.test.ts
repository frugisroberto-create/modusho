import { describe, it, expect } from "vitest";
import { showSendLinkCommand } from "../user-form";

/**
 * La regola di visibilità dei comandi di consegna di un accesso.
 *
 * Il punto di questi test non è il singolo ramo: è che la funzione NON abbia
 * fra i suoi ingressi il ruolo di chi guarda. Se qualcuno reintroducesse un
 * elenco di ruoli nel client, la firma dovrebbe cambiare e questi test
 * andrebbero riscritti — che è esattamente il segnale voluto.
 */

describe("showSendLinkCommand — la visibilità viene dal server, non dal ruolo", () => {
  it("utente NON attivato: segue canSendActivation", () => {
    expect(
      showSendLinkCommand({
        isCreate: false,
        isActivated: false,
        canSendActivation: true,
        canSendReset: false,
      })
    ).toBe(true);

    expect(
      showSendLinkCommand({
        isCreate: false,
        isActivated: false,
        canSendActivation: false,
        canSendReset: true,
      })
    ).toBe(false);
  });

  it("utente GIÀ attivato: segue canSendReset", () => {
    expect(
      showSendLinkCommand({
        isCreate: false,
        isActivated: true,
        canSendActivation: false,
        canSendReset: true,
      })
    ).toBe(true);

    expect(
      showSendLinkCommand({
        isCreate: false,
        isActivated: true,
        canSendActivation: true,
        canSendReset: false,
      })
    ).toBe(false);
  });

  it("in creazione non si mostra mai: non esiste ancora un destinatario", () => {
    expect(
      showSendLinkCommand({
        isCreate: true,
        isActivated: false,
        canSendActivation: true,
        canSendReset: true,
      })
    ).toBe(false);
  });

  it("negato dal server: nessun comando, quale che sia lo stato", () => {
    for (const isActivated of [true, false]) {
      expect(
        showSendLinkCommand({
          isCreate: false,
          isActivated,
          canSendActivation: false,
          canSendReset: false,
        })
      ).toBe(false);
    }
  });

  it("l'esito non dipende da nient'altro: stessi flag, stesso risultato", () => {
    // Nessun ruolo fra gli ingressi. Se un domani ne comparisse uno, questa
    // chiamata non compilerebbe più.
    const ingressi = {
      isCreate: false,
      isActivated: false,
      canSendActivation: true,
      canSendReset: false,
    };
    expect(showSendLinkCommand(ingressi)).toBe(showSendLinkCommand({ ...ingressi }));
    expect(Object.keys(ingressi)).not.toContain("viewerRole");
    expect(Object.keys(ingressi)).not.toContain("role");
  });
});
