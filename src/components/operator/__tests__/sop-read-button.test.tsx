// @vitest-environment jsdom

/**
 * Il click, guardato dal lato di chi è davanti allo schermo.
 *
 * Due cose in collaudo: che il pulsante chiami la rotta di sempre (e non si
 * scriva una scorciatoia sua), e che un click andato male lo dica invece di
 * non fare niente — il difetto silenzioso del pulsante condiviso, che restava
 * fermo senza spiegare perché.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SopReadButton } from "../sop-read-button";
import { SOP_READ_ERROR_MESSAGE } from "@/lib/sop-read";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: (...a: unknown[]) => refresh(...a) }) }));
vi.mock("@/components/shared/push-permission-banner", () => ({ incrementAckCount: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

function clicca() {
  fireEvent.click(screen.getByRole("button"));
}

describe("SopReadButton", () => {
  it("chiama la rotta di sempre, in POST: la scrittura resta una sola", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<SopReadButton contentId="sop-1" />);
    clicca();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/sop/sop-1/acknowledge", { method: "POST" });
  });

  it("andata bene, la pagina si ridisegna e il testo compare", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));

    render(<SopReadButton contentId="sop-1" />);
    clicca();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("andata male, lo dice — e il pulsante torna cliccabile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500 }));

    render(<SopReadButton contentId="sop-1" />);
    clicca();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toBe(SOP_READ_ERROR_MESSAGE);
    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("connessione caduta: il messaggio arriva lo stesso, non una promise persa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rete assente")));

    render(<SopReadButton contentId="sop-1" />);
    clicca();

    expect((await screen.findByRole("alert")).textContent).toBe(SOP_READ_ERROR_MESSAGE);
  });

  it("sessione decaduta: nessun messaggio, se ne occupa il guard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));

    render(<SopReadButton contentId="sop-1" />);
    clicca();

    await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("un secondo tentativo pulisce il messaggio precedente", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<SopReadButton contentId="sop-1" />);
    clicca();
    await screen.findByRole("alert");

    clicca();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
