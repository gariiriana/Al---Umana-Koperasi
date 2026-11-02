// ============================================================================
// Tata letak foto Dokumentasi Bahan untuk ekspor PDF & Word
// ============================================================================

import type { MbgBahanPhoto } from '@/types/mbg';

export interface PhotoCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bagi kotak foto menjadi petak untuk `count` foto:
 * 1 = penuh, 2 = berdampingan, 3 = satu besar kiri + dua bertumpuk kanan, 4 = 2×2.
 */
export function photoMosaicCells(count: number, box: PhotoCell, gap: number): PhotoCell[] {
  const { x, y, w, h } = box;
  const halfW = (w - gap) / 2;
  const halfH = (h - gap) / 2;
  const rightX = x + halfW + gap;
  const lowerY = y + halfH + gap;
  if (count <= 0) return [];
  if (count === 1) return [{ x, y, w, h }];
  if (count === 2) return [{ x, y, w: halfW, h }, { x: rightX, y, w: halfW, h }];
  if (count === 3) {
    return [
      { x, y, w: halfW, h },
      { x: rightX, y, w: halfW, h: halfH },
      { x: rightX, y: lowerY, w: halfW, h: halfH },
    ];
  }
  return [
    { x, y, w: halfW, h: halfH },
    { x: rightX, y, w: halfW, h: halfH },
    { x, y: lowerY, w: halfW, h: halfH },
    { x: rightX, y: lowerY, w: halfW, h: halfH },
  ];
}

/** Rentang jam foto, mis. "07.10 – 07.25" (atau satu jam bila sama). */
export function bahanPhotoTimeRange(photos: MbgBahanPhoto[]): string {
  const times = photos.map((p) => p.waktu).filter((t): t is string => Boolean(t)).sort();
  if (times.length === 0) return '-';
  const first = times[0];
  const last = times[times.length - 1];
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Potong tengah foto agar pas mengisi petak dengan rasio `aspect` (lebar/tinggi),
 * seperti CSS object-fit: cover, supaya semua petak foto di laporan seragam.
 */
export function coverCropDataUrl(dataUrl: string, aspect: number, maxWidthPx = 640): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      if (!srcW || !srcH || !aspect) {
        resolve(dataUrl);
        return;
      }
      let cropW = srcW;
      let cropH = srcW / aspect;
      if (cropH > srcH) {
        cropH = srcH;
        cropW = srcH * aspect;
      }
      const outW = Math.round(Math.min(cropW, maxWidthPx));
      const outH = Math.round(outW / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, (srcW - cropW) / 2, (srcH - cropH) / 2, cropW, cropH, 0, 0, outW, outH);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
