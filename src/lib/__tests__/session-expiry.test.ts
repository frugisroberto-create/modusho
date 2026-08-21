import { describe, it, expect } from "vitest";
import {
  shouldExpireSession,
  buildSessionExpiredUrl,
  SESSION_EXPIRED_MESSAGE,
  SESSION_EXPIRED_PARAM,
  SESSION_EXPIRED_VALUE,
  type SessionStatus,
} from "../session-expiry";

/**
 * La regola che decide se espellere verso il login.
 *
 * Il caso che conta di più è quello che NON deve scattare: durante il
 * caricamento `useSession` non ha ancora i dati, e trattare quell'assenza come
 * una sessione decaduta butterebbe fuori ogni utente a ogni montaggio.
 */

describe("shouldExpireSession — nessuna espulsione durante il caricamento", () => {
  it("stato 'loading': non espelle MAI, nemmeno senza utente", () => {
    expect(
      shouldExpireSession({ status: "loading", hasUser: false, pathname: "/users" })
    ).toBe(false);
  });

  it("stato 'loading' con utente già presente: non espelle", () => {
    expect(
      shouldExpireSession({ status: "loading", hasUser: true, pathname: "/users" })
    ).toBe(false);
  });

  it("stato 'unauthenticated': non espelle — non è una decadenza, non è mai entrato", () => {
    expect(
      shouldExpireSession({ status: "unauthenticated", hasUser: false, pathname: "/users" })
    ).toBe(false);
  });
});

describe("shouldExpireSession — autenticato ma senza utente", () => {
  it("è la firma di una sessione invalidata: espelle", () => {
    expect(
      shouldExpireSession({ status: "authenticated", hasUser: false, pathname: "/users" })
    ).toBe(true);
  });

  it("sessione sana: non espelle", () => {
    expect(
      shouldExpireSession({ status: "authenticated", hasUser: true, pathname: "/users" })
    ).toBe(false);
  });

  it("sulla pagina di login non espelle: si rimbalzerebbe su sé stessi", () => {
    expect(
      shouldExpireSession({ status: "authenticated", hasUser: false, pathname: "/login" })
    ).toBe(false);
  });

  it("vale su qualunque altra pagina", () => {
    for (const pathname of ["/users", "/users/abc", "/dashboard", "/"]) {
      expect(
        shouldExpireSession({ status: "authenticated", hasUser: false, pathname })
      ).toBe(true);
    }
  });

  it("nessuno stato diverso da 'authenticated' espelle", () => {
    const stati: SessionStatus[] = ["loading", "unauthenticated"];
    for (const status of stati) {
      expect(shouldExpireSession({ status, hasUser: false, pathname: "/users" })).toBe(false);
    }
  });
});

describe("il messaggio e l'indirizzo del login", () => {
  it("l'indirizzo porta il parametro che il login riconosce", () => {
    expect(buildSessionExpiredUrl()).toBe(
      `/login?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`
    );
  });

  it("il messaggio dice il motivo, non solo che è scaduta", () => {
    expect(SESSION_EXPIRED_MESSAGE).toBe(
      "La tua sessione è scaduta perché la password del tuo account è cambiata. Entra di nuovo per continuare."
    );
  });
});
