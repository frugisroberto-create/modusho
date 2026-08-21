import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La porta gemella: questo endpoint scrive nella stessa tabella di
 * POST /api/users e PUT /api/users/[id], e finora aveva il solo gate sul
 * ruolo. Il gate dice CHI può assegnare, non DOVE: questi test bloccano le
 * tre vie d'uscita dal perimetro.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    property: { findUnique: vi.fn() },
    department: { findMany: vi.fn() },
    propertyAssignment: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockedSession = vi.mocked(getServerSession);
const mockedPrisma = vi.mocked(prisma, true);

const P1 = "prop-1";
const P2 = "prop-2";
const D1 = "dept-1"; // reparto vero di P1
const D2 = "dept-2"; // reparto vero di P2

function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** ADMIN assegnato alla sola P1: il suo perimetro finisce lì. */
function actorRow() {
  return {
    id: "actor-1",
    role: "ADMIN",
    canCreateUsers: true,
    isActive: true,
    propertyAssignments: [{ propertyId: P1, departmentId: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ user: { id: "actor-1", role: "ADMIN" } } as never);
  mockedPrisma.user.findUnique.mockResolvedValue(actorRow() as never);
  mockedPrisma.property.findUnique.mockResolvedValue({ id: P1 } as never);
  mockedPrisma.propertyAssignment.findFirst.mockResolvedValue(null as never);
});

describe("POST /api/users/[id]/assignments — perimetro", () => {
  it("rifiuta una struttura fuori dal perimetro dell'attore", async () => {
    const res = await POST(fakeRequest({ propertyId: P2, departmentId: null }), params("target-1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/struttura fuori dal tuo perimetro/i);
    expect(mockedPrisma.propertyAssignment.create).not.toHaveBeenCalled();
  });

  it("rifiuta un reparto fuori dal perimetro dell'attore (HOD)", async () => {
    // Un HOD col flag: il suo perimetro è P1 + il solo reparto D1.
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: "actor-1",
      role: "HOD",
      canCreateUsers: true,
      isActive: true,
      propertyAssignments: [{ propertyId: P1, departmentId: D1 }],
    } as never);
    mockedSession.mockResolvedValue({ user: { id: "actor-1", role: "ADMIN" } } as never);

    const res = await POST(
      fakeRequest({ propertyId: P1, departmentId: "reparto-altrui" }),
      params("target-1")
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/reparto fuori dal tuo perimetro/i);
    expect(mockedPrisma.propertyAssignment.create).not.toHaveBeenCalled();
  });

  it("rifiuta un reparto che appartiene a un'altra struttura (integrità)", async () => {
    // D2 è un reparto vero, ma di P2: la coppia (P1, D2) non ha senso.
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D2, propertyId: P2 }] as never);

    const res = await POST(fakeRequest({ propertyId: P1, departmentId: D2 }), params("target-1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Il reparto indicato non appartiene alla struttura indicata.");
    expect(mockedPrisma.propertyAssignment.create).not.toHaveBeenCalled();
  });

  it("ammette un'assegnazione coerente e dentro il perimetro", async () => {
    mockedPrisma.department.findMany.mockResolvedValueOnce([{ id: D1, propertyId: P1 }] as never);
    mockedPrisma.propertyAssignment.create.mockResolvedValue({
      id: "pa-1",
      userId: "target-1",
      propertyId: P1,
      departmentId: D1,
      property: { id: P1, name: "Hotel", code: "HTL" },
      department: { id: D1, name: "Front Office", code: "FO" },
    } as never);

    const res = await POST(fakeRequest({ propertyId: P1, departmentId: D1 }), params("target-1"));

    expect(res.status).toBe(201);
    expect(mockedPrisma.propertyAssignment.create).toHaveBeenCalledTimes(1);
  });

  it("il perimetro è verificato PRIMA di qualunque scrittura o lettura di esistenza", async () => {
    await POST(fakeRequest({ propertyId: P2, departmentId: null }), params("target-1"));

    // Struttura fuori raggio: si nega senza nemmeno controllare i duplicati.
    expect(mockedPrisma.propertyAssignment.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.propertyAssignment.create).not.toHaveBeenCalled();
  });
});
