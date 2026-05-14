// prisma/seed-hod-test.ts
// Crea utente Test HOD assegnato a tutti i reparti di Patria Palace Hotel (PPL)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEST_USER = {
  email: "hod.test.patria@modusho.test",
  name: "Test HOD Patria",
  password: "V$2GvqbCC$xx",
  role: "HOD" as const,
  canView: true,
  canEdit: true,
  canApprove: false,
  isActive: true,
  contentTypes: ["SOP", "DOCUMENT"] as const,
};

const ALL_DEPT_CODES = ["FO", "RM", "FB", "MT", "SP", "QA"];

async function main() {
  console.log("🧪 Creazione utente Test HOD — Patria Palace Hotel...\n");

  const property = await prisma.property.findUnique({ where: { code: "HO3" } });
  if (!property) throw new Error("❌ Property HO3 (Patria Palace) non trovata.");
  console.log(`✓ Property: ${property.name}`);

  const departments = await prisma.department.findMany({
    where: { propertyId: property.id },
  });
  const deptMap: Record<string, string> = {};
  for (const d of departments) deptMap[d.code] = d.id;
  console.log(`✓ Reparti trovati: ${Object.keys(deptMap).join(", ")}\n`);

  const passwordHash = await bcrypt.hash(TEST_USER.password, 12);

  const user = await prisma.user.upsert({
    where: { email: TEST_USER.email },
    update: {
      name: TEST_USER.name,
      passwordHash,
      role: TEST_USER.role,
      canView: TEST_USER.canView,
      canEdit: TEST_USER.canEdit,
      canApprove: TEST_USER.canApprove,
      isActive: TEST_USER.isActive,
    },
    create: {
      email: TEST_USER.email,
      name: TEST_USER.name,
      passwordHash,
      role: TEST_USER.role,
      canView: TEST_USER.canView,
      canEdit: TEST_USER.canEdit,
      canApprove: TEST_USER.canApprove,
      isActive: TEST_USER.isActive,
    },
  });
  console.log(`✓ Utente: ${user.name} (${user.id})`);

  // PropertyAssignment — uno per ogni reparto
  let assigned = 0;
  for (const code of ALL_DEPT_CODES) {
    const deptId = deptMap[code];
    if (!deptId) {
      console.warn(`  ⚠️  Reparto ${code} non trovato — skip`);
      continue;
    }
    const existing = await prisma.propertyAssignment.findFirst({
      where: { userId: user.id, propertyId: property.id, departmentId: deptId },
    });
    if (!existing) {
      await prisma.propertyAssignment.create({
        data: { userId: user.id, propertyId: property.id, departmentId: deptId },
      });
      assigned++;
      console.log(`  ✓  Reparto ${code} assegnato`);
    } else {
      console.log(`  —  Reparto ${code} già presente`);
    }
  }

  // ContentPermissions — SOP e DOCUMENT
  for (const ct of TEST_USER.contentTypes) {
    await prisma.userContentPermission.upsert({
      where: { userId_contentType: { userId: user.id, contentType: ct } },
      update: {},
      create: { userId: user.id, contentType: ct },
    });
    console.log(`  ✓  ContentType ${ct} assegnato`);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅  Test HOD creato — ${assigned} reparti assegnati`);
  console.log(`   Email:    ${TEST_USER.email}`);
  console.log(`   Password: ${TEST_USER.password}`);
  console.log(`${"─".repeat(60)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
