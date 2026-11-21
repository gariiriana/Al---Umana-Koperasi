// Langkah "tengok" scan wajah: seberapa jauh kepala menoleh dari posisi lurus orang itu sendiri.
import { getHeadYawRatio, type Point } from "@/absensi/device/eyes";

/**
 * Posisi hidung (titik 30) dari kiri ke kanan, 0.5 = hadap lurus:
 * - `jaw`: terhadap titik rahang 0 & 16. Pada wajah berkerudung titik ini ikut tepi kerudung, jadi sering hampir diam.
 * - `eye`: terhadap sudut luar mata 36 & 45. Tidak tertutup kerudung; null kalau titik mata tidak terbaca.
 */
export interface YawSample {
  eye: number | null;
  jaw: number;
}

/** Hidung bergeser sejauh ini (terhadap sudut mata) dari posisi lurus = sudah menoleh. */
export const EYE_TURN_DELTA = 0.08;
/** Hidung bergeser sejauh ini (terhadap rahang) dari posisi lurus = sudah menoleh. */
export const JAW_TURN_DELTA = 0.1;
/** Lebar sudut mata (piksel video) di bawah ini dianggap titik mata tidak terbaca. */
const MIN_EYE_SPAN = 1;

export function yawSample(landmarks: Point[]): YawSample {
  const jaw = getHeadYawRatio(landmarks);
  if (!landmarks || landmarks.length < 68) return { eye: null, jaw };
  const left = Math.min(landmarks[36].x, landmarks[45].x);
  const right = Math.max(landmarks[36].x, landmarks[45].x);
  const span = right - left;
  return { eye: span < MIN_EYE_SPAN ? null : (landmarks[30].x - left) / span, jaw };
}

/** Patokan lurus dari beberapa frame lurus (rata-rata). */
export function averageYaw(samples: YawSample[]): YawSample {
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const eyes = samples.map((s) => s.eye).filter((v): v is number => v !== null);
  return { eye: eyes.length > 0 ? mean(eyes) : null, jaw: mean(samples.map((s) => s.jaw)) };
}

/**
 * 0 = masih lurus seperti patokan, 1 atau lebih = sudah cukup menoleh (ke kiri atau kanan).
 * Dihitung dari posisi lurus orang itu sendiri, bukan angka tetap, supaya wajah yang lurusnya agak miring
 * atau berkerudung tetap bisa lolos. Foto datar yang dimiringkan tidak menggeser hidung terhadap mata/rahang,
 * jadi tetap tidak dihitung menoleh.
 */
export function turnProgress(sample: YawSample, baseline: YawSample): number {
  const byJaw = Math.abs(sample.jaw - baseline.jaw) / JAW_TURN_DELTA;
  const byEye = sample.eye !== null && baseline.eye !== null ? Math.abs(sample.eye - baseline.eye) / EYE_TURN_DELTA : 0;
  return Math.max(byJaw, byEye);
}
