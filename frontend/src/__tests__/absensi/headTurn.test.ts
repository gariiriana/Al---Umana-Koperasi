import { describe, expect, it } from "vitest";

import { averageYaw, turnProgress, yawSample } from "@/absensi/device/headTurn";

/** 68 titik dengan rasio hidung terhadap rahang (`jaw`) dan terhadap sudut luar mata (`eye`). */
function face({ jaw, eye, eyeSpan = 40 }: { jaw: number; eye: number; eyeSpan?: number }) {
  const pts = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
  const nose = jaw * 100;
  pts[0] = { x: 0, y: 60 };
  pts[16] = { x: 100, y: 60 };
  pts[30] = { x: nose, y: 55 };
  pts[36] = { x: nose - eye * eyeSpan, y: 40 };
  pts[45] = { x: nose - eye * eyeSpan + eyeSpan, y: 40 };
  return pts;
}

describe("yawSample", () => {
  it("rasio hidung terhadap rahang dan terhadap sudut luar mata (0.5 = hadap lurus)", () => {
    const s = yawSample(face({ jaw: 0.5, eye: 0.5 }));
    expect(s.jaw).toBeCloseTo(0.5, 5);
    expect(s.eye).toBeCloseTo(0.5, 5);
    expect(yawSample(face({ jaw: 0.7, eye: 0.62 })).eye).toBeCloseTo(0.62, 5);
  });

  it("titik mata tidak terbaca (jarak mata ~0): eye null, hanya rahang yang dipakai", () => {
    expect(yawSample(face({ jaw: 0.5, eye: 0.5, eyeSpan: 0 })).eye).toBeNull();
  });
});

describe("averageYaw", () => {
  it("rata-rata beberapa frame lurus jadi patokan orang itu sendiri", () => {
    const base = averageYaw([{ eye: 0.48, jaw: 0.44 }, { eye: 0.52, jaw: 0.46 }]);
    expect(base.eye).toBeCloseTo(0.5, 5);
    expect(base.jaw).toBeCloseTo(0.45, 5);
    expect(averageYaw([{ eye: null, jaw: 0.5 }]).eye).toBeNull();
  });
});

describe("turnProgress (1 = cukup menoleh)", () => {
  const base = { eye: 0.5, jaw: 0.5 };

  it("diam di tempat = 0", () => {
    expect(turnProgress(base, base)).toBe(0);
  });

  it("pakai kerudung: rahang hampir tidak bergeser, hidung terhadap mata cukup bergeser = menoleh", () => {
    expect(turnProgress({ eye: 0.6, jaw: 0.53 }, base)).toBeGreaterThanOrEqual(1);
  });

  it("rahang bergeser cukup jauh juga dihitung menoleh, ke kiri maupun kanan", () => {
    expect(turnProgress({ eye: 0.5, jaw: 0.39 }, base)).toBeGreaterThanOrEqual(1);
    expect(turnProgress({ eye: 0.41, jaw: 0.5 }, base)).toBeGreaterThanOrEqual(1);
  });

  it("goyang sedikit (mis. foto dipegang tangan) belum dihitung menoleh", () => {
    const p = turnProgress({ eye: 0.53, jaw: 0.52 }, base);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.5);
  });

  it("diukur dari posisi lurus orang itu sendiri, bukan dari angka tetap 0.5", () => {
    // Lurusnya miring ke 0.44: dulu harus sampai < 0.34; sekarang cukup bergeser ±0.10 dari patokannya.
    expect(turnProgress({ eye: null, jaw: 0.33 }, { eye: null, jaw: 0.44 })).toBeGreaterThanOrEqual(1);
    expect(turnProgress({ eye: null, jaw: 0.5 }, { eye: null, jaw: 0.44 })).toBeLessThan(1);
  });
});
