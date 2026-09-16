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
  getOperativeDepartmentIds,
  isContentRecipient,
  isInTargetAudience,
  getMemoManagerKind,
  getRolesForRoleTarget,
  getRoleTargetsReaching,
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

// ─── Reparti operativi vs reparti visibili ─────────────────────────────

describe("getOperativeDepartmentIds", () => {
  const hodFrontOfficeConHousekeepingVisibile = () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      role: "HOD", viewDepartmentIds: ["dept-hk"],
    } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "hod-1", propertyId: "prop-1", departmentId: "dept-fo" },
    ] as any);
    mockedPrisma.department.findMany.mockResolvedValue([{ id: "dept-hk" }] as any);
  };

  it("i reparti visibili restano accessibili in consultazione", async () => {
    hodFrontOfficeConHousekeepingVisibile();
    expect(await getAccessibleDepartmentIds("hod-1", "prop-1")).toEqual(["dept-fo", "dept-hk"]);
  });

  it("i reparti visibili NON sono reparti operativi", async () => {
    hodFrontOfficeConHousekeepingVisibile();
    expect(await getOperativeDepartmentIds("hod-1", "prop-1")).toEqual(["dept-fo"]);
    expect(mockedPrisma.department.findMany).not.toHaveBeenCalled();
  });

  it("assegnazione a tutta la property -> tutti i reparti sono operativi", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOTEL_MANAGER", viewDepartmentIds: [] } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([
      { id: "a1", userId: "hm-1", propertyId: "prop-1", departmentId: null },
    ] as any);
    mockedPrisma.department.findMany.mockResolvedValue([{ id: "dept-fo" }, { id: "dept-hk" }] as any);
    expect(await getOperativeDepartmentIds("hm-1", "prop-1")).toEqual(["dept-fo", "dept-hk"]);
  });

  it("nessuna assegnazione nella property -> nessun reparto, anche con visibili", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ role: "HOD", viewDepartmentIds: ["dept-hk"] } as any);
    mockedPrisma.propertyAssignment.findMany.mockResolvedValue([]);
    expect(await getOperativeDepartmentIds("hod-1", "prop-1")).toEqual([]);
  });
});

// ─── Destinatario vs consultazione ─────────────────────────────────────

describe("isContentRecipient", () => {
  const target = (t: Partial<ContentVisibilityInput["targetAudience"][number]>) => ({
    targetType: "DEPARTMENT" as const, targetRole: null, targetDepartmentId: null, targetUserId: null, ...t,
  });
  const memoFrontOffice = [target({ targetDepartmentId: "dept-fo" })];

  it("operatore del reparto destinatario -> destinatario", () => {
    expect(isContentRecipient({ id: "op-1", role: "OPERATOR" }, ["dept-fo"], memoFrontOffice)).toBe(true);
  });

  it("HOD con il reparto solo tra i visibili -> NON destinatario", () => {
    // I reparti visibili non vengono passati: sono solo consultazione
    expect(isContentRecipient({ id: "hod-hk", role: "HOD" }, ["dept-hk"], memoFrontOffice)).toBe(false);
  });

  it("tutti gli operatori -> destinatari anche gli HOD", () => {
    const tutti = [target({ targetType: "ROLE", targetRole: "OPERATOR" })];
    expect(isContentRecipient({ id: "hod-hk", role: "HOD" }, ["dept-hk"], tutti)).toBe(true);
  });

  it("target sul ruolo HOD -> non raggiunge gli operatori", () => {
    const soloHod = [target({ targetType: "ROLE", targetRole: "HOD" })];
    expect(isContentRecipient({ id: "hod-1", role: "HOD" }, [], soloHod)).toBe(true);
    expect(isContentRecipient({ id: "op-1", role: "OPERATOR" }, ["dept-fo"], soloHod)).toBe(false);
  });

  it("target su utente specifico -> solo quell'utente", () => {
    const soloAntonia = [target({ targetType: "USER", targetUserId: "op-antonia" })];
    expect(isContentRecipient({ id: "op-antonia", role: "OPERATOR" }, [], soloAntonia)).toBe(true);
    expect(isContentRecipient({ id: "op-altro", role: "OPERATOR" }, ["dept-fo"], soloAntonia)).toBe(false);
  });

  it("nessun target -> nessun destinatario", () => {
    expect(isContentRecipient({ id: "op-1", role: "OPERATOR" }, ["dept-fo"], [])).toBe(false);
  });
});

// ─── Registro presa visione ────────────────────────────────────────────

describe("isInTargetAudience", () => {
  const t = (x: Partial<ContentVisibilityInput["targetAudience"][number]>) => ({
    targetType: "DEPARTMENT" as const, targetRole: null, targetDepartmentId: null, targetUserId: null, ...x,
  });
  const memoFrontOffice = [t({ targetDepartmentId: "dept-fo" })];

  it("memo al Front Office: dentro operatori e HOD del Front Office", () => {
    expect(isInTargetAudience({ id: "op-fo", role: "OPERATOR", assignedDepartmentIds: ["dept-fo"] }, memoFrontOffice)).toBe(true);
    expect(isInTargetAudience({ id: "hod-fo", role: "HOD", assignedDepartmentIds: ["dept-fo"] }, memoFrontOffice)).toBe(true);
  });

  it("memo al Front Office: fuori i capi reparto degli altri reparti", () => {
    expect(isInTargetAudience({ id: "hod-hk", role: "HOD", assignedDepartmentIds: ["dept-hk"] }, memoFrontOffice)).toBe(false);
  });

  it("tutti gli operatori e capi reparto: dentro operatori e HOD, fuori l'Hotel Manager", () => {
    const tutti = [t({ targetType: "ROLE", targetRole: "OPERATOR" })];
    expect(isInTargetAudience({ id: "op-hk", role: "OPERATOR", assignedDepartmentIds: ["dept-hk"] }, tutti)).toBe(true);
    expect(isInTargetAudience({ id: "hod-hk", role: "HOD", assignedDepartmentIds: ["dept-hk"] }, tutti)).toBe(true);
    expect(isInTargetAudience({ id: "hm-1", role: "HOTEL_MANAGER", assignedDepartmentIds: [] }, tutti)).toBe(false);
  });

  it("utente specifico: solo lui", () => {
    const soloUno = [t({ targetType: "USER", targetUserId: "op-1" })];
    expect(isInTargetAudience({ id: "op-1", role: "OPERATOR", assignedDepartmentIds: [] }, soloUno)).toBe(true);
    expect(isInTargetAudience({ id: "op-2", role: "OPERATOR", assignedDepartmentIds: ["dept-fo"] }, soloUno)).toBe(false);
  });
});

// ─── Gestione memo pubblicati ──────────────────────────────────────────

describe("getMemoManagerKind", () => {
  const memoDiSerena = { createdById: "hod-serena" };

  it("HOD autore: modifica e archivia il proprio memo", () => {
    expect(getMemoManagerKind({ id: "hod-serena", role: "HOD" }, memoDiSerena)).toBe("author");
  });

  it("HOD non autore: nessun permesso", () => {
    expect(getMemoManagerKind({ id: "hod-altro", role: "HOD" }, memoDiSerena)).toBeNull();
  });

  it("Hotel Manager, ADMIN e SUPER_ADMIN: gestiscono tutti i memo", () => {
    for (const role of ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"] as const) {
      expect(getMemoManagerKind({ id: "x", role }, memoDiSerena)).toBe("manager");
    }
  });

  it("Operatore e Corporate: nessun permesso, anche se autori", () => {
    expect(getMemoManagerKind({ id: "hod-serena", role: "OPERATOR" }, memoDiSerena)).toBeNull();
    expect(getMemoManagerKind({ id: "hod-serena", role: "CORPORATE" }, memoDiSerena)).toBeNull();
  });
});

// ─── «Tutti gli operatori e capi reparto» ──────────────────────────────

describe("getRolesForRoleTarget", () => {
  it("ROLE/OPERATOR raggiunge operatori e capi reparto", () => {
    expect(getRolesForRoleTarget("OPERATOR")).toEqual(["OPERATOR", "HOD"]);
  });

  it("gli altri ruoli valgono per sé", () => {
    expect(getRolesForRoleTarget("HOD")).toEqual(["HOD"]);
    expect(getRolesForRoleTarget("HOTEL_MANAGER")).toEqual(["HOTEL_MANAGER"]);
  });
});

describe("getRoleTargetsReaching — quali destinatari «per ruolo» raggiungono una persona", () => {
  it("un capo reparto è raggiunto dal proprio ruolo e da «tutti gli operatori e capi reparto»", () => {
    expect(getRoleTargetsReaching("HOD").sort()).toEqual(["HOD", "OPERATOR"]);
  });

  it("un operatore solo da «tutti gli operatori e capi reparto»", () => {
    expect(getRoleTargetsReaching("OPERATOR")).toEqual(["OPERATOR"]);
  });

  it("gli altri ruoli solo dal proprio", () => {
    expect(getRoleTargetsReaching("HOTEL_MANAGER")).toEqual(["HOTEL_MANAGER"]);
    expect(getRoleTargetsReaching("CORPORATE")).toEqual(["CORPORATE"]);
  });

  it("è l'inverso esatto di getRolesForRoleTarget", () => {
    for (const target of ["OPERATOR", "HOD", "HOTEL_MANAGER"] as const) {
      for (const role of getRolesForRoleTarget(target)) {
        expect(getRoleTargetsReaching(role), `${target} → ${role}`).toContain(target);
      }
    }
  });
});
