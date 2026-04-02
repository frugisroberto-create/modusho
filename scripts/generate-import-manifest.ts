import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const PROPERTY_MAPPING: Record<string, string> = {
  PAT: "HO3",
};

async function main() {
  const importDir = path.resolve(__dirname, "../SOP_IMPORT");
  const manifestPath = path.join(importDir, "_manifest.json");

  if (!fs.existsSync(manifestPath)) {
    console.error("File _manifest.json non trovato in", importDir);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
    codice: string;
    titolo: string;
    struttura: string;
    reparto: string;
    file_html: string;
  }[];

  const rows = manifest.map((entry) => ({
    titolo: entry.titolo,
    file: entry.file_html,
    struttura: PROPERTY_MAPPING[entry.struttura] || entry.struttura,
    reparto: entry.reparto,
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["titolo", "file", "struttura", "reparto"],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Manifest");

  const outputPath = path.join(importDir, "_import_manifest.xlsx");
  XLSX.writeFile(wb, outputPath);

  console.log(`Manifest generato: ${outputPath}`);
  console.log(`Righe: ${rows.length}`);
  console.log(`Struttura: ${rows[0]?.struttura}`);
  console.log(`Primi 3:`, rows.slice(0, 3).map((r) => `${r.titolo} | ${r.file} | ${r.struttura} | ${r.reparto}`).join("\n  "));
}

main().catch(console.error);
