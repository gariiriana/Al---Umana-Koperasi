// Foto bukti alasan terlambat dari kamera live / galeri → JPEG kecil (≤ MAX_LATE_PHOTO_BYTES) + watermark.
import {
  LATE_PHOTO_JPEG_QUALITY,
  LATE_PHOTO_MAX_PX,
  MAX_LATE_PHOTO_BYTES,
} from "../../../../workers/absensi/shared/constants.js";
import { DeviceError } from "@/absensi/device/errors";

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  // createImageBitmap mengikuti orientasi EXIF (foto HP tidak miring).
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Lanjut ke <img> (mis. Safari lama).
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Pita gelap di bawah foto berisi baris-baris watermark (waktu, nama, lokasi, sumber foto). */
export function drawWatermark(context: CanvasRenderingContext2D, width: number, height: number, lines: string[]) {
  const text = lines.filter(Boolean);
  if (text.length === 0) return;
  const fontPx = Math.max(12, Math.round(Math.min(width, height) * 0.034));
  const lineHeight = Math.round(fontPx * 1.3);
  const pad = Math.round(fontPx * 0.8);
  const band = text.length * lineHeight + pad * 2;
  const gradient = context.createLinearGradient(0, height - band * 1.4, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.3, "rgba(0,0,0,0.55)");
  gradient.addColorStop(1, "rgba(0,0,0,0.75)");
  context.fillStyle = gradient;
  context.fillRect(0, height - band * 1.4, width, band * 1.4);
  context.textBaseline = "top";
  context.shadowColor = "rgba(0,0,0,0.6)";
  context.shadowBlur = Math.round(fontPx / 4);
  text.forEach((line, i) => {
    context.font = `${i === 0 ? 800 : 600} ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    context.fillStyle = i === 0 ? "#FBBF24" : "#FFFFFF";
    context.fillText(line, pad, height - band + pad + i * lineHeight, width - pad * 2);
  });
  context.shadowBlur = 0;
}

function toJpeg(image: Decoded, scale: number, quality: number, watermark: string[]): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff"; // PNG transparan jadi putih, bukan hitam.
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  drawWatermark(context, canvas.width, canvas.height, watermark);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Sisi terpanjang 1280 px; turunkan kualitas/ukuran sampai di bawah batas Worker. */
async function shrink(image: Decoded, watermark: string[]): Promise<Blob> {
  const base = Math.min(1, LATE_PHOTO_MAX_PX / Math.max(image.width, image.height));
  const attempts: [number, number][] = [
    [base, LATE_PHOTO_JPEG_QUALITY],
    [base, 0.55],
    [base * 0.75, 0.55],
    [base * 0.5, 0.5],
  ];
  for (const [scale, quality] of attempts) {
    const jpeg = await toJpeg(image, scale, quality, watermark);
    if (jpeg && jpeg.size <= MAX_LATE_PHOTO_BYTES) return jpeg;
  }
  throw new DeviceError("FOTO_ALASAN_TIDAK_VALID");
}

/** Foto dari galeri: dikecilkan, diberi watermark bila ada. */
export async function compressPhoto(file: Blob, { watermark = [] }: { watermark?: string[] } = {}): Promise<Blob> {
  let image: Decoded;
  try {
    image = await decode(file);
  } catch {
    throw new DeviceError("FOTO_ALASAN_TIDAK_VALID");
  }
  try {
    return await shrink(image, watermark);
  } finally {
    image.release();
  }
}

/** Frame kamera live saat ini + watermark, dengan batas ukuran yang sama seperti foto galeri. */
export async function captureWatermarkedPhoto(video: HTMLVideoElement, watermark: string[]): Promise<Blob> {
  if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw new DeviceError("FOTO_ALASAN_TIDAK_VALID");
  return shrink({ source: video, width: video.videoWidth, height: video.videoHeight, release: () => {} }, watermark);
}
