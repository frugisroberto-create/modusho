import { describe, it, expect, vi, beforeEach } from "vitest";

// Nessun database e nessuna push reale: VAPID non è configurato nei test,
// quindi si verifica la notifica in-app, che parte sempre.
vi.mock("../prisma", () => ({
  prisma: {
    content: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pushSubscription: { findMany: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("../notifications", () => ({ createNotifications: vi.fn() }));

import { prisma } from "../prisma";
import { createNotifications } from "../notifications";
import {
  returnNotificationRecipients,
  returnNotificationBody,
  newlyAddedRecipients,
  newContentLabel,
  sendReturnedPush,
  sendRecipientsAddedPush,
} from "../push-notification";

const mockedPrisma = vi.mocked(prisma, true);
const mockedNotify = vi.mocked(createNotifications);

beforeEach(() => vi.clearAllMocks());

describe("restituzione — chi avvisare e con quali parole", () => {
  const wf = { responsibleId: "hod-serena", consultedId: "hm-daniele", accountableId: "hoo" };

  it("R, C e A, mai chi restituisce", () => {
    expect(returnNotificationRecipients(wf, "hoo").sort()).toEqual(["hm-daniele", "hod-serena"]);
    expect(returnNotificationRecipients(wf, "hm-daniele").sort()).toEqual(["hod-serena", "hoo"]);
  });

  it("senza Consultato, e senza doppioni se due ruoli coincidono", () => {
    expect(returnNotificationRecipients({ responsibleId: "hm", consultedId: null, accountableId: "hm" }, "hoo")).toEqual(["hm"]);
  });

  it("il testo dice chi, che cosa e perché", () => {
    const body = returnNotificationBody({
      actorName: "Daniele Petrucci", actorRole: "HOTEL_MANAGER",
      contentCode: "HO1-FO-009", contentTitle: "Conti passanti", contentType: "SOP",
      note: "Manca il   passaggio sul\\n controllo serale",
    });
    expect(body).toBe("Hotel Manager Daniele Petrucci ha restituito la procedura HO1-FO-009 — Conti passanti: «Manca il passaggio sul\\n controllo serale»");
  });

  it("una motivazione lunga si tronca", () => {
    const body = returnNotificationBody({
      actorName: "HOO", actorRole: "ADMIN", contentCode: null, contentTitle: "Doc", contentType: "DOCUMENT", note: "x".repeat(300),
    });
    expect(body).toContain("il documento Doc");
    expect(body.endsWith("...»")).toBe(true);
  });

  it("sendReturnedPush crea la notifica in-app per ciascun destinatario, verso l'editor", async () => {
    await sendReturnedPush({
      recipientIds: ["hod-serena", "hm-daniele"], workflowId: "wf-1", contentId: "c-1",
      contentCode: "HO1-FO-009", contentTitle: "Conti passanti", contentType: "SOP",
      actorName: "HOO Frugis", actorRole: "ADMIN", note: "Rivedere il punto 3",
    });
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const rows = mockedNotify.mock.calls[0][0];
    expect(rows.map((r) => r.userId)).toEqual(["hod-serena", "hm-daniele"]);
    expect(rows[0]).toMatchObject({ type: "NOTE_ADDED", url: "/sop-workflow/wf-1" });
  });

  it("nessun destinatario: nessuna notifica", async () => {
    await sendReturnedPush({
      recipientIds: [], workflowId: null, contentId: "c-1", contentCode: null, contentTitle: "Doc",
      contentType: "DOCUMENT", actorName: "HM", actorRole: "HOTEL_MANAGER", note: "no",
    });
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});

describe("nuovi destinatari di un contenuto pubblicato", () => {
  it("avvisa solo chi prima non era destinatario", () => {
    expect(newlyAddedRecipients(["a", "b"], ["b", "c", "c"])).toEqual(["c"]);
    expect(newlyAddedRecipients(["a", "b"], ["a"])).toEqual([]);
  });

  it("aggiunto un reparto: la notifica arriva solo ai suoi utenti", async () => {
    // Dopo la modifica: reparti FO (già destinatario) e HK (nuovo)
    mockedPrisma.content.findUnique.mockResolvedValue({
      propertyId: "p-1",
      targetAudience: [
        { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: "d-fo", targetUserId: null },
        { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: "d-hk", targetUserId: null },
      ],
    } as never);
    mockedPrisma.user.findMany
      .mockResolvedValueOnce([{ id: "op-fo" }] as never)   // utenti di d-fo
      .mockResolvedValueOnce([{ id: "op-hk" }] as never);  // utenti di d-hk

    await sendRecipientsAddedPush({
      contentId: "sop-1", contentTitle: "Conti passanti", contentType: "SOP",
      actorId: "hm", previousRecipientIds: ["op-fo"],
    });

    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const rows = mockedNotify.mock.calls[0][0];
    expect(rows.map((r) => r.userId)).toEqual(["op-hk"]);
    expect(rows[0]).toMatchObject({ type: "CONTENT_PUBLISHED", url: "/sop/sop-1", body: "Nuova procedura da leggere: Conti passanti" });
  });

  it("tolto un reparto e basta: nessuna notifica", async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      propertyId: "p-1",
      targetAudience: [{ targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: "d-fo", targetUserId: null }],
    } as never);
    mockedPrisma.user.findMany.mockResolvedValueOnce([{ id: "op-fo" }] as never);

    await sendRecipientsAddedPush({
      contentId: "sop-1", contentTitle: "Conti passanti", contentType: "SOP",
      actorId: "hm", previousRecipientIds: ["op-fo", "hod-fb"],
    });
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});

describe("newContentLabel", () => {
  it("concorda con il tipo di contenuto", () => {
    expect(newContentLabel("SOP")).toBe("Nuova procedura");
    expect(newContentLabel("DOCUMENT")).toBe("Nuovo documento");
    expect(newContentLabel("MEMO")).toBe("Nuovo memo");
  });
});
