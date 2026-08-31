import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * La rotta che il pulsante verde chiama.
 *
 * Il pulsante non scrive nulla per conto proprio: passa di qui. Quindi è qui
 * che si verifica, campo per campo, che il gesto di un OPERATOR lasci nel
 * database esattamente le righe che lascia l'apertura di un HM — le stesse due
 * tabelle, gli stessi campi, lo stesso istante. Entrambi i percorsi usano
 * recordSopRead, che qui NON è finto: la scrittura in collaudo è quella vera.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rbac", () => ({ canUserAccessContent: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    content: { findUnique: vi.fn() },
    sopViewRecord: { upsert: vi.fn() },
    contentAcknowledgment: { upsert: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { canUserAccessContent } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { POST } from "../acknowledge/route";

const mockedSession = vi.mocked(getServerSession);
const mockedAccess = vi.mocked(canUserAccessContent);
const mockedPrisma = vi.mocked(prisma, true);

const NOW = new Date("2026-08-31T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  mockedSession.mockResolvedValue({ user: { id: "u-1", role: "OPERATOR" } } as never);
  mockedAccess.mockResolvedValue(true as never);
  mockedPrisma.content.findUnique.mockResolvedValue({
    id: "sop-1",
    type: "SOP",
    status: "PUBLISHED",
    version: 3,
    propertyId: "p-1",
    createdById: "u-9",
    targetAudience: [],
  } as never);
  mockedPrisma.sopViewRecord.upsert.mockResolvedValue({
    contentId: "sop-1",
    contentVersion: 3,
    viewedAt: NOW,
    acknowledgedAt: NOW,
  } as never);
  mockedPrisma.contentAcknowledgment.upsert.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
});

function request() {
  return {} as unknown as Parameters<typeof POST>[0];
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/sop/[id]/acknowledge — il click di chi legge", () => {
  it("scrive la riga legata alla versione, campo per campo", async () => {
    await POST(request(), params("sop-1"));

    expect(mockedPrisma.sopViewRecord.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.sopViewRecord.upsert).toHaveBeenCalledWith({
      where: { contentId_userId_contentVersion: { contentId: "sop-1", userId: "u-1", contentVersion: 3 } },
      update: { acknowledgedAt: NOW, viewedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", contentVersion: 3, viewedAt: NOW, acknowledgedAt: NOW },
    });
  });

  it("scrive anche la riga per coppia contenuto-persona: è quella che leggono home, conformità e cruscotto", async () => {
    await POST(request(), params("sop-1"));

    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledWith({
      where: { contentId_userId: { contentId: "sop-1", userId: "u-1" } },
      update: { acknowledgedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", required: true },
    });
  });

  it("un HOD lascia le stesse identiche righe di un OPERATOR", async () => {
    mockedSession.mockResolvedValue({ user: { id: "u-1", role: "HOD" } } as never);
    await POST(request(), params("sop-1"));

    expect(mockedPrisma.sopViewRecord.upsert.mock.calls[0][0]).toEqual({
      where: { contentId_userId_contentVersion: { contentId: "sop-1", userId: "u-1", contentVersion: 3 } },
      update: { acknowledgedAt: NOW, viewedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", contentVersion: 3, viewedAt: NOW, acknowledgedAt: NOW },
    });
    expect(mockedPrisma.contentAcknowledgment.upsert.mock.calls[0][0]).toEqual({
      where: { contentId_userId: { contentId: "sop-1", userId: "u-1" } },
      update: { acknowledgedAt: NOW },
      create: { contentId: "sop-1", userId: "u-1", required: true },
    });
  });

  it("risponde con la versione registrata", async () => {
    const res = await POST(request(), params("sop-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.contentVersion).toBe(3);
    expect(json.data.acknowledgedAt).not.toBeNull();
  });

  it("senza sessione non si scrive niente", async () => {
    mockedSession.mockResolvedValue(null as never);
    const res = await POST(request(), params("sop-1"));
    expect(res.status).toBe(401);
    expect(mockedPrisma.sopViewRecord.upsert).not.toHaveBeenCalled();
    expect(mockedPrisma.contentAcknowledgment.upsert).not.toHaveBeenCalled();
  });

  it("su una SOP non pubblicata non si scrive niente: è il motivo per cui il pannello non compare sulle bozze", async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: "sop-1", type: "SOP", status: "DRAFT", version: 1,
      propertyId: "p-1", createdById: "u-9", targetAudience: [],
    } as never);

    const res = await POST(request(), params("sop-1"));
    expect(res.status).toBe(404);
    expect(mockedPrisma.sopViewRecord.upsert).not.toHaveBeenCalled();
    expect(mockedPrisma.contentAcknowledgment.upsert).not.toHaveBeenCalled();
  });

  it("fuori perimetro non si scrive niente", async () => {
    mockedAccess.mockResolvedValue(false as never);
    const res = await POST(request(), params("sop-1"));
    expect(res.status).toBe(403);
    expect(mockedPrisma.sopViewRecord.upsert).not.toHaveBeenCalled();
    expect(mockedPrisma.contentAcknowledgment.upsert).not.toHaveBeenCalled();
  });
});
