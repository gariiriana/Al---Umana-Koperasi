// Rekap Toksan sebagai Word (.docx), isi sama persis dengan PDF (lihat rekapModel.ts).
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { NUMERIC_COLUMNS, type RekapModel, type RekapSection } from "@/toksan/export/rekapModel";
import { downloadBlob, loadLogoBytes } from "@/toksan/export/logo";

const AMBER = "FBBF24";
const SOFT = "FFFBEB";
const DARK = "111827";
const MUTED = "6B7280";
const FONT = "Calibri";
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

const text = (value: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text: value, bold: opts.bold, size: opts.size ?? 18, color: opts.color ?? DARK, font: FONT });

function cell(value: string, opts: { bold?: boolean; fill?: string; right?: boolean; size?: number } = {}) {
  return new TableCell({
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [text(value, { bold: opts.bold, size: opts.size })] })],
  });
}

function sectionTable(section: RekapSection): Table {
  const right = section.columns.map((c) => NUMERIC_COLUMNS.has(c));
  const header = new TableRow({ tableHeader: true, children: section.columns.map((c, i) => cell(c, { bold: true, fill: AMBER, right: right[i] })) });
  const body = section.rows.map((row, r) => new TableRow({
    children: row.map((v, i) => cell(v, { right: right[i], fill: r % 2 ? "F9FAFB" : undefined })),
  }));
  const foot = section.subtotal
    ? [new TableRow({ children: section.subtotal.map((v, i) => cell(v, { bold: true, fill: SOFT, right: right[i] })) })]
    : [];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body, ...foot] });
}

const heading = (value: string) => new Paragraph({ spacing: { before: 240, after: 80 }, children: [text(value, { bold: true, size: 22 })] });

export async function buildRekapDocxBlob(model: RekapModel, logo: Uint8Array | null): Promise<Blob> {
  const kopText = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [text(model.kop, { bold: true, size: 26 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [text(model.judul, { bold: true, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [text(model.periode, { size: 19, color: MUTED })] }),
  ];
  const kop = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 12, color: AMBER } },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          children: [logo
            ? new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 64, height: 64 }, type: "png" })] })
            : new Paragraph({})],
        }),
        new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: kopText }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, children: [new Paragraph({})] }),
      ],
    })],
  });

  const pairs: TableRow[] = [];
  for (let i = 0; i < model.ringkasan.length; i += 2) {
    const a = model.ringkasan[i];
    const b = model.ringkasan[i + 1];
    pairs.push(new TableRow({
      children: [
        cell(a.label, { fill: SOFT, size: 17 }), cell(a.value, { bold: true, right: true }),
        cell(b?.label ?? "", { fill: SOFT, size: 17 }), cell(b?.value ?? "", { bold: true, right: true }),
      ],
    }));
  }

  const children: (Paragraph | Table)[] = [kop, heading("Ringkasan"), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: pairs })];
  for (const section of model.sections) children.push(heading(section.title), sectionTable(section));
  if (model.obral) children.push(heading(model.obral.title), sectionTable(model.obral));
  children.push(
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.RIGHT, children: [text("TOTAL KESELURUHAN  ", { bold: true, size: 22 }), text(model.grandTotal, { bold: true, size: 26 })] }),
  );

  const doc = new Document({
    creator: "KASMA JOB — Toksan",
    title: `${model.judul} ${model.periode}`,
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 800, right: 800 } } }, children }],
  });
  return Packer.toBlob(doc);
}

export async function exportRekapDocx(model: RekapModel): Promise<void> {
  downloadBlob(await buildRekapDocxBlob(model, await loadLogoBytes()), `${model.fileName}.docx`);
}
