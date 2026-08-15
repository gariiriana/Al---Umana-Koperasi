import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MbgDeliveryDocument } from '@/services/mbgDeliveryService';
import type { MbgPmEntry } from '@/types/mbg';

// Helper to load image as base64 with canvas fallback (supports transparent PNG)
export const getBase64Image = async (url: string, format: 'image/png' | 'image/jpeg' = 'image/png'): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith('data:image')) return url;

  try {
    const img = new Image();
    if (url.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });

    if (img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL(format, 0.95);
      }
    }
  } catch {
    // Fallback using fetch
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
  return null;
};

// Format date string to Indonesian format (e.g. "Senin, 03 Agustus 2026" or "03 AGUSTUS 2026")
export const formatIndonesianDate = (dateStr?: string, includeDayName = true): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr;
    }
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const dayName = days[d.getDay()];
    const dateNum = String(d.getDate()).padStart(2, '0');
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();

    if (includeDayName) {
      return `${dayName}, ${dateNum} ${monthName} ${year}`;
    }
    return `${dateNum} ${monthName.toUpperCase()} ${year}`;
  } catch {
    return dateStr;
  }
};

export interface ExportDeliveryPdfOptions {
  docMeta?: Partial<MbgDeliveryDocument>;
  entries: MbgPmEntry[];
  petugasName?: string;
  tanggalBatch?: string;
  periodeText?: string;
  fileName?: string;
}

export async function exportMbgDeliveryReportPdf({
  docMeta,
  entries,
  petugasName,
  tanggalBatch,
  periodeText,
  fileName,
}: ExportDeliveryPdfOptions): Promise<void> {
  const activeEntries = entries.filter((e) => !e.isSekolahLibur && (e.institutionName?.trim() || e.id));
  const effectivePetugas = petugasName || docMeta?.petugasName || activeEntries[0]?.assignedPetugasName || 'Semua Petugas';
  const effectiveTanggal = tanggalBatch || docMeta?.tanggalBatch || new Date().toISOString().split('T')[0];
  
  const formattedHeaderDate = formatIndonesianDate(effectiveTanggal, true);
  const effectivePeriode = periodeText || docMeta?.tanggalBatch || formattedHeaderDate;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Colors
  const slateDark: [number, number, number] = [17, 24, 39];
  const mutedGray: [number, number, number] = [100, 116, 139];

  // ─── 1. Load Logo ───
  let logoBase64: string | null = null;
  try {
    logoBase64 = await getBase64Image('/logo_badan_gizi.png');
  } catch {
    logoBase64 = null;
  }

  // ─── 2. COVER PAGE (Layout Sesuai Template Resmi) ───
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Top Header Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('BADAN GIZI NASIONAL', pageW / 2, 32, { align: 'center' });

  doc.setFontSize(11);
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 40, { align: 'center' });
  doc.text('YAYASAN LEMBAGA AL UMANAA', pageW / 2, 48, { align: 'center' });

  // Title & Period
  doc.setFontSize(12.5);
  doc.text('LAPORAN KEGIATAN DISTRIBUSI', pageW / 2, 74, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`PERIODE ${effectivePeriode.toUpperCase()}`, pageW / 2, 82, { align: 'center' });

  // Big Centered BGN Logo (Diameter 76mm)
  const logoSize = 76;
  const logoX = (pageW - logoSize) / 2;
  const logoY = 100;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
  }

  // Summary / Keterangan Table (Placed below center logo)
  autoTable(doc, {
    startY: 194,
    head: [['NO', 'KETERANGAN']],
    body: [
      ['1.', 'Laporan Dokumentasi'],
      ['2.', 'Lampiran Surat Jalan'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 9.5,
      halign: 'left',
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 16, halign: 'left' },
      1: { cellWidth: 70 },
    },
    margin: { left: (pageW - 86) / 2 },
  });

  // ─── 3. PRELOAD ENTRY PHOTOS ───
  const loadedPhotos: Record<string, string> = {};
  const photoUrlsToFetch = new Set<string>();

  for (const entry of activeEntries) {
    if (entry.photoMenuUrl) photoUrlsToFetch.add(entry.photoMenuUrl);
    if (entry.photoSerahTerimaUrl) photoUrlsToFetch.add(entry.photoSerahTerimaUrl);
    if (entry.photoPenerimaUrl) photoUrlsToFetch.add(entry.photoPenerimaUrl);
    if (entry.photoSuratJalanUrl) photoUrlsToFetch.add(entry.photoSuratJalanUrl);
  }

  // Preload all in parallel
  await Promise.all(
    Array.from(photoUrlsToFetch).map(async (url) => {
      const b64 = await getBase64Image(url);
      if (b64) loadedPhotos[url] = b64;
    })
  );

  // ─── 4. DOCUMENTATION TABLE PAGE(S) ───
  doc.addPage();

  // Page Header
  let curY = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...slateDark);
  doc.text(formattedHeaderDate, 12, curY);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedGray);
  doc.text(`Petugas: ${effectivePetugas} | ${activeEntries.length} Institusi`, 12, curY + 5);

  curY += 9;

  if (activeEntries.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('Tidak ada data institusi yang tercatat pada laporan ini.', 12, curY + 15);
  } else {
    // Build table rows
    // Columns: NO (10mm) | SEKOLAH (38mm) | MENU (46mm) | SERAH TERIMA (46mm) | SURAT JALAN (46mm) => Total = 186mm
    const tableRows = activeEntries.map((entry, idx) => {
      return [
        `${idx + 1}.`,
        `${entry.institutionName || '-'}\n(${entry.jumlah || 0} Porsi)`,
        '', // MENU photo cell
        '', // SERAH TERIMA photo cell
        '', // SURAT JALAN photo cell
      ];
    });

    autoTable(doc, {
      startY: curY,
      head: [['NO', 'SEKOLAH', 'MENU', 'SERAH TERIMA', 'SURAT JALAN']],
      body: tableRows,
      theme: 'grid',
      showHead: 'everyPage',
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [17, 24, 39],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.2,
        lineColor: [203, 213, 225],
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [17, 24, 39],
        minCellHeight: 33,
        lineWidth: 0.2,
        lineColor: [203, 213, 225],
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', valign: 'middle' },
        1: { cellWidth: 38, fontStyle: 'bold', valign: 'middle' },
        2: { cellWidth: 46, halign: 'center', valign: 'middle' },
        3: { cellWidth: 46, halign: 'center', valign: 'middle' },
        4: { cellWidth: 46, halign: 'center', valign: 'middle' },
      },
      margin: { left: 12, right: 12 },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const entry = activeEntries[data.row.index];
          if (!entry) return;

          const pad = 1.5;
          const targetW = data.column.width - pad * 2;
          const targetH = data.row.height - pad * 2;
          const cellX = data.cell.x + pad;
          const cellY = data.cell.y + pad;

          let photoUrl: string | undefined;

          if (data.column.index === 2) {
            // MENU column
            photoUrl = entry.photoMenuUrl;
          } else if (data.column.index === 3) {
            // SERAH TERIMA column (fallback to penerima photo if serah terima is empty)
            photoUrl = entry.photoSerahTerimaUrl || entry.photoPenerimaUrl;
          } else if (data.column.index === 4) {
            // SURAT JALAN column
            photoUrl = entry.photoSuratJalanUrl;
          }

          if (photoUrl && loadedPhotos[photoUrl]) {
            try {
              doc.addImage(
                loadedPhotos[photoUrl],
                'JPEG',
                cellX,
                cellY,
                targetW,
                targetH
              );
            } catch (err) {
              console.warn('Failed to render photo in cell:', err);
            }
          } else if ([2, 3, 4].includes(data.column.index)) {
            // Draw neat empty placeholder box
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(248, 250, 252);
            doc.rect(cellX, cellY, targetW, targetH, 'FD');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text('Belum ada foto', cellX + targetW / 2, cellY + targetH / 2, { align: 'center' });
          }
        }
      },
    });
  }

  const finalFileName =
    fileName ||
    docMeta?.fileName ||
    `Laporan_Distribusi_MBG_${effectivePetugas.replace(/\s+/g, '_')}_${effectiveTanggal}.pdf`;

  doc.save(finalFileName);
}
