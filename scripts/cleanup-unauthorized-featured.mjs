import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

/**
 * Trova contenuti con isFeatured=true messi in evidenza da utenti
 * che NON sono HM/ADMIN/SUPER_ADMIN. Questi sono il risultato del bug
 * nel POST /api/memo che mappava isPinned -> isFeatured senza RBAC.
 *
 * Default: dry-run. Usa --apply per eseguire la bonifica.
 */

const featured = await prisma.content.findMany({
  where: { isFeatured: true },
  select: {
    id: true,
    type: true,
    title: true,
    featuredAt: true,
    featuredById: true,
    createdById: true,
    featuredBy: { select: { id: true, name: true, role: true } },
    createdBy: { select: { id: true, name: true, role: true } },
  },
});

console.log(`\n📊 Contenuti isFeatured=true totali: ${featured.length}\n`);

const authorizedRoles = new Set(["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"]);

const toReset = [];
for (const c of featured) {
  // La fonte di verità è featuredBy; se null (record vecchi), fallback su createdBy
  // perché il bug del POST memo scriveva featuredById = userId = createdById.
  const actor = c.featuredBy ?? c.createdBy;
  if (!actor) continue;
  if (!authorizedRoles.has(actor.role)) {
    toReset.push({ ...c, actorRole: actor.role, actorName: actor.name });
  }
}

if (toReset.length === 0) {
  console.log("✅ Nessun contenuto con featured non autorizzato. DB pulito.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`⚠️  ${toReset.length} contenuti messi in evidenza da ruoli NON autorizzati:\n`);
console.table(toReset.map(c => ({
  id: c.id.slice(0, 10),
  type: c.type,
  title: c.title.slice(0, 40),
  actor: `${c.actorName} (${c.actorRole})`,
  featuredAt: c.featuredAt?.toISOString().slice(0, 19) ?? "-",
})));

if (!APPLY) {
  console.log("\n👉 Dry-run. Per eseguire la bonifica: node scripts/cleanup-unauthorized-featured.mjs --apply");
  await prisma.$disconnect();
  process.exit(0);
}

const result = await prisma.content.updateMany({
  where: { id: { in: toReset.map(c => c.id) } },
  data: { isFeatured: false, featuredAt: null, featuredById: null },
});

console.log(`\n✅ Bonifica eseguita: ${result.count} record aggiornati (isFeatured=false).`);
await prisma.$disconnect();
