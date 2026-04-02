import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, NumberFormat } from "docx";
import * as fs from "fs";
import * as path from "path";

async function generateTemplate() {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "procedure-numbering",
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Obiettivo")],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Descrivere lo scopo della procedura: perché esiste, cosa garantisce e in quale contesto operativo si applica.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({ children: [] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Procedura")],
          }),
          new Paragraph({
            numbering: { reference: "procedure-numbering", level: 0 },
            children: [
              new TextRun({
                text: "Primo passaggio operativo. Descrivere l'azione nel dettaglio.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            numbering: { reference: "procedure-numbering", level: 0 },
            children: [
              new TextRun({
                text: "Secondo passaggio operativo.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            numbering: { reference: "procedure-numbering", level: 0 },
            children: [
              new TextRun({
                text: "Terzo passaggio operativo.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({ children: [] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Responsabilità")],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: "Ruolo responsabile: descrivere cosa deve fare e quando.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: "Ruolo di supporto: descrivere la responsabilità complementare.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({ children: [] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Frequenza")],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Indicare la frequenza di esecuzione: giornaliera, settimanale, mensile, al bisogno, ad ogni check-in, ecc.",
                italics: true,
              }),
            ],
          }),
          new Paragraph({ children: [] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("Eccezioni e note")],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Descrivere eventuali casi particolari, eccezioni alla procedura standard o note aggiuntive per l'operatore.",
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.resolve(__dirname, "../public/templates/template-sop.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log(`Template generato: ${outputPath}`);
}

generateTemplate().catch(console.error);
