// @vitest-environment jsdom

/**
 * Il collaudo a mano, fatto fare alla macchina: si monta la pagina di login
 * davvero e si guarda cosa appare sotto il campo password.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { signIn } from "next-auth/react";
import LoginPage from "../page";

const mockedSignIn = vi.mocked(signIn);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "mario@x.it" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "qualsiasi" } });
}

describe("Pagina di login — messaggio d'errore", () => {
  it("un blocco per troppi tentativi viene mostrato integrale", async () => {
    mockedSignIn.mockResolvedValue({
      error: "Troppi tentativi. Riprova tra 12 minuti.",
      status: 401,
      ok: false,
      url: null,
    } as never);

    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: /accedi/i }));

    // Nessun matcher di jest-dom: si resta alle asserzioni di vitest.
    await waitFor(() => {
      expect(screen.queryByText("Troppi tentativi. Riprova tra 12 minuti.")).not.toBeNull();
    });
  });

  it("il codice generico CredentialsSignin mostra 'Credenziali non valide', non il codice grezzo", async () => {
    mockedSignIn.mockResolvedValue({
      error: "CredentialsSignin",
      status: 401,
      ok: false,
      url: null,
    } as never);

    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: /accedi/i }));

    await waitFor(() => {
      expect(screen.queryByText("Credenziali non valide")).not.toBeNull();
    });
    expect(screen.queryByText("CredentialsSignin")).toBeNull();
  });

  it("un errore inatteso mostra il testo generico e NON il testo originale", async () => {
    mockedSignIn.mockResolvedValue({
      error: "PrismaClientKnownRequestError: connection refused",
      status: 500,
      ok: false,
      url: null,
    } as never);

    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: /accedi/i }));

    await waitFor(() => {
      expect(screen.queryByText("Credenziali non valide")).not.toBeNull();
    });
    expect(screen.queryByText(/PrismaClientKnownRequestError/)).toBeNull();
  });

  it("l'etichetta del campo è 'Email', con la riga sull'indirizzo dell'invito", () => {
    render(<LoginPage />);

    expect(screen.queryByText("Email")).not.toBeNull();
    expect(screen.queryByText(/indirizzo a cui è arrivato il tuo invito/i)).not.toBeNull();
  });
});
