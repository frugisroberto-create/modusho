import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La rotta che registra la lettura di documenti e memo. Chi apre un memo o
 * clicca «Clicca qui per leggere il documento» passa di qui.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rbac", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rbac")>()),
  canUserAccessContent: vi.fn(),
  getOperativeDepartmentIds: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    content: { findUnique: vi.fn() },
    contentAcknowledgment: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { canUserAccessContent, getOperativeDepartmentIds } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { POST } from "../acknowledge/route";

const mockedSession = vi.mocked(getServerSession);
const mockedAccess = vi.mocked(canUserAccessContent);
const mockedOperative = vi.mocked(getOperativeDepartmentIds);
const mockedPrisma = vi.mocked(prisma, true);

const request = () => ({}) as unknown as Parameters<typeof POST>[0];
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "u-1", role: "OPERATOR" } } as never);
  mockedAccess.mockResolvedValue(true as never);
  mockedOperative.mockResolvedValue(["d-fo"] as never);
  mockedPrisma.content.findUnique.mockResolvedValue({
    id: "doc-1", status: "PUBLISHED", propertyId: "p-1", createdById: "u-9",
    targetAudience: [{ targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: "d-fo", targetUserId: null }],
  } as never);
  mockedPrisma.contentAcknowledgment.findUnique.mockResolvedValue(null as never);
  mockedPrisma.contentAcknowledgment.upsert.mockResolvedValue({
    contentId: "doc-1", acknowledgedAt: new Date("2026-09-15T10:00:00.000Z"),
  } as never);
});

describe("POST /api/content/[id]/acknowledge — lettura di documenti e memo", () => {
  it("un destinatario registra la lettura, con la forma di sempre", async () => {
    const res = await POST(request(), params("doc-1"));
    expect(res.status).toBe(200);
    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledWith({
      where: { contentId_userId: { contentId: "doc-1", userId: "u-1" } },
      update: {},
      create: { contentId: "doc-1", userId: "u-1", required: true },
    });
  });

  it("un capo reparto che consulta da un reparto solo visibile non registra nulla", async () => {
    mockedSession.mockResolvedValue({ user: { id: "u-1", role: "HOD" } } as never);
    mockedOperative.mockResolvedValue(["d-hk"] as never);
    const res = await POST(request(), params("doc-1"));
    expect(res.status).toBe(403);
    expect(mockedPrisma.contentAcknowledgment.upsert).not.toHaveBeenCalled();
  });

  it("l'Hotel Manager non passa dal controllo di destinatario", async () => {
    mockedSession.mockResolvedValue({ user: { id: "u-1", role: "HOTEL_MANAGER" } } as never);
    mockedOperative.mockResolvedValue([] as never);
    const res = await POST(request(), params("doc-1"));
    expect(res.status).toBe(200);
    expect(mockedOperative).not.toHaveBeenCalled();
    expect(mockedPrisma.contentAcknowledgment.upsert).toHaveBeenCalledTimes(1);
  });

  it("già letto: risponde senza riscrivere", async () => {
    mockedPrisma.contentAcknowledgment.findUnique.mockResolvedValue({
      contentId: "doc-1", acknowledgedAt: new Date("2026-09-01T08:00:00.000Z"),
    } as never);
    const res = await POST(request(), params("doc-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.alreadyAcknowledged).toBe(true);
    expect(mockedPrisma.contentAcknowledgment.upsert).not.toHaveBeenCalled();
  });
});
