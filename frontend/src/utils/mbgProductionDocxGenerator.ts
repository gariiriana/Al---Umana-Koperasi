// ============================================================================
// MBG Production Report DOCX Generator — Landscape Official Layout
// Badan Gizi Nasional & Koperasi Konsumen Al-Umanaa Mandiri Berkah
// ============================================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  PageOrientation,
} from 'docx';
import type {
  MbgPmBatch,
  MbgPmEntry,
  MbgProductionDailyReport,
  MbgPortionDailyData,
} from '@/types/mbg';
import { getFilteredPmEntries, type FilteredPmRow } from '@/utils/mbgPmFilter';

export interface MbgProductionDocxData {
  batch: MbgPmBatch;
  entries: MbgPmEntry[];
  dailyReport?: MbgProductionDailyReport | null;
  logoBase64?: string | null;
}

function dataUriToUint8Array(dataUri: string): Uint8Array | null {
  try {
    const base64 = dataUri.split(',')[1] || dataUri;
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('Failed converting data URI to Uint8Array:', err);
    return null;
  }
}

function formatRp(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return 'Rp 0';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

function formatNum(val: number | undefined | null, decimals = 1): string {
  if (val == null || isNaN(val)) return '0';
  if (Number.isInteger(val)) return val.toString();
  return Number(val.toFixed(decimals)).toString();
}

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
};

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const COMPACT_CELL_MARGINS = { top: 60, bottom: 60, left: 80, right: 80 };
const NORMAL_CELL_MARGINS = { top: 80, bottom: 80, left: 100, right: 100 };

export async function generateMbgProductionDocx(data: MbgProductionDocxData): Promise<Blob> {
  const { batch, entries, dailyReport, logoBase64 } = data;

  if (!dailyReport) {
    throw new Error('Batch ini belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.');
  }

  const docChildren: (Paragraph | Table)[] = [];

  // ==========================================================================
  // 1. KOP SURAT RESMI (OFFICIAL LETTERHEAD)
  // ==========================================================================
  if (logoBase64) {
    const logoBytes = dataUriToUint8Array(logoBase64);
    if (logoBytes) {
      docChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [
            new ImageRun({
              data: logoBytes,
              transformation: { width: 52, height: 52 },
              type: 'png',
            }),
          ],
        })
      );
    }
  }

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [
        new TextRun({
          text: 'BADAN GIZI NASIONAL',
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [
        new TextRun({
          text: 'SATUAN PELAYANAN PROGRAM GIZI (SPPG) KABUPATEN SUKABUMI',
          bold: true,
          size: 20, // 10pt
          font: 'Arial',
          color: '1E293B',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [
        new TextRun({
          text: 'KOPERASI KONSUMEN AL-UMANAA MANDIRI BERKAH',
          bold: true,
          size: 19, // 9.5pt
          font: 'Arial',
          color: 'B45309', // Amber 700
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [
        new TextRun({
          text: 'LAPORAN OPERASIONAL HARIAN MBG — TIM PRODUKSI DAPUR',
          bold: true,
          size: 20, // 10pt
          font: 'Arial',
          color: '0369A1', // Sky 700
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 140 },
      children: [
        new TextRun({
          text: `Tanggal Batch: ${batch.tanggal} • SPPG Sukabumi Gunungguruh Kebonmanggu • Dokumen Resmi SIMOL MBG`,
          size: 15, // 7.5pt
          font: 'Arial',
          color: '64748B',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 160 },
      children: [
        new TextRun({
          text: '══════════════════════════════════════════════════════════════════════════════════════════════════════════════════',
          size: 12,
          color: 'CBD5E1',
        }),
      ],
    })
  );

  // ==========================================================================
  // 2. METADATA BATCH BOX
  // ==========================================================================
  const totalPorsi =
    batch.totalJumlah ||
    entries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : (e.jumlah || 0)), 0) ||
    (dailyReport.sekolahList || []).reduce((s, sk) => s + sk.murid + sk.guru, 0);

  const totalInstitusi = entries.length || (dailyReport.sekolahList || []).length;

  const metadataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: CELL_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Tanggal Produksi', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: batch.tanggal, bold: true, size: 16, color: 'B45309', font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Status Batch', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: batch.status, bold: true, size: 16, color: '059669', font: 'Arial' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Total Sasaran Porsi', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: `${totalPorsi.toLocaleString('id-ID')} Porsi`, bold: true, size: 16, color: '1E3A8A', font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Total Lembaga Sasaran', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: NORMAL_CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: `${totalInstitusi} Lembaga`, bold: true, size: 16, font: 'Arial' })] })],
          }),
        ],
      }),
    ],
  });

  docChildren.push(metadataTable);
  docChildren.push(new Paragraph({ spacing: { after: 180 }, children: [] }));

  // ==========================================================================
  // HELPER: BUILD 3-SECTION TABLE & PM TABLE IN DOCX FOR A PORTION
  // ==========================================================================
  const appendPortionSectionDocx = (
    portionData: MbgPortionDailyData | undefined,
    portionNumberText: string,
    defaultTitle: string,
    portionType: 'kecil' | 'besar' | 'balita' | 'bumil'
  ) => {
    if (!portionData && portionType !== 'kecil' && portionType !== 'besar') {
      return; // Skip balita/bumil if empty
    }

    const title = portionData?.portionTitle || defaultTitle;
    const data = portionData || {
      portionType,
      portionTitle: defaultTitle,
      pmCount: 0,
      menuList: [],
      nutritionItems: [],
      bahanItems: [],
      bumbuItems: [],
      totalGizi: { beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
      akgMetrics: {},
      totalBelanjaBahan: 0,
      hargaBahanPerPorsi: 0,
      totalBelanjaBumbu: 0,
      hargaBumbuPerPorsi: 0,
      totalBelanjaOverall: 0,
      hargaPerPorsiOverall: 0,
    };

    // Section Title
    docChildren.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: `${portionNumberText}. ${title.toUpperCase()}`,
            bold: true,
            size: 20, // 10pt
            font: 'Arial',
            color: '0F172A',
          }),
        ],
      })
    );

    const maxRows = Math.max(
      data.nutritionItems?.length || 0,
      data.bahanItems?.length || 0,
      data.bumbuItems?.length || 0,
      1
    );

    // Build Table Rows (Exact 3-Section side-by-side format)
    const tableRows: TableRow[] = [
      // Header 1: Category Banners (Pink, Sky Blue, Amber)
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            columnSpan: 9,
            shading: { fill: 'FFE4E6' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '🌸 1. KANDUNGAN GIZI MENU', bold: true, size: 14, color: '881337', font: 'Arial' })] })],
          }),
          new TableCell({
            columnSpan: 9,
            shading: { fill: 'E0F2FE' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '🥣 2. PESANAN BAHAN POKOK', bold: true, size: 14, color: '0369A1', font: 'Arial' })] })],
          }),
          new TableCell({
            columnSpan: 6,
            shading: { fill: 'FEF3C7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '🧂 3. PESANAN BUMBU MASAK', bold: true, size: 14, color: '92400E', font: 'Arial' })] })],
          }),
        ],
      }),

      // Header 2: Subheader column names
      new TableRow({
        tableHeader: true,
        children: [
          // Gizi (Pink subheader)
          ...['Jenis Menu', 'Menu', 'Rincian Bahan', 'Berat (g)', 'Energi', 'Protein', 'Lemak', 'Karbo', 'Serat'].map((h) =>
            new TableCell({
              shading: { fill: 'FFF1F2' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 13, color: '9F1239', font: 'Arial' })] })],
            })
          ),
          // Bahan (Sky subheader)
          ...['Rincian Bahan', 'Harga Baku', '%BDD', 'Berat Kotor', 'Total (g)', 'Spare', 'Kebutuhan', 'Satuan', 'Harga'].map((h) =>
            new TableCell({
              shading: { fill: 'F0F9FF' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 13, color: '0C4A6E', font: 'Arial' })] })],
            })
          ),
          // Bumbu (Amber subheader)
          ...['Nama Menu', 'Nama Bumbu', 'Harga Bumbu', 'Kebutuhan', 'Satuan', 'Harga'].map((h) =>
            new TableCell({
              shading: { fill: 'FFFBEB' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 13, color: '78350F', font: 'Arial' })] })],
            })
          ),
        ],
      }),
    ];

    // Data Rows
    for (let idx = 0; idx < maxRows; idx++) {
      const nut = data.nutritionItems?.[idx];
      const bah = data.bahanItems?.[idx];
      const bum = data.bumbuItems?.[idx];
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';

      tableRows.push(
        new TableRow({
          children: [
            // Gizi
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: idx === 0 ? defaultTitle : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: nut?.menuName || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: nut?.rincianBahan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.beratBersih, 1) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.energi, 1) : '', bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.protein, 1) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.lemak, 1) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.karbohidrat, 1) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: nut ? formatNum(nut.serat, 1) : '', size: 13, font: 'Arial' })] })] }),

            // Bahan
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bah?.rincianBahan || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bah?.hargaBahan ? formatRp(bah.hargaBahan) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah?.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah ? formatNum(bah.beratKotor, 0) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah ? formatNum(bah.totalGml, 0) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah?.sparePercent ? `${bah.sparePercent}%` : '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'E0F2FE' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah ? formatNum(bah.kebutuhan, 1) : '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah?.satuan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'DCFCE7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bah?.harga ? formatRp(bah.harga) : '', bold: true, color: '166534', size: 13, font: 'Arial' })] })] }),

            // Bumbu
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bum?.namaMenu || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bum?.namaBumbu || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bum?.hargaBumbu ? formatRp(bum.hargaBumbu) : '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bum ? (bum.kebutuhan !== undefined && bum.kebutuhan !== null ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '0') : '-') : '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bum?.satuan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bum?.harga ? formatRp(bum.harga) : '', bold: true, color: '92400E', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    }

    // Footers
    tableRows.push(
      // Row Total
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { fill: 'FFE4E6' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'TOTAL GIZI', bold: true, size: 13, color: '881337', font: 'Arial' })] })],
          }),
          new TableCell({ shading: { fill: 'FFE4E6' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.beratBersih, 1), bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.energi, 1), bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFE4E6' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.protein, 1), bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFE4E6' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.lemak, 1), bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFE4E6' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.karbohidrat, 1), bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFE4E6' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.serat, 1), bold: true, size: 13, font: 'Arial' })] })] }),

          new TableCell({
            columnSpan: 8,
            shading: { fill: 'E0F2FE' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL BELANJA BAHAN:', bold: true, size: 13, color: '0369A1', font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'DCFCE7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(data.totalBelanjaBahan), bold: true, size: 13, color: '166534', font: 'Arial' })] })],
          }),

          new TableCell({
            columnSpan: 5,
            shading: { fill: 'FEF3C7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL BELANJA BUMBU:', bold: true, size: 13, color: '92400E', font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'FEF3C7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(data.totalBelanjaBumbu), bold: true, size: 13, color: '92400E', font: 'Arial' })] })],
          }),
        ],
      }),

      // Row Biaya per Porsi
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 9,
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Biaya Bahan Pokok per Porsi:', bold: true, size: 13, color: '475569', font: 'Arial' })] })],
          }),
          new TableCell({
            columnSpan: 9,
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi`, bold: true, size: 13, color: '0369A1', font: 'Arial' })] })],
          }),
          new TableCell({
            columnSpan: 6,
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi`, bold: true, size: 13, color: '92400E', font: 'Arial' })] })],
          }),
        ],
      })
    );

    // AKG Metrics
    if (data.akgMetrics && Object.keys(data.akgMetrics).length > 0) {
      Object.entries(data.akgMetrics).forEach(([akgKey, metric]) => {
        const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 3,
                shading: { fill: 'FEF3C7' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: `% Pemenuhan Makan Siang (${cleanKey})`, bold: true, size: 13, color: '92400E', font: 'Arial' })] })],
              }),
              new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '-', size: 13, font: 'Arial' })] })] }),
              new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(metric.percentMakanSiang, 1)}%`, bold: true, size: 13, color: '92400E', font: 'Arial' })] })] }),
              new TableCell({
                columnSpan: 4,
                shading: { fill: 'FEF3C7' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes', size: 13, color: '92400E', font: 'Arial' })] })],
              }),
              new TableCell({
                columnSpan: 15,
                shading: { fill: 'F8FAFC' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: `Capaian Angka Kecukupan Gizi (AKG) Sasaran ${cleanKey}`, italics: true, size: 13, color: '64748B', font: 'Arial' })] })],
              }),
            ],
          })
        );
      });
    }

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: tableRows }));
    docChildren.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

    // ─── DIRECTLY BELOW: PENERIMA MANFAAT (INPUT ADMIN MBG) ───
    const pmRows: FilteredPmRow[] = getFilteredPmEntries(entries, portionType, dailyReport.sekolahList);
    const totalPorsiPm = pmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.portionCount), 0);

    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [
          new TextRun({
            text: `Data Penerima Manfaat (Input Admin MBG) — Sasaran ${title} (Total: ${totalPorsiPm.toLocaleString('id-ID')} Porsi • ${pmRows.length} Lembaga)`,
            bold: true,
            size: 16, // 8pt
            font: 'Arial',
            color: '1E293B',
          }),
        ],
      })
    );

    if (pmRows.length === 0) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: 'Belum ada data input Admin MBG yang dialokasikan untuk kategori sasaran ini.',
              italics: true,
              size: 14,
              color: '94A3B8',
              font: 'Arial',
            }),
          ],
        })
      );
    } else {
      const pmDocxRows: TableRow[] = [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Nama Institusi / Lembaga', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Kategori / Jenjang', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Porsi Sasaran', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Rincian / Catatan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Total Porsi', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Kurir', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Status', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          ],
        }),
      ];

      pmRows.forEach((r, pIdx) => {
        const rowBg = r.isLibur ? 'FEE2E2' : pIdx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        pmDocxRows.push(
          new TableRow({
            children: [
              new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${pIdx + 1}`, size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.institutionName, bold: true, size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.categoryLabel, size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${r.portionCount}`, bold: true, color: 'B45309', size: 14, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.detailBreakdown || '-', size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${r.totalJumlah}`, bold: true, size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.petugasName, size: 13, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.isLibur ? 'Libur' : 'Aktif', bold: true, color: r.isLibur ? 'DC2626' : '059669', size: 13, font: 'Arial' })] })] }),
            ],
          })
        );
      });

      // Total Row
      pmDocxRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              width: { size: 44, type: WidthType.PERCENTAGE },
              shading: { fill: '0F172A' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL PORSI SASARAN INI:', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })],
            }),
            new TableCell({
              width: { size: 12, type: WidthType.PERCENTAGE },
              shading: { fill: 'FEF3C7' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${totalPorsiPm} Porsi`, bold: true, color: 'B45309', size: 14, font: 'Arial' })] })],
            }),
            new TableCell({
              columnSpan: 4,
              width: { size: 44, type: WidthType.PERCENTAGE },
              shading: { fill: '0F172A' },
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'Data Terintegrasi Admin MBG', italics: true, color: 'CBD5E1', size: 13, font: 'Arial' })] })],
            }),
          ],
        })
      );

      docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: pmDocxRows }));
      docChildren.push(new Paragraph({ spacing: { after: 180 }, children: [] }));
    }
  };

  // ─── RENDER PORTIONS ──────────────────────────────────────────────────────
  appendPortionSectionDocx(dailyReport.porsiKecil, 'I', 'PORSI KECIL (PAUD / TK & SD KELAS 1-3)', 'kecil');
  appendPortionSectionDocx(dailyReport.porsiBesar, 'II', 'PORSI BESAR (SD KELAS 4-6, SMP, SMA)', 'besar');

  if (dailyReport.porsiBalita && (dailyReport.porsiBalita.nutritionItems?.length || 0) > 0) {
    appendPortionSectionDocx(dailyReport.porsiBalita, 'III', 'PORSI BALITA (USIA 6-59 BULAN)', 'balita');
  }

  if (dailyReport.porsiBumilBusui && (dailyReport.porsiBumilBusui.nutritionItems?.length || 0) > 0) {
    appendPortionSectionDocx(dailyReport.porsiBumilBusui, 'IV', 'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)', 'bumil');
  }

  // ==========================================================================
  // 3. TABEL SUPPLIER (PURCHASE ORDER BAHAN & BUMBU)
  // ==========================================================================
  const poList = dailyReport.poRows || [];
  const poGrandTotal =
    poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
    dailyReport.totalPengeluaran ||
    0;

  docChildren.push(
    new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [
        new TextRun({
          text: `TABEL SUPPLIER — PESANAN BAHAN MAKANAN & BUMBU (PO)`,
          bold: true,
          size: 20, // 10pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    })
  );

  const poDocxRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Nama Supplier', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Item / Bahan Dipesan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jam Tiba', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jumlah', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Satuan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Harga Satuan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 15, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Harga', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
      ],
    }),
  ];

  poList.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';
    const totalHargaItem = r.totalHarga || (r.jumlah > 0 && r.hargaSatuan ? r.jumlah * r.hargaSatuan : 0);

    poDocxRows.push(
      new TableRow({
        children: [
          new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri', bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.item, size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.jamKedatangan || '06:00', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(r.jumlah, 1), bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.satuan || 'kg', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: r.hargaSatuan ? formatRp(r.hargaSatuan) : '-', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 15, type: WidthType.PERCENTAGE }, shading: { fill: 'DCFCE7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(totalHargaItem), bold: true, color: '166534', size: 13, font: 'Arial' })] })] }),
        ],
      })
    );
  });

  // Total Supplier Row
  poDocxRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 7,
          width: { size: 85, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `TOTAL PENGELUARAN BELANJA SUPPLIER (${poList.length} ITEM):`, bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: 'DCFCE7' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(poGrandTotal), bold: true, color: '166534', size: 15, font: 'Arial' })] })],
        }),
      ],
    })
  );

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: poDocxRows }));
  docChildren.push(new Paragraph({ spacing: { after: 180 }, children: [] }));

  // ==========================================================================
  // 4. PAKET SEHAT 3B (KERINGAN BALITA & BUMIL) — JIKA ADA
  // ==========================================================================
  const paketItems = dailyReport.paketSehat3b?.keringanItems || [];
  if (paketItems.length > 0) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          new TextRun({
            text: 'PAKET SEHAT 3B — KERINGAN BALITA, IBU HAMIL & IBU MENYUSUI',
            bold: true,
            size: 18,
            font: 'Arial',
            color: '6B21A8',
          }),
        ],
      })
    );

    const p3bDocxRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Item Bahan Keringan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qty (Pcs)', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qty Kebutuhan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Satuan', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Biaya', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        ],
      }),
    ];

    paketItems.forEach((p, idx) => {
      p3bDocxRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: p.item, bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(p.qtyPcs, 0), size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(p.qty, 1), bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.satuan || 'pcs', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: 'F3E8FF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: p.totalHarga ? formatRp(p.totalHarga) : '-', bold: true, color: '6B21A8', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: p3bDocxRows }));
    docChildren.push(new Paragraph({ spacing: { after: 180 }, children: [] }));
  }

  // ==========================================================================
  // 5. REKAPITULASI PENERIMA MANFAAT LENGKAP (INPUT ADMIN MBG)
  // ==========================================================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 140, after: 60 },
      children: [
        new TextRun({
          text: 'REKAPITULASI DISTRIBUSI SELURUH PENERIMA MANFAAT (PM)',
          bold: true,
          size: 18,
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    })
  );

  const rekapPmRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Nama Institusi / Sasaran', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Tipe / Jenjang', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Kurir', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Siswa/Blt', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Bumil/Bsu', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Guru/Kdr', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '0F172A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Porsi', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })] }),
      ],
    }),
  ];

  if (entries && entries.length > 0) {
    entries.forEach((e, idx) => {
      const rowBg = e.isSekolahLibur ? 'FEE2E2' : idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      rekapPmRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: e.institutionName + (e.isSekolahLibur ? ' (Libur)' : ''), bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: e.institutionType === 'posyandu' ? 'Posyandu' : (e.schoolLevel || 'Sekolah').toUpperCase(), size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: e.assignedPetugasName || '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtSiswaBalita || 0}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtBumilBusui || 0}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtGuruKader || 0}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '0' : `${e.jumlah || 0}`, bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });
  } else if (dailyReport.sekolahList && dailyReport.sekolahList.length > 0) {
    dailyReport.sekolahList.forEach((s, idx) => {
      rekapPmRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 4, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: s.nama, bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Sekolah', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Tim MBG', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${s.murid}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${s.guru}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${s.murid + s.guru}`, bold: true, size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });
  }

  // Grand Total Row
  rekapPmRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 7,
          width: { size: 88, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL SELURUH PENERIMA MANFAAT:', bold: true, color: '92400E', size: 14, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 12, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${totalPorsi.toLocaleString('id-ID')} Porsi`, bold: true, color: 'B45309', size: 15, font: 'Arial' })] })],
        }),
      ],
    })
  );

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: rekapPmRows }));
  docChildren.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  // ==========================================================================
  // 6. LEMBAR PENGESAHAN (3 TANDA TANGAN)
  // ==========================================================================
  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Mengetahui,', size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Kepala Satuan Pelayanan (SPPG)', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ text: '', spacing: { after: 600 } }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'NIP: SPPG-BGN-001', size: 14, color: '64748B', font: 'Arial' })] }),
            ],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Diperiksa Oleh,', size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tenaga Ahli Gizi (Nutrisionis)', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ text: '', spacing: { after: 600 } }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'STR: GIZI-MBG-2026', size: 14, color: '64748B', font: 'Arial' })] }),
            ],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Dibuat Oleh,', size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Koordinator Produksi & Dapur', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ text: '', spacing: { after: 600 } }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Koperasi Al-Umanaa', size: 14, color: '64748B', font: 'Arial' })] }),
            ],
          }),
        ],
      }),
    ],
  });

  docChildren.push(signatureTable);

  // ==========================================================================
  // DOCUMENT BUILD IN LANDSCAPE ORIENTATION
  // ==========================================================================
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 720, // 0.5 in
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Laporan Operasional Produksi MBG • Tanggal: ${batch.tanggal}`,
                    size: 14,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Dokumen Resmi SIMOL MBG — Halaman ',
                    size: 14,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 14,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    text: ' dari ',
                    size: 14,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 14,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function exportProductionDocx(data: MbgProductionDocxData, fileName?: string): Promise<void> {
  const blob = await generateMbgProductionDocx(data);
  const name = fileName || `Laporan_Produksi_MBG_${data.batch.tanggal || 'terbaru'}.docx`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.docx') ? name : `${name}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
