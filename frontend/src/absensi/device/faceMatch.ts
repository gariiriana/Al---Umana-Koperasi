// Aturan bantu pencocokan wajah supaya satu frame buram / miring / gelap tidak langsung membuat absen gagal.

export interface MatchTracker {
  /** Catat jarak wajah satu frame (`at` dalam ms). */
  push(distance: number, at: number): void;
  /** Jarak terkecil dalam jendela waktu terakhir, atau null kalau belum ada. */
  best(at: number): number | null;
  reset(): void;
}

export function createMatchTracker({ windowMs = 3000 } = {}): MatchTracker {
  let samples: { distance: number; at: number }[] = [];
  return {
    push(distance, at) {
      samples = samples.filter((s) => at - s.at <= windowMs);
      samples.push({ distance, at });
    },
    best(at) {
      let best: number | null = null;
      for (const s of samples) {
        if (at - s.at <= windowMs && (best === null || s.distance < best)) best = s.distance;
      }
      return best;
    },
    reset() {
      samples = [];
    },
  };
}

/**
 * Wajah terkuat dari hasil deteksi. Deteksi tambahan yang lemah (bayangan, poster, pantulan di ruangan redup)
 * diabaikan; baru dianggap "many" kalau wajah kedua juga jelas.
 */
export function pickSingleFace<T extends { detection: { score: number } }>(
  results: T[],
  extraFaceScore = 0.5,
): T | "none" | "many" {
  if (results.length === 0) return "none";
  const sorted = [...results].sort((a, b) => b.detection.score - a.detection.score);
  if (sorted.length > 1 && sorted[1].detection.score >= extraFaceScore) return "many";
  return sorted[0];
}

/** Rata-rata kecerahan (0–255) dari data RGBA. */
export function averageLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    count++;
  }
  return count === 0 ? 255 : sum / count;
}

let lumaCanvas: HTMLCanvasElement | null = null;

/** Kecerahan frame kamera dari gambar kecil 16×12; null kalau canvas tidak tersedia. */
export function frameBrightness(video: HTMLVideoElement): number | null {
  try {
    lumaCanvas ??= document.createElement("canvas");
    lumaCanvas.width = 16;
    lumaCanvas.height = 12;
    const context = lumaCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || video.videoWidth === 0) return null;
    context.drawImage(video, 0, 0, 16, 12);
    return averageLuma(context.getImageData(0, 0, 16, 12).data);
  } catch {
    return null;
  }
}
