import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user;
}

export async function getUserProperties(userId: string) {
  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId },
    select: {
      propertyId: true,
      property: { select: { id: true, name: true, code: true } },
    },
    distinct: ["propertyId"],
  });
  return assignments.map((a) => a.property);
}

export async function getUserDepartments(userId: string, propertyId: string) {
  const assignments = await prisma.propertyAssignment.findMany({
    where: { userId, propertyId },
    select: {
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
    },
  });

  // Se almeno un assignment non ha departmentId → accesso a tutti i reparti
  if (assignments.some((a) => a.departmentId === null)) {
    return prisma.department.findMany({
      where: { propertyId },
      select: { id: true, name: true, code: true },
    });
  }

  return assignments
    .filter((a) => a.department !== null)
    .map((a) => a.department!);
}
