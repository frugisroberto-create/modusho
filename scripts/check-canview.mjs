import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const all = await prisma.user.findMany({
  where: { role: { in: ["ADMIN", "SUPER_ADMIN", "HOTEL_MANAGER"] }, isActive: true },
  select: { name: true, email: true, role: true, canView: true, canEdit: true, canApprove: true, isActive: true },
});

console.table(all);
await prisma.$disconnect();
