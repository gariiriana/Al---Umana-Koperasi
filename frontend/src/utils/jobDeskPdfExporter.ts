// ============================================================================
// Job Desk PDF Exporter
// Exports the (filtered) job desk table — No | Start Time | Kegiatan | Keterangan —
// as a compact A4 portrait PDF with the Badan Gizi Nasional logo in the header.
// Tanggal / PIC shared by every row go in the summary line; when the rows span
// several dates, each date gets its own separator row.
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { CateringJobDesk } from '@/types/cateringJobDesk';
import { getBase64ImageWithDimensions } from './mbgDeliveryReportPdfExporter';

export interface JobDeskPdfOptions {
  /** Filter lines shown under the title, e.g. ["PIC: Dwi", "Tanggal: 05 Oktober 2026"]. */
  filterSummary?: string[];
  /**
   * For a single date with several PICs: insert a "PIC: …" separator row whenever
   * the PIC changes. The caller passes rows already grouped by PIC.
   */
  groupByPic?: boolean;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** "2026-10-05" → "05 Oktober 2026" */
export function formatJobDeskDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function keteranganText(jd: CateringJobDesk): string {
  const parts = (jd.keterangan || jd.description || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean);
  if (jd.incompleteReason) parts.push(`Alasan incomplete: ${jd.incompleteReason}`);
  if (jd.reviewStatus === 'rejected' && jd.rejectionRemark) parts.push(`Remark CO_MO: ${jd.rejectionRemark}`);
  return parts.length ? parts.join('\n') : '-';
}

/** "Lembaga: …" / "Pesanan: …" sub-label shown under the kegiatan. */
function sourceLabel(jd: CateringJobDesk): string {
  if (jd.division === 'mbg') {
    const name = jd.mbgInstitutionName || jd.orderLabel;
    return name ? `Lembaga: ${name}` : '';
  }
  return jd.orderLabel ? `Pesanan: ${jd.orderLabel}` : '';
}

export async function exportJobDesksPdf(jobDesks: CateringJobDesk[], options: JobDeskPdfOptions = {}): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // 1. Logo Badan Gizi Nasional (top left)
  const logoHeight = 15;
  try {
    const logo =
      (await getBase64ImageWithDimensions('/logo_bgn_official.png', 'image/png')) ||
      (await getBase64ImageWithDimensions('/logo_badan_gizi.png', 'image/png'));
    if (logo) {
      const ratio = logo.height > 0 ? logo.width / logo.height : 2.376;
      doc.addImage(logo.dataUrl, 'PNG', margin, 10, logoHeight * ratio, logoHeight);
    }
  } catch (err) {
    console.warn('[PDF] Could not load BGN logo:', err);
  }

  // 2. Title block (top right)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('DAFTAR TUGAS / JOB DESK OPERASIONAL', pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Koperasi Al Umanaa Sejahtera Mandiri', pageWidth - margin, 20.5, { align: 'right' });
  doc.text(`Total: ${jobDesks.length} tugas`, pageWidth - margin, 25, { align: 'right' });

  // 3. Divider + filter summary
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(margin, 29, pageWidth - margin, 29);

  // When every row comes from the same lembaga/pesanan, show it once in the
  // summary instead of repeating it under each kegiatan.
  const sources = new Set(jobDesks.map(sourceLabel));
  const sharedSource = sources.size === 1 ? [...sources][0] : '';

  // Tanggal and PIC have no column of their own, so show them once when shared.
  const filterSummary = (options.filterSummary ?? []).filter(Boolean);
  const dateSet = new Set(jobDesks.map((jd) => jd.tanggal || ''));
  const picSet = new Set(jobDesks.map((jd) => jd.pic || ''));
  const singleDate = dateSet.size === 1 ? [...dateSet][0] : '';
  const singlePic = picSet.size === 1 ? [...picSet][0] : '';
  const sharedDate =
    singleDate && !filterSummary.some((s) => s.startsWith('Tanggal:'))
      ? `Tanggal: ${jobDesks[0].hari ? `${jobDesks[0].hari}, ` : ''}${formatJobDeskDate(singleDate)}`
      : '';
  const sharedPic = singlePic && !filterSummary.some((s) => s.startsWith('PIC:')) ? `PIC: ${singlePic}` : '';

  let curY = 34;
  const summary = [...filterSummary, sharedPic, sharedDate, sharedSource].filter(Boolean);
  if (summary.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const lines: string[] = doc.splitTextToSize(summary.join('   •   '), pageWidth - margin * 2);
    doc.text(lines, margin, curY);
    curY += lines.length * 4;
  }

  // 4. Table — rows stay in the caller's order; a separator row is inserted
  // whenever the date changes (only when the rows span several dates).
  const kegiatanCell = (jd: CateringJobDesk) => {
    const kegiatan = jd.kegiatan || jd.title || '-';
    const source = sourceLabel(jd);
    return sharedSource || !source ? kegiatan : `${kegiatan}\n${source}`;
  };
  const body: RowInput[] = [];
  const separator = (content: string): RowInput => [
    { content, colSpan: 4, styles: { fillColor: [226, 232, 240], fontStyle: 'bold', halign: 'left' } },
  ];
  const picSeparators = !!options.groupByPic && dateSet.size === 1 && picSet.size > 1;
  let lastDate: string | undefined;
  let lastPic: string | undefined;
  jobDesks.forEach((jd, i) => {
    if (dateSet.size > 1 && jd.tanggal !== lastDate) {
      lastDate = jd.tanggal;
      body.push(separator(jd.tanggal ? `${jd.hari ? `${jd.hari}, ` : ''}${formatJobDeskDate(jd.tanggal)}` : 'Tanpa tanggal'));
    }
    if (picSeparators && jd.pic !== lastPic) {
      lastPic = jd.pic;
      body.push(separator(`PIC: ${jd.pic || '-'}`));
    }
    body.push([i + 1, jd.startTime || '-', kegiatanCell(jd), keteranganText(jd)]);
  });

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, bottom: 14 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: [15, 23, 42],
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
      cellPadding: 1.8,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [['No', 'Start Time', 'Kegiatan', 'Keterangan']],
    body,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 70, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
    },
    // A cell can't mix bold and normal text, so a kegiatan carrying a
    // lembaga/pesanan sub-label is drawn in normal weight.
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2 && String(data.cell.raw).includes('\n')) {
        data.cell.styles.fontStyle = 'normal';
      }
    },
  });

  // 5. Footer on every page
  const pageCount = doc.getNumberOfPages();
  const printedAt = new Date().toLocaleString('id-ID');
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dicetak otomatis pada ${printedAt}`, margin, pageHeight - 7);
    doc.text(`Halaman ${p} dari ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  // 6. Filename from the date range in the data
  const dates = jobDesks.map((jd) => jd.tanggal).filter(Boolean).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const range = !first ? 'semua' : first === last ? first : `${first}_sd_${last}`;
  doc.save(`Job_Desk_${range.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
}
