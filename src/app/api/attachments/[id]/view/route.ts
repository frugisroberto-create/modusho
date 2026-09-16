/**
 * GET /api/attachments/[id]/view
 *
 * La vista a schermo di un allegato che il browser non sa mostrare: Word ed
 * Excel diventano HTML, e si leggono nella pagina come una SOP.
 *
 * PERCHÉ ESISTE
 * Su ModusHO un documento è quasi sempre un file: il corpo ha poche righe e la
 * sostanza sta nell'allegato. Finché l'unico comando era «Scarica», leggere una
 * policy voleva dire portarsela sul disco e aprirla con Word.
 *
 * COSA NON È
 * Non è una copia e non sostituisce il file: è una resa in sola lettura,
 * calcolata a ogni richiesta e mai salvata. L'originale resta l'unica cosa che
 * si scarica, e resta l'unica versione buona — impaginazione, intestazioni e
 * fogli di calcolo con le formule non sopravvivono alla conversione.
 *
 * Il permesso è quello del contenuto a cui l'allegato appartiene, deciso da
 * `loadAccessibleAttachment`, lo stesso dell'indirizzo firmato.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { loadAccessibleAttachment } from "@/lib/attachments/access-db";
import { downloadFromStorage } from "@/lib/attachments/storage";
import {
  EMPTY_CONVERSION_MESSAGE,
  isSpreadsheet,
  isWordDocument,
  MAX_CONVERTED_HTML_BYTES,
  TOO_LARGE_MESSAGE,
} from "@/lib/attachments/viewable";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: attachmentId } = await params;
  const access = await loadAccessibleAttachment(attachmentId, {
    id: session.user.id,
    role: session.user.role,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { attachment } = access;
  const word = isWordDocument(attachment.mimeType);
  const sheet = isSpreadsheet(attachment.mimeType);

  // PDF e immagini non passano di qui: il browser li mostra da sé, con
  // l'indirizzo firmato. Chiedere la conversione per loro è un errore di chi
  // chiama, non una mancanza del file.
  if (!word && !sheet) {
    return NextResponse.json(
      { error: "Questo tipo di file non si converte: si apre con l'indirizzo firmato" },
      { status: 400 }
    );
  }

  try {
    const buffer = await downloadFromStorage(attachment.storageKey);
    const html = word ? await convertWord(buffer) : convertSpreadsheet(buffer);

    if (html.trim().length === 0) {
      return NextResponse.json({
        data: { fileName: attachment.originalFileName, html: null, notice: EMPTY_CONVERSION_MESSAGE },
      });
    }

    if (Buffer.byteLength(html, "utf8") > MAX_CONVERTED_HTML_BYTES) {
      return NextResponse.json({
        data: { fileName: attachment.originalFileName, html: null, notice: TOO_LARGE_MESSAGE },
      });
    }

    return NextResponse.json({
      data: { fileName: attachment.originalFileName, mimeType: attachment.mimeType, html, notice: null },
    });
  } catch (error) {
    console.error("Conversione allegato non riuscita:", error);
    return NextResponse.json({ error: "Non è stato possibile mostrare il file" }, { status: 500 });
  }
}

async function convertWord(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}

/**
 * Un foglio di calcolo diventa una tabella per foglio, con il nome del foglio
 * sopra: senza il nome, tre tabelle di seguito non si capisce cosa siano.
 */
function convertSpreadsheet(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet || !trimToUsedCells(sheet)) return "";
    // `header`/`footer` vuoti: senza, SheetJS incarta la tabella in una pagina
    // HTML intera, e qui serve solo la tabella.
    const table = XLSX.utils.sheet_to_html(sheet, { editable: false, header: "", footer: "" });
    return `<h3>${escapeHtml(name)}</h3>${table}`;
  })
    .filter(Boolean)
    .join("\n");
}

/**
 * Restringe il foglio alle celle che contengono davvero qualcosa.
 *
 * Un foglio dichiara spesso un'area molto più grande di quella usata — righe
 * toccate una volta e poi svuotate, colonne formattate e mai riempite — e
 * SheetJS produce una cella HTML per ognuna: una checklist da 51 KB diventava
 * una pagina da 14 MB, che il limite rifiutava di mostrare. Si guardano le
 * celle esistenti, non l'area dichiarata, perché il foglio è sparso e l'area
 * dichiarata può contare milioni di caselle vuote.
 *
 * Restituisce false se non c'è niente da mostrare.
 */
function trimToUsedCells(sheet: XLSX.WorkSheet): boolean {
  const declared = sheet["!ref"];
  if (!declared) return false;

  const range = XLSX.utils.decode_range(declared);
  let lastRow = -1;
  let lastCol = -1;

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (cell?.v === undefined || String(cell.v).trim() === "") continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r > lastRow) lastRow = r;
    if (c > lastCol) lastCol = c;
  }

  if (lastRow < 0 || lastCol < 0) return false;

  sheet["!ref"] = XLSX.utils.encode_range({
    s: range.s,
    e: { r: Math.min(lastRow, range.e.r), c: Math.min(lastCol, range.e.c) },
  });
  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
