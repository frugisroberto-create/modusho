import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveRaciRoles } from "@/lib/sop-workflow";
import { sanitizeHtml } from "@/lib/sanitize-html";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// ─── POST: Import bulk SOP da manifest Excel + file DOCX/HTML ───────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { role } = session.user;
  const userId = session.user.id;

  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Solo ADMIN e SUPER_ADMIN possono importare SOP" }, { status: 403 });
  }

  // ── Parse multipart ──
  const formData = await request.formData();
  const manifestFile = formData.get("manifest") as File | null;
  const uploadedFiles = formData.getAll("files") as File[];

  if (!manifestFile) {
    return NextResponse.json({ error: "File manifest mancante" }, { status: 400 });
  }
  if (uploadedFiles.length === 0) {
    return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 });
  }

  // ── Detect import mode from file extensions ──
  const extensions = new Set(
    uploadedFiles.map((f) => f.name.split(".").pop()?.toLowerCase())
  );
  if (extensions.size > 1) {
    return NextResponse.json(
      { error: "Tutti i file devono avere la stessa estensione (.docx o .html)" },
      { status: 400 }
    );
  }
  const importMode: "html" | "docx" = extensions.has("html") ? "html" : "docx";
  const expectedExt = importMode === "html" ? ".html" : ".docx";

  // ── Parse manifest Excel ──
  const manifestBuffer = Buffer.from(await manifestFile.arrayBuffer());
  const workbook = XLSX.read(manifestBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return NextResponse.json({ error: "Il manifest non contiene fogli" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Il manifest è vuoto" }, { status: 400 });
  }

  // Build file map (lowercase name → File)
  const fileMap = new Map<string, File>();
  for (const f of uploadedFiles) {
    fileMap.set(f.name.toLowerCase(), f);
  }

  // ── Pre-fetch all properties + departments ──
  const allProperties = await prisma.property.findMany({
    where: { isActive: true },
    select: { id: true, code: true, departments: { select: { id: true, code: true } } },
  });
  const propertyByCode = new Map(allProperties.map((p) => [p.code.toUpperCase(), p]));

  // ── Pre-fetch existing SOP titles for duplicate warnings ──
  const existingTitles = await prisma.content.findMany({
    where: { type: "SOP", isDeleted: false },
    select: { title: true, propertyId: true, departmentId: true },
  });
  const titleKey = (t: string, propId: string, deptId: string) =>
    `${t.trim().toLowerCase()}|${propId}|${deptId}`;
  const existingTitleSet = new Set(
    existingTitles.map((c) => titleKey(c.title, c.propertyId, c.departmentId || ""))
  );

  // ── Process rows ──
  const errors: { row: number; file: string; error: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  let imported = 0;

  // Track codes generated in this batch to avoid collisions
  const batchCodeCounters = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel row (1-indexed header + data)

    const titolo = (row["titolo"] || "").trim();
    const fileName = (row["file"] || "").trim();
    const strutturaCode = (row["struttura"] || "").trim().toUpperCase();
    const repartoCode = (row["reparto"] || "").trim().toUpperCase();

    // ── Validate required fields ──
    if (!titolo) {
      errors.push({ row: rowNum, file: fileName, error: "Titolo mancante" });
      continue;
    }
    if (!fileName) {
      errors.push({ row: rowNum, file: fileName, error: "Nome file mancante" });
      continue;
    }
    if (!strutturaCode) {
      errors.push({ row: rowNum, file: fileName, error: "Codice struttura mancante" });
      continue;
    }
    if (!repartoCode) {
      errors.push({ row: rowNum, file: fileName, error: "Codice reparto mancante" });
      continue;
    }

    // ── Validate file extension matches import mode ──
    if (!fileName.toLowerCase().endsWith(expectedExt)) {
      errors.push({ row: rowNum, file: fileName, error: `Il file deve avere estensione ${expectedExt} (modalità ${importMode})` });
      continue;
    }

    // ── Validate property ──
    const property = propertyByCode.get(strutturaCode);
    if (!property) {
      errors.push({ row: rowNum, file: fileName, error: `Struttura '${strutturaCode}' non trovata` });
      continue;
    }

    // ── Validate department ──
    const department = property.departments.find((d) => d.code.toUpperCase() === repartoCode);
    if (!department) {
      errors.push({ row: rowNum, file: fileName, error: `Reparto '${repartoCode}' non trovato per struttura '${strutturaCode}'` });
      continue;
    }

    // ── Validate file exists ──
    const uploadedFile = fileMap.get(fileName.toLowerCase());
    if (!uploadedFile) {
      errors.push({ row: rowNum, file: fileName, error: "File non trovato nell'upload" });
      continue;
    }

    // ── Check duplicate warning ──
    const key = titleKey(titolo, property.id, department.id);
    if (existingTitleSet.has(key)) {
      warnings.push({ row: rowNum, message: `SOP con titolo simile già esistente: '${titolo}'` });
    }
    existingTitleSet.add(key);

    // ── Convert file to HTML ──
    let htmlBody: string;
    try {
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      if (importMode === "html") {
        htmlBody = sanitizeHtml(fileBuffer.toString("utf-8"));
      } else {
        const result = await mammoth.convertToHtml({ buffer: fileBuffer });
        htmlBody = sanitizeHtml(result.value);
      }
    } catch (err) {
      errors.push({ row: rowNum, file: fileName, error: `Errore lettura file: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    if (!htmlBody || htmlBody.trim().length === 0) {
      errors.push({ row: rowNum, file: fileName, error: "Il file non contiene testo convertibile" });
      continue;
    }

    // ── Generate SOP code (collision-safe within batch) ──
    const codePrefix = `${property.code}-${department.code}-`;
    let nextNum: number;

    if (batchCodeCounters.has(codePrefix)) {
      nextNum = batchCodeCounters.get(codePrefix)! + 1;
    } else {
      const lastCode = await prisma.content.findFirst({
        where: { type: "SOP", code: { startsWith: codePrefix } },
        orderBy: { code: "desc" },
        select: { code: true },
      });
      nextNum = 1;
      if (lastCode?.code) {
        const parts = lastCode.code.split("-");
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) nextNum = num + 1;
      }
    }
    batchCodeCounters.set(codePrefix, nextNum);
    const sopCode = `${codePrefix}${String(nextNum).padStart(3, "0")}`;

    // ── Resolve RACI: import → R=HM, A=HOO (importer) ──
    const hm = await prisma.propertyAssignment.findFirst({
      where: { propertyId: property.id, user: { role: "HOTEL_MANAGER", isActive: true } },
      select: { userId: true },
    });
    const hmUserId = hm?.userId;

    // Import: HM is R so they can review/edit, HOO (importer) is A
    const raciAssignment = hmUserId
      ? { responsibleId: hmUserId, consultedId: null, accountableId: userId }
      : { responsibleId: userId, consultedId: null, accountableId: userId };

    // ── Create SOP + workflow in transaction ──
    try {
      await prisma.$transaction(async (tx) => {
        const content = await tx.content.create({
          data: {
            type: "SOP",
            code: sopCode,
            title: titolo,
            body: htmlBody,
            status: "DRAFT",
            propertyId: property.id,
            departmentId: department.id,
            createdById: userId,
            updatedById: userId,
          },
        });

        const workflow = await tx.sopWorkflow.create({
          data: {
            contentId: content.id,
            sopStatus: "IN_LAVORAZIONE",
            responsibleId: raciAssignment.responsibleId,
            consultedId: raciAssignment.consultedId,
            accountableId: raciAssignment.accountableId,
            textVersionCount: 1,
            lastSavedAt: new Date(),
            lastSavedById: userId,
          },
        });

        await tx.sopTextVersion.create({
          data: {
            sopWorkflowId: workflow.id,
            versionNumber: 1,
            title: titolo,
            body: htmlBody,
            savedById: userId,
          },
        });

        await tx.sopWorkflowEvent.create({
          data: {
            sopWorkflowId: workflow.id,
            eventType: "DRAFT_CREATED",
            actorId: userId,
            metadata: { source: "bulk-import", originalFile: fileName },
          },
        });

        await tx.contentTarget.create({
          data: { contentId: content.id, targetType: "DEPARTMENT", targetDepartmentId: department.id },
        });

        await tx.contentStatusHistory.create({
          data: { contentId: content.id, fromStatus: null, toStatus: "DRAFT", changedById: userId },
        });
      });

      imported++;
    } catch (err) {
      errors.push({ row: rowNum, file: fileName, error: `Errore creazione SOP: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return NextResponse.json({
    data: { imported, errors, warnings, mode: importMode },
  });
}
