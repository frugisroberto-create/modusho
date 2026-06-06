import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma prima dell'import di rbac
vi.mock("../prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    propertyAssignment: { findMany: vi.fn() },
    userContentPermission: { findUnique: vi.fn(), findMany: vi.fn() },
    property: { findMany: vi.fn() },
    department: { findMany: vi.fn() },
  },
}));

import { prisma } from "../prisma";
import {
  checkAccess,
  canUserManageContentType,
  getAccessiblePropertyIds,
  getAccessibleDepartmentIds,
  canUserAccessContent,
  type ContentVisibilityInput,
} from "../rbac";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── checkAccess ───────────────────────────────────────────────────────

describe("checkAccess", () => {
  it("utente non trovato -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    expect(await checkAccess("u1", "OPERATOR")).toBe(false);
  });

  it("utente disattivato -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "ADMIN", isActive: false, canView: true,
    } as any);
    expect(await checkAccess("u1", "OPERATOR")).toBe(false);
  });

  it("SUPER_ADMIN bypassa tutto", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "SUPER_ADMIN", isActive: true, canView: true,
    } as any);
    expect(await checkAccess("u1", "ADMIN", "prop-1", "dept-1")).toBe(true);
  });

  it("ruolo insufficiente -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "OPERATOR", isActive: true, canView: true,
    } as any);
    expect(await checkAccess("u1", "ADMIN")).toBe(false);
  });

  it("ruolo sufficiente senza property check -> true", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "ADMIN", isActive: true, canView: true,
    } as any);
    expect(await checkAccess("u1", "HOD")).toBe(true);
  });

  it("nessuna assegnazione property -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([]);
    expect(await checkAccess("u1", "HOD", "prop-1")).toBe(false);
  });

  it("assegnazione property senza dept -> true per property check", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "u1", propertyId: "prop-1", departmentId: null },
    ] as any);
    expect(await checkAccess("u1", "HOD", "prop-1")).toBe(true);
  });

  it("assegnazione full property -> accesso a qualsiasi dept", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "u1", propertyId: "prop-1", departmentId: null },
    ] as any);
    expect(await checkAccess("u1", "HOD", "prop-1", "dept-99")).toBe(true);
  });

  it("assegnazione specifica dept -> solo quel dept", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "u1", propertyId: "prop-1", departmentId: "dept-1" },
    ] as any);
    expect(await checkAccess("u1", "HOD", "prop-1", "dept-1")).toBe(true);
    expect(await checkAccess("u1", "HOD", "prop-1", "dept-2")).toBe(false);
  });
});

// ─── canUserManageContentType ──────────────────────────────────────────

describe("canUserManageContentType", () => {
  it("SUPER_ADMIN puo gestire qualsiasi tipo", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "SUPER_ADMIN", canEdit: true } as any);
    expect(await canUserManageContentType("u1", "SOP")).toBe(true);
  });

  it("ADMIN puo gestire qualsiasi tipo", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN", canEdit: true } as any);
    expect(await canUserManageContentType("u1", "MEMO")).toBe(true);
  });

  it("HOD senza canEdit -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOD", canEdit: false } as any);
    expect(await canUserManageContentType("u1", "SOP")).toBe(false);
  });

  it("HOD con canEdit + permission -> true", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOD", canEdit: true } as any);
    mockedPrisma.userContentPermission.findUnique.mockResolvedValue({ id: "p1" } as any);
    expect(await canUserManageContentType("u1", "SOP")).toBe(true);
  });

  it("HOD con canEdit senza permission -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOD", canEdit: true } as any);
    mockedPrisma.userContentPermission.findUnique.mockResolvedValue(null);
    expect(await canUserManageContentType("u1", "SOP")).toBe(false);
  });
});

// ─── getAccessiblePropertyIds ──────────────────────────────────────────

describe("getAccessiblePropertyIds", () => {
  it("SUPER_ADMIN vede tutte le property attive", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "SUPER_ADMIN" } as any);
    mockedPrisma.property.findMany.mockResolvedValue([
      { id: "p1" }, { id: "p2" }, { id: "p3" },
    ] as any);
    const ids = await getAccessiblePropertyIds("u1");
    expect(ids).toEqual(["p1", "p2", "p3"]);
  });

  it("HOD vede solo le property assegnate", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOD" } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { propertyId: "p1" },
    ] as any);
    const ids = await getAccessiblePropertyIds("u1");
    expect(ids).toEqual(["p1"]);
  });

  it("utente non trovato -> array vuoto", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    const ids = await getAccessiblePropertyIds("u1");
    expect(ids).toEqual([]);
  });
});

// ─── canUserAccessContent ──────────────────────────────────────────────

describe("canUserAccessContent", () => {
  const content: ContentVisibilityInput = {
    propertyId: "prop-1",
    createdById: "hod-1",
    targetAudience: [
      { targetType: "ROLE", targetRole: "OPERATOR", targetDepartmentId: null, targetUserId: null },
      { targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: "dept-1", targetUserId: null },
    ],
  };

  it("SUPER_ADMIN vede tutto", async () => {
    expect(await canUserAccessContent("sa-1", "SUPER_ADMIN", content)).toBe(true);
  });

  it("ADMIN con accesso property -> true", async () => {
    // checkAccess internamente chiama user.findUnique e propertyAssignment.findMany
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "ADMIN", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "admin-1", propertyId: "prop-1", departmentId: null },
    ] as any);
    expect(await canUserAccessContent("admin-1", "ADMIN", content)).toBe(true);
  });

  it("HOD autore vede il proprio contenuto", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "hod-1", propertyId: "prop-1", departmentId: "dept-1" },
    ] as any);
    expect(await canUserAccessContent("hod-1", "HOD", content)).toBe(true);
  });

  it("OPERATOR nel dept target -> true", async () => {
    // Prima chiamata: checkAccess -> user.findUnique
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce({ role: "OPERATOR", isActive: true, canView: true } as any)
      // Seconda chiamata: getAccessibleDepartmentIds -> user.findUnique
      .mockResolvedValueOnce({ role: "OPERATOR", viewDepartmentIds: [] } as any);
    mockedPrisma.propertyAssignment.findMany
      .mockResolvedValueOnce([{ id: "a1", userId: "op-1", propertyId: "prop-1", departmentId: "dept-1" }] as any)
      .mockResolvedValueOnce([{ id: "a1", userId: "op-1", propertyId: "prop-1", departmentId: "dept-1" }] as any);
    expect(await canUserAccessContent("op-1", "OPERATOR", content)).toBe(true);
  });

  it("OPERATOR senza property -> false", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "OPERATOR", isActive: true, canView: true,
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([]);
    expect(await canUserAccessContent("op-1", "OPERATOR", content)).toBe(false);
  });
});
