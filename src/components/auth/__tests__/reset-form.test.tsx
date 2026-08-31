// @vitest-environment jsdom

/**
 * Stesso collaudo di activation-form.test.tsx, per il form di reimpostazione
 * password: prima di questo intervento un blocco da rate limiting dopo il
 * salvataggio reindirizzava in silenzio a /login, senza dire perché.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ResetForm } from "../reset-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import { signIn } from "next-auth/react";
const mockedSignIn = vi.mocked(signIn);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillValidPassword() {
  fireEvent.change(screen.getByLabelText("La tua nuova password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Scrivila di nuovo"), { target: { value: "Password123" } });
}

describe("ResetForm — errore di signIn dopo il reset", () => {
  it("un blocco per troppi tentativi viene mostrato integrale, non un redirect silenzioso", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "Account temporaneamente bloccato. Riprova tra 30 minuti.",
      status: 401,
      ok: false,
      url: null,
    } as never);

    render(<ResetForm token="tok-1" email="mario@x.it" />);
    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: /salva ed entra/i }));

    // Nessun matcher di jest-dom: si resta alle asserzioni di vitest.
    await waitFor(() => {
      expect(screen.queryByText("Account temporaneamente bloccato. Riprova tra 30 minuti.")).not.toBeNull();
    });
  });

  it("un errore inatteso mostra il testo generico, non il testo grezzo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "TypeError: fetch failed",
      status: 500,
      ok: false,
      url: null,
    } as never);

    render(<ResetForm token="tok-1" email="mario@x.it" />);
    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: /salva ed entra/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/non siamo riusciti a farti entrare automaticamente/i)
      ).not.toBeNull();
    });
    expect(screen.queryByText(/TypeError/)).toBeNull();
  });
});
