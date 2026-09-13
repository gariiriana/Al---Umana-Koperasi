// ============================================================================
// MBG Production Report DOCX Generator — Official Word Exporter
// Badan Gizi Nasional & Koperasi Al-Umanaa Mandiri Berkah
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
} from 'docx';
import type {
  MbgPmBatch,
  MbgPmEntry,
  MbgNutritionEntry,
  MbgProductionDailyReport,
} from '@/types/mbg';

export interface MbgProductionDocxRecipeItem {
  name: string;
  amount: number;
  satuan: string;
  sourceMenus?: string[];
  isCustom?: boolean;
  adjustmentId?: string | null;
  [key: string]: unknown;
}

export interface MbgProductionDocxData {
  batch: MbgPmBatch;
  entries: MbgPmEntry[];
  menuList?: string[];
  nutritionTotals?: {
    kalori: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  nutritionData?: MbgNutritionEntry[];
  recipeRequirements?: MbgProductionDocxRecipeItem[];
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

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
};

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const CELL_MARGINS = { top: 100, bottom: 100, left: 120, right: 120 };

export async function generateMbgProductionDocx(data: MbgProductionDocxData): Promise<Blob> {
  const {
    batch,
    entries,
    nutritionTotals = { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
    recipeRequirements = [],
    dailyReport,
    logoBase64,
  } = data;

  const docChildren: (Paragraph | Table)[] = [];

  // ==========================================================================
  // 1. KOP SURAT (OFFICIAL LETTERHEAD)
  // ==========================================================================
  if (logoBase64) {
    const logoBytes = dataUriToUint8Array(logoBase64);
    if (logoBytes) {
      docChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 120 },
          children: [
            new ImageRun({
              data: logoBytes,
              transformation: { width: 56, height: 56 },
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
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: 'BADAN GIZI NASIONAL',
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '1E3A8A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: 'SATUAN PELAYANAN PROGRAM GIZI (SPPG) KABUPATEN SUKABUMI',
          bold: true,
          size: 20, // 10pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: 'KOPERASI KONSUMEN AL-UMANAA MANDIRI BERKAH',
          bold: true,
          size: 19, // 9.5pt
          font: 'Arial',
          color: 'B45309',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: 'Alamat: Jl. Pelabuhan II Km. 10, Cikembar / Kebonmanggu, Kab. Sukabumi, Jawa Barat | Email: info@al-umanaa.org',
          size: 15, // 7.5pt
          font: 'Arial',
          color: '64748B',
        }),
      ],
    }),
    // Double separator line
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 180 },
      children: [
        new TextRun({
          text: '══════════════════════════════════════════════════════════════════════════════',
          size: 14,
          color: '94A3B8',
        }),
      ],
    })
  );

  // ==========================================================================
  // 2. DOCUMENT TITLE & METADATA
  // ==========================================================================
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({
          text: 'LAPORAN REKAPITULASI PRODUKSI & PENERIMA MANFAAT (PM)',
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 160 },
      children: [
        new TextRun({
          text: 'Sistem Informasi Manajemen Operasional MBG (SIMOL MBG) — Arsip Gizi',
          italics: true,
          size: 17, // 8.5pt
          font: 'Arial',
          color: '64748B',
        }),
      ],
    })
  );

  // Metadata Table Box
  const totalPorsi = batch.totalJumlah || entries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : (e.jumlah || 0)), 0);
  const totalInstitusi = entries.length;

  // Menu List resolution
  const resolvedMenuList = data.menuList && data.menuList.length > 0
    ? data.menuList
    : Array.from(new Set(
      (dailyReport?.porsiBesar?.nutritionItems || [])
        .map((i) => i.menuName)
        .filter(Boolean)
    ));

  const metadataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: CELL_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Tanggal Batch Produksi', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: batch.tanggal, bold: true, size: 16, color: 'B45309', font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Status Arsip', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: batch.status, bold: true, size: 16, color: '059669', font: 'Arial' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Total Porsi Siap Saji', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: `${totalPorsi} Porsi`, bold: true, size: 16, color: '1E3A8A', font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Total Sasaran Institusi', bold: true, size: 16, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: `${totalInstitusi} Sekolah/Posyandu`, size: 16, font: 'Arial' })] })],
          }),
        ],
      }),
      ...(resolvedMenuList.length > 0
        ? [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC' },
                margins: CELL_MARGINS,
                children: [new Paragraph({ children: [new TextRun({ text: 'Menu Produksi Hari Ini', bold: true, size: 16, font: 'Arial' })] })],
              }),
              new TableCell({
                columnSpan: 3,
                width: { size: 75, type: WidthType.PERCENTAGE },
                margins: CELL_MARGINS,
                children: [new Paragraph({ children: [new TextRun({ text: resolvedMenuList.join(', '), bold: true, size: 16, font: 'Arial' })] })],
              }),
            ],
          }),
        ]
        : []),
    ],
  });

  docChildren.push(metadataTable);
  docChildren.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ==========================================================================
  // 3. BAGIAN I: REKAPITULASI PENERIMA MANFAAT (PM)
  // ==========================================================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: '1. REKAPITULASI PENERIMA MANFAAT (PM) PER INSTITUSI',
          bold: true,
          size: 19, // 9.5pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    })
  );

  const pmTableRows: TableRow[] = [
    // Header
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 4, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 27, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: 'Nama Institusi / Sasaran', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tipe', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: 'Petugas / Kurir', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Siswa/Blt', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Bumil/Bsu', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Guru/Kdr', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Porsi', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jadwal', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
      ],
    }),
  ];

  let sumSiswa = 0;
  let sumBumil = 0;
  let sumGuru = 0;
  let sumTotal = 0;

  entries.forEach((e, idx) => {
    if (!e.isSekolahLibur) {
      sumSiswa += e.qtSiswaBalita || 0;
      sumBumil += e.qtBumilBusui || 0;
      sumGuru += e.qtGuruKader || 0;
      sumTotal += e.jumlah || 0;
    }

    const isEven = idx % 2 === 0;
    const rowBg = e.isSekolahLibur ? 'FEE2E2' : isEven ? 'FFFFFF' : 'F8FAFC';

    pmTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 27, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: e.institutionName, bold: true, size: 15, font: 'Arial' }),
                  ...(e.isSekolahLibur
                    ? [new TextRun({ text: ' (LIBUR)', bold: true, color: 'DC2626', size: 13, font: 'Arial' })]
                    : []),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: e.institutionType === 'posyandu' ? 'Posyandu' : 'Sekolah', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: e.assignedPetugasName || '-', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 9, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtSiswaBalita || 0}`, size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 9, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtBumilBusui || 0}`, size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '-' : `${e.qtGuruKader || 0}`, size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 9, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: e.isSekolahLibur ? '0' : `${e.jumlah || 0}`, bold: true, color: 'B45309', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 9, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: e.jadwalPengantaran || '-', size: 15, font: 'Arial' })] })],
          }),
        ],
      })
    );
  });

  // Grand Total Row
  pmTableRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          width: { size: 56, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL SELURUH INSTITUSI AKTIF:', bold: true, size: 15, font: 'Arial', color: '92400E' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${sumSiswa}`, bold: true, size: 15, font: 'Arial', color: '92400E' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${sumBumil}`, bold: true, size: 15, font: 'Arial', color: '92400E' })] })],
        }),
        new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${sumGuru}`, bold: true, size: 15, font: 'Arial', color: '92400E' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${sumTotal}`, bold: true, size: 16, font: 'Arial', color: 'B45309' })] })],
        }),
        new TableCell({
          width: { size: 9, type: WidthType.PERCENTAGE },
          shading: { fill: 'FEF3C7' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Porsi', bold: true, size: 15, font: 'Arial', color: '92400E' })] })],
        }),
      ],
    })
  );

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: pmTableRows }));
  docChildren.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ==========================================================================
  // 4. BAGIAN II: ESTIMASI KEBUTUHAN BAHAN BAKU (STANDAR RESEP)
  // ==========================================================================
  if (recipeRequirements.length > 0) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: '2. ESTIMASI KEBUTUHAN BAHAN BAKU BATCH (STANDAR RESEP)',
            bold: true,
            size: 19, // 9.5pt
            font: 'Arial',
            color: '0F172A',
          }),
        ],
      })
    );

    const recipeTableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 6, type: WidthType.PERCENTAGE },
            shading: { fill: '1E293B' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { fill: '1E293B' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Nama Bahan Baku', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 24, type: WidthType.PERCENTAGE },
            shading: { fill: '1E293B' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Kebutuhan', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: '1E293B' },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: 'Menu Terkait', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
          }),
        ],
      }),
    ];

    recipeRequirements.forEach((r, idx) => {
      let formattedAmount = '';
      if (r.satuan === 'g' && r.amount >= 1000) {
        formattedAmount = `${(r.amount / 1000).toFixed(2)} kg`;
      } else if (r.satuan === 'ml' && r.amount >= 1000) {
        formattedAmount = `${(r.amount / 1000).toFixed(2)} L`;
      } else {
        formattedAmount = `${r.amount.toFixed(1)} ${r.satuan}`;
      }

      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';

      recipeTableRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 6, type: WidthType.PERCENTAGE },
              shading: { fill: rowBg },
              margins: CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 15, font: 'Arial' })] })],
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              shading: { fill: rowBg },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: r.name, bold: true, size: 15, font: 'Arial' }),
                    ...(r.isCustom ? [new TextRun({ text: ' (Manual)', color: '2563EB', size: 13, font: 'Arial' })] : []),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              shading: { fill: rowBg },
              margins: CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formattedAmount, bold: true, color: '1E3A8A', size: 15, font: 'Arial' })] })],
            }),
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: rowBg },
              margins: CELL_MARGINS,
              children: [new Paragraph({ children: [new TextRun({ text: (r.sourceMenus || []).join(', ') || '-', size: 14, color: '64748B', font: 'Arial' })] })],
            }),
          ],
        })
      );
    });

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: recipeTableRows }));
    docChildren.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // ==========================================================================
  // 5. BAGIAN III: RINGKASAN KANDUNGAN GIZI BATCH
  // ==========================================================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: '3. RINGKASAN ESTIMASI KANDUNGAN GIZI BATCH PRODUKSI',
          bold: true,
          size: 19, // 9.5pt
          font: 'Arial',
          color: '0F172A',
        }),
      ],
    })
  );

  const nutritionTableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ children: [new TextRun({ text: 'Parameter Kandungan Gizi', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Kandungan Batch', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Estimasi Rata-rata / Porsi', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
        }),
      ],
    }),
  ];

  const portionDivisor = Math.max(1, totalPorsi);
  const nutritionParams = [
    { label: 'Energi / Total Kalori', total: `${nutritionTotals.kalori.toFixed(1)} kcal`, perPortion: `${(nutritionTotals.kalori / portionDivisor).toFixed(1)} kcal` },
    { label: 'Protein Nabati & Hewani', total: `${nutritionTotals.protein.toFixed(1)} g`, perPortion: `${(nutritionTotals.protein / portionDivisor).toFixed(1)} g` },
    { label: 'Lemak Total', total: `${nutritionTotals.lemak.toFixed(1)} g`, perPortion: `${(nutritionTotals.lemak / portionDivisor).toFixed(1)} g` },
    { label: 'Karbohidrat Kompleks', total: `${nutritionTotals.karbohidrat.toFixed(1)} g`, perPortion: `${(nutritionTotals.karbohidrat / portionDivisor).toFixed(1)} g` },
    { label: 'Serat Pangan (Dietary Fiber)', total: `${nutritionTotals.serat.toFixed(1)} g`, perPortion: `${(nutritionTotals.serat / portionDivisor).toFixed(1)} g` },
  ];

  nutritionParams.forEach((n, idx) => {
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';

    nutritionTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: n.label, bold: true, size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: n.total, bold: true, color: 'B45309', size: 15, font: 'Arial' })] })],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: rowBg },
            margins: CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: n.perPortion, size: 15, color: '059669', font: 'Arial' })] })],
          }),
        ],
      })
    );
  });

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: nutritionTableRows }));
  docChildren.push(new Paragraph({ spacing: { after: 300 }, children: [] }));

  // ==========================================================================
  // 6. LEMBAR PENGESAHAN & TANDA TANGAN
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
              new Paragraph({ text: '', spacing: { after: 700 } }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'NIP / ID: SPPG-BGN-001', size: 14, color: '64748B', font: 'Arial' })] }),
            ],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Diperiksa Oleh,', size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tenaga Ahli Gizi (Nutrisionis)', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ text: '', spacing: { after: 700 } }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '( _______________________ )', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'STR: GIZI-MBG-2026', size: 14, color: '64748B', font: 'Arial' })] }),
            ],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Dibuat Oleh,', size: 16, font: 'Arial' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Koordinator Produksi & Dapur', bold: true, size: 16, font: 'Arial' })] }),
              new Paragraph({ text: '', spacing: { after: 700 } }),
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
  // DOCUMENT BUILD
  // ==========================================================================
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1200,
              right: 1200,
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
                    text: `Laporan Produksi MBG • Tanggal: ${batch.tanggal}`,
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
