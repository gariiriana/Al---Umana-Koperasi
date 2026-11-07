// Foto bukti alasan terlambat dari kamera / galeri → JPEG kecil (≤ MAX_LATE_PHOTO_BYTES) sebelum dikirim.
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

function toJpeg(image: Decoded, scale: number, quality: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff"; // PNG transparan jadi putih, bukan hitam.
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Kecilkan foto ke sisi terpanjang 1280 px; turunkan kualitas/ukuran sampai di bawah batas Worker. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  let image: Decoded;
  try {
    image = await decode(file);
  } catch {
    throw new DeviceError("FOTO_ALASAN_TIDAK_VALID");
  }
  try {
    const base = Math.min(1, LATE_PHOTO_MAX_PX / Math.max(image.width, image.height));
    const attempts: [number, number][] = [
      [base, LATE_PHOTO_JPEG_QUALITY],
      [base, 0.55],
      [base * 0.75, 0.55],
      [base * 0.5, 0.5],
    ];
    for (const [scale, quality] of attempts) {
      const jpeg = await toJpeg(image, scale, quality);
      if (jpeg && jpeg.size <= MAX_LATE_PHOTO_BYTES) return jpeg;
    }
    throw new DeviceError("FOTO_ALASAN_TIDAK_VALID");
  } finally {
    image.release();
  }
}
