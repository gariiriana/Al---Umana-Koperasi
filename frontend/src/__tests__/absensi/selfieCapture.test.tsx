import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Frame = { yaw: "lurus" | "kanan"; d?: number; cover?: "terbuka" | "tertutup" | "tidak_pasti" } | "none";

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

// 68 titik: hidung di tengah rahang (hadap lurus), atau digeser ke kanan (menoleh).
function landmarks(turned = false) {
  const points = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  points[0] = { x: 0, y: 50 };
  points[16] = { x: 100, y: 50 };
  points[30] = { x: turned ? 80 : 50, y: 50 };
  return points;
}

const lurus = (d = 0.2, cover: "terbuka" | "tertutup" = "terbuka"): Frame => ({ yaw: "lurus", d, cover });
const kanan = (d = 0.2): Frame => ({ yaw: "kanan", d });
const times = <T,>(n: number, item: T): T[] => Array.from({ length: n }, () => item);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  mocks.script = [];
  mocks.detect.mockReset();
  mocks.detect.mockImplementation(async () => {
    const frame = mocks.script.length > 1 ? mocks.script.shift()! : mocks.script[0];
    if (!frame || frame === "none") return { kind: "none" };
    // Deskriptor [d] vs wajah awal [d'] → jarak |d - d'|.
    return { kind: "one", descriptor: [frame.d ?? 0.2], landmarks: landmarks(frame.yaw === "kanan"), cover: frame.cover ?? "terbuka" };
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
    expect(screen.getByText("Sekarang tengok pelan ke kiri atau kanan")).toBeTruthy();
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
    expect(screen.queryByText("Sekarang tengok pelan ke kiri atau kanan")).toBeNull();
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
    expect(screen.getByText("Sekarang tengok pelan ke kiri atau kanan")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("wajah hilang lama di tengah scan: mulai lagi dari langkah lurus", async () => {
    mocks.script = [...times(2, lurus()), kanan(), ...times<Frame>(10, "none"), lurus()];
    const onDone = vi.fn();
    await renderCapture(<SelfieCapture mode="match" onDone={onDone} onCancel={vi.fn()} />);

    await run(4000);
    // Sesudah hilang > 1.5 detik, frame lurus berikutnya dianggap langkah 1 lagi → diminta menoleh lagi.
    expect(screen.getByText("Sekarang tengok pelan ke kiri atau kanan")).toBeTruthy();
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
