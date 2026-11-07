import { describe, expect, it } from "vitest";

import { createMatchTracker, pickSingleFace } from "@/absensi/device/faceMatch";

describe("createMatchTracker", () => {
  it("mengambil jarak terbaik dalam jendela waktu terakhir saja", () => {
    const tracker = createMatchTracker({ windowMs: 3000 });
    expect(tracker.best(0)).toBeNull();
    tracker.push(0.62, 0);
    tracker.push(0.48, 1000);
    tracker.push(0.58, 2000);
    expect(tracker.best(2500)).toBe(0.48);
    // Frame 0.48 (t=1000) sudah lewat 3 detik pada t=4500.
    expect(tracker.best(4500)).toBe(0.58);
    tracker.reset();
    expect(tracker.best(4500)).toBeNull();
  });
});

describe("pickSingleFace", () => {
  const face = (score: number) => ({ detection: { score } });

  it("tidak ada wajah", () => {
    expect(pickSingleFace([])).toBe("none");
  });

  it("wajah redup (skor rendah) tetap dipakai kalau hanya satu", () => {
    const dim = face(0.38);
    expect(pickSingleFace([dim])).toBe(dim);
  });

  it("deteksi tambahan yang lemah diabaikan, wajah terkuat dipakai", () => {
    const strong = face(0.81);
    expect(pickSingleFace([face(0.36), strong])).toBe(strong);
  });

  it("dua wajah jelas → many", () => {
    expect(pickSingleFace([face(0.9), face(0.7)])).toBe("many");
  });
});
