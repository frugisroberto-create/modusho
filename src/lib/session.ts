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
      property: { select: { id: true, name: true, code: true, tagline: true } },
    },
    distinct: ["propertyId"],
  });
  // Ordine deterministico: il chiamante usa properties[0] come struttura di
  // default. L'ordinamento è in memoria e non in query: questo percorso lo
  // attraversa ogni utente non-SUPER_ADMIN, e un `orderBy` su relazione
  // combinato con `distinct` non è mai stato eseguito contro il database —
  // se non venisse digerito farebbe fallire il layout all'accesso, non
  // degradare. Il risultato è lo stesso, il rischio no.
  return assignments
    .map((a) => a.property)
    .sort((a, b) => a.code.localeCompare(b.code));
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
