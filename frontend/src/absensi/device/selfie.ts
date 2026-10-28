import { SELFIE_JPEG_QUALITY, SELFIE_WIDTH_PX } from "../../../../workers/absensi/shared/constants.js";
import { sha256Hex } from "../../../../workers/absensi/shared/binding.js";

/** Frame kamera saat ini sebagai JPEG selebar `width` px. */
export function captureJpeg(
  video: HTMLVideoElement,
  { width = SELFIE_WIDTH_PX, quality = SELFIE_JPEG_QUALITY } = {},
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  const ratio = video.videoWidth > 0 && video.videoHeight > 0
    ? video.videoHeight / video.videoWidth
    : 4 / 3;
  canvas.height = Math.round(ratio * width);
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas 2D tidak tersedia"));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal membuat JPEG"))), "image/jpeg", quality);
  });
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Base64 polos (tanpa awalan data:) untuk body API. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = await blobBytes(blob);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** SHA-256 hex dari isi JPEG, sama dengan hitungan Worker (shared/binding.js). */
export async function blobSha256Hex(blob: Blob): Promise<string> {
  return sha256Hex(await blobBytes(blob));
}
