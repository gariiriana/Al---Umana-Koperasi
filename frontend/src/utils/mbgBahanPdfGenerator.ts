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

  // 4. Construct Table Data (Minimum 17 rows to replicate official layout exactly)
  const rows = form.rows || [];
  const minRows = Math.max(17, rows.length);
  const tableBody: (string | number)[][] = [];

  for (let i = 0; i < minRows; i++) {
    const item = rows[i];
    if (item && item.jenisBahan) {
      tableBody.push([
        i + 1,
        item.jenisBahan,
        item.banyaknya ? String(item.banyaknya) : '',
        item.satuan || '',
        item.isSesuai === true ? 'V' : '',
        item.isSesuai === false ? 'V' : '',
        item.isBaik === true ? 'V' : '',
        item.isBaik === false ? 'V' : '',
        item.notes || '',
      ]);
    } else {
      // Empty placeholder row
      tableBody.push([i + 1, '', '', '', '', '', '', '', '']);
    }
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

  // Header Logos
  try {
    const bgnLogo = await getBase64ImageWithDimensions('/logo_badan_gizi.png');
    if (bgnLogo) {
      doc.addImage(bgnLogo.dataUrl, 'PNG', margin, 10, 16, 16);
    }
  } catch {
    // ignore
  }

  try {
    const alumanaLogo = await getBase64ImageWithDimensions('/logo_alumana.png');
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
  doc.text(`Petugas Dokumentasi: ${docData.officerName || 'Tim Distribusi MBG'}`, margin + 4, 43);

  const totalItems = docData.items?.length || 0;
  const withPhotos = (docData.items || []).filter((i) => Boolean(i.photoUrl)).length;
  doc.text(`Total Bahan: ${totalItems} Item`, pageWidth - margin - 4, 37, { align: 'right' });
  doc.text(`Terdokumentasi Foto: ${withPhotos} / ${totalItems}`, pageWidth - margin - 4, 43, { align: 'right' });

  let curY = 52;
  const items = docData.items || [];

  // Card Grid settings: 2 columns per row
  const colWidth = (pageWidth - (margin * 2) - 8) / 2;
  const cardHeight = 65;

  let pageNum = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const colIndex = i % 2;
    const rowIndex = Math.floor((i % 6) / 2); // 3 rows (6 cards) per page

    // Check if we need a new page
    if (i > 0 && i % 6 === 0) {
      // Draw footer on current page
      drawPageFooter(doc, pageNum, pageWidth, pageHeight, margin);
      doc.addPage();
      pageNum++;
      curY = 20;
    }

    const cardX = margin + (colIndex * (colWidth + 8));
    const cardY = curY + (rowIndex * (cardHeight + 6));

    // Card frame
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, cardY, colWidth, cardHeight, 2, 2, 'FD');

    // Photo Box (Top of card: 40mm height)
    const photoBoxHeight = 42;
    if (item.photoUrl) {
      try {
        const photoInfo = await getBase64ImageWithDimensions(item.photoUrl, 'image/jpeg');
        if (photoInfo) {
          // Fit image maintaining aspect ratio inside photo box
          const ratio = photoInfo.width / photoInfo.height;
          let drawW = colWidth - 4;
          let drawH = drawW / ratio;
          if (drawH > photoBoxHeight - 4) {
            drawH = photoBoxHeight - 4;
            drawW = drawH * ratio;
          }
          const imgX = cardX + ((colWidth - drawW) / 2);
          const imgY = cardY + 2 + ((photoBoxHeight - 4 - drawH) / 2);
          doc.addImage(photoInfo.dataUrl, 'JPEG', imgX, imgY, drawW, drawH);
        }
      } catch {
        doc.setFillColor(241, 245, 249);
        doc.rect(cardX + 2, cardY + 2, colWidth - 4, photoBoxHeight - 4, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Foto gagal dimuat', cardX + (colWidth / 2), cardY + (photoBoxHeight / 2), { align: 'center' });
      }
    } else {
      // Placeholder when no photo taken
      doc.setFillColor(248, 250, 252);
      doc.rect(cardX + 2, cardY + 2, colWidth - 4, photoBoxHeight - 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('📷 Belum ada foto', cardX + (colWidth / 2), cardY + (photoBoxHeight / 2), { align: 'center' });
    }

    // Divider inside card
    doc.setDrawColor(226, 232, 240);
    doc.line(cardX, cardY + photoBoxHeight, cardX + colWidth, cardY + photoBoxHeight);

    // Card Details (Bottom of card)
    const textStartY = cardY + photoBoxHeight + 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const shortName = item.namaBahan.length > 30 ? `${item.namaBahan.slice(0, 28)}...` : item.namaBahan;
    doc.text(`${i + 1}. ${shortName}`, cardX + 3, textStartY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const qtyStr = item.kuantitas ? `${item.kuantitas} ${item.satuan || ''}` : '-';
    const timeStr = item.waktuFoto || '-';
    doc.text(`Jumlah: ${qtyStr} | Waktu: ${timeStr}`, cardX + 3, textStartY + 4.5);

    // Condition Badge text
    const isBaik = item.kondisi !== 'rusak';
    doc.setFont('helvetica', 'bold');
    if (isBaik) {
      doc.setTextColor(16, 149, 106); // Emerald
      doc.text(`Kondisi: Baik / Segar`, cardX + 3, textStartY + 9);
    } else {
      doc.setTextColor(220, 38, 38); // Red
      doc.text(`Kondisi: Rusak / Cacat`, cardX + 3, textStartY + 9);
    }

    if (item.catatan) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      const noteStr = item.catatan.length > 35 ? `${item.catatan.slice(0, 33)}...` : item.catatan;
      doc.text(`Catatan: ${noteStr}`, cardX + 3, textStartY + 13.5);
    }
  }

  // Draw footer on last page
  drawPageFooter(doc, pageNum, pageWidth, pageHeight, margin);

  // Save PDF
  const cleanDate = (docData.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Dokumentasi_Foto_Bahan_MBG_${cleanDate}.pdf`);
}

function drawPageFooter(doc: jsPDF, pageNum: number, pageWidth: number, pageHeight: number, margin: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Dokumentasi Bahan MBG • Dicetak otomatis pada ${new Date().toLocaleString('id-ID')}`,
    margin,
    pageHeight - 8
  );
  doc.text(`Halaman ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
}
