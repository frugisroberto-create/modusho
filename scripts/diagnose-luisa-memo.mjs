import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 1) Trova Luisa
const luisa = await prisma.user.findFirst({
  where: { name: { contains: "Luisa", mode: "insensitive" }, isActive: true },
  select: { id: true, name: true, email: true, role: true, canView: true },
});

if (!luisa) {
  console.log("❌ Nessuna utente 'Luisa' attiva trovata");
  await prisma.$disconnect();
  process.exit(0);
}
console.log("👤 Luisa:", luisa);

// 2) Property assegnate
const assignments = await prisma.propertyAssignment.findMany({
  where: { userId: luisa.id },
  include: {
    property: { select: { id: true, code: true, name: true } },
    department: { select: { id: true, code: true, name: true } },
  },
});
console.log("\n🏨 Assignments:");
console.table(assignments.map(a => ({
  property: a.property.code,
  department: a.department?.code ?? "(all)",
})));

// 3) Tutti i MEMO PUBLISHED nelle property accessibili
const propertyIds = [...new Set(assignments.map(a => a.propertyId))];
const memos = await prisma.content.findMany({
  where: {
    type: "MEMO",
    status: "PUBLISHED",
    isDeleted: false,
    propertyId: { in: propertyIds },
  },
  select: {
    id: true,
    title: true,
    propertyId: true,
    departmentId: true,
    publishedAt: true,
    createdBy: { select: { name: true, role: true } },
    targetAudience: {
      select: { targetType: true, targetRole: true, targetDepartmentId: true, targetUserId: true },
    },
    acknowledgments: {
      where: { userId: luisa.id },
      select: { acknowledgedAt: true },
    },
  },
  orderBy: { publishedAt: "desc" },
});

console.log(`\n📝 ${memos.length} MEMO(s) PUBLISHED nelle property di Luisa:\n`);
for (const m of memos) {
  const ack = m.acknowledgments[0];
  console.log("─".repeat(80));
  console.log(`Titolo: ${m.title}`);
  console.log(`  contentId: ${m.id}`);
  console.log(`  creato da: ${m.createdBy.name} (${m.createdBy.role})`);
  console.log(`  departmentId: ${m.departmentId ?? "(null)"}`);
  console.log(`  publishedAt: ${m.publishedAt?.toISOString()}`);
  console.log(`  Ack Luisa: ${ack ? `✅ ${ack.acknowledgedAt.toISOString()}` : "❌ NON confermato"}`);
  console.log(`  Target audience:`);
  for (const t of m.targetAudience) {
    console.log(`    - ${t.targetType} / role=${t.targetRole ?? "-"} / dept=${t.targetDepartmentId ?? "-"} / user=${t.targetUserId ?? "-"}`);
  }
}

// 4) Simulazione della query che fa /api/content per Luisa con acknowledged=false
console.log("\n\n🔍 Simulazione query '/api/content?acknowledged=false' per Luisa:");
const accessibleDeptIds = assignments
  .filter(a => a.departmentId)
  .map(a => a.departmentId);
const hasFullAccess = assignments.some(a => a.departmentId === null);
let deptFilterForTargets = accessibleDeptIds;
if (hasFullAccess) {
  const allDepts = await prisma.department.findMany({
    where: { propertyId: { in: propertyIds } },
    select: { id: true },
  });
  deptFilterForTargets = allDepts.map(d => d.id);
}

const orClauses = [
  { targetType: "ROLE", targetRole: "OPERATOR" },
  { targetType: "ROLE", targetRole: luisa.role },
  { targetType: "USER", targetUserId: luisa.id },
];
if (deptFilterForTargets.length > 0) {
  orClauses.push({ targetType: "DEPARTMENT", targetDepartmentId: { in: deptFilterForTargets } });
}

const pendingVisibleToLuisa = await prisma.content.findMany({
  where: {
    isDeleted: false,
    status: "PUBLISHED",
    propertyId: { in: propertyIds },
    targetAudience: { some: { OR: orClauses } },
    acknowledgments: { none: { userId: luisa.id } },
  },
  select: {
    id: true,
    type: true,
    title: true,
    createdBy: { select: { name: true, role: true } },
  },
  orderBy: { publishedAt: "desc" },
});

console.log(`\n→ Risultato (${pendingVisibleToLuisa.length} contenuti nella sezione "Da prendere visione"):`);
console.table(pendingVisibleToLuisa.map(c => ({
  type: c.type,
  title: c.title.slice(0, 50),
  author: `${c.createdBy.name} (${c.createdBy.role})`,
  contentId: c.id.slice(0, 8),
})));

await prisma.$disconnect();
