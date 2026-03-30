interface ContentTargetInfo {
  targetType: string;
  targetRole?: string | null;
  targetDepartment?: { name: string } | null;
}

export function formatTargetAudience(targets: ContentTargetInfo[]): string {
  if (!targets || targets.length === 0) return "";

  const roleTarget = targets.find((t) => t.targetType === "ROLE");
  if (roleTarget) return "Tutti i reparti";

  const deptNames = targets
    .filter((t) => t.targetType === "DEPARTMENT" && t.targetDepartment)
    .map((t) => t.targetDepartment!.name);

  if (deptNames.length === 0) return "";
  if (deptNames.length <= 3) return deptNames.join(", ");
  return `${deptNames.slice(0, 2).join(", ")} +${deptNames.length - 2}`;
}
