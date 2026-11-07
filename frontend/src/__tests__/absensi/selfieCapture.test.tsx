import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  distances: [] as number[],
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

// 68 titik: hadap lurus (hidung di tengah rahang) dan mata terbuka, jadi tidak ada kedip/tengok otomatis.
function landmarks() {
  const points = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  points[0] = { x: 0, y: 50 };
  points[16] = { x: 100, y: 50 };
  points[30] = { x: 50, y: 50 };
  const eye = [{ x: 0, y: 0 }, { x: 3, y: -3 }, { x: 7, y: -3 }, { x: 10, y: 0 }, { x: 7, y: 3 }, { x: 3, y: 3 }];
  eye.forEach((p, i) => {
    points[36 + i] = p;
    points[42 + i] = p;
  });
  return points;
}

beforeEach(() => {
  mocks.distances = [];
  mocks.detect.mockReset();
  // Deskriptor [d] vs acuan [0] → jarak euclidean = d.
  mocks.detect.mockImplementation(async () => ({
    kind: "one",
    descriptor: [mocks.distances.length > 1 ? mocks.distances.shift()! : mocks.distances[0]],
    landmarks: landmarks(),
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

describe("SelfieCapture mode match", () => {
  it("frame pertama belum cocok: tidak langsung gagal, frame berikutnya yang cocok dipakai", async () => {
    mocks.distances = [0.62, 0.62, 0.62, 0.49];
    const onDone = vi.fn();
    render(<SelfieCapture mode="match" reference={[0]} onDone={onDone} onCancel={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Ambil foto" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0].distance).toBeCloseTo(0.49);
    expect(screen.queryByText("Wajah belum cocok")).toBeNull();
  });

  it("wajah lain: setelah 8 detik mencoba baru tampil Wajah belum cocok + Coba lagi", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mocks.distances = [0.8];
    const onDone = vi.fn();
    render(<SelfieCapture mode="match" reference={[0]} onDone={onDone} onCancel={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(500));

    fireEvent.click(screen.getByRole("button", { name: "Ambil foto" }));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(screen.queryByText("Wajah belum cocok")).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText("Wajah belum cocok")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
