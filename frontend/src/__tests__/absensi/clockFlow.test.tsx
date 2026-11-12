import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const d = 0.0001;

const mocks = vi.hoisted(() => ({
  position: { lat: 0, lng: 0, accuracy: 8 },
  absenOptions: vi.fn(async () => ({
    challengeId: "ch-9",
    nonce: "bm9uY2U",
    rpId: "localhost",
    allowCredentials: [{ id: "cred-1", transports: ["internal"] }],
  })),
  absen: vi.fn(),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  absenOptions: mocks.absenOptions,
  absen: mocks.absen,
}));

import { useClockFlow } from "@/absensi/flow/useClockFlow";
import type { Me, ShiftStatus } from "@/absensi/types";

const me = {
  uid: "u1",
  name: "Sari",
  faceRequired: true,
  faceDescriptor: [0.1, 0.2],
  areas: [{
    id: "sppg",
    name: "SPPG",
    toleranceM: 15,
    active: true,
    polygon: [
      { lat: PIN.lat - d, lng: PIN.lng - d },
      { lat: PIN.lat - d, lng: PIN.lng + d },
      { lat: PIN.lat + d, lng: PIN.lng + d },
      { lat: PIN.lat + d, lng: PIN.lng - d },
    ],
  }],
} as unknown as Me;

const STATUS: ShiftStatus = { today: null, open: null, last: null };
const EARLY = Date.parse("2026-11-07T07:30:00+07:00");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);

beforeEach(() => {
  mocks.position = { lat: PIN.lat, lng: PIN.lng, accuracy: 8.25 };
  mocks.absen.mockReset();
  mocks.absen.mockResolvedValue({ serverTime: 1_800_000_000_000, status: STATUS });
  mocks.absenOptions.mockClear();
});

async function runToSelfie(onStatus = vi.fn()) {
  const hook = renderHook(() => useClockFlow({ me, onStatus, now: () => EARLY }));
  await act(async () => hook.result.current.start("masuk"));
  expect(hook.result.current.step).toBe("lokasi");
  await act(async () => hook.result.current.confirmLocation(mocks.position));
  await waitFor(() => expect(hook.result.current.step).toBe("selfie"));
  await act(async () => hook.result.current.selfieDone({ jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1, 0.2], distance: 0.31 }));
  return hook;
}

describe("useClockFlow", () => {
  it("sukses: mulai di step lokasi → konfirmasi peta → selfie → langsung terkirim tanpa sidik jari", async () => {
    const onStatus = vi.fn();
    const hook = await runToSelfie(onStatus);
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(onStatus).toHaveBeenCalledWith(STATUS);
    expect(hook.result.current.result).toEqual({ kind: "masuk", serverTime: 1_800_000_000_000 });
    expect(mocks.absen.mock.calls[0][0]).toMatchObject({
      challengeId: "ch-9",
      kind: "masuk",
      location: { lat: PIN.lat, lng: PIN.lng, accuracy: 8.25 },
      faceDistance: 0.31,
    });
    expect(mocks.absen.mock.calls[0][0]).not.toHaveProperty("authentication");
    const sentBytes = Uint8Array.from(atob(mocks.absen.mock.calls[0][0].selfieBase64), (c) => c.charCodeAt(0));
    expect(sentBytes).toEqual(JPEG);
  });

  it("pra-cek di luar area saat konfirmasi lokasi: gagal dengan DI_LUAR_AREA dan absen tidak dipanggil", async () => {
    mocks.position = { lat: PIN.lat + 0.001, lng: PIN.lng, accuracy: 8 };
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => EARLY }));
    await act(async () => hook.result.current.start("masuk"));
    expect(hook.result.current.step).toBe("lokasi");
    await act(async () => hook.result.current.confirmLocation(mocks.position));
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));
    expect(hook.result.current.error).toMatch(/^Kamu di luar area absen \(sekitar \d+ m dari gedung\)\.$/);
    expect(mocks.absenOptions).not.toHaveBeenCalled();
    expect(mocks.absen).not.toHaveBeenCalled();
  });


  it("Worker menolak: gagal dengan pesan, bisa coba lagi dari lokasi", async () => {
    const { AbsensiApiError } = await import("@/absensi/api");
    mocks.absen.mockRejectedValueOnce(new AbsensiApiError("WAJAH_TIDAK_COCOK", 422));
    const hook = await runToSelfie();
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));
    expect(hook.result.current.error).toBeTruthy();
    await act(async () => hook.result.current.retry());
    expect(hook.result.current.step).toBe("lokasi");
  });
});
