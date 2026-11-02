// ============================================================================
// MBG Bahan PDF Generator
// Generates official-standard PDFs for:
// 1. Dokumentasi Foto Bahan Makanan (Distribusi MBG)
// 2. Formulir Pemeriksaan Bahan Makanan (Standar Badan Gizi Nasional)
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MbgBahanDocumentation, MbgBahanChecklistForm } from '@/types/mbg';
import { getBase64ImageWithDimensions } from './mbgDeliveryReportPdfExporter';
import { MBG_BAHAN_DOC_OFFICERS } from '@/constants/mbgConstants';
import { getLoadedBahanPhotos } from '@/services/mbgBahanService';
import { bahanPhotoTimeRange, coverCropDataUrl, photoMosaicCells } from './bahanPhotoLayout';

/**
 * Format date string into Indonesian locale: e.g. "01 September 2026"
 */
function formatIndoDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

// ============================================================================
// 1. EXPORT FORMULIR PEMERIKSAAN BAHAN MAKANAN (PDF BADAN GIZI NASIONAL)
// ============================================================================

export async function exportBahanChecklistPdf(form: MbgBahanChecklistForm): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // 1. Logo Badan Gizi Nasional (Top Left)
  try {
    const logoInfo =
      (await getBase64ImageWithDimensions('/logo_bgn_official.png', 'image/png')) ||
      (await getBase64ImageWithDimensions('/logo_badan_gizi.png', 'image/png'));
    if (logoInfo) {
      const targetHeight = 14;
      const ratio = logoInfo.height > 0 ? logoInfo.width / logoInfo.height : 2.376;
      const targetWidth = Math.min(42, Math.round(targetHeight * ratio * 10) / 10);
      doc.addImage(logoInfo.dataUrl, 'PNG', margin, 11, targetWidth, targetHeight);
    }
  } catch (err) {
    console.warn('[PDF] Could not load BGN logo:', err);
  }

  // 2. Title & Nomor Form (Top Right / Center)
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text('FORM PEMERIKSAAN BAHAN MAKANAN', pageWidth - margin, 18, { align: 'right' });

  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.text(`NO : ${form.noForm || '01/PBM/IX/2026'}`, pageWidth - margin, 23, { align: 'right' });

  // 3. Metadata Header (Dari, Kepada, Waktu)
  let curY = 37;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);

  const labelX = margin;
  const colonX = margin + 18;
  const valueX = margin + 21;

  doc.text('Dari', labelX, curY);
  doc.text(':', colonX, curY);
  doc.text(form.dari || 'Koperasi Al Umanaa Sejahtera Mandiri', valueX, curY);

  curY += 5;
  doc.text('Kepada', labelX, curY);
  doc.text(':', colonX, curY);
  doc.text(form.kepada || 'SPPG Sukabumi Gunungguruh Kebonmanggu', valueX, curY);

  curY += 5;
  doc.text('Waktu', labelX, curY);
  doc.text(':', colonX, curY);
  doc.text(form.waktu || '06.00 - 08.00 WIB', valueX, curY);

  curY += 6;

  // 4. Construct Table Data (Export exact items from form rows)
  const rawRows = form.rows || [];
  const rows = rawRows.filter(
    (item) => (item.jenisBahan && item.jenisBahan.trim() !== '') || (item.banyaknya !== undefined && item.banyaknya !== null && String(item.banyaknya).trim() !== '' && Number(item.banyaknya) !== 0)
  );
  const itemsToRender = rows.length > 0 ? rows : rawRows;
  const tableBody: (string | number)[][] = [];

  for (let i = 0; i < itemsToRender.length; i++) {
    const item = itemsToRender[i];
    tableBody.push([
      i + 1,
      item.jenisBahan || '',
      item.banyaknya ? String(item.banyaknya) : '',
      item.satuan || '',
      item.isSesuai === true ? 'V' : '',
      item.isSesuai === false ? 'V' : '',
      item.isBaik === true ? 'V' : '',
      item.isBaik === false ? 'V' : '',
      item.notes || '',
    ]);
  }

  // 5. Render AutoTable with exact dual-header layout
  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.25,
    styles: {
      font: 'times',
      fontSize: 8.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      cellPadding: 1.8,
      valign: 'middle',
    },
    head: [
      [
        { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: 'Jenis Bahan Makanan', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: 'Banyaknya\n(Angka)', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: 'Satuan', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
        { content: 'Jumlah', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Kondisi Bahan Makanan', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Keterangan', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
      ],
      [
        { content: 'Sesuai', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Tidak', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Baik', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Rusak', styles: { halign: 'center', fontStyle: 'bold' } },
      ],
    ],
    body: tableBody,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 54, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      8: { cellWidth: 'auto', halign: 'left' },
    },
  });

  // 6. Signature Block (Bottom Right)
  // Retrieve final Y position from autoTable
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 200;
  let sigY = Math.max(finalY + 12, pageHeight - 55);

  // If table went too close to bottom, add new page
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 30;
  }

  const sigX = pageWidth - margin - 60;
  const formattedDate = form.tanggalTtd || formatIndoDate(form.tanggal) || '01 September 2026';
  const locationDate = `${form.lokasiTtd || 'Sukabumi'}, ${formattedDate}`;

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.text(locationDate, sigX, sigY);

  sigY += 5;
  doc.text(form.officerTitle || 'Kepala Satuan Pelayanan Pemenuhan Gizi', sigX, sigY);

  // Signature space
  sigY += 24;
  doc.setFont('times', 'normal');
  doc.text(form.officerName || 'Ragha Eskha Utama, S. Hum.', sigX, sigY);

  // Save & trigger browser download
  const cleanDate = (form.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Form_Pemeriksaan_Bahan_Makanan_${cleanDate}.pdf`);
}

// ============================================================================
// 2. EXPORT DOKUMENTASI FOTO BAHAN MAKANAN (DISTRIBUSI MBG)
// ============================================================================

export async function exportBahanDocumentationPdf(docData: MbgBahanDocumentation): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Header Logos — dimuat sebagai PNG agar latar transparan tidak berubah hitam
  try {
    const bgnLogo = await getBase64ImageWithDimensions('/logo_badan_gizi.png', 'image/png', 256);
    if (bgnLogo) {
      doc.addImage(bgnLogo.dataUrl, 'PNG', margin, 10, 16, 16);
    }
  } catch {
    // ignore
  }

  try {
    const alumanaLogo = await getBase64ImageWithDimensions('/logo_alumana.png', 'image/png', 256);
    if (alumanaLogo) {
      doc.addImage(alumanaLogo.dataUrl, 'PNG', pageWidth - margin - 16, 10, 16, 16);
    }
  } catch {
    // ignore
  }

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('DOKUMENTASI FOTO BAHAN MAKANAN', pageWidth / 2, 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text('PROGRAM MAKAN BERGIZI GRATIS (MBG) — DISTRIBUSI & PENERIMAAN', pageWidth / 2, 22, { align: 'center' });

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(margin, 28, pageWidth - margin, 28);

  // Meta Info Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, 31, pageWidth - (margin * 2), 16, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, 31, pageWidth - (margin * 2), 16, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Tanggal Batch: ${formatIndoDate(docData.tanggal)}`, margin + 4, 37);
  doc.text(`Petugas Dokumentasi: ${MBG_BAHAN_DOC_OFFICERS}`, margin + 4, 43);

  const items = docData.items || [];
  const itemPhotos = items.map(getLoadedBahanPhotos);
  const totalItems = items.length;
  const withPhotos = itemPhotos.filter((p) => p.length > 0).length;
  const totalPhotos = itemPhotos.reduce((sum, p) => sum + p.length, 0);
  doc.text(`Total Bahan: ${totalItems} Item`, pageWidth - margin - 4, 37, { align: 'right' });
  doc.text(`Bahan Difoto: ${withPhotos} / ${totalItems}  •  ${totalPhotos} Foto`, pageWidth - margin - 4, 43, { align: 'right' });

  // Card grid: 3 kolom; baris yang tidak muat pindah ke halaman baru
  // (3 baris di halaman 1 di bawah kop, 4 baris di halaman berikutnya).
  // Tiap kartu: judul bahan → kolase foto (maks. 4) → jumlah, waktu, kondisi, catatan.
  const columns = 3;
  const gap = 5;
  const rowGap = 5;
  const colWidth = (pageWidth - (margin * 2) - (gap * (columns - 1))) / columns;
  const headerHeight = 7.5;
  const photoBoxHeight = 38;
  const detailHeight = 15.5;
  const cardHeight = headerHeight + photoBoxHeight + detailHeight;
  const contentBottom = pageHeight - 14; // footer sits at pageHeight - 8
  const pad = 2.5;

  let cardY = 52;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const photos = itemPhotos[i];
    const colIndex = i % columns;
    const isRusak = item.kondisi === 'rusak';

    if (i > 0 && colIndex === 0) {
      cardY += cardHeight + rowGap;
      if (cardY + cardHeight > contentBottom) {
        doc.addPage();
        cardY = 18;
      }
    }

    const cardX = margin + (colIndex * (colWidth + gap));

    // Latar kartu + strip judul
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cardX, cardY, colWidth, cardHeight, 2, 2, 'F');
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(cardX, cardY, colWidth, headerHeight, 2, 2, 'F');
    doc.rect(cardX, cardY + 2, colWidth, headerHeight - 2, 'F');

    // Nomor urut (lingkaran) + nama bahan + jumlah foto
    const midY = cardY + (headerHeight / 2);
    doc.setFillColor(5, 150, 105);
    doc.circle(cardX + pad + 2.2, midY, 2.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i + 1 >= 100 ? 5 : 6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), cardX + pad + 2.2, midY + 0.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const countLabel = `${photos.length} foto`;
    const countWidth = doc.getTextWidth(countLabel);
    doc.text(countLabel, cardX + colWidth - pad, midY + 0.9, { align: 'right' });

    const nameX = cardX + pad + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(fitText(doc, item.namaBahan || '-', cardX + colWidth - pad - countWidth - 2 - nameX), nameX, midY + 1);

    // Kolase foto
    const photoBox = {
      x: cardX + 2,
      y: cardY + headerHeight + 1.5,
      w: colWidth - 4,
      h: photoBoxHeight - 3,
    };
    if (photos.length > 0) {
      const cells = photoMosaicCells(photos.length, photoBox, 1);
      for (let p = 0; p < cells.length; p++) {
        const cell = cells[p];
        try {
          const cropped = await coverCropDataUrl(photos[p].url!, cell.w / cell.h);
          doc.addImage(cropped, 'JPEG', cell.x, cell.y, cell.w, cell.h);
        } catch {
          doc.setFillColor(241, 245, 249);
          doc.rect(cell.x, cell.y, cell.w, cell.h, 'F');
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(6.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Foto gagal dimuat', cell.x + (cell.w / 2), cell.y + (cell.h / 2), { align: 'center' });
        }
      }
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(photoBox.x, photoBox.y, photoBox.w, photoBox.h, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Belum ada foto', photoBox.x + (photoBox.w / 2), photoBox.y + (photoBox.h / 2) + 1, { align: 'center' });
    }

    // Garis pemisah
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(cardX, cardY + headerHeight, cardX + colWidth, cardY + headerHeight);
    doc.line(cardX, cardY + headerHeight + photoBoxHeight, cardX + colWidth, cardY + headerHeight + photoBoxHeight);

    // Detail: jumlah + badge kondisi, waktu foto, catatan
    const textX = cardX + pad;
    const textWidth = colWidth - (pad * 2);
    const lineY = cardY + headerHeight + photoBoxHeight + 4.4;

    const kondisiLabel = isRusak ? 'Rusak / Cacat' : 'Baik / Segar';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    const badgeW = doc.getTextWidth(kondisiLabel) + 4;
    const badgeX = cardX + colWidth - pad - badgeW;
    if (isRusak) doc.setFillColor(254, 226, 226);
    else doc.setFillColor(209, 250, 229);
    doc.roundedRect(badgeX, lineY - 2.8, badgeW, 3.8, 1.9, 1.9, 'F');
    if (isRusak) doc.setTextColor(185, 28, 28);
    else doc.setTextColor(4, 120, 87);
    doc.text(kondisiLabel, badgeX + 2, lineY - 0.2);

    const qtyStr = item.kuantitas ? `${item.kuantitas} ${item.satuan || ''}`.trim() : '-';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(fitText(doc, `Jumlah: ${qtyStr}`, textWidth - badgeW - 2), textX, lineY);
    doc.text(fitText(doc, `Waktu foto: ${bahanPhotoTimeRange(photos)}`, textWidth), textX, lineY + 4);

    if (item.catatan) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(fitText(doc, `Catatan: ${item.catatan}`, textWidth), textX, lineY + 8);
    }

    // Bingkai kartu (merah muda untuk bahan rusak) digambar terakhir agar di atas foto
    if (isRusak) doc.setDrawColor(252, 165, 165);
    else doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, cardY, colWidth, cardHeight, 2, 2, 'S');
  }

  // Footer + "Halaman x dari y" di setiap halaman
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawPageFooter(doc, p, pageCount, pageWidth, pageHeight, margin);
  }

  // Save PDF
  const cleanDate = (docData.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Dokumentasi_Foto_Bahan_MBG_${cleanDate}.pdf`);
}

/** Potong teks satu baris agar muat di `maxWidth` (mm) dengan font yang sedang aktif. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

function drawPageFooter(doc: jsPDF, pageNum: number, pageCount: number, pageWidth: number, pageHeight: number, margin: number) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Dokumentasi Bahan MBG • Dicetak otomatis pada ${new Date().toLocaleString('id-ID')}`,
    margin,
    pageHeight - 8
  );
  doc.text(`Halaman ${pageNum} dari ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
}
