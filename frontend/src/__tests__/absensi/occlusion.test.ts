import { describe, expect, it } from "vitest";

import { coverVerdict, sampleFaceColors, toYcc, type FaceColors, type Ycc } from "@/absensi/device/occlusion";

const rgb = (r: number, g: number, b: number): Ycc => toYcc(r, g, b);

// Warna dari kalibrasi 2026-11-21 (wajah asli + masker sintetis).
const SKIN = rgb(200, 150, 120);
const SKIN_SHADOW = rgb(170, 125, 100);
const LIPS = rgb(190, 110, 105);
const TEETH = rgb(225, 225, 215);
const BEARD = rgb(60, 50, 45);
const WHITE_MASK = rgb(236, 236, 238);
const BLUE_MASK = rgb(150, 190, 220);
const BLACK_MASK = rgb(38, 38, 42);
const PINK_MASK = rgb(232, 150, 190);

const face = (nose: Ycc, mouth: Ycc, ref: Ycc = SKIN): FaceColors => ({ ref, nose, mouth });

describe("coverVerdict", () => {
  it("wajah terbuka: hidung warna kulit, bibir merah, termasuk senyum gigi dan jenggot", () => {
    expect(coverVerdict(face(SKIN_SHADOW, LIPS))).toBe("terbuka");
    expect(coverVerdict(face(SKIN, TEETH))).toBe("terbuka");
    expect(coverVerdict(face(SKIN_SHADOW, BEARD))).toBe("terbuka");
  });

  it("masker putih, biru medis, hitam, dan pink menutup hidung + mulut = tertutup", () => {
    expect(coverVerdict(face(WHITE_MASK, WHITE_MASK))).toBe("tertutup");
    expect(coverVerdict(face(BLUE_MASK, BLUE_MASK))).toBe("tertutup");
    expect(coverVerdict(face(BLACK_MASK, BLACK_MASK))).toBe("tertutup");
    expect(coverVerdict(face(PINK_MASK, PINK_MASK))).toBe("tertutup");
  });

  it("hanya mulut yang beda (gigi, jenggot, masker di bawah hidung) tidak diblokir; kecocokan dinilai server", () => {
    expect(coverVerdict(face(SKIN, WHITE_MASK))).toBe("terbuka");
    expect(coverVerdict(face(SKIN, BLACK_MASK))).toBe("terbuka");
  });

  it("terlalu gelap, silau, atau tanpa warna: tidak dinilai (tidak memblokir)", () => {
    expect(coverVerdict(face(WHITE_MASK, WHITE_MASK, rgb(40, 30, 25)))).toBe("tidak_pasti");
    expect(coverVerdict(face(WHITE_MASK, WHITE_MASK, rgb(250, 235, 225)))).toBe("tidak_pasti");
    expect(coverVerdict(face(WHITE_MASK, WHITE_MASK, rgb(150, 150, 150)))).toBe("tidak_pasti");
    expect(coverVerdict(null)).toBe("tidak_pasti");
  });
});

describe("sampleFaceColors", () => {
  // Gambar 200×200 berwarna kulit; landmark: rahang 0 & 16, pangkal hidung 27, ujung hidung 30, bibir 62/66.
  const W = 200;
  const H = 200;
  const landmarks = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
  landmarks[0] = { x: 20, y: 100 };
  landmarks[16] = { x: 180, y: 100 };
  landmarks[27] = { x: 100, y: 70 };
  landmarks[30] = { x: 100, y: 110 };
  landmarks[62] = { x: 100, y: 140 };
  landmarks[66] = { x: 100, y: 146 };

  function image(lower: [number, number, number] | null) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const [r, g, b] = lower && y >= 95 ? lower : [200, 150, 120];
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it("membaca warna di landmark dan menilai wajah polos terbuka, bermasker tertutup", () => {
    expect(coverVerdict(sampleFaceColors(image(null), W, H, landmarks))).toBe("terbuka");
    expect(coverVerdict(sampleFaceColors(image([150, 190, 220]), W, H, landmarks))).toBe("tertutup");
  });

  it("landmark kurang atau wajah terlalu kecil: tidak bisa dinilai", () => {
    expect(sampleFaceColors(image(null), W, H, landmarks.slice(0, 60))).toBeNull();
    const tiny = landmarks.map((p) => ({ x: p.x / 20, y: p.y / 20 }));
    expect(sampleFaceColors(image(null), W, H, tiny)).toBeNull();
  });
});
