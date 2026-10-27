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

export function createBlinkDetector({ closeBelow = 0.21, openAbove = 0.25 } = {}): BlinkDetector {
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
