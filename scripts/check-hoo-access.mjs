import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const hoos = await prisma.user.findMany({
  where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
  select: {
    id: true, name: true, email: true, role: true,
    propertyAssignments: { select: { propertyId: true, departmentId: true } },
  },
});

console.log("HOO users and their property assignments:");
for (const u of hoos) {
  console.log(`\n${u.role} — ${u.name} (${u.email})`);
  if (u.propertyAssignments.length === 0) {
    console.log("  ⚠️  NO PROPERTY ASSIGNMENTS");
  } else {
    for (const a of u.propertyAssignments) {
      console.log(`  • property ${a.propertyId} dept ${a.departmentId ?? "(all)"}`);
    }
  }
}

console.log("\n---\nProperties in DB:");
const props = await prisma.property.findMany({ select: { id: true, code: true, name: true } });
for (const p of props) console.log(`  ${p.code} | ${p.id} | ${p.name}`);

await prisma.$disconnect();
