// ============================================================================
// Foto bukti task — foto asli ≤ 10 MB disimpan utuh di Firestore
// ============================================================================
// Dokumen Firestore maksimal 1 MB, jadi foto asli dipotong per EVIDENCE_CHUNK_BYTES
// ke ad_hoc_tasks/{id}/evidence_chunks/{0..11} (tipe Bytes). Dokumen task hanya
// menyimpan pratinjau kecil (data URL) supaya daftar task tetap ringan.

/** Ukuran file foto asli terbesar yang boleh diunggah. */
export const EVIDENCE_ORIGINAL_MAX_BYTES = 10 * 1024 * 1024;
/** Isi biner per potongan (di bawah batas dokumen 1 MB; rules: ≤ 921.600). */
export const EVIDENCE_CHUNK_BYTES = 900 * 1024;
/** Jumlah potongan maksimal = ceil(10 MB / 900 KB) = 12 (rules: chunk 0..11). */
export const EVIDENCE_MAX_CHUNKS = Math.ceil(EVIDENCE_ORIGINAL_MAX_BYTES / EVIDENCE_CHUNK_BYTES);
/** Panjang data URL pratinjau maksimal di dokumen task. */
export const EVIDENCE_PREVIEW_MAX_CHARS = 250_000;
/** Batas lama rules untuk evidencePhoto di dokumen task (tetap berlaku). */
export const EVIDENCE_PHOTO_MAX_CHARS = 850_000;

/** Potong isi file menjadi bagian-bagian ≤ chunkBytes. */
export function splitIntoChunks(data: Uint8Array, chunkBytes = EVIDENCE_CHUNK_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkBytes) parts.push(data.subarray(offset, offset + chunkBytes));
  return parts.length ? parts : [new Uint8Array(0)];
}

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
  /** File asli yang akan diunggah utuh */
  file: File;
  /** Pratinjau kecil untuk dokumen task */
  dataUrl: string;
  originalBytes: number;
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

/** Validasi foto bukti + buat pratinjau kecil. Melempar Error berbahasa Indonesia kalau gagal. */
export async function prepareEvidencePhoto(file: File): Promise<EvidencePhoto> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error("File harus berupa foto.");
  }
  if (file.size > EVIDENCE_ORIGINAL_MAX_BYTES) {
    throw new Error(`Foto terlalu besar (${formatBytes(file.size)}). Maksimal ${formatBytes(EVIDENCE_ORIGINAL_MAX_BYTES)}.`);
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
    }, EVIDENCE_PREVIEW_MAX_CHARS);
    if (!dataUrl) throw new Error("Pratinjau foto tidak bisa dibuat. Coba foto lain.");
    return { file, dataUrl, originalBytes: file.size };
  } finally {
    img.release();
  }
}
