import { describe, it, expect } from "vitest";
import {
  showsReadPanel,
  buildSopReadWrites,
  classifySopReadClick,
  SOP_READ_ERROR_MESSAGE,
  SOP_READ_NETWORK_OUTCOME,
} from "../sop-read";

/**
 * Le tre regole della lettura di una SOP, guardate una per una:
 * a chi si chiede di aprire, cosa si scrive quando lo fa, cosa si dice se
 * la scrittura non riesce.
 */

describe("showsReadPanel — a chi si mostra il pannello", () => {
  it("un OPERATOR che non ha ancora letto una SOP pubblicata lo vede", () => {
    expect(showsReadPanel({ role: "OPERATOR", contentStatus: "PUBLISHED", alreadyRead: false })).toBe(true);
  });

  it("un HOD si comporta come l'OPERATOR", () => {
    expect(showsReadPanel({ role: "HOD", contentStatus: "PUBLISHED", alreadyRead: false })).toBe(true);
  });

  it("chi ha già letto vede il testo, non il pannello", () => {
    expect(showsReadPanel({ role: "OPERATOR", contentStatus: "PUBLISHED", alreadyRead: true })).toBe(false);
    expect(showsReadPanel({ role: "HOD", contentStatus: "PUBLISHED", alreadyRead: true })).toBe(false);
  });

  it("HM, ADMIN e SUPER_ADMIN vedono sempre il testo: per loro la lettura si registra da sola", () => {
    for (const role of ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"] as const) {
      expect(showsReadPanel({ role, contentStatus: "PUBLISHED", alreadyRead: false })).toBe(false);
    }
  });

  it("un HOD che apre una SOP in bozza legge il testo, non resta chiuso fuori", () => {
    // Il pulsante non potrebbe funzionare: la rotta registra solo ciò che è
    // pubblicato. Mostrare il pannello qui significherebbe sbarrare la strada
    // con un comando inerte.
    for (const contentStatus of ["DRAFT", "REVIEW_HM", "REVIEW_ADMIN", "RETURNED", "ARCHIVED"] as const) {
      expect(showsReadPanel({ role: "HOD", contentStatus, alreadyRead: false })).toBe(false);
    }
  });
});

describe("buildSopReadWrites — cosa finisce nei due registri", () => {
  const now = new Date("2026-08-31T10:00:00.000Z");
  const args = { contentId: "sop-1", userId: "u-1", contentVersion: 3, now };

  it("SopViewRecord: chiave sulla versione, viewedAt e acknowledgedAt allo stesso istante", () => {
    expect(buildSopReadWrites(args).viewRecord).toEqual({
      where: {
        contentId_userId_contentVersion: { contentId: "sop-1", userId: "u-1", contentVersion: 3 },
      },
      update: { acknowledgedAt: now, viewedAt: now },
      create: {
        contentId: "sop-1",
        userId: "u-1",
        contentVersion: 3,
        viewedAt: now,
        acknowledgedAt: now,
      },
    });
  });

  it("ContentAcknowledgment: chiave contenuto-persona, required true, acknowledgedAt lasciato al default in create", () => {
    expect(buildSopReadWrites(args).acknowledgment).toEqual({
      where: { contentId_userId: { contentId: "sop-1", userId: "u-1" } },
      update: { acknowledgedAt: now },
      create: { contentId: "sop-1", userId: "u-1", required: true },
    });
    // Il campo NON va aggiunto in create: è la forma già in uso, e cambiarla
    // sposterebbe di qualche millisecondo righe che oggi due percorsi scrivono
    // allo stesso modo.
    expect(buildSopReadWrites(args).acknowledgment.create).not.toHaveProperty("acknowledgedAt");
  });

  it("i due registri portano lo stesso istante", () => {
    const w = buildSopReadWrites(args);
    expect(w.viewRecord.update.acknowledgedAt).toBe(w.acknowledgment.update.acknowledgedAt);
  });
});

describe("classifySopReadClick — come finisce il click", () => {
  it("una risposta buona è un successo", () => {
    expect(classifySopReadClick(200)).toEqual({ kind: "ok" });
  });

  it("un 401 è la sessione decaduta: se ne occupa il guard, non si mostra un errore", () => {
    expect(classifySopReadClick(401)).toEqual({ kind: "session-expired" });
  });

  it("403, 404 e 500 sono guasti, e si dicono", () => {
    for (const status of [403, 404, 500]) {
      expect(classifySopReadClick(status)).toEqual({ kind: "error", message: SOP_READ_ERROR_MESSAGE });
    }
  });

  it("il messaggio parla di registrazione, non di caricamento", () => {
    expect(SOP_READ_ERROR_MESSAGE).toContain("registrare la lettura");
    expect(SOP_READ_NETWORK_OUTCOME).toEqual({ kind: "error", message: SOP_READ_ERROR_MESSAGE });
  });
});
