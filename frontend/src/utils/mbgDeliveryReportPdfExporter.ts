import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MbgDeliveryDocument } from '@/services/mbgDeliveryService';
import type { MbgPmEntry, MbgDeliveryTask } from '@/types/mbg';

export interface LoadedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
}

// Helper to load image as base64 with natural dimensions (supports transparent PNG & JPEG)
export const getBase64ImageWithDimensions = async (
  url: string,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg'
): Promise<LoadedImageInfo | null> => {
  if (!url) return null;
  if (url.startsWith('data:image')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl: url,
          width: img.naturalWidth || 4,
          height: img.naturalHeight || 3,
        });
      };
      img.onerror = () => {
        resolve({ dataUrl: url, width: 4, height: 3 });
      };
      img.src = url;
    });
  }

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
        return {
          dataUrl: canvas.toDataURL(format, 0.92),
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      }
    }
  } catch {
    // Fallback using fetch
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) return null;

      return await new Promise<LoadedImageInfo | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            dataUrl,
            width: img.naturalWidth || 4,
            height: img.naturalHeight || 3,
          });
        };
        img.onerror = () => {
          resolve({ dataUrl, width: 4, height: 3 });
        };
        img.src = dataUrl;
      });
    } catch {
      return null;
    }
  }
  return null;
};

// Helper to load image as base64 string
export const getBase64Image = async (
  url: string,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string | null> => {
  const info = await getBase64ImageWithDimensions(url, format);
  return info ? info.dataUrl : null;
};

/**
 * Menghitung ukuran dan posisi foto agar 'object-fit: contain' (tidak gepeng / terdistorsi)
 * dan selalu terpusat (center) di dalam kotak sel target.
 */
export function calculateFitDimensions(
  imgW: number,
  imgH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): { x: number; y: number; w: number; h: number } {
  if (!imgW || !imgH || imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: boxX, y: boxY, w: Math.max(1, boxW), h: Math.max(1, boxH) };
  }

  const imgRatio = imgW / imgH;
  const boxRatio = boxW / boxH;

  let renderW: number;
  let renderH: number;

  if (imgRatio > boxRatio) {
    // Foto lebih lebar dibanding kotak -> lebarnya penuhi boxW, tingginya menyesuaikan rasio
    renderW = boxW;
    renderH = boxW / imgRatio;
  } else {
    // Foto lebih tinggi dibanding kotak -> tingginya penuhi boxH, lebarnya menyesuaikan rasio
    renderH = boxH;
    renderW = boxH * imgRatio;
  }

  // Posisikan tepat di tengah-tengah kotak sel (centered)
  const renderX = boxX + (boxW - renderW) / 2;
  const renderY = boxY + (boxH - renderH) / 2;

  return { x: renderX, y: renderY, w: renderW, h: renderH };
}

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

/**
 * Helper untuk memeriksa apakah nama institusi adalah Posyandu
 */
export function isPosyanduName(name?: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  const posyanduKeywords = [
    'posyandu', 'balita', 'bumil', 'busui', 'b3b', '3b', 'paket 3b', 'paket3b',
    'cempaka', 'mawar', 'melati', 'anggrek', 'dahlia', 'flamboyan', 'kenanga',
    'teratai', 'kamboja', 'kasih ibu', 'matahari', 'tulip', 'bougenville',
    'nusa indah', 'asoka', 'kemuning', 'pmt', 'kader'
  ];
  const isExplicitSchool =
    lower.includes('sd ') || lower.startsWith('sd') || lower.includes('smp') ||
    lower.includes('sma') || lower.includes('smk') || lower.includes('sps') ||
    lower.includes('tk ') || lower.startsWith('tk') || lower.includes('paud');

  if (isExplicitSchool && !lower.includes('posyandu') && !lower.includes('balita') && !lower.includes('bumil') && !lower.includes('busui') && !lower.includes('cempaka')) {
    return false;
  }
  return posyanduKeywords.some((k) => lower.includes(k));
}

/**
 * Helper untuk memformat rincian institusi secara otomatis:
 * Contoh: "13 Sekolah, 4 Posyandu" atau "17 Sekolah" atau "8 Posyandu"
 */
export function formatInstitutionBreakdown(entries: MbgPmEntry[]): string {
  let sekolahCount = 0;
  let posyanduCount = 0;

  for (const e of entries) {
    if (e.institutionType === 'posyandu' || isPosyanduName(e.institutionName)) {
      posyanduCount++;
    } else {
      sekolahCount++;
    }
  }

  const parts: string[] = [];
  if (sekolahCount > 0) parts.push(`${sekolahCount} Sekolah`);
  if (posyanduCount > 0) parts.push(`${posyanduCount} Posyandu`);

  if (parts.length === 0) return '0 Institusi';
  return parts.join(', ');
}

/**
 * Menentukan bobot urutan kurir untuk Distribusi MBG:
 * 1. Andi & Dede (Order 10 - 19)
 * 2. Yusep & Erik (Order 20 - 29)
 * 3. Agus & Firdi (Order 30 - 39)
 * 4. Kurir Lainnya (Order 100+)
 * 5. Belum Ditugaskan / Unassigned (Order 999)
 */
export function getCourierGroupOrder(courierName?: string, kenekName?: string): number {
  const cName = (courierName || '').toLowerCase().trim();
  const kName = (kenekName || '').toLowerCase().trim();
  const combined = `${cName} ${kName}`.trim();

  if (!cName || cName === 'belum ditugaskan' || cName === 'unassigned' || cName === '-') {
    return 999;
  }

  // 1. Andi & Dede
  const hasAndi = combined.includes('andi');
  const hasDede = combined.includes('dede');
  if (hasAndi && hasDede) return 10;
  if (hasAndi) return 11;
  if (hasDede) return 12;

  // 2. Yusep & Erik
  const hasYusep = combined.includes('yusep');
  const hasErik = combined.includes('erik');
  if (hasYusep && hasErik) return 20;
  if (hasYusep) return 21;
  if (hasErik) return 22;

  // 3. Agus & Firdi
  const hasAgus = combined.includes('agus');
  const hasFirdi = combined.includes('firdi');
  if (hasAgus && hasFirdi) return 30;
  if (hasAgus) return 31;
  if (hasFirdi) return 32;

  // Other named couriers
  return 100;
}

/**
 * Comparator function untuk mengurutkan kurir MBG sesuai standar operasional:
 * 1. Andi & Dede
 * 2. Yusep & Erik
 * 3. Agus & Firdi
 */
export function compareCouriers(
  aName?: string,
  aKenek?: string,
  bName?: string,
  bKenek?: string
): number {
  const orderA = getCourierGroupOrder(aName, aKenek);
  const orderB = getCourierGroupOrder(bName, bKenek);

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return (aName || '').localeCompare(bName || '');
}

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
  doc.text('BADAN GIZI NASIONAL', pageW / 2, 28, { align: 'center' });

  doc.setFontSize(11);
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 36, { align: 'center' });
  doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 44, { align: 'center' });

  // Centered BGN Logo (Diameter 72mm) - Placed in the middle between Header and Title
  const logoSize = 72;
  const logoX = (pageW - logoSize) / 2;
  const logoY = 56;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
  }

  // Title & Period (Placed below Center Logo)
  doc.setFontSize(13);
  doc.text('LAPORAN DISTRIBUSI', pageW / 2, 142, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`PERIODE ${effectivePeriode.toUpperCase()}`, pageW / 2, 150, { align: 'center' });

  // Summary / Keterangan Table (Placed below title)
  autoTable(doc, {
    startY: 172,
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
  const loadedPhotos: Record<string, LoadedImageInfo> = {};
  const photoUrlsToFetch = new Set<string>();

  for (const entry of activeEntries) {
    if (entry.photoMenuUrl) photoUrlsToFetch.add(entry.photoMenuUrl);
    if (entry.photoSerahTerimaUrl) photoUrlsToFetch.add(entry.photoSerahTerimaUrl);
    if (entry.photoPenerimaUrl) photoUrlsToFetch.add(entry.photoPenerimaUrl);
    if (entry.photoSuratJalanUrl) photoUrlsToFetch.add(entry.photoSuratJalanUrl);
  }

  // Preload all in parallel with natural dimensions
  await Promise.all(
    Array.from(photoUrlsToFetch).map(async (url) => {
      const imgInfo = await getBase64ImageWithDimensions(url);
      if (imgInfo) loadedPhotos[url] = imgInfo;
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
  doc.text(`Petugas: ${effectivePetugas} | ${formatInstitutionBreakdown(activeEntries)}`, 12, curY + 5);

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
      rowPageBreak: 'avoid',
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
        minCellHeight: 34,
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
      margin: { top: 12, left: 12, right: 12, bottom: 18 },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const entry = activeEntries[data.row.index];
          if (!entry) return;

          const pad = 1.5;
          const targetW = data.column.width - pad * 2;
          const targetH = data.row.height - pad * 2;
          const cellX = data.cell.x + pad;
          const cellY = data.cell.y + pad;

          if (targetH <= 5 || targetW <= 5) return;

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
              const photoInfo = loadedPhotos[photoUrl];
              const fit = calculateFitDimensions(
                photoInfo.width,
                photoInfo.height,
                cellX,
                cellY,
                targetW,
                targetH
              );

              // Background fill in cell box to keep clean border & white backdrop
              doc.setFillColor(248, 250, 252);
              doc.rect(cellX, cellY, targetW, targetH, 'F');

              doc.addImage(
                photoInfo.dataUrl,
                'JPEG',
                fit.x,
                fit.y,
                fit.w,
                fit.h
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

  // ─── RUNNING FOOTER & PAGE NUMBERING ON ALL PAGES ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      const footY = pageH - 9;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(12, footY, pageW - 12, footY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Laporan Distribusi MBG — SPPG Sukabumi Gunungguruh Kebonmanggu (Al Umanaa)',
        12,
        footY + 4.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 12, footY + 4.5, { align: 'right' });
    }
  }

  const finalFileName =
    fileName ||
    docMeta?.fileName ||
    `Laporan_Distribusi_MBG_${effectivePetugas.replace(/\s+/g, '_')}_${effectiveTanggal}.pdf`;

  doc.save(finalFileName);
}

// ─── 5. DAILY COMBINED REPORT EXPORTER (ALL COURIERS IN ONE PDF) ───
export interface ExportDailyDeliveryPdfOptions {
  tanggalBatch: string;
  batchName?: string;
  entries: MbgPmEntry[];
  deliveryTasks?: MbgDeliveryTask[];
  fileName?: string;
}

export async function exportMbgDailyDistributionReportPdf({
  tanggalBatch,
  batchName,
  entries,
  deliveryTasks = [],
  fileName,
}: ExportDailyDeliveryPdfOptions): Promise<void> {
  const activeEntries = entries.filter((e) => !e.isSekolahLibur && (e.institutionName?.trim() || e.id));
  const effectiveTanggal = tanggalBatch || new Date().toISOString().split('T')[0];
  const formattedHeaderDate = formatIndonesianDate(effectiveTanggal, true);

  // Group entries by Courier / Petugas Name
  const courierMap = new Map<string, { kenekName?: string; entries: MbgPmEntry[] }>();

  // Helper to find task proof
  const findTaskProof = (petugasName: string, entryId: string) => {
    const pNameLower = petugasName.toLowerCase().trim();
    const task = deliveryTasks.find((t) => {
      const tName = (t.petugasName || '').toLowerCase().trim();
      return pNameLower && (tName === pNameLower || tName.includes(pNameLower) || pNameLower.includes(tName));
    });
    return task?.schoolProofs?.[entryId];
  };

  for (const entry of activeEntries) {
    const pName = entry.assignedPetugasName?.trim() || 'Belum Ditugaskan';
    const proof = findTaskProof(pName, entry.id);
    const enrichedEntry: MbgPmEntry = {
      ...entry,
      photoMenuUrl: entry.photoMenuUrl || proof?.photoMenuUrl,
      photoSerahTerimaUrl: entry.photoSerahTerimaUrl || proof?.photoSerahTerimaUrl,
      photoPenerimaUrl: entry.photoPenerimaUrl || proof?.photoPenerimaUrl,
      photoSuratJalanUrl: entry.photoSuratJalanUrl || proof?.photoSuratJalanUrl,
    };

    const existing = courierMap.get(pName) || { kenekName: entry.assignedKenekName, entries: [] };
    if (entry.assignedKenekName && !existing.kenekName) {
      existing.kenekName = entry.assignedKenekName;
    }
    existing.entries.push(enrichedEntry);
    courierMap.set(pName, existing);
  }

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

  // ─── 2. COVER PAGE ───
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Top Header Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('BADAN GIZI NASIONAL', pageW / 2, 28, { align: 'center' });

  doc.setFontSize(11);
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 36, { align: 'center' });
  doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 44, { align: 'center' });

  // Centered BGN Logo (Diameter 72mm) - Placed in the middle between Header and Title
  const logoSize = 72;
  const logoX = (pageW - logoSize) / 2;
  const logoY = 56;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
  }

  // Title & Period (Placed below Logo)
  doc.setFontSize(13);
  doc.text('LAPORAN DISTRIBUSI HARIAN', pageW / 2, 142, { align: 'center' });
  doc.setFontSize(10.5);
  doc.text('(SELURUH KURIR & RUTE PENGIRIMAN)', pageW / 2, 149, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`PERIODE ${formattedHeaderDate.toUpperCase()}`, pageW / 2, 157, { align: 'center' });

  const totalPortions = activeEntries.reduce((acc, e) => acc + (e.jumlah || 0), 0);
  const totalCouriers = Array.from(courierMap.keys()).filter((k) => k !== 'Belum Ditugaskan').length || courierMap.size;

  // Summary / Keterangan Table
  autoTable(doc, {
    startY: 172,
    head: [['NO', 'KETERANGAN DOKUMEN']],
    body: [
      ['1.', 'Rekapitulasi Penugasan & Rute Seluruh Kurir'],
      ['2.', 'Laporan Dokumentasi Pengiriman Per Kurir'],
      ['3.', 'Lampiran Surat Jalan & Bukti Serah Terima'],
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
      fontSize: 9,
      textColor: [0, 0, 0],
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 16, halign: 'left' },
      1: { cellWidth: 80 },
    },
    margin: { left: (pageW - 96) / 2 },
  });

  // Summary stats banner at bottom of cover
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Total: ${totalCouriers} Kurir  •  ${formatInstitutionBreakdown(activeEntries)}  •  ${totalPortions.toLocaleString('id-ID')} Porsi`,
    pageW / 2,
    260,
    { align: 'center' }
  );

  // ─── 3. PRELOAD ALL ENTRY PHOTOS ───
  const loadedPhotos: Record<string, LoadedImageInfo> = {};
  const photoUrlsToFetch = new Set<string>();

  for (const entry of activeEntries) {
    if (entry.photoMenuUrl) photoUrlsToFetch.add(entry.photoMenuUrl);
    if (entry.photoSerahTerimaUrl) photoUrlsToFetch.add(entry.photoSerahTerimaUrl);
    if (entry.photoPenerimaUrl) photoUrlsToFetch.add(entry.photoPenerimaUrl);
    if (entry.photoSuratJalanUrl) photoUrlsToFetch.add(entry.photoSuratJalanUrl);
  }

  await Promise.all(
    Array.from(photoUrlsToFetch).map(async (url) => {
      const imgInfo = await getBase64ImageWithDimensions(url);
      if (imgInfo) loadedPhotos[url] = imgInfo;
    })
  );

  // ─── 4. PAGE 2: REKAPITULASI PENUGASAN KURIR ───
  doc.addPage();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...slateDark);
  doc.text('REKAPITULASI PENUGASAN DISTRIBUSI HARIAN', 12, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedGray);
  doc.text(`${formattedHeaderDate} | ${batchName || 'SPPG Sukabumi'}`, 12, 22);

  // Convert and sort couriers by operational order (1. Andi & Dede, 2. Yusep & Erik, 3. Agus & Firdi)
  const sortedCourierList = Array.from(courierMap.entries())
    .map(([courierName, groupData]) => ({
      courierName,
      kenekName: groupData.kenekName,
      entries: [...groupData.entries].sort((a, b) => {
        const diff = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (diff !== 0) return diff;
        return (a.institutionName || '').localeCompare(b.institutionName || '');
      }),
    }))
    .sort((a, b) => compareCouriers(a.courierName, a.kenekName, b.courierName, b.kenekName));

  const rekapRows: (string | { content: string; styles?: Record<string, unknown> })[][] = [];
  let courierIdx = 1;

  sortedCourierList.forEach((groupData) => {
    const courierName = groupData.courierName;
    const cPortions = groupData.entries.reduce((acc, e) => acc + (e.jumlah || 0), 0);
    const completeCount = groupData.entries.filter(
      (e) => e.photoMenuUrl && (e.photoSerahTerimaUrl || e.photoPenerimaUrl) && e.photoSuratJalanUrl
    ).length;
    const completeness = `${completeCount}/${groupData.entries.length} Selesai`;

    rekapRows.push([
      `${courierIdx++}.`,
      courierName,
      groupData.kenekName || '-',
      formatInstitutionBreakdown(groupData.entries),
      `${cPortions.toLocaleString('id-ID')} Porsi`,
      completeness,
    ]);
  });

  autoTable(doc, {
    startY: 27,
    head: [['NO', 'NAMA KURIR', 'KENEK', 'INSTITUSI', 'TOTAL PORSI', 'STATUS DOKUMENTASI']],
    body: rekapRows,
    foot: [
      [
        {
          content: 'TOTAL KESELURUHAN',
          colSpan: 3,
          styles: { halign: 'left', fontStyle: 'bold', fontSize: 8.5 },
        },
        {
          content: formatInstitutionBreakdown(activeEntries),
          styles: { halign: 'center', fontStyle: 'bold', fontSize: 8.5 },
        },
        {
          content: `${totalPortions.toLocaleString('id-ID')} Porsi`,
          styles: { halign: 'center', fontStyle: 'bold', fontSize: 8.5 },
        },
        {
          content: `${totalCouriers} Kurir Aktif`,
          styles: { halign: 'center', fontStyle: 'bold', fontSize: 8.5 },
        },
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [17, 24, 39],
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 36 },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 36, halign: 'center' },
    },
    margin: { top: 12, left: 12, right: 12, bottom: 18 },
  });

  // ─── 5. DOKUMENTASI FOTO PER KURIR ───
  sortedCourierList.forEach((groupData) => {
    const courierName = groupData.courierName;
    doc.addPage();

    const cPortions = groupData.entries.reduce((acc, e) => acc + (e.jumlah || 0), 0);

    // Courier Header Section Banner
    doc.setFillColor(17, 24, 39);
    doc.rect(12, 12, pageW - 24, 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(251, 191, 36); // Amber Gold
    doc.text(`DOKUMENTASI PENGIRIMAN: ${courierName.toUpperCase()}`, 16, 19.5);

    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    const subText = `Kenek: ${groupData.kenekName || '-'} | ${formatInstitutionBreakdown(groupData.entries)} • ${cPortions.toLocaleString('id-ID')} Porsi`;
    doc.text(subText, pageW - 16, 19.5, { align: 'right' });

    // Table of photo proofs
    const tableRows = groupData.entries.map((entry, idx) => {
      const scheduleText = entry.jadwalPengantaran ? `\nJam: ${entry.jadwalPengantaran}` : '';
      return [
        `${idx + 1}.`,
        `${entry.institutionName || '-'}\n(${entry.jumlah || 0} Porsi)${scheduleText}`,
        '', // MENU photo cell
        '', // SERAH TERIMA photo cell
        '', // SURAT JALAN photo cell
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [['NO', 'SEKOLAH / INSTITUSI', 'MENU', 'SERAH TERIMA', 'SURAT JALAN']],
      body: tableRows,
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
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
        minCellHeight: 34,
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
      margin: { top: 12, left: 12, right: 12, bottom: 18 },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const entry = groupData.entries[data.row.index];
          if (!entry) return;

          const pad = 1.5;
          const targetW = data.column.width - pad * 2;
          const targetH = data.row.height - pad * 2;
          const cellX = data.cell.x + pad;
          const cellY = data.cell.y + pad;

          if (targetH <= 5 || targetW <= 5) return;

          let photoUrl: string | undefined;

          if (data.column.index === 2) {
            photoUrl = entry.photoMenuUrl;
          } else if (data.column.index === 3) {
            photoUrl = entry.photoSerahTerimaUrl || entry.photoPenerimaUrl;
          } else if (data.column.index === 4) {
            photoUrl = entry.photoSuratJalanUrl;
          }

          if (photoUrl && loadedPhotos[photoUrl]) {
            try {
              const photoInfo = loadedPhotos[photoUrl];
              const fit = calculateFitDimensions(
                photoInfo.width,
                photoInfo.height,
                cellX,
                cellY,
                targetW,
                targetH
              );

              // Background fill in cell box to keep clean border & white backdrop
              doc.setFillColor(248, 250, 252);
              doc.rect(cellX, cellY, targetW, targetH, 'F');

              doc.addImage(
                photoInfo.dataUrl,
                'JPEG',
                fit.x,
                fit.y,
                fit.w,
                fit.h
              );
            } catch (err) {
              console.warn('Failed to render photo in cell:', err);
            }
          } else if ([2, 3, 4].includes(data.column.index)) {
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
  });

  // ─── 6. RUNNING FOOTER & PAGE NUMBERING ON ALL PAGES ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Add running footer for page 2 onwards
    if (i > 1) {
      const footY = pageH - 9;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(12, footY, pageW - 12, footY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Laporan Distribusi MBG — SPPG Sukabumi Gunungguruh Kebonmanggu (Al Umanaa)',
        12,
        footY + 4.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 12, footY + 4.5, { align: 'right' });
    }
  }

  const finalFileName =
    fileName ||
    `Laporan_Distribusi_MBG_Harian_${effectiveTanggal}.pdf`;

  doc.save(finalFileName);
}
