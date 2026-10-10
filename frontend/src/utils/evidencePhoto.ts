// ============================================================================
// Foto bukti task — terima foto besar dari kamera HP, simpan versi terkompres
// ============================================================================
// Foto disimpan sebagai data URL di dokumen Firestore (batas dokumen 1 MB; rules
// ad_hoc_tasks membatasi evidencePhoto < 900.000 karakter). Foto kamera 10–25 MB
// diperkecil bertahap sampai muat, jadi tidak pernah ditolak server.

/** Ukuran file foto terbesar yang boleh dipilih. */
export const EVIDENCE_PHOTO_MAX_BYTES = 25 * 1024 * 1024;
/** Panjang data URL maksimal yang disimpan (di bawah batas rules 900.000). */
export const EVIDENCE_PHOTO_MAX_CHARS = 850_000;

/** Urutan percobaan: resolusi tinggi dulu, turun sampai ukurannya muat. */
export const ENCODE_STEPS: ReadonlyArray<{ maxSide: number; quality: number }> = [
  { maxSide: 1920, quality: 0.85 },
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1280, quality: 0.75 },
  { maxSide: 1024, quality: 0.7 },
  { maxSide: 800, quality: 0.65 },
  { maxSide: 640, quality: 0.55 },
];

export interface EvidencePhoto {
  dataUrl: string;
  originalBytes: number;
  /** Perkiraan ukuran file JPEG hasil kompres */
  storedBytes: number;
}

/** Ambil hasil encode pertama yang muat; null kalau semua langkah masih terlalu besar. */
export async function firstThatFits(
  encode: (step: { maxSide: number; quality: number }) => Promise<string> | string,
  maxChars = EVIDENCE_PHOTO_MAX_CHARS,
): Promise<string | null> {
  for (const step of ENCODE_STEPS) {
    const dataUrl = await encode(step);
    if (dataUrl.length <= maxChars) return dataUrl;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  // createImageBitmap tidak membuat string base64 raksasa dan mengikuti orientasi EXIF.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // lanjut ke cara lama
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Format foto tidak bisa dibaca (mis. HEIC). Ambil ulang lewat kamera atau ubah ke JPG/PNG.");
  }
}

/** Validasi + kompres foto bukti. Melempar Error berbahasa Indonesia kalau gagal. */
export async function prepareEvidencePhoto(file: File): Promise<EvidencePhoto> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error("File harus berupa foto.");
  }
  if (file.size > EVIDENCE_PHOTO_MAX_BYTES) {
    throw new Error(`Foto terlalu besar (${formatBytes(file.size)}). Maksimal ${formatBytes(EVIDENCE_PHOTO_MAX_BYTES)}.`);
  }
  const img = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak bisa memproses foto.");
    const dataUrl = await firstThatFits(({ maxSide, quality }) => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      ctx.fillStyle = "#FFFFFF"; // PNG transparan → latar putih, bukan hitam
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    });
    if (!dataUrl) throw new Error("Foto tidak bisa diperkecil sampai ukuran yang diizinkan. Coba foto lain.");
    return { dataUrl, originalBytes: file.size, storedBytes: Math.round((dataUrl.length * 3) / 4) };
  } finally {
    img.release();
  }
}
