import { Role, ContentType } from "@prisma/client";
import { prisma } from "./prisma";

const ROLE_HIERARCHY: Record<Role, number> = {
  OPERATOR: 0,
  HOD: 1,
  HOTEL_MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/**
 * Verifica se un utente ha accesso in base a:
 * 1. role (gerarchia)
 * 2. canView / canEdit / canApprove
 * 3. propertyId (PropertyAssignment)
 * 4. departmentId (PropertyAssignment con departmentId)
 * 5. contentType (UserContentPermission, se applicabile)
 *
 * SUPER_ADMIN bypassa tutto.
 * Prevale sempre il livello più restrittivo.
 */
export async function checkAccess(
  userId: string,
  requiredRole: Role,
  propertyId?: string,
  departmentId?: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, canView: true },
  });

  if (!user || !user.isActive || !user.canView) return false;

  // SUPER_ADMIN bypassa tutto
  if (user.role === "SUPER_ADMIN") return true;

  // Verifica ruolo
  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[requiredRole]) {
    return false;
  }

  // Se non serve un controllo su property, il ruolo basta
  if (!propertyId) return true;

  // Verifica assegnazione property
  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId, propertyId },
  });

  if (assignments.length === 0) return false;

  // Se non serve un controllo su department, l'assegnazione property basta
  if (!departmentId) return true;

  // Un assignment senza departmentId = accesso a tutti i reparti della property
  const hasFullPropertyAccess = assignments.some((a) => a.departmentId === null);
  if (hasFullPropertyAccess) return true;

  const hasDepartmentAccess = assignments.some(
    (a) => a.departmentId === departmentId
  );
  return hasDepartmentAccess;
}

/**
 * Verifica se l'utente può gestire (creare/editare) un certo tipo di contenuto.
 * SUPER_ADMIN bypassa tutto.
 * Operatori non hanno content permissions (solo visualizzazione).
 */
export async function canUserManageContentType(
  userId: string,
  contentType: ContentType
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, canEdit: true },
  });

  if (!user) return false;
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
  if (!user.canEdit) return false;

  const permission = await prisma.userContentPermission.findUnique({
    where: { userId_contentType: { userId, contentType } },
  });

  return !!permission;
}

/**
 * Restituisce i tipi di contenuto che l'utente può gestire.
 * SUPER_ADMIN: tutti.
 */
export async function getUserContentPermissions(
  userId: string
): Promise<ContentType[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) return [];

  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    return ["SOP", "DOCUMENT", "MEMO"];
  }

  const permissions = await prisma.userContentPermission.findMany({
    where: { userId },
    select: { contentType: true },
  });

  return permissions.map((p) => p.contentType);
}

/**
 * Restituisce gli ID delle property accessibili dall'utente.
 * SUPER_ADMIN: tutte le property attive.
 */
export async function getAccessiblePropertyIds(
  userId: string
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) return [];

  if (user.role === "SUPER_ADMIN") {
    const allProperties = await prisma.property.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return allProperties.map((p) => p.id);
  }

  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId },
    select: { propertyId: true },
    distinct: ["propertyId"],
  });

  return assignments.map((a) => a.propertyId);
}

/**
 * Restituisce gli ID dei department accessibili dall'utente in una property.
 * Assignment senza departmentId = accesso a tutti i reparti.
 * SUPER_ADMIN: tutti i reparti.
 */
export async function getAccessibleDepartmentIds(
  userId: string,
  propertyId: string
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) return [];

  if (user.role === "SUPER_ADMIN") {
    const allDepts = await prisma.department.findMany({
      where: { propertyId },
      select: { id: true },
    });
    return allDepts.map((d) => d.id);
  }

  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId, propertyId },
  });

  if (assignments.length === 0) return [];

  const hasFullAccess = assignments.some((a) => a.departmentId === null);
  if (hasFullAccess) {
    const allDepts = await prisma.department.findMany({
      where: { propertyId },
      select: { id: true },
    });
    return allDepts.map((d) => d.id);
  }

  return assignments
    .filter((a) => a.departmentId !== null)
    .map((a) => a.departmentId!);
}
