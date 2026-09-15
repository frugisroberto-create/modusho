/**
 * Destinatari proposti ↔ destinatari salvati.
 *
 * Funzioni pure: costruiscono le righe ContentTarget da ciò che arriva dal
 * modulo, e dicono che cosa cambia rispetto a quelle salvate. La rotta usa il
 * confronto per non riscrivere nulla quando nulla cambia, e per tracciare in
 * cronologia che cosa è stato aggiunto o tolto.
 */

export type TargetRoleValue = "OPERATOR" | "HOD" | "HOTEL_MANAGER";

export interface TargetRow {
  targetType: "ROLE" | "DEPARTMENT" | "USER";
  targetRole: TargetRoleValue | null;
  targetDepartmentId: string | null;
  targetUserId: string | null;
}

export interface TargetProposal {
  allDepartments: boolean;
  roles: TargetRoleValue[];
  departmentIds: string[];
  userIds: string[];
}

/** Le righe da salvare. «Tutti gli operatori» è un solo ROLE/OPERATOR, senza doppioni. */
export function buildTargetRows(p: TargetProposal): TargetRow[] {
  const rows: TargetRow[] = [];
  const role = (r: TargetRoleValue): TargetRow => ({ targetType: "ROLE", targetRole: r, targetDepartmentId: null, targetUserId: null });
  if (p.allDepartments) rows.push(role("OPERATOR"));
  for (const r of p.roles) {
    if (r === "OPERATOR" && p.allDepartments) continue;
    rows.push(role(r));
  }
  for (const d of p.departmentIds) rows.push({ targetType: "DEPARTMENT", targetRole: null, targetDepartmentId: d, targetUserId: null });
  for (const u of p.userIds) rows.push({ targetType: "USER", targetRole: null, targetDepartmentId: null, targetUserId: u });
  return uniqueRows(rows);
}

export function targetKey(t: TargetRow): string {
  if (t.targetType === "ROLE") return `ROLE:${t.targetRole}`;
  if (t.targetType === "DEPARTMENT") return `DEPARTMENT:${t.targetDepartmentId}`;
  return `USER:${t.targetUserId}`;
}

function uniqueRows(rows: TargetRow[]): TargetRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = targetKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Che cosa cambia passando da `current` a `next`. L'ordine non conta. */
export function diffTargets(current: TargetRow[], next: TargetRow[]) {
  const currentKeys = new Set(current.map(targetKey));
  const nextKeys = new Set(next.map(targetKey));
  const added = uniqueRows(next).filter((t) => !currentKeys.has(targetKey(t)));
  const removed = uniqueRows(current).filter((t) => !nextKeys.has(targetKey(t)));
  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}

/** Etichette dei destinatari per ruolo, come le vede chi li sceglie. */
export const TARGET_ROLE_LABELS: Record<TargetRoleValue, string> = {
  OPERATOR: "Tutti gli operatori e capi reparto",
  HOD: "Tutti gli HOD",
  HOTEL_MANAGER: "Hotel Manager",
};

/** «aggiunti: …; rimossi: …» — il testo che resta in cronologia. */
export function describeTargetChanges(
  diff: { added: TargetRow[]; removed: TargetRow[] },
  names: { departments: Map<string, string>; users: Map<string, string> }
): string {
  const label = (t: TargetRow) =>
    t.targetType === "ROLE"
      ? TARGET_ROLE_LABELS[t.targetRole as TargetRoleValue] ?? String(t.targetRole)
      : t.targetType === "DEPARTMENT"
        ? (names.departments.get(t.targetDepartmentId ?? "") ?? "reparto").trim()
        : names.users.get(t.targetUserId ?? "") ?? "utente";
  return [
    diff.added.length ? `aggiunti: ${diff.added.map(label).join(", ")}` : "",
    diff.removed.length ? `rimossi: ${diff.removed.map(label).join(", ")}` : "",
  ].filter(Boolean).join("; ");
}

/** Gli id di reparti e utenti citati nel confronto, per caricarne i nomi. */
export function idsInDiff(diff: { added: TargetRow[]; removed: TargetRow[] }) {
  const rows = [...diff.added, ...diff.removed];
  return {
    departmentIds: rows.map((t) => t.targetDepartmentId).filter((d): d is string => !!d),
    userIds: rows.map((t) => t.targetUserId).filter((u): u is string => !!u),
  };
}
