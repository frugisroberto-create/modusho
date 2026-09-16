/**
 * COME SI GUARDA UN ALLEGATO SENZA SCARICARLO.
 *
 * PERCHÉ ESISTE QUESTO MODULO
 * Un documento su ModusHO è quasi sempre un file: il corpo del contenuto ha
 * poche righe e la sostanza sta nell'allegato. Finché l'unico comando era
 * «Scarica», leggere una policy significava portarsela sul disco, aprirla con
 * Word e sperare di avere l'ultima versione. Un documento deve potersi
 * leggere a schermo, come una SOP.
 *
 * I tre modi, che dipendono solo dal tipo di file:
 *  - "file": il browser lo mostra da sé (PDF e immagini). Basta l'indirizzo
 *    firmato, in un riquadro nella pagina.
 *  - "converted": Word ed Excel il browser non li sa mostrare. Il server li
 *    converte in HTML — mammoth per .docx, xlsx per i fogli — e la pagina
 *    mostra il testo. La conversione è una VISTA, non una copia: il file
 *    originale resta l'unica cosa scaricabile.
 *  - "download": nient'altro è previsto oggi. Chi arriva qui scarica.
 *
 * Funzioni pure: nessuna query, nessun accesso allo storage.
 */

export type ViewMode = "file" | "converted" | "download";

/** Tipi che il browser mostra da solo. */
const BROWSER_NATIVE_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Tipi che il server sa convertire in HTML per la lettura a schermo. */
const CONVERTIBLE_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];

export function getViewMode(mimeType: string): ViewMode {
  if (BROWSER_NATIVE_MIMES.includes(mimeType)) return "file";
  if (CONVERTIBLE_MIMES.includes(mimeType)) return "converted";
  return "download";
}

export function isViewable(mimeType: string): boolean {
  return getViewMode(mimeType) !== "download";
}

/** Vero solo per i tipi che la rotta di conversione accetta. */
export function isConvertible(mimeType: string): boolean {
  return getViewMode(mimeType) === "converted";
}

export function isWordDocument(mimeType: string): boolean {
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function isSpreadsheet(mimeType: string): boolean {
  return mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

/**
 * Quanto HTML ha senso mandare al browser per una vista.
 * Oltre questa soglia la pagina diventa più lenta del download che voleva
 * evitare: meglio dirlo, e lasciare il file.
 */
export const MAX_CONVERTED_HTML_BYTES = 2 * 1024 * 1024;

/** Il messaggio che sostituisce la vista quando il file è troppo grande. */
export const TOO_LARGE_MESSAGE =
  "Il file è troppo grande per essere mostrato a schermo. Scaricalo per consultarlo.";

/** Il messaggio quando il file non contiene testo mostrabile. */
export const EMPTY_CONVERSION_MESSAGE =
  "Il file non contiene testo che si possa mostrare a schermo. Scaricalo per consultarlo.";
