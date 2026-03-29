import { PrismaClient } from "@prisma/client";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const HOD_MAP: Record<string, string> = {
  FO: "hod.fo.patria@modusho.test",
  RM: "hod.rm.patria@modusho.test",
  FB: "hod.fb.patria@modusho.test",
  SP: "hod.sp.patria@modusho.test",
  QA: "hod.qa.patria@modusho.test",
};

const SOP_OUTPUT_DIR = path.join(process.cwd(), "SOP_OUTPUT");

async function main() {
  console.log("=== Import SOP Patria Palace ===\n");

  const property = await prisma.property.findUnique({ where: { code: "PPL" } });
  if (!property) throw new Error("Property PPL not found");

  const departments = await prisma.department.findMany({ where: { propertyId: property.id } });
  const deptByCode = new Map(departments.map((d) => [d.code, d]));

  // Load HOD users
  const hodUsers = new Map<string, { id: string; email: string }>();
  for (const [deptCode, email] of Object.entries(HOD_MAP)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { console.error(`  HOD not found: ${email}`); continue; }
    hodUsers.set(deptCode, { id: user.id, email: user.email });
  }

  // Find all PAT-*.docx files
  const sopFiles: { filePath: string; code: string; deptCode: string; title: string }[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.startsWith("PAT-") && entry.name.endsWith(".docx")) {
        const match = entry.name.match(/^(PAT-(\w+)-\d+)\s*-\s*(.+)\.docx$/);
        if (match) {
          sopFiles.push({ filePath: fullPath, code: match[1], deptCode: match[2], title: match[3].trim() });
        }
      }
    }
  }

  scanDir(SOP_OUTPUT_DIR);
  sopFiles.sort((a, b) => a.code.localeCompare(b.code));
  console.log(`Found ${sopFiles.length} SOP files\n`);

  let imported = 0;
  let skipped = 0;

  for (const sop of sopFiles) {
    const existing = await prisma.content.findUnique({ where: { code: sop.code } });
    if (existing) { console.log(`  SKIP ${sop.code} — already exists`); skipped++; continue; }

    const dept = deptByCode.get(sop.deptCode);
    if (!dept) { console.error(`  ERROR ${sop.code} — dept not found: ${sop.deptCode}`); continue; }

    const hod = hodUsers.get(sop.deptCode);
    if (!hod) { console.error(`  ERROR ${sop.code} — HOD not found for: ${sop.deptCode}`); continue; }

    // Convert docx → HTML
    let htmlBody: string;
    try {
      const result = await mammoth.convertToHtml({ path: sop.filePath });
      htmlBody = result.value;
    } catch (err) {
      console.error(`  ERROR ${sop.code} — docx conversion failed:`, err);
      continue;
    }

    const relPath = path.relative(process.cwd(), sop.filePath);
    const now = new Date();
    const createdAt = new Date(now.getTime() - 2 * 86400000);
    const submittedAt = new Date(now.getTime() - 1 * 86400000);

    // Create content — createdBy = HOD, submittedBy = HOD, status = REVIEW_HM
    const content = await prisma.content.create({
      data: {
        code: sop.code,
        type: "SOP",
        title: sop.title,
        body: htmlBody,
        fileUrl: relPath,
        status: "REVIEW_HM",
        propertyId: property.id,
        departmentId: dept.id,
        createdById: hod.id,
        updatedById: hod.id,
        submittedById: hod.id,
      },
    });

    // ContentStatusHistory: DRAFT → REVIEW_HM
    await prisma.contentStatusHistory.create({
      data: {
        contentId: content.id, fromStatus: null, toStatus: "DRAFT",
        changedById: hod.id, changedAt: createdAt,
        note: "Creazione SOP da import documentale",
      },
    });
    await prisma.contentStatusHistory.create({
      data: {
        contentId: content.id, fromStatus: "DRAFT", toStatus: "REVIEW_HM",
        changedById: hod.id, changedAt: submittedAt,
        note: "Inviata a review Hotel Manager",
      },
    });

    // ContentTarget: destinatari = reparto (tutti gli operatori del reparto vedranno questa SOP)
    await prisma.contentTarget.create({
      data: {
        contentId: content.id,
        targetType: "DEPARTMENT",
        targetDepartmentId: dept.id,
      },
    });

    console.log(`  OK ${sop.code} — ${sop.title} [${sop.deptCode}] author=${hod.email} target=${dept.name}`);
    imported++;
  }

  console.log(`\n=== Done: ${imported} imported, ${skipped} skipped ===`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
