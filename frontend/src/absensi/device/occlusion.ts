// Cek wajah tertutup (masker, tangan, kain) dari warna di sekitar landmark wajah.
// face-api tidak punya model masker, jadi warna kulit di pangkal hidung (antara mata, tidak tertutup masker)
// dibandingkan dengan ujung hidung dan bibir. Masker putih/abu/hitam pudar (tidak berwarna kulit), masker biru bergeser
// ke biru, masker berwarna/motif jauh dari warna kulit. Jenggot tidak menutupi ujung hidung, jadi tidak dianggap masker.
// Masker warna kulit (krem) tidak terdeteksi di sini; jarak wajahnya ke acuan tetap jauh sehingga ditolak server.
// Masker yang dipakai di bawah hidung juga tidak dianggap tertutup (senyum bergigi warnanya mirip kain putih);
// hidung + mata masih terlihat, jadi kecocokan wajahnya tetap dinilai server.
// Ambang dikalibrasi 2026-11-21 dengan 21 wajah asli + masker sintetis (putih, biru medis, hitam, abu, pink, motif)
// dan variasi gelap / lampu hangat / lampu dingin / JPEG kasar.
import type { Point } from "@/absensi/device/eyes";

export interface Ycc {
  y: number;
  cb: number;
  cr: number;
}

export interface FaceColors {
  /** Pangkal hidung di antara mata (landmark 27) = warna kulit acuan. */
  ref: Ycc;
  nose: Ycc;
  mouth: Ycc;
}

/** "tidak_pasti" = terlalu gelap / warna pudar, tidak bisa dinilai (tidak memblokir). */
export type CoverVerdict = "terbuka" | "tertutup" | "tidak_pasti";

export function toYcc(r: number, g: number, b: number): Ycc {
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Median warna kotak (sisi 2r) di sekitar titik; null kalau di luar gambar. */
export function patchColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  center: Point,
  radius: number,
): Ycc | null {
  const r = Math.max(1, Math.round(radius));
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  const ys: number[] = [];
  const cbs: number[] = [];
  const crs: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      const c = toYcc(data[i], data[i + 1], data[i + 2]);
      ys.push(c.y);
      cbs.push(c.cb);
      crs.push(c.cr);
    }
  }
  if (ys.length < 4) return null;
  return { y: median(ys), cb: median(cbs), cr: median(crs) };
}

const mid = (a: Point, b: Point, t = 0.5): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Warna tiga titik wajah dari data RGBA; landmark dalam koordinat gambar yang sama. */
export function sampleFaceColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Point[],
): FaceColors | null {
  if (landmarks.length < 68) return null;
  const faceWidth = Math.hypot(landmarks[16].x - landmarks[0].x, landmarks[16].y - landmarks[0].y);
  if (!(faceWidth > 20)) return null;
  const r = faceWidth * 0.045;
  const ref = patchColor(data, width, height, landmarks[27], r);
  const nose = patchColor(data, width, height, landmarks[30], r);
  const mouth = patchColor(data, width, height, mid(landmarks[62], landmarks[66]), r * 0.8);
  if (!ref || !nose || !mouth) return null;
  return { ref, nose, mouth };
}

const saturation = (c: Ycc) => Math.hypot(c.cb - 128, c.cr - 128);
const chromaDistance = (a: Ycc, b: Ycc) => Math.hypot(a.cb - b.cb, a.cr - b.cr);

/** Ambang hasil kalibrasi (lihat komentar di atas dan occlusion.test.ts). */
export const COVER_RULES = {
  /** Kulit acuan terlalu gelap, terlalu terang (silau), atau terlalu pudar: tidak dinilai. */
  minRefLuma: 45,
  maxRefLuma: 210,
  minRefSaturation: 6,
  /** Lebih pudar dari ini (relatif kulit acuan) = kain putih/abu/hitam. Kulit asli ≥ 0.37. */
  minSaturationRatio: 0.3,
  /** Geser ke biru (ΔCb − ΔCr) sejauh ini = kain putih/biru/hitam. Kulit asli wajah lurus < 30. */
  maxBlueShift: 30,
  /** Jarak warna (Cb/Cr) sejauh ini = bukan kulit (masker berwarna/motif). Ujung hidung asli wajah lurus < 11. */
  maxChromaDistance: 22,
} as const;

/** Wilayah ini tidak tampak seperti kulit (dibanding kulit acuan). */
export function isSkinLike(region: Ycc, ref: Ycc): boolean {
  const blueShift = (region.cb - ref.cb) - (region.cr - ref.cr);
  return saturation(region) >= saturation(ref) * COVER_RULES.minSaturationRatio
    && blueShift < COVER_RULES.maxBlueShift
    && chromaDistance(region, ref) < COVER_RULES.maxChromaDistance;
}

export function coverVerdict(colors: FaceColors | null): CoverVerdict {
  if (!colors) return "tidak_pasti";
  const { ref, nose, mouth } = colors;
  if (ref.y < COVER_RULES.minRefLuma || ref.y > COVER_RULES.maxRefLuma || saturation(ref) < COVER_RULES.minRefSaturation) {
    return "tidak_pasti";
  }
  // Hidung DAN mulut harus sama-sama bukan kulit: satu titik saja bisa karena silau, bayangan, atau gigi.
  return !isSkinLike(nose, ref) && !isSkinLike(mouth, ref) ? "tertutup" : "terbuka";
}

let canvas: HTMLCanvasElement | null = null;

/** Nilai tertutup/tidak dari frame video (atau gambar) dan landmark dalam koordinat sumber. */
export function faceCoverFromSource(source: CanvasImageSource & { width?: number }, landmarks: Point[]): CoverVerdict {
  try {
    if (landmarks.length < 68) return "tidak_pasti";
    const xs = landmarks.map((p) => p.x);
    const ys = landmarks.map((p) => p.y);
    const pad = 8;
    const sx = Math.max(0, Math.floor(Math.min(...xs)) - pad);
    const sy = Math.max(0, Math.floor(Math.min(...ys)) - pad);
    const sw = Math.ceil(Math.max(...xs)) + pad - sx;
    const sh = Math.ceil(Math.max(...ys)) + pad - sy;
    if (sw <= 0 || sh <= 0) return "tidak_pasti";
    canvas ??= document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "tidak_pasti";
    context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const { data } = context.getImageData(0, 0, sw, sh);
    const local = landmarks.map((p) => ({ x: p.x - sx, y: p.y - sy }));
    return coverVerdict(sampleFaceColors(data, sw, sh, local));
  } catch {
    return "tidak_pasti";
  }
}
