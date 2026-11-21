import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `yaw`: rasio hidung terhadap rahang (`jaw`) dan terhadap sudut luar mata (`eye`); 0.5 = hadap lurus. */
type Yaw = { jaw: number; eye: number };
type Frame = { yaw: Yaw; d?: number; cover?: "terbuka" | "tertutup" | "tidak_pasti" } | "none";

const mocks = vi.hoisted(() => ({
  // Frame berikutnya diambil dari depan; frame terakhir diulang terus.
  script: [] as Frame[],
  detect: vi.fn(),
}));

vi.mock("@/absensi/device/face", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/device/face")>()),
  loadFaceModels: vi.fn(async () => {}),
  detectSingleFace: mocks.detect,
}));
vi.mock("@/absensi/device/selfie", () => ({
  captureJpeg: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })),
}));

import { SelfieCapture } from "@/absensi/components/SelfieCapture";

// 68 titik: rahang 0–100, hidung di `jaw * 100`, sudut luar mata selebar 40 dengan hidung di `eye` dari kiri.
function landmarks({ jaw, eye }: Yaw) {
  const points = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  const nose = jaw * 100;
  points[0] = { x: 0, y: 50 };
  points[16] = { x: 100, y: 50 };
  points[30] = { x: nose, y: 50 };
  points[36] = { x: nose - eye * 40, y: 40 };
  points[45] = { x: nose - eye * 40 + 40, y: 40 };
  return points;
}

const LURUS: Yaw = { jaw: 0.5, eye: 0.5 };
const lurus = (d = 0.2, cover: "terbuka" | "tertutup" = "terbuka"): Frame => ({ yaw: LURUS, d, cover });
const kanan = (d = 0.2): Frame => ({ yaw: { jaw: 0.8, eye: 0.75 }, d });
/** Pakai kerudung: titik rahang ikut tepi kerudung jadi hampir tidak bergeser; hidung terhadap mata tetap bergeser. */
const tengokBerkerudung = (d = 0.2): Frame => ({ yaw: { jaw: 0.54, eye: 0.6 }, d });
/** Tengok setengah jalan. */
const tengokSedikit = (d = 0.2): Frame => ({ yaw: { jaw: 0.53, eye: 0.55 }, d });
/** Goyang kecil, mis. foto yang dipegang tangan. */
const goyang = (d = 0.2): Frame => ({ yaw: { jaw: 0.52, eye: 0.52 }, d });
const times = <T,>(n: number, item: T): T[] => Array.from({ length: n }, () => item);
const HINT_TURN = "Tengok ke kiri atau kanan sampai garis penuh";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  mocks.script = [];
  mocks.detect.mockReset();
  mocks.detect.mockImplementation(async () => {
    const frame = mocks.script.length > 1 ? mocks.script.shift()! : mocks.script[0];
    if (!frame || frame === "none") return { kind: "none" };
    // Deskriptor [d] vs wajah awal [d'] → jarak |d - d'|.
    return { kind: "one", descriptor: [frame.d ?? 0.2], landmarks: landmarks(frame.yaw), cover: frame.cover ?? "terbuka" };
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Jalankan loop deteksi (1 frame per 200 ms). */
const run = async (ms: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
};

/** Render lalu tunggu kamera + model siap (state kamera baru diterapkan React sesudah act pertama selesai). */
async function renderCapture(ui: React.ReactElement) {
  render(ui);
  await run(10);
}

describe("SelfieCapture mode match (lurus → tengok → lurus, dicocokkan server)", () => {
  it("menoleh lalu lurus lagi: 5 frame dikirim sebagai deskriptor, tanpa tombol ambil foto", async () => {
    mocks.script = [...times(2, lurus(0.21)), "none", kanan(), ...times(5, lurus(0.22))];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();
    await run(90);
    expect(screen.getByLabelText("Langkah scan wajah")).toBeTruthy();
    await run(3000);
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0];
    expect(result.descriptor).toBeNull();
    expect(result.descriptors).toEqual(times(5, [0.22]));
    expect(result).not.toHaveProperty("distance");
  });

  it("wajah diam (foto) tidak pernah terambil; setelah 25 detik muncul Scan wajah belum selesai + Coba lagi", async () => {
    mocks.script = [lurus()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(1000);
    expect(screen.getByText(HINT_TURN)).toBeTruthy();
    await run(23_000);
    expect(screen.queryByText("Scan wajah belum selesai")).toBeNull();

    await run(2500);
    expect(screen.getByText("Scan wajah belum selesai")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(screen.queryByText("Scan wajah belum selesai")).toBeNull();
  });

  it("pakai masker: minta hidung & mulut terlihat dan tidak pernah terambil, walau sudah menoleh", async () => {
    mocks.script = [...times(2, lurus()), kanan(), lurus(0.2, "tertutup")];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(4000);
    expect(screen.getByText("Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("masker sejak awal: belum diminta menoleh", async () => {
    mocks.script = [lurus(0.2, "tertutup")];
    await renderCapture(<SelfieCapture mode="match" onDone={vi.fn()} onCancel={vi.fn()} />);
    await run(2000);
    expect(screen.getByText("Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah")).toBeTruthy();
    expect(screen.queryByText(HINT_TURN)).toBeNull();
  });

  it("wajah berganti sesudah menoleh (mis. foto orang lain disodorkan): scan diulang dari awal", async () => {
    mocks.script = [...times(2, lurus(0)), kanan(0), lurus(0.9), lurus(0.9)];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    // Frame 4 (≈610 ms) wajah lain; pesannya bertahan sampai langkah berikutnya dimulai.
    await run(700);
    expect(screen.getByText("Wajah berganti. Ulangi: hadap lurus ke kamera")).toBeTruthy();
    await run(600);
    // Wajah baru harus menoleh lagi dari awal.
    expect(screen.getByText(HINT_TURN)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("wajah hilang lama di tengah scan: mulai lagi dari langkah lurus", async () => {
    mocks.script = [...times(2, lurus()), kanan(), ...times<Frame>(10, "none"), lurus()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(4000);
    // Sesudah hilang > 1.5 detik, frame lurus berikutnya dianggap langkah 1 lagi → diminta menoleh lagi.
    expect(screen.getByText(HINT_TURN)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("pakai kerudung: rahang hampir tidak bergeser, tengok tetap terbaca dari hidung terhadap mata", async () => {
    mocks.script = [...times(2, lurus(0.21)), tengokBerkerudung(), ...times(5, lurus(0.22))];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(3000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].descriptors).toEqual(times(5, [0.22]));
  });

  it("tengok setengah jalan: garis tengok terisi sebagian dan diminta tengok lebih jauh", async () => {
    mocks.script = [...times(2, lurus()), tengokSedikit()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(1500);
    expect(screen.getByText("Sedikit lagi, tengok lebih jauh")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Seberapa jauh menoleh" });
    const value = Number(bar.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(50);
    expect(value).toBeLessThan(100);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("goyang sedikit (mis. foto dipegang tangan) tidak dihitung menoleh", async () => {
    mocks.script = [...times(2, lurus()), goyang(), lurus(), goyang()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(5000);
    expect(screen.getByText(HINT_TURN)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("SelfieCapture mode acuan & photo", () => {
  it("acuan: menunggu wajah lurus & diam tanpa masker, lalu terekam otomatis", async () => {
    mocks.script = [...times(5, kanan(0.3)), ...times(4, lurus(0.3, "tertutup")), lurus(0.3)];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="acuan" onDone={onDone} onCancel={vi.fn()} />);

    await run(1900);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah")).toBeTruthy();
    await run(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ descriptor: [0.3], descriptors: null });
  });

  it("photo: hitung mundur lalu foto otomatis tanpa tombol", async () => {
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="photo" onDone={onDone} onCancel={vi.fn()} />);
    await run(100);
    expect(screen.getByText(/foto otomatis dalam 3/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();

    await run(3500);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ descriptor: null, descriptors: null });
  });
});
