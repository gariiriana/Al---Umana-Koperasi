import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  distances: [] as number[],
  yawRight: false,
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
  const eye = [{ x: 0, y: 0 }, { x: 3, y: -3 }, { x: 7, y: -3 }, { x: 10, y: 0 }, { x: 7, y: 3 }, { x: 3, y: 3 }];
  eye.forEach((p, i) => {
    points[36 + i] = p;
    points[42 + i] = p;
  });
  return points;
}

beforeEach(() => {
  mocks.distances = [];
  mocks.yawRight = false;
  mocks.detect.mockReset();
  // Deskriptor [d] vs acuan [0] → jarak euclidean = d.
  mocks.detect.mockImplementation(async () => ({
    kind: "one",
    descriptor: [mocks.distances.length > 1 ? mocks.distances.shift()! : mocks.distances[0]],
    landmarks: landmarks(mocks.yawRight),
  }));
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

describe("SelfieCapture mode match (scan otomatis)", () => {
  it("tidak ada tombol Ambil foto; foto diambil sendiri setelah wajah cocok 2 frame berturut-turut", async () => {
    mocks.distances = [0.62, 0.49, 0.62, 0.48, 0.47];
    const onDone = vi.fn();
    render(<SelfieCapture mode="match" reference={[0]} onDone={onDone} onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onDone.mock.calls[0][0].distance).toBeCloseTo(0.47);
    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();
  });

  it("wajah lain: terus memindai, baru setelah 12 detik tampil Wajah belum cocok + Coba lagi", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mocks.distances = [0.8];
    const onDone = vi.fn();
    render(<SelfieCapture mode="match" reference={[0]} onDone={onDone} onCancel={vi.fn()} />);

    // Langkah kecil dulu supaya kamera + model siap dan loop deteksi berjalan.
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () => vi.advanceTimersByTimeAsync(11000));
    expect(screen.queryByText("Wajah belum cocok")).toBeNull();
    expect(mocks.detect.mock.calls.length).toBeGreaterThan(20);

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText("Wajah belum cocok")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(screen.queryByText("Wajah belum cocok")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("SelfieCapture mode acuan & photo", () => {
  it("acuan: menunggu wajah lurus & diam, lalu terekam otomatis", async () => {
    mocks.distances = [0.3];
    mocks.yawRight = true;
    const onDone = vi.fn();
    render(<SelfieCapture mode="acuan" onDone={onDone} onCancel={vi.fn()} />);

    await new Promise((r) => setTimeout(r, 1200));
    expect(onDone).not.toHaveBeenCalled();
    mocks.yawRight = false;
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onDone.mock.calls[0][0].descriptor).toEqual([0.3]);
  });

  it("photo: hitung mundur lalu foto otomatis tanpa tombol", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const onDone = vi.fn();
    render(<SelfieCapture mode="photo" onDone={onDone} onCancel={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText(/foto otomatis dalam 3/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ambil foto/i })).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(3500));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ descriptor: null, distance: null });
  });
});
