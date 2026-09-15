import { describe, it, expect } from "vitest";
import type { ContentVisibilityInput } from "../rbac";
import { selectRegistryRecipients, type RegistryCandidate } from "../registry-recipients";

type Target = ContentVisibilityInput["targetAudience"][number];
const t = (x: Partial<Target>): Target => ({
  targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: null, targetUserId: null, ...x,
});

// Caso reale HO1-FO-009: destinatari Front Office + F&B
const people: RegistryCandidate[] = [
  { id: "op-fo", name: "Operatrice FO", role: "OPERATOR", departmentIds: ["fo"] },
  { id: "hod-fo", name: "Serena", role: "HOD", departmentIds: ["fo"] },
  { id: "hod-fb", name: "Donato", role: "HOD", departmentIds: ["fb", "sala-bar"] },
  { id: "hod-hk", name: "Governante", role: "HOD", departmentIds: ["hk"] },
  { id: "op-hk", name: "Cameriera", role: "OPERATOR", departmentIds: ["hk"] },
  { id: "hm", name: "Hotel Manager", role: "HOTEL_MANAGER", departmentIds: [null] },
  { id: "corp-fb", name: "Corporate F&B", role: "CORPORATE", departmentIds: ["fb"] },
];
const ids = (xs: RegistryCandidate[]) => xs.map((x) => x.id).sort();

describe("selectRegistryRecipients", () => {
  it("destinatari per reparto: operatori e capi reparto di quei reparti, nessun altro", () => {
    const content = { departmentId: "fo", targetAudience: [t({ targetDepartmentId: "fo" }), t({ targetDepartmentId: "fb" })] };
    expect(ids(selectRegistryRecipients(people, content))).toEqual(["hod-fb", "hod-fo", "op-fo"]);
  });

  it("un Corporate assegnato a un reparto destinatario non compare (come in Presa visione)", () => {
    const content = { departmentId: "fo", targetAudience: [t({ targetDepartmentId: "fb" })] };
    expect(ids(selectRegistryRecipients(people, content))).toEqual(["hod-fb"]);
  });

  it("utente specifico: solo lui (prima il registro elencava tutta la struttura)", () => {
    const content = { departmentId: "fo", targetAudience: [t({ targetType: "USER", targetUserId: "op-hk" })] };
    expect(ids(selectRegistryRecipients(people, content))).toEqual(["op-hk"]);
  });

  it("«Tutti gli operatori e capi reparto»: operatori e HOD, non l'Hotel Manager", () => {
    const content = { departmentId: null, targetAudience: [t({ targetType: "ROLE", targetRole: "OPERATOR" })] };
    expect(ids(selectRegistryRecipients(people, content))).toEqual(["hod-fb", "hod-fo", "hod-hk", "op-fo", "op-hk"]);
  });

  it("vista HOD: solo le persone del suo reparto fra i destinatari, HOD compresi", () => {
    const content = { departmentId: "fo", targetAudience: [t({ targetType: "ROLE", targetRole: "OPERATOR" })] };
    expect(ids(selectRegistryRecipients(people, content, "fo"))).toEqual(["hod-fo", "op-fo"]);
  });

  it("vista HOD: chi è del reparto ma non è destinatario non compare", () => {
    const content = { departmentId: "fo", targetAudience: [t({ targetType: "USER", targetUserId: "op-hk" })] };
    expect(ids(selectRegistryRecipients(people, content, "fo"))).toEqual([]);
  });

  it("contenuto storico senza destinatari: reparto del contenuto e assegnati a tutti i reparti", () => {
    const content = { departmentId: "hk", targetAudience: [] };
    expect(ids(selectRegistryRecipients(people, content))).toEqual(["hm", "hod-hk", "op-hk"]);
  });
});
