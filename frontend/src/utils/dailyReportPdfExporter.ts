// ============================================================================
// MBG Daily Report PDF Exporter — Landscape Official Layout
// Badan Gizi Nasional & Koperasi Al Umanaa Sejahtera Mandiri
// ============================================================================

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type {
  MbgProductionDailyReport,
  MbgPmBatch,
  MbgPmEntry,
  MbgPortionDailyData,
} from '@/types/mbg';
import { buildMbgPmRecipientTable } from '@/utils/mbgPmRecipientTable';
import { getAutoRekapTotals, isSummaryOrCategoryRow } from '@/utils/mbgPmFilter';


const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      return null;
    }
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith('image/')) {
      return null;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 256;
          let width = img.naturalWidth || 100;
          let height = img.naturalHeight || 100;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.warn('Error loading image base64:', err);
    return null;
  }
};

function formatRp(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return 'Rp 0';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

function formatNum(val: number | undefined | null, decimals = 1): string {
  if (val == null || isNaN(val)) return '0';
  if (Number.isInteger(val)) return val.toString();
  return Number(val.toFixed(decimals)).toString();
}

// ─── OFFICIAL HEADER FOR LANDSCAPE A4 ─────────────────────────────────────────

const drawLandscapeHeader = (
  doc: jsPDF,
  sectionTitle: string,
  tanggal: string,
  totalPorsi: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  const pageW = doc.internal.pageSize.getWidth();

  if (logoAlUmanaa) {
    try {
      doc.addImage(logoAlUmanaa, 'PNG', 10, 6, 15, 15);
    } catch {
      // ignore
    }
  }

  if (logoBadanGizi) {
    try {
      doc.addImage(logoBadanGizi, 'PNG', pageW - 25, 6, 15, 15);
    } catch {
      // ignore
    }
  }

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // slate 900
  doc.text('BADAN GIZI NASIONAL', pageW / 2, 9, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59); // slate 800
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU - YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 13.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(180, 83, 9); // amber 700
  doc.text(`LAPORAN OPERASIONAL HARIAN MBG — ${sectionTitle.toUpperCase()}`, pageW / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate 500
  doc.text(`Tanggal Batch: ${tanggal} • Sasaran Produksi: ${totalPorsi.toLocaleString('id-ID')} Porsi • Koperasi Al Umanaa Sejahtera Mandiri`, pageW / 2, 22.5, { align: 'center' });

  // Dividing line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(10, 24.5, pageW - 10, 24.5);
};

// ─── HALAMAN 1: REKAPITULASI PENERIMA MANFAAT (FOTO 1) ────────────────────────

export const buildRekapPmRows = (
  entries: MbgPmEntry[] = [],
  sekolahList: { nama: string; murid: number; guru: number }[] = []
): ReturnType<typeof buildMbgPmRecipientTable>['rows'] =>
  buildMbgPmRecipientTable(entries, sekolahList).rows;

const renderRekapitulasiPmPage = (
  doc: jsPDF,
  report: MbgProductionDailyReport,
  entries: MbgPmEntry[],
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  // Filter out summary/category rows
  const validEntries = (entries || []).filter((e) => !isSummaryOrCategoryRow(e.institutionName));

  const effectiveEntries: MbgPmEntry[] = validEntries.length > 0 ? validEntries : (report.sekolahList || [])
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

  const columnWidths: { [key: number]: { cellWidth: number; halign?: 'left' | 'center' | 'right' } } = {
    0: { cellWidth: 44, halign: 'left' },
    1: { cellWidth: 10, halign: 'center' },
    2: { cellWidth: 10, halign: 'center' },
    3: { cellWidth: 10, halign: 'center' },
    4: { cellWidth: 10, halign: 'center' },
    5: { cellWidth: 11, halign: 'center' },
    6: { cellWidth: 11, halign: 'center' },
    7: { cellWidth: 13, halign: 'center' },
    8: { cellWidth: 10, halign: 'center' },
    9: { cellWidth: 10, halign: 'center' },
    10: { cellWidth: 10, halign: 'center' },
    11: { cellWidth: 10, halign: 'center' },
    12: { cellWidth: 13, halign: 'center' },
    13: { cellWidth: 20, halign: 'center' },
    14: { cellWidth: 43, halign: 'left' },
    15: { cellWidth: 32, halign: 'center' },
  };

  const buildTableConfig = (
    list: MbgPmEntry[],
    totals: ReturnType<typeof getAutoRekapTotals>,
    isPosyandu: boolean
  ) => {
    const head: RowInput[] = [
      [
        { content: isPosyandu ? 'POSYANDU' : 'SEKOLAH', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
        { content: 'PORSI KECIL', colSpan: 2, styles: { halign: 'center' } },
        { content: 'PORSI BESAR', colSpan: 2, styles: { halign: 'center' } },
        { content: 'TOTAL', colSpan: 2, styles: { halign: 'center', fillColor: [226, 232, 240] } },
        { content: 'JML', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [226, 232, 240] } },
        { content: 'GURU', colSpan: 2, styles: { halign: 'center' } },
        { content: 'TENDIK', colSpan: 2, styles: { halign: 'center' } },
        { content: 'JML', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [241, 245, 249] } },
        { content: 'TOTAL KESELURUHAN', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [254, 243, 199], textColor: [120, 53, 15] } },
        { content: 'PETUGAS KURIR', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'JADWAL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      ],
      [
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
        { content: 'L', styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: 'P', styles: { halign: 'center', fillColor: [241, 245, 249] } },
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
      ],
    ];

    const body: RowInput[] = list.length === 0
      ? [[{ content: `Belum ada data ${isPosyandu ? 'Posyandu' : 'Sekolah'}`, colSpan: 16, styles: { halign: 'center', fontStyle: 'italic', textColor: [148, 163, 184] } }]]
      : list.map((entry) => {
          if (entry.isSekolahLibur) {
            return [
              { content: `${entry.institutionName} (LIBUR)`, styles: { fontStyle: 'bold', textColor: [185, 28, 28] } },
              { content: 'TIDAK ADA PENGIRIMAN (LIBUR)', colSpan: 12, styles: { halign: 'center', fontStyle: 'bold', textColor: [185, 28, 28] } },
              { content: entry.assignedPetugasName || '—', styles: { halign: 'center', textColor: [148, 163, 184] } },
              { content: entry.jadwalPengantaran || '—', styles: { halign: 'center', textColor: [148, 163, 184] } },
            ];
          }

          const totalL = isPosyandu ? (entry.qtPorsiKecilL || 0) : ((entry.qtPorsiKecilL || 0) + (entry.qtPorsiBesarL || 0));
          const bumil = entry.qtBumil ?? (isPosyandu ? entry.qtPorsiBesarL || 0 : 0);
          const busui = entry.qtBusui ?? (isPosyandu ? entry.qtPorsiBesarP || 0 : 0);
          const totalP = isPosyandu ? ((entry.qtPorsiKecilP || 0) + bumil + busui) : ((entry.qtPorsiKecilP || 0) + (entry.qtPorsiBesarP || 0));
          const totalSiswa = totalL + totalP;
          const totalStaf = (entry.qtGuruL || 0) + (entry.qtGuruP || 0) + (entry.qtTendikL || 0) + (entry.qtTendikP || 0);

          return [
            { content: entry.institutionName, styles: { fontStyle: 'bold' } },
            { content: entry.qtPorsiKecilL ? String(entry.qtPorsiKecilL) : '—', styles: { halign: 'center' } },
            { content: entry.qtPorsiKecilP ? String(entry.qtPorsiKecilP) : '—', styles: { halign: 'center' } },
            { content: entry.qtPorsiBesarL ? String(entry.qtPorsiBesarL) : (isPosyandu && bumil ? String(bumil) : '—'), styles: { halign: 'center' } },
            { content: entry.qtPorsiBesarP ? String(entry.qtPorsiBesarP) : (isPosyandu && busui ? String(busui) : '—'), styles: { halign: 'center' } },
            { content: totalL ? String(totalL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252] } },
            { content: totalP ? String(totalP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252] } },
            { content: totalSiswa ? String(totalSiswa) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: entry.qtGuruL ? String(entry.qtGuruL) : '—', styles: { halign: 'center' } },
            { content: entry.qtGuruP ? String(entry.qtGuruP) : '—', styles: { halign: 'center' } },
            { content: entry.qtTendikL ? String(entry.qtTendikL) : '—', styles: { halign: 'center' } },
            { content: entry.qtTendikP ? String(entry.qtTendikP) : '—', styles: { halign: 'center' } },
            { content: totalStaf ? String(totalStaf) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: String(entry.jumlah), styles: { halign: 'center', fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [146, 64, 14] } },
            { content: entry.assignedPetugasName || '—', styles: { halign: 'left' } },
            { content: entry.jadwalPengantaran || '—', styles: { halign: 'center' } },
          ];
        });

    const foot: RowInput[] = [
      [
        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'left', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.porsiKecilL ? String(totals.porsiKecilL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.porsiKecilP ? String(totals.porsiKecilP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.porsiBesarL ? String(totals.porsiBesarL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.porsiBesarP ? String(totals.porsiBesarP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.totalL ? String(totals.totalL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
        { content: totals.totalP ? String(totals.totalP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
        { content: (totals.totalL + totals.totalP) ? String(totals.totalL + totals.totalP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [51, 65, 85], textColor: [255, 255, 255] } },
        { content: totals.guruL ? String(totals.guruL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.guruP ? String(totals.guruP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.tendikL ? String(totals.tendikL) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.tendikP ? String(totals.tendikP) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: totals.totalStaf ? String(totals.totalStaf) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
        { content: totals.jumlah ? String(totals.jumlah) : '—', styles: { halign: 'center', fontStyle: 'bold', fillColor: [245, 158, 11], textColor: [15, 23, 42] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
      ],
    ];

    return { head, body, foot };
  };

  let curY = 27;

  // Header 1: DATA PM — FORMAT AUTO REKAP
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('DATA PM — FORMAT AUTO REKAP', 10, curY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${schoolEntries.length} Sekolah • ${schoolTotals.jumlah.toLocaleString('id-ID')} Porsi`, 287, curY, { align: 'right' });
  curY += 2;

  const schoolCfg = buildTableConfig(schoolEntries, schoolTotals, false);
  autoTable(doc, {
    startY: curY,
    head: schoolCfg.head,
    body: schoolCfg.body,
    foot: schoolCfg.foot,
    theme: 'grid',
    styles: {
      fontSize: 5.2,
      cellPadding: 0.7,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: columnWidths,
    margin: { top: 27, bottom: 12, left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.fillColor = data.cell.styles.fillColor || [241, 245, 249];
        data.cell.styles.textColor = data.cell.styles.textColor || [51, 65, 85];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });

  curY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Page break check if needed for Posyandu table
  if (curY > 165) {
    doc.addPage();
    drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    curY = 27;
  }

  // Header 2: DATA POSYANDU
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('DATA POSYANDU', 10, curY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${posyanduEntries.length} Posyandu • ${posyanduTotals.jumlah.toLocaleString('id-ID')} Porsi`, 287, curY, { align: 'right' });
  curY += 2;

  const posyanduCfg = buildTableConfig(posyanduEntries, posyanduTotals, true);
  autoTable(doc, {
    startY: curY,
    head: posyanduCfg.head,
    body: posyanduCfg.body,
    foot: posyanduCfg.foot,
    theme: 'grid',
    styles: {
      fontSize: 5.2,
      cellPadding: 0.7,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: columnWidths,
    margin: { top: 27, bottom: 12, left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.fillColor = data.cell.styles.fillColor || [241, 245, 249];
        data.cell.styles.textColor = data.cell.styles.textColor || [51, 65, 85];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });

  curY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // Grand Total Summary Box
  if (curY > 185) {
    doc.addPage();
    drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    curY = 27;
  }

  // Draw summary card
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.roundedRect(10, curY, 277, 12, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(6, 78, 59); // emerald 900
  doc.text('RINGKASAN TOTAL PENERIMA MANFAAT', 14, curY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(4, 120, 87); // emerald 700
  doc.text(
    `Jumlah keseluruhan porsi Sekolah (${schoolTotals.jumlah.toLocaleString('id-ID')}) dan Posyandu (${posyanduTotals.jumlah.toLocaleString('id-ID')}) dari data Admin MBG.`,
    14,
    curY + 8.5
  );

  // Badge on the right
  doc.setFillColor(5, 150, 105); // emerald 600
  doc.roundedRect(215, curY + 2.5, 68, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Total Keseluruhan: ${overallTotals.jumlah.toLocaleString('id-ID')} Porsi`, 249, curY + 6.8, { align: 'center' });
};


// ─── HALAMAN 2+: INDIVIDUAL PORTION (3 TABEL VERTIKAL: FOTO 2, 3, 4) ──────────

const renderPortionStackedPage = (
  doc: jsPDF,
  portionData: MbgPortionDailyData | undefined,
  defaultTitle: string,
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui',
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  const pageW = doc.internal.pageSize.getWidth();
  const title = portionData?.portionTitle || defaultTitle;

  drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

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

  // Header Banner 1: REALISASI MENU (Navy #0F2D59)
  let curY = 27;
  doc.setFillColor(15, 45, 89);
  doc.rect(10, curY, pageW - 20, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('REALISASI MENU', pageW / 2, curY + 3.5, { align: 'center' });

  // Header Banner 2: PORSI KECIL / BESAR / BALITA (Light Blue #BAE6FD)
  curY += 5;
  doc.setFillColor(186, 230, 253); // Sky 200
  doc.rect(10, curY, pageW - 20, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42); // slate 900
  doc.text(title.toUpperCase(), pageW / 2, curY + 3.5, { align: 'center' });

  curY += 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 1: KANDUNGAN GIZI
  // ═══════════════════════════════════════════════════════════════════════════
  const giziRows: RowInput[] = (data.nutritionItems || []).map((nut) => [
    nut.menuName || '',
    nut.rincianBahan || '',
    formatNum(nut.beratBersih, 1),
    formatNum(nut.energi, 1),
    formatNum(nut.protein, 1),
    formatNum(nut.lemak, 1),
    formatNum(nut.karbohidrat, 1),
    formatNum(nut.serat, 1),
  ]);

  if (giziRows.length === 0) {
    giziRows.push(['-', '-', '-', '-', '-', '-', '-', '-']);
  }

  const giziFootRows: RowInput[] = [
    // Row 1: Total
    [
      { content: 'Total', colSpan: 2, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: '-', styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.energi, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [180, 83, 9] } },
      { content: formatNum(data.totalGizi?.protein, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.lemak, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.karbohidrat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.serat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
    ],
  ];

  // AKG % Pemenuhan rows (EPLKS: Energi, Protein, Lemak, Karbohidrat, Serat)
  if (data.akgRows && data.akgRows.length > 0) {
    data.akgRows.forEach((akgRow) => {
      giziFootRows.push([
        { content: akgRow.label, colSpan: 2, styles: { fontStyle: 'bold', halign: 'left', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: '-', styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(akgRow.energi, 1)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
        { content: `${formatNum(akgRow.protein, 1)}%`, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(akgRow.lemak, 1)}%`, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(akgRow.karbohidrat, 1)}%`, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(akgRow.serat, 1)}%`, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
      ]);
    });
  } else if (data.akgMetrics && Object.keys(data.akgMetrics).length > 0) {
    Object.entries(data.akgMetrics).forEach(([akgKey, metric]) => {
      const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
      giziFootRows.push([
        { content: `% Pemenuhan Makan Siang (${cleanKey})`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'left', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(metric.percentMakanSiang, 1)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
        { content: metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes', colSpan: 4, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
      ]);
    });
  }

  autoTable(doc, {
    startY: curY,
    head: [
      [
        { content: 'Menu', styles: { halign: 'center' } },
        { content: 'Rincian Bahan', styles: { halign: 'center' } },
        { content: 'Berat Bersih', styles: { halign: 'center' } },
        { content: 'Energi', styles: { halign: 'center' } },
        { content: 'Protein', styles: { halign: 'center' } },
        { content: 'Lemak', styles: { halign: 'center' } },
        { content: 'Karbohidrat', styles: { halign: 'center' } },
        { content: 'Serat', styles: { halign: 'center' } },
      ],
    ],
    body: giziRows,
    foot: giziFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14], // Amber 800
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 32, halign: 'center' },
      7: { cellWidth: 28, halign: 'center' },
    },
    margin: { top: 28, bottom: 12, left: 10, right: 10 },
    didDrawPage: () => {
      drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 2: PESANAN BAHAN MAKANAN
  // ═══════════════════════════════════════════════════════════════════════════
  const afterGiziY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || curY + 40;
  let bahanStartY = afterGiziY + 4;
  if (afterGiziY > 140) {
    doc.addPage();
    drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    bahanStartY = 28;
  }

  const bahanRows: RowInput[] = (data.bahanItems || []).map((bah) => [
    bah.rincianBahan || '',
    bah.hargaBahan ? formatRp(bah.hargaBahan) : '-',
    bah.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : '-',
    formatNum(bah.beratKotor, 0),
    formatNum(bah.totalGml, 0),
    bah.sparePercent ? `${bah.sparePercent}%` : '-',
    formatNum(bah.kebutuhan, 1),
    bah.satuan || '',
    formatRp(bah.harga),
  ]);

  if (bahanRows.length === 0) {
    bahanRows.push(['-', '-', '-', '-', '-', '-', '-', '-', '-']);
  }

  const bahanFootRows: RowInput[] = [
    // Total Belanja
    [
      { content: 'TOTAL BELANJA', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatRp(data.totalBelanjaBahan), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
    ],
    // Harga per Porsi
    [
      { content: 'HARGA BAHAN MAKANAN (PER PORSI)', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [71, 85, 105] } },
      { content: `${formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [224, 242, 254], textColor: [3, 105, 161] } },
    ],
  ];

  autoTable(doc, {
    startY: bahanStartY,
    head: [
      [
        { content: 'Rincian Bahan', styles: { halign: 'center' } },
        { content: 'Harga Bahan', styles: { halign: 'center' } },
        { content: '%BDD', styles: { halign: 'center' } },
        { content: 'Berat Kotor', styles: { halign: 'center' } },
        { content: 'Total (g/ml)', styles: { halign: 'center' } },
        { content: 'Spare %', styles: { halign: 'center' } },
        { content: 'Kebutuhan (Per Unit)', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Harga', styles: { halign: 'center' } },
      ],
    ],
    body: bahanRows,
    foot: bahanFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14],
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 34, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 41, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    margin: { top: 28, bottom: 12, left: 10, right: 10 },
    didDrawPage: () => {
      drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 3: PESANAN BUMBU
  // ═══════════════════════════════════════════════════════════════════════════
  const afterBahanY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || bahanStartY + 45;
  let bumbuStartY = afterBahanY + 4;
  if (afterBahanY > 140) {
    doc.addPage();
    drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    bumbuStartY = 28;
  }

  const bumbuRows: RowInput[] = (data.bumbuItems || []).map((bum) => [
    bum.namaMenu || '',
    bum.namaBumbu || '',
    bum.hargaBumbu ? formatRp(bum.hargaBumbu) : '-',
    bum.kebutuhan !== undefined && bum.kebutuhan !== null
      ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '0')
      : '-',
    bum.satuan || '',
    formatRp(bum.harga),
  ]);

  if (bumbuRows.length === 0) {
    bumbuRows.push(['-', '-', '-', '-', '-', '-']);
  }

  const bumbuFootRows: RowInput[] = [
    // Total Belanja Bumbu
    [
      { content: 'TOTAL BELANJA', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatRp(data.totalBelanjaBumbu), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
    ],
    // Harga Bumbu per Porsi
    [
      { content: 'HARGA BUMBU (PER PORSI)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [71, 85, 105] } },
      { content: `${formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [146, 64, 14] } },
    ],
    // Grand Total per Porsi
    [
      { content: 'HARGA PER PORSI (BAHAN + BUMBU)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
      { content: `${formatRp(data.hargaPerPorsiOverall || ((data.hargaBahanPerPorsi || 0) + (data.hargaBumbuPerPorsi || 0)))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
    ],
  ];

  autoTable(doc, {
    startY: bumbuStartY,
    head: [
      [
        { content: 'Nama Menu', styles: { halign: 'center' } },
        { content: 'Nama Bumbu', styles: { halign: 'center' } },
        { content: 'Harga Bumbu', styles: { halign: 'center' } },
        { content: 'Kebutuhan (Per Unit)', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Harga', styles: { halign: 'center' } },
      ],
    ],
    body: bumbuRows,
    foot: bumbuFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14],
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 56, halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] },
    },
    margin: { top: 28, bottom: 12, left: 10, right: 10 },
    didDrawPage: () => {
      drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });
};

// ─── HALAMAN AKHIR: TABEL SUPPLIER & PENGESAHAN ───────────────────────────────

const renderSupplierPage = (
  doc: jsPDF,
  report: MbgProductionDailyReport,
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  drawLandscapeHeader(doc, 'DAFTAR PESANAN BAHAN', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  const poList = report.poRows || [];
  const poGrandTotal =
    poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
    report.totalPengeluaran ||
    0;

  const poTableBody: RowInput[] = poList.map((row, idx) => [
    idx + 1,
    row.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri',
    row.item,
    formatNum(Math.round(row.jumlah), 0),
    row.satuan || 'kg',
    formatRp(row.totalHarga || (Math.round(row.jumlah) * (row.hargaSatuan || 0))),
  ]);

  if (poTableBody.length === 0) {
    poTableBody.push(['1', 'Koperasi Al Umanaa Sejahtera Mandiri', 'Bahan Baku & Bumbu Masak Terintegrasi', '1', 'paket', formatRp(poGrandTotal)]);
  }

  autoTable(doc, {
    startY: 27,
    head: [
      // Banner row
      [
        {
          content: 'DAFTAR PESANAN BAHAN — DAFTAR PESANAN BAHAN KE MITRA SUPPLIER',
          colSpan: 6,
          styles: {
            fillColor: [15, 45, 89],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8,
          },
        },
      ],
      // Subheaders
      [
        { content: 'No', styles: { halign: 'center' } },
        { content: 'Supplier', styles: { halign: 'center' } },
        { content: 'List Pesanan Bahan', styles: { halign: 'center' } },
        { content: 'Jumlah', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Total Harga', styles: { halign: 'center' } },
      ],
    ],
    body: poTableBody,
    foot: [
      [
        { content: `TOTAL BELANJA (${poList.length || 1} ITEM):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: formatRp(poGrandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.2, lineWidth: 0.15, lineColor: [203, 213, 225], overflow: 'linebreak' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 80, fontStyle: 'bold' },
      2: { cellWidth: 106 },
      3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 36, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    margin: { top: 28, bottom: 12, left: 10, right: 10 },
    didDrawPage: () => {
      drawLandscapeHeader(doc, 'DAFTAR PESANAN BAHAN', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });

  // Paket Sehat 3B (Balita / Bumil) if exists
  const paketItems = report.paketSehat3b?.keringanItems || [];
  if (paketItems.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 100;
    const p3bStartY = lastY + 4;

    const p3bBody: RowInput[] = paketItems.map((p, idx) => [
      idx + 1,
      p.item,
      formatNum(p.qtyPcs, 0),
      formatNum(p.qty, 1),
      p.satuan || 'pcs',
      p.hargaSatuan ? formatRp(p.hargaSatuan) : '-',
      p.totalHarga ? formatRp(p.totalHarga) : '-',
    ]);

    autoTable(doc, {
      startY: p3bStartY,
      head: [
        [
          {
            content: 'PAKET SEHAT 3B — KERINGAN BALITA, IBU HAMIL & IBU MENYUSUI',
            colSpan: 7,
            styles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
          },
        ],
        ['No', 'Item Bahan Keringan', 'Qty (Pcs)', 'Qty Kebutuhan', 'Satuan', 'Harga Satuan (Rp)', 'Total Biaya (Rp)'],
      ],
      body: p3bBody,
      theme: 'grid',
      styles: { fontSize: 6.8, cellPadding: 1, lineWidth: 0.15, lineColor: [233, 213, 255], overflow: 'linebreak' },
      headStyles: { fillColor: [107, 33, 168], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 80, fontStyle: 'bold' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 40, halign: 'right' },
        6: { cellWidth: 45, halign: 'right', fontStyle: 'bold', textColor: [107, 33, 168] },
      },
      margin: { top: 28, bottom: 12, left: 10, right: 10 },
      didDrawPage: () => {
        drawLandscapeHeader(doc, 'DAFTAR PESANAN BAHAN', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
      },
    });
  }
};

// ─── EXPORT MAIN FUNCTION ─────────────────────────────────────────────────────

export async function generate8PageDailyReportPdf(
  report: MbgProductionDailyReport | null | undefined,
  batch: MbgPmBatch | undefined,
  entries: MbgPmEntry[] = []
) {
  if (!report) {
    throw new Error('Batch ini belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const logoAlUmanaa = (await getBase64ImageFromUrl('/logo.png')) || (await getBase64ImageFromUrl('/logo_alumana.png'));
  const logoBadanGizi = await getBase64ImageFromUrl('/logo_badan_gizi.png');

  const tanggalStr = report.tanggal || batch?.tanggal || new Date().toISOString().split('T')[0];
  const autoTotals = getAutoRekapTotals(entries);
  const filteredSekolahList = (report.sekolahList || []).filter((s) => !isSummaryOrCategoryRow(s.nama));
  const totalDariSekolahList = filteredSekolahList.reduce((s, sk) => s + (sk.murid || 0) + (sk.guru || 0), 0);
  const totalPorsiBatch =
    (entries.length > 0 ? autoTotals.jumlah : 0) ||
    batch?.totalJumlah ||
    totalDariSekolahList ||
    0;


  // ─── HALAMAN 1: REKAPITULASI PENERIMA MANFAAT (FOTO 1) ────────────────────
  renderRekapitulasiPmPage(
    doc,
    report,
    entries,
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 2: PORSI KECIL (FOTO 2) ──────────────────────────────────────
  doc.addPage();
  renderPortionStackedPage(
    doc,
    report.porsiKecil,
    'PORSI KECIL (PAUD / TK & SD KELAS 1-3)',
    'kecil',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 3: PORSI BESAR (FOTO 3) ──────────────────────────────────────
  doc.addPage();
  renderPortionStackedPage(
    doc,
    report.porsiBesar,
    'PORSI BESAR (SD KELAS 4-6, SMP, SMA)',
    'besar',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 4+: PORSI BALITA & BUMIL / BUSUI (FOTO 4) ────────────────────
  const hasBalita = report.porsiBalita && (report.porsiBalita.nutritionItems?.length || 0) > 0;
  const hasBumil = report.porsiBumilBusui && (report.porsiBumilBusui.nutritionItems?.length || 0) > 0;

  if (hasBalita) {
    doc.addPage();
    renderPortionStackedPage(
      doc,
      report.porsiBalita,
      'PORSI BALITA (USIA 6-59 BULAN)',
      'balita',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi
    );
  }

  if (hasBumil) {
    doc.addPage();
    renderPortionStackedPage(
      doc,
      report.porsiBumilBusui,
      'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)',
      'bumil_busui',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi
    );
  }

  // ─── HALAMAN AKHIR: DAFTAR PESANAN BAHAN ───────────────────────────────────
  doc.addPage();
  renderSupplierPage(
    doc,
    report,
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  return doc;
}

export async function export8PageDailyReportPdf(
  report: MbgProductionDailyReport | null | undefined,
  batch: MbgPmBatch | undefined,
  entries: MbgPmEntry[] = []
) {
  const doc = await generate8PageDailyReportPdf(report, batch, entries);
  const tanggalStr = report?.tanggal || batch?.tanggal || new Date().toISOString().split('T')[0];
  doc.save(`Laporan_Harian_MBG_Produksi_${tanggalStr}.pdf`);
}
