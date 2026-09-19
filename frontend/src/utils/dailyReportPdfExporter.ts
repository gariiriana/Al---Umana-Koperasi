// ============================================================================
// MBG Daily Report PDF Exporter — Landscape Official Layout
// Badan Gizi Nasional & Koperasi Konsumen Al-Umanaa Mandiri Berkah
// ============================================================================

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type {
  MbgProductionDailyReport,
  MbgPmBatch,
  MbgPmEntry,
  MbgPortionDailyData,
} from '@/types/mbg';
import { getFilteredPmEntries, type FilteredPmRow } from '@/components/mbg/DailyReportExcelSections';

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
  doc.text(`Tanggal Batch: ${tanggal} • Sasaran Produksi: ${totalPorsi.toLocaleString('id-ID')} Porsi • Koperasi Konsumen Al-Umanaa Mandiri Berkah`, pageW / 2, 22.5, { align: 'center' });

  // Dividing line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(10, 24.5, pageW - 10, 24.5);
};

// ─── RENDER 3-SECTION UNIFIED EXCEL TABLE (GIZI + BAHAN + BUMBU) ───────────────

const renderPortionExcelAndPmPage = (
  doc: jsPDF,
  portionData: MbgPortionDailyData | undefined,
  defaultTitle: string,
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil',
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null,
  entries: MbgPmEntry[],
  fallbackSekolahList: { nama: string; murid: number; guru: number }[] = []
) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const title = portionData?.portionTitle || defaultTitle;

  drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

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

  const maxRows = Math.max(
    data.nutritionItems?.length || 0,
    data.bahanItems?.length || 0,
    data.bumbuItems?.length || 0,
    1
  );

  // Table Body Rows
  const bodyRows: RowInput[] = [];

  for (let idx = 0; idx < maxRows; idx++) {
    const nut = data.nutritionItems?.[idx];
    const bah = data.bahanItems?.[idx];
    const bum = data.bumbuItems?.[idx];

    bodyRows.push([
      // Gizi
      idx === 0 ? defaultTitle : '',
      nut?.menuName || '',
      nut?.rincianBahan || '',
      nut ? formatNum(nut.beratBersih, 1) : '',
      nut ? formatNum(nut.energi, 1) : '',
      nut ? formatNum(nut.protein, 1) : '',
      nut ? formatNum(nut.lemak, 1) : '',
      nut ? formatNum(nut.karbohidrat, 1) : '',
      nut ? formatNum(nut.serat, 1) : '',

      // Bahan Pokok
      bah?.rincianBahan || '',
      bah?.hargaBahan ? formatRp(bah.hargaBahan) : '',
      bah?.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : '',
      bah ? formatNum(bah.beratKotor, 0) : '',
      bah ? formatNum(bah.totalGml, 0) : '',
      bah?.sparePercent ? `${bah.sparePercent}%` : '-',
      bah ? formatNum(bah.kebutuhan, 1) : '',
      bah?.satuan || '',
      bah?.harga ? formatRp(bah.harga) : '',

      // Bumbu Masak
      bum?.namaMenu || '',
      bum?.namaBumbu || '',
      bum?.hargaBumbu ? formatRp(bum.hargaBumbu) : '',
      bum ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '-') : '',
      bum?.satuan || '',
      bum?.harga ? formatRp(bum.harga) : '',
    ]);
  }

  // Footer Rows
  const footRows: RowInput[] = [
    // Row 1: TOTAL
    [
      { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'left', fillColor: [255, 228, 230], textColor: [136, 19, 55] } },
      { content: formatNum(data.totalGizi?.beratBersih, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 228, 230] } },
      { content: formatNum(data.totalGizi?.energi, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
      { content: formatNum(data.totalGizi?.protein, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 228, 230] } },
      { content: formatNum(data.totalGizi?.lemak, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 228, 230] } },
      { content: formatNum(data.totalGizi?.karbohidrat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 228, 230] } },
      { content: formatNum(data.totalGizi?.serat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [255, 228, 230] } },

      { content: 'TOTAL BAHAN:', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right', fillColor: [224, 242, 254], textColor: [3, 105, 161] } },
      { content: formatRp(data.totalBelanjaBahan), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },

      { content: 'TOTAL BUMBU:', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199], textColor: [146, 64, 14] } },
      { content: formatRp(data.totalBelanjaBumbu), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
    ],
    // Row 2: Biaya per Porsi
    [
      { content: 'Biaya Bahan Pokok per Porsi:', colSpan: 9, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [71, 85, 105] } },
      { content: `${formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi`, colSpan: 9, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [3, 105, 161] } },
      { content: `${formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [146, 64, 14] } },
    ],
  ];

  // Row 3+: % Pemenuhan AKG
  if (data.akgMetrics && Object.keys(data.akgMetrics).length > 0) {
    Object.entries(data.akgMetrics).forEach(([akgKey, metric]) => {
      const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
      footRows.push([
        { content: `% Pemenuhan Makan Siang (${cleanKey})`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'left', fillColor: [254, 243, 199], textColor: [146, 64, 14] } },
        { content: '-', styles: { halign: 'center', fillColor: [254, 243, 199] } },
        { content: `${formatNum(metric.percentMakanSiang, 1)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [146, 64, 14] } },
        { content: metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes', colSpan: 4, styles: { halign: 'center', fillColor: [254, 243, 199], textColor: [146, 64, 14] } },
        { content: `Capaian Angka Kecukupan Gizi (AKG) Makan Siang Sasaran ${cleanKey}`, colSpan: 15, styles: { fontStyle: 'italic', halign: 'left', fillColor: [248, 250, 252], textColor: [100, 116, 139] } },
      ]);
    });
  }

  // Draw 3-Section Unified Table
  autoTable(doc, {
    startY: 26,
    head: [
      // Category Group Row (Exact website colors)
      [
        { content: '🌸 1. Kandungan Gizi Menu', colSpan: 9, styles: { fillColor: [255, 228, 230], textColor: [136, 19, 55], fontStyle: 'bold', halign: 'center' } },
        { content: '🥣 2. Pesanan Bahan Makanan Pokok', colSpan: 9, styles: { fillColor: [224, 242, 254], textColor: [3, 105, 161], fontStyle: 'bold', halign: 'center' } },
        { content: '🧂 3. Pesanan Bumbu Masak', colSpan: 6, styles: { fillColor: [254, 243, 199], textColor: [146, 64, 14], fontStyle: 'bold', halign: 'center' } },
      ],
      // Column Names Subheader
      [
        // Gizi
        { content: 'Jenis Menu', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57] } },
        { content: 'Menu', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57] } },
        { content: 'Rincian Bahan', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57] } },
        { content: 'Berat Bersih', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: 'center' } },
        { content: 'Energi (kkal)', styles: { fillColor: [255, 241, 242], textColor: [180, 83, 9], fontStyle: 'bold', halign: 'center' } },
        { content: 'Protein (g)', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: 'center' } },
        { content: 'Lemak (g)', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: 'center' } },
        { content: 'Karbohidrat (g)', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: 'center' } },
        { content: 'Serat (g)', styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: 'center' } },

        // Bahan
        { content: 'Rincian Bahan', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110] } },
        { content: 'Harga Baku', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'right' } },
        { content: '%BDD', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'center' } },
        { content: 'Berat Kotor', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'center' } },
        { content: 'Total (g)', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'center' } },
        { content: 'Spare %', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'center' } },
        { content: 'Kebutuhan', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], fontStyle: 'bold', halign: 'center' } },
        { content: 'Satuan', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], halign: 'center' } },
        { content: 'Harga (Rp)', styles: { fillColor: [240, 249, 255], textColor: [12, 74, 110], fontStyle: 'bold', halign: 'right' } },

        // Bumbu
        { content: 'Nama Menu', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15] } },
        { content: 'Nama Bumbu', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15] } },
        { content: 'Harga Bumbu', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15], halign: 'right' } },
        { content: 'Kebutuhan', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15], fontStyle: 'bold', halign: 'center' } },
        { content: 'Satuan', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15], halign: 'center' } },
        { content: 'Harga (Rp)', styles: { fillColor: [255, 251, 235], textColor: [120, 53, 15], fontStyle: 'bold', halign: 'right' } },
      ],
    ],
    body: bodyRows,
    foot: footRows,
    theme: 'grid',
    styles: {
      fontSize: 5.8,
      cellPadding: 0.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 17 },
      2: { cellWidth: 17 },
      3: { cellWidth: 9, halign: 'center' },
      4: { cellWidth: 9, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
      5: { cellWidth: 8, halign: 'center' },
      6: { cellWidth: 8, halign: 'center' },
      7: { cellWidth: 8, halign: 'center' },
      8: { cellWidth: 8, halign: 'center' },

      9: { cellWidth: 18 },
      10: { cellWidth: 14, halign: 'right' },
      11: { cellWidth: 9, halign: 'center' },
      12: { cellWidth: 9, halign: 'center' },
      13: { cellWidth: 9, halign: 'center' },
      14: { cellWidth: 8, halign: 'center' },
      15: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
      16: { cellWidth: 8, halign: 'center' },
      17: { cellWidth: 15, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },

      18: { cellWidth: 15 },
      19: { cellWidth: 16 },
      20: { cellWidth: 13, halign: 'right' },
      21: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
      22: { cellWidth: 8, halign: 'center' },
      23: { cellWidth: 14, halign: 'right', fontStyle: 'bold', textColor: [146, 64, 14] },
    },
    margin: { left: 10, right: 10 },
  });

  // ─── DIRECTLY UNDERNEATH: DATA PENERIMA MANFAAT (INPUT ADMIN MBG) ─────────
  const finalTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 100;
  let pmStartY = finalTableY + 5;

  const pmRows: FilteredPmRow[] = getFilteredPmEntries(entries, portionType, fallbackSekolahList);
  const totalPorsiPm = pmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.portionCount), 0);

  // If table doesn't fit on this page, add page with header
  if (pmStartY + 35 > pageH - 12) {
    doc.addPage();
    drawLandscapeHeader(doc, `${title} — DATA PENERIMA MANFAAT`, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    pmStartY = 27;
  }

  // Section Banner for PM Table
  doc.setFillColor(15, 23, 42); // slate 900
  doc.rect(10, pmStartY, pageW - 20, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`DATA PENERIMA MANFAAT (INPUT ADMIN MBG) — SASARAN ${title.toUpperCase()} (TOTAL: ${totalPorsiPm.toLocaleString('id-ID')} PORSI • ${pmRows.length} LEMBAGA)`, pageW / 2, pmStartY + 3.5, { align: 'center' });

  if (pmRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Belum ada data input Admin MBG yang dialokasikan untuk kategori sasaran ini.', 14, pmStartY + 10);
  } else {
    const pmTableBody: RowInput[] = pmRows.map((row, idx) => [
      idx + 1,
      row.institutionName + (row.address ? `\n${row.address}` : ''),
      row.categoryLabel,
      formatNum(row.portionCount, 0),
      row.detailBreakdown || '-',
      formatNum(row.totalJumlah, 0),
      row.petugasName,
      row.jadwal,
      row.isLibur ? 'Libur' : 'Aktif',
    ]);

    autoTable(doc, {
      startY: pmStartY + 5.5,
      head: [['No', 'Nama Institusi / Lembaga', 'Kategori / Jenjang', 'Porsi Sasaran Ini', 'Rincian / Catatan', 'Total Porsi Lembaga', 'Petugas Kurir', 'Jadwal Pengantaran', 'Status']],
      body: pmTableBody,
      foot: [
        [
          { content: `TOTAL ALOKASI PORSI SASARAN (${pmRows.length} INSTITUSI):`, colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
          { content: `${totalPorsiPm.toLocaleString('id-ID')} Porsi`, styles: { halign: 'center', fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
          { content: 'Data terhubung otomatis dengan Administrasi PM MBG', colSpan: 5, styles: { fontStyle: 'italic', fillColor: [15, 23, 42], textColor: [203, 213, 225] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1, lineWidth: 0.15, lineColor: [226, 232, 240] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 28 },
        3: { cellWidth: 25, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
        4: { cellWidth: 40 },
        5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 35 },
        7: { cellWidth: 25, halign: 'center' },
        8: { cellWidth: 17, halign: 'center' },
      },
      margin: { left: 10, right: 10 },
    });
  }
};

// ─── EXPORT MAIN FUNCTION ─────────────────────────────────────────────────────

export async function export8PageDailyReportPdf(
  report: MbgProductionDailyReport | null | undefined,
  batch: MbgPmBatch | undefined,
  entries: MbgPmEntry[] = []
) {
  if (!report) {
    throw new Error('Batch ini belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const logoAlUmanaa = (await getBase64ImageFromUrl('/logo.png')) || (await getBase64ImageFromUrl('/logo_alumana.png'));
  const logoBadanGizi = await getBase64ImageFromUrl('/logo_badan_gizi.png');

  const tanggalStr = report.tanggal || batch?.tanggal || new Date().toISOString().split('T')[0];
  const totalPorsiBatch = batch?.totalJumlah || entries.reduce((s, e) => s + (e.isSekolahLibur ? 0 : (e.jumlah || 0)), 0) || (report.sekolahList || []).reduce((s, sk) => s + sk.murid + sk.guru, 0) || 0;

  // ─── PAGE 1: PORSI KECIL ──────────────────────────────────────────────────
  renderPortionExcelAndPmPage(
    doc,
    report.porsiKecil,
    'PORSI KECIL (PAUD / TK & SD KELAS 1-3)',
    'kecil',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi,
    entries,
    report.sekolahList
  );

  // ─── PAGE 2: PORSI BESAR ──────────────────────────────────────────────────
  doc.addPage();
  renderPortionExcelAndPmPage(
    doc,
    report.porsiBesar,
    'PORSI BESAR (SD KELAS 4-6, SMP, SMA)',
    'besar',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi,
    entries,
    report.sekolahList
  );

  // ─── PAGE 3: PORSI BALITA & BUMIL / BUSUI (IF PRESENT) ────────────────────
  const hasBalita = report.porsiBalita && (report.porsiBalita.nutritionItems?.length || 0) > 0;
  const hasBumil = report.porsiBumilBusui && (report.porsiBumilBusui.nutritionItems?.length || 0) > 0;

  if (hasBalita) {
    doc.addPage();
    renderPortionExcelAndPmPage(
      doc,
      report.porsiBalita,
      'PORSI BALITA (USIA 6-59 BULAN)',
      'balita',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi,
      entries,
      report.sekolahList
    );
  }

  if (hasBumil) {
    doc.addPage();
    renderPortionExcelAndPmPage(
      doc,
      report.porsiBumilBusui,
      'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)',
      'bumil',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi,
      entries,
      report.sekolahList
    );
  }

  // ─── PAGE 4: TABEL SUPPLIER (PURCHASE ORDER BAHAN & BUMBU) ────────────────
  doc.addPage();
  drawLandscapeHeader(doc, 'TABEL SUPPLIER (PESANAN BAHAN MAKANAN & BUMBU)', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  const poList = report.poRows || [];
  const poGrandTotal =
    poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
    report.totalPengeluaran ||
    0;

  const poTableBody: RowInput[] = poList.map((row, idx) => [
    idx + 1,
    row.supplier || 'Koperasi Al-Umanaa',
    row.item,
    row.jamKedatangan || '06:00',
    formatNum(row.jumlah, 1),
    row.satuan || 'kg',
    row.hargaSatuan ? formatRp(row.hargaSatuan) : '-',
    formatRp(row.totalHarga || (row.jumlah * (row.hargaSatuan || 0))),
    row.keterangan || 'Sesuai Spesifikasi',
  ]);

  autoTable(doc, {
    startY: 27,
    head: [['No', 'Nama Supplier / Pemasok', 'Item / Rincian Bahan', 'Jam Tiba', 'Jumlah', 'Satuan', 'Harga Satuan (Rp)', 'Total Harga (Rp)', 'Keterangan / Catatan']],
    body: poTableBody,
    foot: [
      [
        { content: `TOTAL PESANAN SUPPLIER (${poList.length} ITEM BAHAN & BUMBU):`, colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: formatRp(poGrandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
        { content: 'Realisasi Pembelian Terverifikasi', styles: { fontStyle: 'italic', fillColor: [15, 23, 42], textColor: [203, 213, 225] } },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.2, lineWidth: 0.15, lineColor: [203, 213, 225] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 55 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
      8: { cellWidth: 70 },
    },
    margin: { left: 10, right: 10 },
  });

  // If Paket Sehat 3B exists, render it below Supplier Table
  const paketItems = report.paketSehat3b?.keringanItems || [];
  if (paketItems.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 100;
    let p3bStartY = lastY + 5;

    if (p3bStartY + 35 > pageH - 12) {
      doc.addPage();
      drawLandscapeHeader(doc, 'PAKET SEHAT 3B (KERINGAN BALITA & BUMIL)', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
      p3bStartY = 27;
    }

    doc.setFillColor(88, 28, 135); // purple 900
    doc.rect(10, p3bStartY, pageW - 20, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('PAKET SEHAT 3B — KERINGAN BALITA, IBU HAMIL & IBU MENYUSUI', pageW / 2, p3bStartY + 3.5, { align: 'center' });

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
      startY: p3bStartY + 5.5,
      head: [['No', 'Item Bahan Keringan', 'Qty (Pcs)', 'Qty Kebutuhan', 'Satuan', 'Harga Satuan (Rp)', 'Total Biaya (Rp)']],
      body: p3bBody,
      theme: 'grid',
      styles: { fontSize: 6.8, cellPadding: 1, lineWidth: 0.15, lineColor: [233, 213, 255] },
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
      margin: { left: 10, right: 10 },
    });
  }

  // ─── PAGE 5: REKAP PENERIMA MANFAAT LENGKAP & LEMBAR PENGESAHAN ───────────
  doc.addPage();
  drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT & PENGESAHAN', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  // Source of PM list: admin entries or imported sekolahList
  const pmFullRows: RowInput[] = [];
  if (entries && entries.length > 0) {
    entries.forEach((e, idx) => {
      pmFullRows.push([
        idx + 1,
        e.institutionName + (e.isSekolahLibur ? ' (Libur)' : ''),
        e.institutionType === 'posyandu' ? 'Posyandu' : (e.schoolLevel || 'Sekolah').toUpperCase(),
        e.assignedPetugasName || '-',
        e.isSekolahLibur ? '-' : formatNum(e.qtSiswaBalita, 0),
        e.isSekolahLibur ? '-' : formatNum(e.qtBumilBusui, 0),
        e.isSekolahLibur ? '-' : formatNum(e.qtGuruKader, 0),
        e.isSekolahLibur ? '0' : formatNum(e.jumlah, 0),
        e.jadwalPengantaran || '06.30 - 08.00',
        e.isSekolahLibur ? 'Libur' : 'Aktif',
      ]);
    });
  } else if (report.sekolahList && report.sekolahList.length > 0) {
    report.sekolahList.forEach((s, idx) => {
      pmFullRows.push([
        idx + 1,
        s.nama,
        'Sekolah / Sasaran',
        'Tim Distribusi MBG',
        formatNum(s.murid, 0),
        '-',
        formatNum(s.guru, 0),
        formatNum(s.murid + s.guru, 0),
        '06.30 - 08.00',
        'Aktif',
      ]);
    });
  }

  autoTable(doc, {
    startY: 27,
    head: [['No', 'Nama Institusi / Sasaran', 'Tipe / Jenjang', 'Petugas Kurir', 'Siswa/Balita', 'Bumil/Busui', 'Guru/Staff', 'Total Porsi', 'Jadwal Tiba', 'Status']],
    body: pmFullRows,
    foot: [
      [
        { content: 'TOTAL SELURUH PENERIMA MANFAAT MBG:', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: `${totalPorsiBatch.toLocaleString('id-ID')} Porsi`, styles: { halign: 'center', fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
        { content: 'Data Terverifikasi Admin MBG', colSpan: 2, styles: { fontStyle: 'italic', fillColor: [15, 23, 42], textColor: [203, 213, 225] } },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1, lineWidth: 0.15, lineColor: [203, 213, 225] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 28 },
      3: { cellWidth: 35 },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 24, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
      8: { cellWidth: 25, halign: 'center' },
      9: { cellWidth: 18, halign: 'center' },
    },
    margin: { left: 10, right: 10 },
  });

  // ─── LEMBAR PENGESAHAN (3 SIGNATURES) ─────────────────────────────────────
  const lastFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 130;
  let sigY = lastFinalY + 8;

  if (sigY + 35 > pageH - 10) {
    doc.addPage();
    drawLandscapeHeader(doc, 'LEMBAR PENGESAHAN LAPORAN OPERASIONAL', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    sigY = 35;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const col1X = 45;
  const col2X = pageW / 2;
  const col3X = pageW - 45;

  // Signatures
  doc.text('Mengetahui,', col1X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Kepala Satuan Pelayanan (SPPG)', col1X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col1X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('NIP: SPPG-BGN-001', col1X, sigY + 23.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Diperiksa Oleh,', col2X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Tenaga Ahli Gizi (Nutrisionis)', col2X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col2X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('STR: GIZI-MBG-2026', col2X, sigY + 23.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Dibuat Oleh,', col3X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Koordinator Produksi & Dapur', col3X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col3X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Koperasi Al-Umanaa', col3X, sigY + 23.5, { align: 'center' });

  // Save PDF
  const filename = `Laporan_Harian_MBG_Produksi_${tanggalStr}.pdf`;
  doc.save(filename);
}
