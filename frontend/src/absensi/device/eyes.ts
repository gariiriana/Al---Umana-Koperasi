// Deteksi kedip dari landmark 68 titik (eye aspect ratio): bukti wajah hidup, bukan foto.

export interface Point {
  x: number;
  y: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** EAR = (|p2-p6| + |p3-p5|) / (2|p1-p4|) untuk 6 titik satu mata. */
export function eyeAspectRatio(eye: Point[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
}

/** Rata-rata EAR mata kiri (titik 36–41) dan kanan (42–47). */
export function averageEar(landmarks68: Point[]): number {
  return (eyeAspectRatio(landmarks68.slice(36, 42)) + eyeAspectRatio(landmarks68.slice(42, 48))) / 2;
}

export interface BlinkDetector {
  /** True tepat sekali saat siklus terbuka → tertutup → terbuka selesai. */
  push(ear: number): boolean;
  reset(): void;
}

export function createBlinkDetector({ closeBelow = 0.22, openAbove = 0.24 } = {}): BlinkDetector {
  // Kedip baru dihitung setelah mata terlihat terbuka dulu.
  let state: "unknown" | "open" | "closed" = "unknown";
  return {
    push(ear) {
      if (state === "closed" && ear > openAbove) {
        state = "open";
        return true;
      }
      if (state === "open" && ear < closeBelow) state = "closed";
      else if (state === "unknown" && ear > openAbove) state = "open";
      return false;
    },
    reset() {
      state = "unknown";
    },
  };
}

/** Menghitung rasio posisi hidung terhadap lebar rahang wajah (0.5 = hadap depan). */
export function getHeadYawRatio(landmarks68: Point[]): number {
  if (!landmarks68 || landmarks68.length < 68) return 0.5;
  const noseX = landmarks68[30].x;
  const jawLeft = landmarks68[0].x;
  const jawRight = landmarks68[16].x;
  const minX = Math.min(jawLeft, jawRight);
  const maxX = Math.max(jawLeft, jawRight);
  const span = maxX - minX;
  if (span <= 0) return 0.5;
  return (noseX - minX) / span;
}

export interface HeadTurnDetector {
  /** Return true saat terdeteksi gerakan menoleh ke kiri/kanan. */
  push(landmarks68: Point[]): boolean;
  reset(): void;
}

export function createHeadTurnDetector({ centerMin = 0.42, centerMax = 0.58, sideThreshold = 0.08 } = {}): HeadTurnDetector {
  let hasCentered = false;
  let hasTurned = false;
  return {
    push(landmarks68) {
      const ratio = getHeadYawRatio(landmarks68);
      const isCenter = ratio >= centerMin && ratio <= centerMax;
      const isSide = ratio < (centerMin - sideThreshold) || ratio > (centerMax + sideThreshold);

      if (isCenter) {
        if (hasTurned) {
          hasTurned = false;
          hasCentered = false;
          return true;
        }
        hasCentered = true;
      } else if (isSide) {
        if (hasCentered) {
          hasCentered = false;
          hasTurned = false;
          return true;
        }
        hasTurned = true;
      }
      return false;
    },
    reset() {
      hasCentered = false;
      hasTurned = false;
    },
  };
}
