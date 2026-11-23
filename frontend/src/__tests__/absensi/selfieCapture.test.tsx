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
const times = <T,>(n: number, item: T): T[] => Array.from({ length: n }, () => item);
const HINT_COVERED = "Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah";

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

describe("SelfieCapture mode match (cukup hadap lurus, dicocokkan server)", () => {
  it("hadap lurus sebentar: 5 frame dikirim tanpa langkah tengok dan tanpa tombol ambil foto", async () => {
    mocks.script = [lurus(0.21), ...times(5, lurus(0.22))];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();
    await run(500);
    expect(screen.queryByLabelText("Langkah scan wajah")).toBeNull();
    expect(screen.queryByText(/tengok/i)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await run(1500);
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0];
    expect(result.descriptor).toBeNull();
    expect(result.descriptors).toEqual(times(5, [0.22]));
    expect(result).not.toHaveProperty("distance");
  });

  it("wajah tidak menghadap kamera tidak terambil; setelah 25 detik muncul Scan wajah belum selesai + Coba lagi", async () => {
    mocks.script = [kanan()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(1000);
    expect(screen.getByText("Hadap lurus ke kamera")).toBeTruthy();
    await run(23_000);
    expect(screen.queryByText("Scan wajah belum selesai")).toBeNull();

    await run(2500);
    expect(screen.getByText("Scan wajah belum selesai")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(screen.queryByText("Scan wajah belum selesai")).toBeNull();
  });

  it("masker sejak awal: minta hidung & mulut terlihat dan tidak pernah terambil", async () => {
    mocks.script = [lurus(0.2, "tertutup")];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);
    await run(4000);
    expect(screen.getByText(HINT_COVERED)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("masker dipasang di tengah scan: frame dibuang dan tidak pernah terambil", async () => {
    mocks.script = [...times(3, lurus()), lurus(0.2, "tertutup")];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);
    await run(4000);
    expect(screen.getByText(HINT_COVERED)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("wajah berganti di tengah scan (mis. foto orang lain disodorkan): scan diulang, frame wajah lama tidak ikut terkirim", async () => {
    mocks.script = [...times(3, lurus(0)), lurus(0.9)];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    // Frame 4 (≈610 ms) wajah lain.
    await run(700);
    expect(screen.getByText("Wajah berganti. Ulangi: hadap lurus ke kamera")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await run(3000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].descriptors).toEqual(times(5, [0.9]));
  });

  it("wajah hilang lama di tengah scan: mulai lagi dari awal", async () => {
    mocks.script = [...times(3, lurus(0.2)), ...times<Frame>(10, "none"), lurus(0.5)];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(6000);
    expect(onDone).toHaveBeenCalledTimes(1);
    // Frame sebelum wajah hilang tidak ikut terkirim.
    expect(onDone.mock.calls[0][0].descriptors).toEqual(times(5, [0.5]));
  });
});

describe("SelfieCapture mode acuan & photo", () => {
  it("acuan: menunggu wajah lurus & diam tanpa masker, lalu terekam otomatis", async () => {
    mocks.script = [...times(5, kanan(0.3)), ...times(4, lurus(0.3, "tertutup")), lurus(0.3)];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="acuan" onDone={onDone} onCancel={vi.fn()} />);

    await run(1900);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(HINT_COVERED)).toBeTruthy();
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
