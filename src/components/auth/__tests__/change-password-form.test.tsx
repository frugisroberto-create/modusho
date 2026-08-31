// @vitest-environment jsdom

/**
 * Stesso collaudo di activation-form.test.tsx, per il cambio password
 * dell'utente autenticato: prima di questo intervento un blocco da rate
 * limiting dopo il salvataggio reindirizzava in silenzio a /login.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ChangePasswordForm } from "../change-password-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import { signIn } from "next-auth/react";
const mockedSignIn = vi.mocked(signIn);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("La password che usi adesso"), { target: { value: "Vecchia123" } });
  fireEvent.change(screen.getByLabelText("La tua nuova password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Scrivila di nuovo"), { target: { value: "Password123" } });
}

const HELP = { question: "Domanda?", answer: "Risposta." };

describe("ChangePasswordForm — errore di signIn dopo il salvataggio", () => {
  it("un blocco per troppi tentativi viene mostrato integrale, non un redirect silenzioso", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "Troppi tentativi. Riprova tra 5 minuti.",
      status: 401,
      ok: false,
      url: null,
    } as never);

    render(
      <ChangePasswordForm email="mario@x.it" submitLabel="Salva" redirectTo="/" help={HELP} />
    );
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /salva/i }));

    // Nessun matcher di jest-dom: si resta alle asserzioni di vitest.
    await waitFor(() => {
      expect(screen.queryByText("Troppi tentativi. Riprova tra 5 minuti.")).not.toBeNull();
    });
  });

  it("un errore inatteso mostra il testo generico, non il testo grezzo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "Unexpected token < in JSON",
      status: 500,
      ok: false,
      url: null,
    } as never);

    render(
      <ChangePasswordForm email="mario@x.it" submitLabel="Salva" redirectTo="/" help={HELP} />
    );
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() => {
      expect(screen.queryByText(/non siamo riusciti a rinnovare la sessione/i)).not.toBeNull();
    });
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
  });
});
