/**
 * import-lqa-standards.ts
 *
 * Importa le 25 sezioni LQA Standards 2026–2028 come STANDARD_BOOK
 * nel database ModusHO per la property indicata (default: PPL).
 *
 * Uso:
 *   npx ts-node --project tsconfig.json scripts/import-lqa-standards.ts
 *
 * Variabili opzionali (env):
 *   PROPERTY_CODE   Codice property target (default: PPL)
 *   DRY_RUN         Se "true", non scrive nel DB (default: false)
 *   ADMIN_USER_ID   ID utente da usare come createdById (se omesso: primo SUPER_ADMIN)
 */

import { PrismaClient, ContentType, ContentStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const PROPERTY_CODE = process.env.PROPERTY_CODE ?? "HO3";
const DRY_RUN = process.env.DRY_RUN === "true";
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? null;

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface LqaSection {
  num: string;
  title: string;
  standardSource: string;
  deptCodes: string[];
  standardCount: number;
  bodyHtml: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAdminUserId(): Promise<string> {
  if (ADMIN_USER_ID) return ADMIN_USER_ID;
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("Nessun utente SUPER_ADMIN trovato nel database.");
  console.log(`  → Utente admin: ${user.name} (${user.id})`);
  return user.id;
}

async function getProperty(code: string) {
  const prop = await prisma.property.findFirst({
    where: { code: code.toUpperCase(), isActive: true },
    select: { id: true, name: true, code: true },
  });
  if (!prop) throw new Error(`Property con codice "${code}" non trovata.`);
  return prop;
}

async function getDepartmentMap(
  propertyId: string
): Promise<Map<string, string>> {
  const depts = await prisma.department.findMany({
    where: { propertyId },
    select: { id: true, code: true, name: true },
  });
  const map = new Map<string, string>();
  for (const d of depts) {
    map.set(d.code.toUpperCase(), d.id);
  }
  console.log(
    `  → Reparti trovati: ${depts.map((d) => `${d.code}(${d.name})`).join(", ")}`
  );
  return map;
}

async function sectionExists(title: string, propertyId: string): Promise<boolean> {
  const existing = await prisma.content.findFirst({
    where: {
      title,
      propertyId,
      type: "STANDARD_BOOK",
      isDeleted: false,
    },
    select: { id: true },
  });
  return existing !== null;
}

// ─── Import principale ───────────────────────────────────────────────────────

async function importSection(
  section: LqaSection,
  propertyId: string,
  deptMap: Map<string, string>,
  adminUserId: string,
  index: number
): Promise<{ created: boolean; id?: string; skipped?: boolean }> {
  // Idempotenza: salta se esiste già con lo stesso titolo + property
  if (await sectionExists(section.title, propertyId)) {
    console.log(
      `  [${index}] SKIP  — già presente: "${section.title}"`
    );
    return { created: false, skipped: true };
  }

  // Risolvi dept codes → dept IDs
  const resolvedDeptIds: string[] = [];
  const missingCodes: string[] = [];
  for (const code of section.deptCodes) {
    const deptId = deptMap.get(code.toUpperCase());
    if (deptId) {
      resolvedDeptIds.push(deptId);
    } else {
      missingCodes.push(code);
    }
  }

  if (missingCodes.length > 0) {
    console.warn(
      `  [${index}] ⚠  Codici reparto non trovati per "${section.title}": ${missingCodes.join(", ")} — verrà creata senza target reparto specifico`
    );
  }

  if (DRY_RUN) {
    const targetInfo =
      resolvedDeptIds.length > 0
        ? `target: ${section.deptCodes.join(", ")}`
        : "target: NESSUNO";
    console.log(
      `  [${index}] DRY   — "${section.title}" (${section.standardCount} std) [${targetInfo}]`
    );
    return { created: false };
  }

  // Crea Content
  const content = await prisma.content.create({
    data: {
      type: "STANDARD_BOOK" as ContentType,
      title: section.title,
      body: section.bodyHtml,
      status: "DRAFT" as ContentStatus,
      propertyId,
      departmentId: null, // le sezioni Standard Book non appartengono a un singolo reparto
      standardSource: section.standardSource,
      createdById: adminUserId,
      updatedById: adminUserId,
      isDeleted: false,
    },
    select: { id: true },
  });

  // Crea ContentTarget
  if (resolvedDeptIds.length > 0) {
    await prisma.contentTarget.createMany({
      data: resolvedDeptIds.map((deptId) => ({
        contentId: content.id,
        targetType: "DEPARTMENT" as const,
        targetDepartmentId: deptId,
      })),
    });
  }
  // Se non ci sono deptIds (es. sezioni trasversali), non creiamo target:
  // la sezione sarà visibile solo agli ADMIN/SUPER_ADMIN finché non assegnata.

  // ContentStatusHistory — creazione DRAFT
  await prisma.contentStatusHistory.create({
    data: {
      contentId: content.id,
      fromStatus: null,
      toStatus: "DRAFT",
      changedById: adminUserId,
      note: `Import LQA Standards 2026–2028 — Sezione ${section.num} (${section.standardCount} standard)`,
    },
  });

  const targetSummary =
    resolvedDeptIds.length > 0
      ? section.deptCodes.join("+")
      : "senza target";
  console.log(
    `  [${index}] OK    — "${section.title}" → id=${content.id} [${targetSummary}] (${section.standardCount} std)`
  );

  return { created: true, id: content.id };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const jsonPath = path.join(__dirname, "lqa_sections.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(
      `File JSON non trovato: ${jsonPath}\nEsegui prima: python3 scripts/gen_lqa_json_v2.py`
    );
  }

  const sections: LqaSection[] = JSON.parse(
    fs.readFileSync(jsonPath, "utf-8")
  );

  console.log(`\n━━━ Import LQA Standards 2026–2028 ━━━`);
  console.log(`  Sezioni da importare: ${sections.length}`);
  console.log(`  Property target:      ${PROPERTY_CODE}`);
  console.log(`  Dry run:              ${DRY_RUN ? "SÌ (nessuna scrittura)" : "NO"}`);
  console.log();

  const adminUserId = await getAdminUserId();
  const property = await getProperty(PROPERTY_CODE);
  console.log(`  Property:  ${property.name} (${property.id})\n`);

  const deptMap = await getDepartmentMap(property.id);
  console.log();

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    try {
      const result = await importSection(
        section,
        property.id,
        deptMap,
        adminUserId,
        i + 1
      );
      if (result.created) created++;
      else if (result.skipped) skipped++;
    } catch (err) {
      console.error(`  [${i + 1}] ERRORE "${section.title}":`, err);
      errors++;
    }
  }

  console.log(`\n━━━ Riepilogo ━━━`);
  console.log(`  ✅ Create:  ${created}`);
  console.log(`  ⏭  Saltate: ${skipped} (già presenti)`);
  if (errors > 0) console.log(`  ❌ Errori:  ${errors}`);

  if (!DRY_RUN && created > 0) {
    console.log(`\n  → Sezioni create come DRAFT.`);
    console.log(`     Vai su HOO > Standard Book, assegna i reparti e pubblica.`);
  }

  console.log();
}

main()
  .catch((e) => {
    console.error("Errore fatale:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
