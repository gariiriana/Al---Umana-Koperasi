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
import {
  buildMbgPmRecipientTable,
  formatMbgPmRecipientName,
  formatMbgPmRecipientPetugas,
  formatMbgPmRecipientValue,
  MBG_PM_RECIPIENT_TABLE_COLUMNS,
} from '@/utils/mbgPmRecipientTable';

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

  const recipientTable = buildMbgPmRecipientTable(entries, report.sekolahList);
  const { rows: rowsData, totals } = recipientTable;
  const bodyRows: RowInput[] = rowsData.map((row, index) => [
    { content: String(index + 1), styles: { halign: 'center' } },
    { content: formatMbgPmRecipientName(row), styles: { fontStyle: 'bold' } },
    row.categoryLabel,
    { content: formatMbgPmRecipientValue(row.porsiKecil), styles: { halign: 'center' } },
    { content: formatMbgPmRecipientValue(row.porsiBesar), styles: { halign: 'center' } },
    { content: formatMbgPmRecipientValue(row.porsiBalita), styles: { halign: 'center' } },
    { content: formatMbgPmRecipientValue(row.porsiBumilBusui), styles: { halign: 'center' } },
    { content: row.totalJumlah.toLocaleString('id-ID'), styles: { halign: 'center', fontStyle: 'bold', textColor: [146, 64, 14], fillColor: [255, 251, 235] } },
    row.rincian || '-',
    formatMbgPmRecipientPetugas(row),
    { content: row.jadwal, styles: { halign: 'center' } },
    {
      content: row.isLibur ? 'Libur' : 'Aktif',
      styles: row.isLibur
        ? { halign: 'center', fontStyle: 'bold', textColor: [185, 28, 28], fillColor: [254, 226, 226] }
        : { halign: 'center', fontStyle: 'bold', textColor: [6, 95, 70], fillColor: [209, 250, 229] },
    },
  ]);

  const footRows: RowInput[] = [[
    {
      content: `TOTAL (${rowsData.length} LEMBAGA):`,
      colSpan: 3,
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    },
    { content: totals.porsiKecil.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center', fillColor: [30, 41, 59], textColor: [252, 211, 77] } },
    { content: totals.porsiBesar.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
    { content: totals.porsiBalita.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
    { content: totals.porsiBumilBusui.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
    { content: totals.totalPorsi.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center', fillColor: [2, 6, 23], textColor: [252, 211, 77] } },
    {
      content: 'Data otomatis terhubung dengan inputan Administrasi PM MBG.',
      colSpan: 4,
      styles: { fontStyle: 'italic', fillColor: [15, 23, 42], textColor: [148, 163, 184] },
    },
  ]];

  autoTable(doc, {
    startY: 27,
    head: [[...MBG_PM_RECIPIENT_TABLE_COLUMNS]],
    body: bodyRows,
    foot: footRows,
    theme: 'grid',
    styles: {
      fontSize: 5.4,
      cellPadding: 0.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 24 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 17, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { cellWidth: 40 },
      9: { cellWidth: 26 },
      10: { cellWidth: 24, halign: 'center' },
      11: { cellWidth: 15, halign: 'center' },
    },
    margin: { top: 28, bottom: 12, left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [51, 65, 85];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.halign = 'center';
      }
      if (data.section === 'body' && rowsData[data.row.index]?.isLibur) {
        data.cell.styles.fillColor = [254, 242, 242];
        if (data.column.index !== 11) data.cell.styles.textColor = [153, 27, 27];
      }
    },
    didDrawPage: () => {
      drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    },
  });
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
      { content: formatNum(data.totalGizi?.beratBersih, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
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
  const totalDariEntries = buildMbgPmRecipientTable(entries, report.sekolahList).totals.totalPorsi;
  const totalPorsiBatch =
    totalDariEntries ||
    batch?.totalJumlah ||
    (report.sekolahList || []).reduce((s, sk) => s + sk.murid + sk.guru, 0) ||
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
