// Pengenal wajah di perangkat (@vladmandic/face-api); model disajikan dari /models.
import type * as FaceApi from "@vladmandic/face-api";
import type { Point } from "@/absensi/device/eyes";
import { pickSingleFace } from "@/absensi/device/faceMatch";

const MODEL_URI = "/models";

let ready: Promise<typeof FaceApi> | null = null;

function faceApi(): Promise<typeof FaceApi> {
  if (!ready) {
    ready = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URI),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URI),
      ]);
      return faceapi;
    })();
    // Gagal (mis. offline) boleh dicoba lagi.
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

/** Memuat model sekali; panggilan berikutnya memakai hasil yang sama. */
export async function loadFaceModels(): Promise<void> {
  await faceApi();
}

export type FaceDetection =
  | { kind: "one"; descriptor: number[]; landmarks: Point[] }
  | { kind: "none" }
  | { kind: "many" };

// Saat absen ambang deteksi dilonggarkan supaya wajah di ruangan redup / malam hari tetap terbaca;
// cocok-tidaknya wajah tetap ditentukan jarak deskriptor (FACE_MATCH_THRESHOLD).
// Foto acuan aktivasi tetap memakai ambang default face-api (0.5) supaya acuannya jelas.
export const DETECT_SCORE_ABSEN = 0.3;
export const DETECT_SCORE_ACUAN = 0.5;

export async function detectSingleFace(
  video: HTMLVideoElement,
  { minScore = DETECT_SCORE_ABSEN }: { minScore?: number } = {},
): Promise<FaceDetection> {
  const faceapi = await faceApi();
  const results = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: minScore }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  const face = pickSingleFace(results);
  if (face === "none" || face === "many") return { kind: face };
  return {
    kind: "one",
    descriptor: Array.from(face.descriptor),
    landmarks: face.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
  };
}

/** Jarak euclidean dua deskriptor wajah; makin kecil makin mirip. */
export function faceDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
