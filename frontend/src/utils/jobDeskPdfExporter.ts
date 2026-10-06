// ============================================================================
// Job Desk PDF Exporter
// Exports the (filtered) job desk table — Divisi | Hari | Tanggal | Start Time |
// PIC Teklap | Kegiatan | Keterangan | Key ID | Status — as an A4 landscape PDF
// with the Badan Gizi Nasional logo in the header.
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CateringJobDesk } from '@/types/cateringJobDesk';
import { getBase64ImageWithDimensions } from './mbgDeliveryReportPdfExporter';

export interface JobDeskPdfOptions {
  /** Filter lines shown under the title, e.g. ["PIC: Dwi", "Tanggal: 05 Oktober 2026"]. */
  filterSummary?: string[];
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

function statusLabel(jd: CateringJobDesk): string {
  const work = jd.status === 'complete' ? 'Complete' : jd.status === 'incomplete' ? 'Incomplete' : 'Belum Ditandai';
  const review =
    jd.reviewStatus === 'approved' ? 'Approved'
    : jd.reviewStatus === 'rejected' ? 'Rejected'
    : jd.reviewStatus === 'pending_review' ? 'Menunggu Review'
    : 'Belum Submit';
  return `${work}\n${review}`;
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
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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

  let curY = 34;
  const summary = [...(options.filterSummary ?? []), sharedSource].filter(Boolean);
  if (summary.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const lines: string[] = doc.splitTextToSize(summary.join('   •   '), pageWidth - margin * 2);
    doc.text(lines, margin, curY);
    curY += lines.length * 4;
  }

  // 4. Table
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
    head: [['No', 'Divisi', 'Hari', 'Tanggal', 'Start Time', 'PIC Teklap', 'Kegiatan', 'Keterangan', 'Key ID', 'Status']],
    body: jobDesks.map((jd, i) => [
      i + 1,
      jd.division === 'mbg' ? 'MBG' : 'Katering',
      jd.hari || '-',
      jd.tanggal || '-',
      jd.startTime || '-',
      jd.pic || '-',
      sharedSource || !sourceLabel(jd)
        ? jd.kegiatan || jd.title || '-'
        : `${jd.kegiatan || jd.title || '-'}\n${sourceLabel(jd)}`,
      keteranganText(jd),
      jd.keyId || '-',
      statusLabel(jd),
    ]),
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 17, halign: 'center' },
      2: { cellWidth: 16 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 58, fontStyle: 'bold' },
      7: { cellWidth: 'auto' },
      8: { cellWidth: 32, halign: 'center', font: 'courier', fontStyle: 'bold', fontSize: 7.5 },
      9: { cellWidth: 25, halign: 'center', fontSize: 7.5 },
    },
    // A cell can't mix bold and normal text, so a kegiatan carrying a
    // lembaga/pesanan sub-label is drawn in normal weight.
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6 && String(data.cell.raw).includes('\n')) {
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
