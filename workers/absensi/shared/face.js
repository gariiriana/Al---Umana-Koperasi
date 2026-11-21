// Pencocokan wajah. Dipakai Worker (keputusan cocok/tidak) dan frontend (cek wajah tidak tertukar di tengah scan).
// HP tidak lagi menerima deskriptor acuan: HP mengirim deskriptor beberapa frame, Worker yang menghitung jaraknya.

export const DESCRIPTOR_LENGTH = 128;

/** Deskriptor wajah face-api: 128 angka finite. */
export function isDescriptor(value) {
  return Array.isArray(value) && value.length === DESCRIPTOR_LENGTH && value.every(Number.isFinite);
}

/** Jarak euclidean dua deskriptor; makin kecil makin mirip. Panjang beda = tak terhingga. */
export function faceDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/**
 * Median jarak tiap frame ke acuan. Satu-dua frame yang kebetulan mirip (atau kebetulan buram) tidak menentukan;
 * mayoritas frame harus dekat dengan acuan.
 */
export function medianFaceDistance(frames, reference) {
  if (!Array.isArray(frames) || frames.length === 0) return Number.POSITIVE_INFINITY;
  const distances = frames.map((frame) => faceDistance(frame, reference)).sort((x, y) => x - y);
  const mid = Math.floor(distances.length / 2);
  return distances.length % 2 === 1 ? distances[mid] : (distances[mid - 1] + distances[mid]) / 2;
}
