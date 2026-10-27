// Export rekap absensi → Word: A4 landscape, ringkasan per karyawan lalu detail per karyawan.
import {
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { formatJam, formatTanggalPanjang } from "@/absensi/logic/format";
import { rekapFileName, rekapTables, type RekapMeta } from "@/absensi/export/rekapData";
import type { RekapRow } from "@/absensi/types";

// A4 dalam DXA (1440 = 1 inci); docx menukar lebar/tinggi untuk landscape.
const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
const MARGIN = 1000;
const CONTENT_WIDTH = A4_HEIGHT - 2 * MARGIN;

/** Lebar kolom proporsional yang jumlahnya pas dengan lebar halaman. */
function widths(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const result = weights.map((w) => Math.floor((w / total) * CONTENT_WIDTH));
  result[result.length - 1] += CONTENT_WIDTH - result.reduce((a, b) => a + b, 0);
  return result;
}

function table(rows: string[][], weights: number[]): Table {
  const columnWidths = widths(weights);
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows: rows.map((cells, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: cells.map((cell, col) => new TableCell({
        width: { size: columnWidths[col], type: WidthType.DXA },
        shading: rowIndex === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: cell, bold: rowIndex === 0, size: 20 })] })],
      })),
    })),
  });
}

const line = (text: string) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, size: 22 })] });

export function buildRekapDocument(rows: RekapRow[], meta: RekapMeta): Document {
  const { summary, detailByEmployee } = rekapTables(rows);
  const printedAt = `${formatTanggalPanjang(workDateWIB(meta.printedAt))} ${formatJam(meta.printedAt)} WIB`;

  return new Document({
    creator: meta.printedBy,
    title: "Rekap Absensi",
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Rekap Absensi")] }),
        line(`Area: ${meta.areaNames.length > 0 ? meta.areaNames.join(", ") : "-"}`),
        line(`Periode: ${formatTanggalPanjang(meta.from)} – ${formatTanggalPanjang(meta.to)}`),
        line(`Dicetak oleh: ${meta.printedBy} · ${printedAt}`),
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun("Ringkasan")] }),
        table(summary, [4, 2, 2, 3]),
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun("Detail per karyawan")] }),
        ...detailByEmployee.flatMap((employee) => [
          // keepNext: nama karyawan tidak terpisah dari tabelnya di pergantian halaman.
          new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 200 }, children: [new TextRun(employee.name)] }),
          table(employee.rows, [3, 2, 2, 2, 2, 4]),
        ]),
      ],
    }],
  });
}

export async function downloadRekapDocx(rows: RekapRow[], meta: RekapMeta): Promise<void> {
  const blob = await Packer.toBlob(buildRekapDocument(rows, meta));
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = rekapFileName(meta.from, meta.to, "docx");
  a.click();
  window.URL.revokeObjectURL(url);
}
