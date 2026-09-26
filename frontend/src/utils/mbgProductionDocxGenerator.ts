// ============================================================================
// MBG Production Report DOCX Generator — Landscape Official Layout
// Badan Gizi Nasional & Koperasi Al Umanaa Sejahtera Mandiri
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
import { getAutoRekapTotals, isSummaryOrCategoryRow } from '@/utils/mbgPmFilter';


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

const COMPACT_CELL_MARGINS = { top: 50, bottom: 50, left: 60, right: 60 };

// ─── REKAP PM ROW BUILDER ───────────────────────────────────────────────────

interface RekapPmRowData {
  nama: string;
  kecilL: number;
  kecilP: number;
  besarL: number;
  besarP: number;
  balitaL: number;
  balitaP: number;
  bumilL: number;
  bumilP: number;
  siswaL: number;
  siswaP: number;
  siswaJumlah: number;
  guruL: number;
  guruP: number;
  tendikL: number;
  tendikP: number;
  tendikJumlah: number;
  totalAkhir: number;
}

/** @deprecated Recipient exports use buildMbgPmRecipientTable instead. */
export function buildRekapPmRows(
  entries: MbgPmEntry[] = [],
  sekolahList: { nama: string; murid: number; guru: number }[] = []
): RekapPmRowData[] {
  if (entries && entries.length > 0) {
    const seenNames = new Set<string>();
    const uniqueEntries: MbgPmEntry[] = [];
    for (const e of entries) {
      const norm = (e.institutionName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (norm && seenNames.has(norm)) continue;
      if (norm) seenNames.add(norm);
      uniqueEntries.push(e);
    }
    return uniqueEntries.map((e) => {
      const isTk =
        e.schoolLevel === 'tk_paud' ||
        e.institutionName.toLowerCase().includes('tk') ||
        e.institutionName.toLowerCase().includes('paud');
      const isPosyandu = e.institutionType === 'posyandu' || e.institutionName.toLowerCase().includes('posyandu');
      const isSd =
        e.schoolLevel === 'sd' ||
        e.institutionName.toLowerCase().includes('sd') ||
        e.institutionName.toLowerCase().includes('mi');
      const isSmaOrSmp =
        e.schoolLevel === 'sma' ||
        (e.schoolLevel as string) === 'smp' ||
        e.institutionName.toLowerCase().includes('smp') ||
        e.institutionName.toLowerCase().includes('sma') ||
        e.institutionName.toLowerCase().includes('smk') ||
        e.institutionName.toLowerCase().includes('mts') ||
        e.institutionName.toLowerCase().includes('ma ');

      let kecilL = e.qtPorsiKecilL ?? 0;
      let kecilP = e.qtPorsiKecilP ?? 0;
      if (!kecilL && !kecilP) {
        if (e.qtPorsiKecil && e.qtPorsiKecil > 0) {
          kecilL = Math.ceil(e.qtPorsiKecil / 2);
          kecilP = Math.floor(e.qtPorsiKecil / 2);
        } else if (isTk) {
          const tot = e.qtSiswaBalita || e.jumlah || 0;
          kecilL = Math.ceil(tot / 2);
          kecilP = Math.floor(tot / 2);
        } else if (isSd) {
          const sdKecil = Math.ceil((e.qtSiswaBalita || 0) / 2);
          kecilL = Math.ceil(sdKecil / 2);
          kecilP = Math.floor(sdKecil / 2);
        }
      }

      let besarL = e.qtPorsiBesarL ?? 0;
      let besarP = e.qtPorsiBesarP ?? 0;
      if (!besarL && !besarP) {
        if (e.qtPorsiBesar && e.qtPorsiBesar > 0) {
          besarL = Math.ceil(e.qtPorsiBesar / 2);
          besarP = Math.floor(e.qtPorsiBesar / 2);
        } else if (isSmaOrSmp) {
          const tot = e.qtSiswaBalita || (e.jumlah ? e.jumlah - (e.qtGuruKader || 0) : 0);
          besarL = Math.ceil(tot / 2);
          besarP = Math.floor(tot / 2);
        } else if (isSd) {
          const sdBesar = Math.floor((e.qtSiswaBalita || 0) / 2);
          besarL = Math.ceil(sdBesar / 2);
          besarP = Math.floor(sdBesar / 2);
        }
      }

      let balitaL = 0;
      let balitaP = 0;
      if (isPosyandu) {
        const balitaTot = e.qtPorsiBalita || e.qtSiswaBalita || 0;
        balitaL = Math.ceil(balitaTot / 2);
        balitaP = Math.floor(balitaTot / 2);
      }

      const bumilL = 0;
      let bumilP = 0;
      if (isPosyandu) {
        const bumilTot = (e.qtBumil || 0) + (e.qtBusui || 0) || (e.qtPorsiBumilBusui || e.qtBumilBusui || 0);
        bumilP = bumilTot;
      }

      const siswaL = kecilL + besarL + balitaL + bumilL;
      const siswaP = kecilP + besarP + balitaP + bumilP;
      const siswaJumlah = siswaL + siswaP;

      let guruL = e.qtGuruL ?? 0;
      let guruP = e.qtGuruP ?? 0;
      if (!guruL && !guruP && e.qtGuruKader && e.qtGuruKader > 0) {
        guruL = Math.ceil(e.qtGuruKader / 2);
        guruP = Math.floor(e.qtGuruKader / 2);
      }

      const tendikL = e.qtTendikL ?? 0;
      const tendikP = e.qtTendikP ?? 0;
      const tendikJumlah = tendikL + tendikP;

      const totalAkhir = siswaJumlah + (guruL + guruP) + tendikJumlah;

      return {
        nama: e.institutionName + (e.isSekolahLibur ? ' (Libur)' : ''),
        kecilL,
        kecilP,
        besarL,
        besarP,
        balitaL,
        balitaP,
        bumilL,
        bumilP,
        siswaL,
        siswaP,
        siswaJumlah,
        guruL,
        guruP,
        tendikL,
        tendikP,
        tendikJumlah,
        totalAkhir,
      };
    });
  }

  // Fallback if entries not available but sekolahList is present
  const seenSekolah = new Set<string>();
  const uniqueSekolah: typeof sekolahList = [];
  for (const s of sekolahList || []) {
    const norm = (s.nama || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (norm && seenSekolah.has(norm)) continue;
    if (norm) seenSekolah.add(norm);
    uniqueSekolah.push(s);
  }
  return uniqueSekolah.map((s) => {
    const isTk = s.nama.toLowerCase().includes('tk') || s.nama.toLowerCase().includes('paud');
    const isPosyandu = s.nama.toLowerCase().includes('posyandu');
    const isSd = s.nama.toLowerCase().includes('sd') || s.nama.toLowerCase().includes('mi');
    const isSmaOrSmp = s.nama.toLowerCase().includes('smp') || s.nama.toLowerCase().includes('sma') || s.nama.toLowerCase().includes('smk');

    let kecilL = 0;
    let kecilP = 0;
    let besarL = 0;
    let besarP = 0;
    let balitaL = 0;
    let balitaP = 0;
    const bumilL = 0;
    let bumilP = 0;

    if (isTk) {
      kecilL = Math.ceil(s.murid / 2);
      kecilP = Math.floor(s.murid / 2);
    } else if (isSd) {
      const half = Math.round(s.murid / 2);
      kecilL = Math.ceil(half / 2);
      kecilP = Math.floor(half / 2);
      besarL = Math.ceil((s.murid - half) / 2);
      besarP = Math.floor((s.murid - half) / 2);
    } else if (isSmaOrSmp) {
      besarL = Math.ceil(s.murid / 2);
      besarP = Math.floor(s.murid / 2);
    } else if (isPosyandu) {
      balitaL = Math.ceil(s.murid / 2);
      balitaP = Math.floor(s.murid / 2);
      bumilP = s.guru || 0;
    }

    const siswaL = kecilL + besarL + balitaL + bumilL;
    const siswaP = kecilP + besarP + balitaP + bumilP;
    const siswaJumlah = siswaL + siswaP;

    const guruL = isPosyandu ? 0 : Math.ceil((s.guru || 0) / 2);
    const guruP = isPosyandu ? 0 : Math.floor((s.guru || 0) / 2);

    const tendikL = 0;
    const tendikP = 0;
    const tendikJumlah = 0;

    const totalAkhir = siswaJumlah + (guruL + guruP) + tendikJumlah;

    return {
      nama: s.nama,
      kecilL,
      kecilP,
      besarL,
      besarP,
      balitaL,
      balitaP,
      bumilL,
      bumilP,
      siswaL,
      siswaP,
      siswaJumlah,
      guruL,
      guruP,
      tendikL,
      tendikP,
      tendikJumlah,
      totalAkhir,
    };
  });
}

export async function generateMbgProductionDocx(data: MbgProductionDocxData): Promise<Blob> {
  const { batch, entries, dailyReport, logoBase64 } = data;

  if (!dailyReport) {
    throw new Error('Batch ini belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.');
  }

  const docChildren: (Paragraph | Table)[] = [];

  // ==========================================================================
  // HELPER: KOP RESMI
  // ==========================================================================
  const appendOfficialHeader = (
    sectionTitle: string,
    pageBreak = false,
    totalPorsi = batch.totalJumlah || 0
  ) => {
    if (pageBreak) {
      docChildren.push(
        new Paragraph({
          pageBreakBefore: true,
          children: [],
        })
      );
    }

    if (logoBase64 && !pageBreak) {
      const logoBytes = dataUriToUint8Array(logoBase64);
      if (logoBytes) {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 60 },
            children: [
              new ImageRun({
                data: logoBytes,
                transformation: { width: 45, height: 45 },
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
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({
            text: 'BADAN GIZI NASIONAL',
            bold: true,
            size: 22, // 11pt
            font: 'Arial',
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({
            text: 'SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU - YAYASAN LEMBAGA WAKAF AL UMANAA',
            bold: true,
            size: 18, // 9pt
            font: 'Arial',
            color: '1E293B',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [
          new TextRun({
            text: `LAPORAN OPERASIONAL HARIAN MBG — ${sectionTitle.toUpperCase()}`,
            bold: true,
            size: 19, // 9.5pt
            font: 'Arial',
            color: 'B45309', // Amber 700
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [
          new TextRun({
            text: `Tanggal Batch: ${batch.tanggal} • Sasaran: ${totalPorsi.toLocaleString('id-ID')} Porsi • Koperasi Al Umanaa Sejahtera Mandiri`,
            size: 14, // 7pt
            font: 'Arial',
            color: '64748B',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [
          new TextRun({
            text: '══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════',
            size: 11,
            color: 'CBD5E1',
          }),
        ],
      })
    );
  };

  // ==========================================================================
  // HALAMAN 1 (FOTO 1): REKAPITULASI PENERIMA MANFAAT
  // ==========================================================================
  const validEntries = (entries || []).filter((e) => !isSummaryOrCategoryRow(e.institutionName));

  const effectiveEntries: MbgPmEntry[] = validEntries.length > 0 ? validEntries : (dailyReport.sekolahList || [])
    .filter((s) => !isSummaryOrCategoryRow(s.nama))
    .map((s, idx) => {
      const isPos = s.nama.toLowerCase().includes('posyandu');
      const isTk = s.nama.toLowerCase().includes('tk') || s.nama.toLowerCase().includes('paud');
      const pKecilL = isPos ? Math.ceil(s.murid / 2) : (isTk ? Math.ceil(s.murid / 2) : 0);
      const pKecilP = isPos ? Math.floor(s.murid / 2) : (isTk ? Math.floor(s.murid / 2) : 0);
      const pBesarL = !isPos && !isTk ? Math.ceil(s.murid / 2) : 0;
      const pBesarP = !isPos && !isTk ? Math.floor(s.murid / 2) : 0;
      const bumil = isPos ? s.guru : 0;
      return {
        id: `fallback-${idx}`,
        batchId: '',
        institutionName: s.nama,
        institutionType: isPos ? ('posyandu' as const) : ('sekolah' as const),
        qtPorsiKecilL: pKecilL,
        qtPorsiKecilP: pKecilP,
        qtPorsiBesarL: pBesarL,
        qtPorsiBesarP: pBesarP,
        qtSiswaBalita: s.murid,
        qtBumil: bumil,
        qtBusui: 0,
        qtBumilBusui: bumil,
        qtGuruL: isPos ? 0 : Math.ceil(s.guru / 2),
        qtGuruP: isPos ? 0 : Math.floor(s.guru / 2),
        qtGuruKader: s.guru,
        qtTendikL: 0,
        qtTendikP: 0,
        qtPobiaNasi: 0,
        jumlah: s.murid + s.guru,
        jadwalPengantaran: '06.00-08.30',
        assignedPetugasId: '',
        assignedPetugasName: '-',
        isSekolahLibur: false,
        menuItems: [],
        menuKeringanItems: [],
        notes: '',
        sortOrder: idx,
        createdBy: 'system',
        createdAt: '',
        updatedAt: '',
      } as unknown as MbgPmEntry;
    });

  const schoolEntries = effectiveEntries.filter((e) => e.institutionType !== 'posyandu');
  const posyanduEntries = effectiveEntries.filter((e) => e.institutionType === 'posyandu');

  const schoolTotals = getAutoRekapTotals(schoolEntries);
  const posyanduTotals = getAutoRekapTotals(posyanduEntries);
  const overallTotals = getAutoRekapTotals(effectiveEntries);

  appendOfficialHeader('REKAPITULASI PENERIMA MANFAAT', false, overallTotals.jumlah || batch.totalJumlah);

  // Column widths for 16 columns matching website
  const colWidths = [2500, 600, 600, 600, 600, 700, 700, 800, 600, 600, 600, 600, 800, 1200, 2438, 2000];

  const makeCell = (
    text: string,
    width: number,
    opts: {
      fill?: string;
      color?: string;
      bold?: boolean;
      alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
      columnSpan?: number;
      rowSpan?: number;
      size?: number;
    } = {}
  ) => {
    const {
      fill = 'FFFFFF',
      color = '1E293B',
      bold = false,
      alignment = AlignmentType.LEFT,
      columnSpan,
      rowSpan,
      size = 11, // 5.5pt
    } = opts;

    return new TableCell({
      ...(columnSpan ? { columnSpan } : {}),
      ...(rowSpan ? { rowSpan } : {}),
      width: { size: width, type: WidthType.DXA },
      shading: { fill },
      margins: COMPACT_CELL_MARGINS,
      children: [
        new Paragraph({
          alignment,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text, bold, color, size, font: 'Arial' })],
        }),
      ],
    });
  };

  const buildDocxAutoRekapTable = (
    list: MbgPmEntry[],
    totals: ReturnType<typeof getAutoRekapTotals>,
    isPosyandu: boolean
  ): Table => {
    const rows: TableRow[] = [
      // Header Row 1
      new TableRow({
        tableHeader: true,
        children: [
          makeCell(isPosyandu ? 'POSYANDU' : 'SEKOLAH', colWidths[0], { rowSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('PORSI KECIL', colWidths[1] + colWidths[2], { columnSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('PORSI BESAR', colWidths[3] + colWidths[4], { columnSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('TOTAL', colWidths[5] + colWidths[6], { columnSpan: 2, fill: 'CBD5E1', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('JML', colWidths[7], { rowSpan: 2, fill: 'CBD5E1', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('GURU', colWidths[8] + colWidths[9], { columnSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('TENDIK', colWidths[10] + colWidths[11], { columnSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('JML', colWidths[12], { rowSpan: 2, fill: 'CBD5E1', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('TOTAL KESELURUHAN', colWidths[13], { rowSpan: 2, fill: 'FEF3C7', color: '78350F', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('PETUGAS KURIR', colWidths[14], { rowSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('JADWAL', colWidths[15], { rowSpan: 2, fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
        ],
      }),
      // Header Row 2
      new TableRow({
        tableHeader: true,
        children: [
          makeCell('L', colWidths[1], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('P', colWidths[2], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('L', colWidths[3], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('P', colWidths[4], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('L', colWidths[5], { fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('P', colWidths[6], { fill: 'E2E8F0', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('L', colWidths[8], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('P', colWidths[9], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('L', colWidths[10], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('P', colWidths[11], { fill: 'F1F5F9', bold: true, alignment: AlignmentType.CENTER }),
        ],
      }),
    ];

    if (list.length === 0) {
      rows.push(
        new TableRow({
          children: [
            makeCell(`Belum ada data ${isPosyandu ? 'Posyandu' : 'Sekolah'}`, 15838, {
              columnSpan: 16,
              alignment: AlignmentType.CENTER,
              color: '94A3B8',
            }),
          ],
        })
      );
    } else {
      list.forEach((entry, idx) => {
        const rowBg = entry.isSekolahLibur ? 'FEF2F2' : idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        const txtColor = entry.isSekolahLibur ? '991B1B' : '1E293B';

        if (entry.isSekolahLibur) {
          rows.push(
            new TableRow({
              children: [
                makeCell(`${entry.institutionName} (LIBUR)`, colWidths[0], { fill: 'FEE2E2', color: '991B1B', bold: true }),
                makeCell('TIDAK ADA PENGIRIMAN (LIBUR)', colWidths.slice(1, 14).reduce((a, b) => a + b, 0), {
                  columnSpan: 12,
                  fill: 'FEE2E2',
                  color: '991B1B',
                  bold: true,
                  alignment: AlignmentType.CENTER,
                }),
                makeCell(entry.assignedPetugasName || '—', colWidths[14], { fill: rowBg, color: '64748B' }),
                makeCell(entry.jadwalPengantaran || '—', colWidths[15], { fill: rowBg, color: '64748B', alignment: AlignmentType.CENTER }),
              ],
            })
          );
          return;
        }

        const totalL = isPosyandu ? (entry.qtPorsiKecilL || 0) : ((entry.qtPorsiKecilL || 0) + (entry.qtPorsiBesarL || 0));
        const bumil = entry.qtBumil ?? (isPosyandu ? entry.qtPorsiBesarL || 0 : 0);
        const busui = entry.qtBusui ?? (isPosyandu ? entry.qtPorsiBesarP || 0 : 0);
        const totalP = isPosyandu ? ((entry.qtPorsiKecilP || 0) + bumil + busui) : ((entry.qtPorsiKecilP || 0) + (entry.qtPorsiBesarP || 0));
        const totalSiswa = totalL + totalP;
        const totalStaf = (entry.qtGuruL || 0) + (entry.qtGuruP || 0) + (entry.qtTendikL || 0) + (entry.qtTendikP || 0);

        rows.push(
          new TableRow({
            children: [
              makeCell(entry.institutionName, colWidths[0], { fill: rowBg, color: txtColor, bold: true }),
              makeCell(entry.qtPorsiKecilL ? String(entry.qtPorsiKecilL) : '—', colWidths[1], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtPorsiKecilP ? String(entry.qtPorsiKecilP) : '—', colWidths[2], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtPorsiBesarL ? String(entry.qtPorsiBesarL) : (isPosyandu && bumil ? String(bumil) : '—'), colWidths[3], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtPorsiBesarP ? String(entry.qtPorsiBesarP) : (isPosyandu && busui ? String(busui) : '—'), colWidths[4], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(totalL ? String(totalL) : '—', colWidths[5], { fill: 'F8FAFC', color: txtColor, bold: true, alignment: AlignmentType.CENTER }),
              makeCell(totalP ? String(totalP) : '—', colWidths[6], { fill: 'F8FAFC', color: txtColor, bold: true, alignment: AlignmentType.CENTER }),
              makeCell(totalSiswa ? String(totalSiswa) : '—', colWidths[7], { fill: 'F1F5F9', color: txtColor, bold: true, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtGuruL ? String(entry.qtGuruL) : '—', colWidths[8], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtGuruP ? String(entry.qtGuruP) : '—', colWidths[9], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtTendikL ? String(entry.qtTendikL) : '—', colWidths[10], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(entry.qtTendikP ? String(entry.qtTendikP) : '—', colWidths[11], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
              makeCell(totalStaf ? String(totalStaf) : '—', colWidths[12], { fill: 'F1F5F9', color: txtColor, bold: true, alignment: AlignmentType.CENTER }),
              makeCell(String(entry.jumlah), colWidths[13], { fill: 'FFFBEB', color: '92400E', bold: true, alignment: AlignmentType.CENTER }),
              makeCell(entry.assignedPetugasName || '—', colWidths[14], { fill: rowBg, color: txtColor }),
              makeCell(entry.jadwalPengantaran || '—', colWidths[15], { fill: rowBg, color: txtColor, alignment: AlignmentType.CENTER }),
            ],
          })
        );
      });
    }

    // Foot Row
    rows.push(
      new TableRow({
        children: [
          makeCell('TOTAL', colWidths[0], { fill: '0F172A', color: 'FFFFFF', bold: true }),
          makeCell(totals.porsiKecilL ? String(totals.porsiKecilL) : '—', colWidths[1], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.porsiKecilP ? String(totals.porsiKecilP) : '—', colWidths[2], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.porsiBesarL ? String(totals.porsiBesarL) : '—', colWidths[3], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.porsiBesarP ? String(totals.porsiBesarP) : '—', colWidths[4], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.totalL ? String(totals.totalL) : '—', colWidths[5], { fill: '1E293B', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.totalP ? String(totals.totalP) : '—', colWidths[6], { fill: '1E293B', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell((totals.totalL + totals.totalP) ? String(totals.totalL + totals.totalP) : '—', colWidths[7], { fill: '334155', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.guruL ? String(totals.guruL) : '—', colWidths[8], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.guruP ? String(totals.guruP) : '—', colWidths[9], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.tendikL ? String(totals.tendikL) : '—', colWidths[10], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.tendikP ? String(totals.tendikP) : '—', colWidths[11], { fill: '0F172A', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.totalStaf ? String(totals.totalStaf) : '—', colWidths[12], { fill: '1E293B', color: 'FFFFFF', bold: true, alignment: AlignmentType.CENTER }),
          makeCell(totals.jumlah ? String(totals.jumlah) : '—', colWidths[13], { fill: 'F59E0B', color: '0F172A', bold: true, alignment: AlignmentType.CENTER }),
          makeCell('—', colWidths[14], { fill: '0F172A', color: '94A3B8', alignment: AlignmentType.CENTER }),
          makeCell('—', colWidths[15], { fill: '0F172A', color: '94A3B8', alignment: AlignmentType.CENTER }),
        ],
      })
    );

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: colWidths,
      borders: CELL_BORDER,
      rows,
    });
  };

  // Section 1: Sekolah
  docChildren.push(
    new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({ text: '● DATA PM — FORMAT AUTO REKAP  ', bold: true, size: 18, color: '059669', font: 'Arial' }),
        new TextRun({ text: `(${schoolEntries.length} Sekolah • ${schoolTotals.jumlah.toLocaleString('id-ID')} Porsi)`, size: 14, color: '64748B', font: 'Arial' }),
      ],
    }),
    buildDocxAutoRekapTable(schoolEntries, schoolTotals, false),
    new Paragraph({ spacing: { before: 160, after: 60 }, children: [] })
  );

  // Section 2: Posyandu
  docChildren.push(
    new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({ text: '● DATA POSYANDU  ', bold: true, size: 18, color: '7C3AED', font: 'Arial' }),
        new TextRun({ text: `(${posyanduEntries.length} Posyandu • ${posyanduTotals.jumlah.toLocaleString('id-ID')} Porsi)`, size: 14, color: '64748B', font: 'Arial' }),
      ],
    }),
    buildDocxAutoRekapTable(posyanduEntries, posyanduTotals, true),
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [] })
  );

  // Grand Total Summary Box
  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: CELL_BORDER,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 11000, type: WidthType.DXA },
              shading: { fill: 'ECFDF5' },
              margins: COMPACT_CELL_MARGINS,
              children: [
                new Paragraph({
                  spacing: { before: 40, after: 20 },
                  children: [new TextRun({ text: 'RINGKASAN TOTAL PENERIMA MANFAAT', bold: true, size: 16, color: '065F46', font: 'Arial' })],
                }),
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({
                      text: `Jumlah keseluruhan porsi Sekolah (${schoolTotals.jumlah.toLocaleString('id-ID')}) dan Posyandu (${posyanduTotals.jumlah.toLocaleString('id-ID')}) dari data Admin MBG.`,
                      size: 13,
                      color: '047857',
                      font: 'Arial',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 4838, type: WidthType.DXA },
              shading: { fill: '059669' },
              margins: COMPACT_CELL_MARGINS,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 60, after: 60 },
                  children: [
                    new TextRun({
                      text: `Total Keseluruhan: ${overallTotals.jumlah.toLocaleString('id-ID')} Porsi`,
                      bold: true,
                      size: 16,
                      color: 'FFFFFF',
                      font: 'Arial',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // ==========================================================================
  // HELPER: BUILD PORTION STACKED TABLES (FOTO 2, 3, 4)
  // ==========================================================================
  const appendPortionStackedDocx = (
    portionData: MbgPortionDailyData | undefined,
    defaultTitle: string,
    portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui'
  ) => {
    if (!portionData && portionType !== 'kecil' && portionType !== 'besar') {
      return;
    }

    const title = portionData?.portionTitle || defaultTitle;
    const data: MbgPortionDailyData = portionData || {
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

    appendOfficialHeader(title, true);

    // Banners: REALISASI MENU & PORSI
    const bannerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDER,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: '0F2D59' }, // Navy #0F2D59
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'REALISASI MENU', bold: true, color: 'FFFFFF', size: 15, font: 'Arial' })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: 'BAE6FD' }, // Sky 200
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title.toUpperCase(), bold: true, color: '0F172A', size: 15, font: 'Arial' })] })],
            }),
          ],
        }),
      ],
    });

    docChildren.push(bannerTable);
    docChildren.push(new Paragraph({ spacing: { after: 100 }, children: [] }));

    // ─────────────────────────────────────────────────────────────────────────
    // TABEL 1: KANDUNGAN GIZI
    // ─────────────────────────────────────────────────────────────────────────
    const giziDocxRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          ...['Menu', 'Rincian Bahan', 'Berat Bersih', 'Energi', 'Protein', 'Lemak', 'Karbohidrat', 'Serat'].map((h) =>
            new TableCell({
              shading: { fill: 'FEF08A' }, // Yellow #FEF08A
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: '854D0E', size: 13, font: 'Arial' })] })],
            })
          ),
        ],
      }),
    ];

    (data.nutritionItems || []).forEach((nut, idx) => {
      const rowBg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      giziDocxRows.push(
        new TableRow({
          children: [
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: nut.menuName || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: nut.rincianBahan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.beratBersih, 1), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.energi, 1), bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.protein, 1), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.lemak, 1), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.karbohidrat, 1), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(nut.serat, 1), size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });

    // Total Gizi Row
    giziDocxRows.push(
      new TableRow({
        children: [
          new TableCell({ columnSpan: 2, shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Total', bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '-', bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.energi, 1), bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.protein, 1), bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.lemak, 1), bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.karbohidrat, 1), bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FEF08A' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(data.totalGizi?.serat, 1), bold: true, color: '854D0E', size: 13, font: 'Arial' })] })] }),
        ],
      })
    );

    // AKG Rows (EPLKS: Energi, Protein, Lemak, Karbohidrat, Serat)
    if (data.akgRows && data.akgRows.length > 0) {
      data.akgRows.forEach((akgRow) => {
        giziDocxRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 2,
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: akgRow.label, bold: true, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '-', color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FEF3C7' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(akgRow.energi, 1)}%`, bold: true, color: 'B45309', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(akgRow.protein, 1)}%`, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(akgRow.lemak, 1)}%`, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(akgRow.karbohidrat, 1)}%`, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(akgRow.serat, 1)}%`, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
            ],
          })
        );
      });
    } else if (data.akgMetrics && Object.keys(data.akgMetrics).length > 0) {
      Object.entries(data.akgMetrics).forEach(([akgKey, metric]) => {
        const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
        giziDocxRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 3,
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: `% Pemenuhan Makan Siang (${cleanKey})`, bold: true, color: '92400E', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                shading: { fill: 'FEF3C7' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatNum(metric.percentMakanSiang, 1)}%`, bold: true, color: 'B45309', size: 13, font: 'Arial' })] })],
              }),
              new TableCell({
                columnSpan: 4,
                shading: { fill: 'FFFBEB' },
                margins: COMPACT_CELL_MARGINS,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes', color: '92400E', size: 13, font: 'Arial' })] })],
              }),
            ],
          })
        );
      });
    }

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: giziDocxRows }));
    docChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

    // ─────────────────────────────────────────────────────────────────────────
    // TABEL 2: PESANAN BAHAN MAKANAN
    // ─────────────────────────────────────────────────────────────────────────
    const bahanDocxRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          ...['Rincian Bahan', 'Harga Bahan', '%BDD', 'Berat Kotor', 'Total (g/ml)', 'Spare %', 'Kebutuhan (Per Unit)', 'Satuan', 'Harga'].map((h) =>
            new TableCell({
              shading: { fill: 'FEF08A' }, // Yellow #FEF08A
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: '854D0E', size: 13, font: 'Arial' })] })],
            })
          ),
        ],
      }),
    ];

    (data.bahanItems || []).forEach((bah, idx) => {
      const rowBg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      bahanDocxRows.push(
        new TableRow({
          children: [
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bah.rincianBahan || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bah.hargaBahan ? formatRp(bah.hargaBahan) : '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(bah.beratKotor, 0), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(bah.totalGml, 0), size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah.sparePercent ? `${bah.sparePercent}%` : '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'E0F2FE' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatNum(bah.kebutuhan, 1), bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bah.satuan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'DCFCE7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(bah.harga), bold: true, color: '166534', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });

    // Total Belanja & Harga per Porsi
    bahanDocxRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 8,
            shading: { fill: 'FEF08A' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL BELANJA', bold: true, color: '854D0E', size: 13, font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'DCFCE7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(data.totalBelanjaBahan), bold: true, color: '166534', size: 13, font: 'Arial' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 8,
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'HARGA BAHAN MAKANAN (PER PORSI)', bold: true, color: '475569', size: 13, font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'E0F2FE' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi`, bold: true, color: '0369A1', size: 13, font: 'Arial' })] })],
          }),
        ],
      })
    );

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: bahanDocxRows }));
    docChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

    // ─────────────────────────────────────────────────────────────────────────
    // TABEL 3: PESANAN BUMBU
    // ─────────────────────────────────────────────────────────────────────────
    const bumbuDocxRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          ...['Nama Menu', 'Nama Bumbu', 'Harga Bumbu', 'Kebutuhan (Per Unit)', 'Satuan', 'Harga'].map((h) =>
            new TableCell({
              shading: { fill: 'FEF08A' }, // Yellow #FEF08A
              margins: COMPACT_CELL_MARGINS,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: '854D0E', size: 13, font: 'Arial' })] })],
            })
          ),
        ],
      }),
    ];

    (data.bumbuItems || []).forEach((bum, idx) => {
      const rowBg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
      bumbuDocxRows.push(
        new TableRow({
          children: [
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bum.namaMenu || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: bum.namaBumbu || '', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: bum.hargaBumbu ? formatRp(bum.hargaBumbu) : '-', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bum.kebutuhan !== undefined && bum.kebutuhan !== null ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '0') : '-', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bum.satuan || '', size: 13, font: 'Arial' })] })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(bum.harga), bold: true, color: 'B45309', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });

    // Total Belanja, Harga Bumbu per Porsi & Grand Total per Porsi
    bumbuDocxRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            shading: { fill: 'FEF08A' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'TOTAL BELANJA', bold: true, color: '854D0E', size: 13, font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'FEF3C7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(data.totalBelanjaBumbu), bold: true, color: 'B45309', size: 13, font: 'Arial' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'HARGA BUMBU (PER PORSI)', bold: true, color: '475569', size: 13, font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'F1F5F9' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi`, bold: true, color: '92400E', size: 13, font: 'Arial' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            shading: { fill: 'DCFCE7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'HARGA PER PORSI (BAHAN + BUMBU)', bold: true, color: '166534', size: 13, font: 'Arial' })] })],
          }),
          new TableCell({
            shading: { fill: 'DCFCE7' },
            margins: COMPACT_CELL_MARGINS,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${formatRp(data.hargaPerPorsiOverall || ((data.hargaBahanPerPorsi || 0) + (data.hargaBumbuPerPorsi || 0)))} / porsi`, bold: true, color: '166534', size: 13, font: 'Arial' })] })],
          }),
        ],
      })
    );

    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: bumbuDocxRows }));
  };

  // ─── RENDER PORTIONS (PAGES 2+) ───────────────────────────────────────────
  appendPortionStackedDocx(dailyReport.porsiKecil, 'PORSI KECIL (PAUD / TK & SD KELAS 1-3)', 'kecil');
  appendPortionStackedDocx(dailyReport.porsiBesar, 'PORSI BESAR (SD KELAS 4-6, SMP, SMA)', 'besar');

  if (dailyReport.porsiBalita && (dailyReport.porsiBalita.nutritionItems?.length || 0) > 0) {
    appendPortionStackedDocx(dailyReport.porsiBalita, 'PORSI BALITA (USIA 6-59 BULAN)', 'balita');
  }

  if (dailyReport.porsiBumilBusui && (dailyReport.porsiBumilBusui.nutritionItems?.length || 0) > 0) {
    appendPortionStackedDocx(dailyReport.porsiBumilBusui, 'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)', 'bumil_busui');
  }

  // ==========================================================================
  // HALAMAN AKHIR: DAFTAR PESANAN BAHAN
  // ==========================================================================
  appendOfficialHeader('DAFTAR PESANAN BAHAN', true);

  const poList = dailyReport.poRows || [];
  const poGrandTotal =
    poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
    dailyReport.totalPengeluaran ||
    0;

  const poDocxRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          columnSpan: 6,
          shading: { fill: '0F2D59' }, // Navy #0F2D59
          margins: COMPACT_CELL_MARGINS,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'DAFTAR PESANAN BAHAN — DAFTAR PESANAN BAHAN KE MITRA SUPPLIER', bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Supplier', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'List Pesanan Bahan', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jumlah', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Satuan', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: '1E293B' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Harga', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
      ],
    }),
  ];

  if (poList.length === 0) {
    poDocxRows.push(
      new TableRow({
        children: [
          new TableCell({ shading: { fill: 'FFFFFF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '1', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFFFFF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Koperasi Al Umanaa Sejahtera Mandiri', bold: true, size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFFFFF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Bahan Baku & Bumbu Masak Terintegrasi', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFFFFF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '1', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'FFFFFF' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'paket', size: 13, font: 'Arial' })] })] }),
          new TableCell({ shading: { fill: 'DCFCE7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(poGrandTotal), bold: true, color: '166534', size: 13, font: 'Arial' })] })] }),
        ],
      })
    );
  } else {
    poList.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';
      const totalHargaItem = r.totalHarga || (r.jumlah > 0 && r.hargaSatuan ? Math.round(r.jumlah) * r.hargaSatuan : 0);

      poDocxRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri', bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: r.item, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Math.round(r.jumlah || 0).toString(), bold: true, size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 7, type: WidthType.PERCENTAGE }, shading: { fill: rowBg }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.satuan || 'kg', size: 13, font: 'Arial' })] })] }),
            new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, shading: { fill: 'DCFCE7' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(totalHargaItem), bold: true, color: '166534', size: 13, font: 'Arial' })] })] }),
          ],
        })
      );
    });
  }

  // Total Supplier Row
  poDocxRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 5,
          width: { size: 86, type: WidthType.PERCENTAGE },
          shading: { fill: '0F172A' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `TOTAL BELANJA (${poList.length || 1} ITEM):`, bold: true, color: 'FFFFFF', size: 14, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'DCFCE7' },
          margins: COMPACT_CELL_MARGINS,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatRp(poGrandTotal), bold: true, color: '166534', size: 14, font: 'Arial' })] })],
        }),
      ],
    })
  );

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: CELL_BORDER, rows: poDocxRows }));
  docChildren.push(new Paragraph({ spacing: { after: 180 }, children: [] }));

  // Paket Sehat 3B if present
  const paketItems = dailyReport.paketSehat3b?.keringanItems || [];
  if (paketItems.length > 0) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          new TextRun({
            text: 'PAKET SEHAT 3B — KERINGAN BALITA, IBU HAMIL & IBU MENYUSUI',
            bold: true,
            size: 16,
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
          new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ children: [new TextRun({ text: 'Item Bahan Keringan', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qty (Pcs)', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qty Kebutuhan', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Satuan', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: '6B21A8' }, margins: COMPACT_CELL_MARGINS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Biaya', bold: true, color: 'FFFFFF', size: 13, font: 'Arial' })] })] }),
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
              top: 500,
              bottom: 500,
              left: 500,
              right: 500,
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
                    size: 13,
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
                    size: 13,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 13,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    text: ' dari ',
                    size: 13,
                    color: '94A3B8',
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 13,
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
