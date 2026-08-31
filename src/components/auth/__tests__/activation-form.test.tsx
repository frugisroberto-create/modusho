// @vitest-environment jsdom

/**
 * Il collaudo a mano, fatto fare alla macchina: si monta il form davvero e
 * si guarda cosa appare quando il login automatico dopo l'attivazione fallisce
 * per un blocco da rate limiting. Prima di questo intervento, quel ramo
 * reindirizzava in silenzio a /login senza mostrare nulla — qui si verifica
 * che il messaggio arrivi integrale sullo schermo di QUESTA pagina.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ActivationForm } from "../activation-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import { signIn } from "next-auth/react";
const mockedSignIn = vi.mocked(signIn);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fillValidPassword() {
  fireEvent.change(screen.getByLabelText("Scegli la tua password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Scrivila di nuovo"), { target: { value: "Password123" } });
}

describe("ActivationForm — errore di signIn dopo l'attivazione", () => {
  it("un blocco per troppi tentativi viene mostrato integrale, non un redirect silenzioso", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "Troppi tentativi. Riprova tra 12 minuti.",
      status: 401,
      ok: false,
      url: null,
    } as never);

    render(<ActivationForm token="tok-1" email="mario@x.it" />);
    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: /attiva e entra/i }));

    // Nessun matcher di jest-dom: si resta alle asserzioni di vitest.
    await waitFor(() => {
      expect(screen.queryByText("Troppi tentativi. Riprova tra 12 minuti.")).not.toBeNull();
    });
  });

  it("un errore inatteso mostra il testo generico, non il testo grezzo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }) as never;
    mockedSignIn.mockResolvedValue({
      error: "PrismaClientKnownRequestError: connection refused",
      status: 500,
      ok: false,
      url: null,
    } as never);

    render(<ActivationForm token="tok-1" email="mario@x.it" />);
    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: /attiva e entra/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/non siamo riusciti a farti entrare automaticamente/i)
      ).not.toBeNull();
    });
    expect(screen.queryByText(/PrismaClientKnownRequestError/)).toBeNull();
  });
});
