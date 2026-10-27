import { describe, expect, it } from "vitest";

import { averageEar, createBlinkDetector, eyeAspectRatio } from "@/absensi/device/eyes";

// p1..p6 seperti landmark 68 titik: sudut luar, 2 titik atas, sudut dalam, 2 titik bawah.
const eye = (open: number, dx = 0) => [
  { x: dx + 0, y: 0 },
  { x: dx + 0.33, y: -open / 2 },
  { x: dx + 0.66, y: -open / 2 },
  { x: dx + 1, y: 0 },
  { x: dx + 0.66, y: open / 2 },
  { x: dx + 0.33, y: open / 2 },
];

const pushAll = (values: number[]) => {
  const detector = createBlinkDetector();
  return values.map((ear) => detector.push(ear));
};

describe("eyeAspectRatio", () => {
  it("mata terbuka ≈ 0.3, tertutup ≈ 0.1", () => {
    expect(eyeAspectRatio(eye(0.3))).toBeCloseTo(0.3, 5);
    expect(eyeAspectRatio(eye(0.1))).toBeCloseTo(0.1, 5);
  });

  it("averageEar memakai titik 36–41 dan 42–47", () => {
    const landmarks = Array.from({ length: 68 }, () => ({ x: 9, y: 9 }));
    landmarks.splice(36, 6, ...eye(0.3));
    landmarks.splice(42, 6, ...eye(0.1, 2));
    expect(averageEar(landmarks)).toBeCloseTo(0.2, 5);
  });
});

describe("createBlinkDetector", () => {
  it("terbuka → tertutup → terbuka dihitung satu kedip", () => {
    expect(pushAll([0.3, 0.1, 0.3])).toEqual([false, false, true]);
  });

  it("mulai dari tertutup tidak dihitung", () => {
    expect(pushAll([0.1, 0.3])).toEqual([false, false]);
  });

  it("tidak cukup tertutup tidak dihitung", () => {
    expect(pushAll([0.3, 0.23, 0.3])).toEqual([false, false, false]);
  });

  it("reset membuang siklus yang sedang berjalan", () => {
    const detector = createBlinkDetector();
    detector.push(0.3);
    detector.push(0.1);
    detector.reset();
    expect(detector.push(0.3)).toBe(false);
  });
});
