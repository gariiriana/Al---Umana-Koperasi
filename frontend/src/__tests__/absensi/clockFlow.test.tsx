import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { payloadChallenge, sha256Hex } from "../../../../workers/absensi/shared/binding.js";

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
  signWithPasskey: vi.fn(async () => ({ id: "cred-1", response: {} })),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  absenOptions: mocks.absenOptions,
  absen: mocks.absen,
}));
vi.mock("@/absensi/device/gps", () => ({ getBestPosition: vi.fn(async () => mocks.position) }));
vi.mock("@/absensi/device/passkey", () => ({ signWithPasskey: mocks.signWithPasskey }));

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
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);

beforeEach(() => {
  mocks.position = { lat: PIN.lat, lng: PIN.lng, accuracy: 8.25 };
  mocks.absen.mockReset();
  mocks.absen.mockResolvedValue({ serverTime: 1_800_000_000_000, status: STATUS });
  mocks.signWithPasskey.mockClear();
  mocks.absenOptions.mockClear();
});

async function runToPasskey(onStatus = vi.fn()) {
  const hook = renderHook(() => useClockFlow({ me, onStatus }));
  await act(async () => hook.result.current.start("masuk"));
  await waitFor(() => expect(hook.result.current.step).toBe("selfie"));
  await act(async () => hook.result.current.selfieDone({ jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1, 0.2], distance: 0.31 }));
  await waitFor(() => expect(hook.result.current.passkeyReady).toBe(true));
  expect(hook.result.current.step).toBe("passkey");
  return hook;
}

describe("useClockFlow", () => {
  it("sukses: onStatus menerima status dari Worker lalu step sukses", async () => {
    const onStatus = vi.fn();
    const hook = await runToPasskey(onStatus);
    await act(async () => hook.result.current.confirmPasskey());
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(onStatus).toHaveBeenCalledWith(STATUS);
    expect(hook.result.current.result).toEqual({ kind: "masuk", serverTime: 1_800_000_000_000 });
    expect(mocks.absen.mock.calls[0][0]).toMatchObject({
      challengeId: "ch-9",
      kind: "masuk",
      location: { lat: PIN.lat, lng: PIN.lng, accuracy: 8.25 },
      faceDistance: 0.31,
      authentication: { id: "cred-1", response: {} },
    });
  });

  it("pra-cek di luar area: gagal dengan DI_LUAR_AREA dan absen tidak dipanggil", async () => {
    mocks.position = { lat: PIN.lat + 0.001, lng: PIN.lng, accuracy: 8 };
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn() }));
    await act(async () => hook.result.current.start("masuk"));
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));
    expect(hook.result.current.error).toMatch(/^Kamu di luar area absen \(sekitar \d+ m dari gedung\)\.$/);
    expect(mocks.absenOptions).not.toHaveBeenCalled();
    expect(mocks.absen).not.toHaveBeenCalled();
  });

  it("kontrak pengikatan: challenge passkey = payloadChallenge dari data yang dikirim ke absen", async () => {
    const hook = await runToPasskey();
    await act(async () => hook.result.current.confirmPasskey());
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));

    const body = mocks.absen.mock.calls[0][0];
    const sentBytes = Uint8Array.from(atob(body.selfieBase64), (c) => c.charCodeAt(0));
    expect(sentBytes).toEqual(JPEG);
    const expected = await payloadChallenge({
      nonce: "bm9uY2U",
      kind: body.kind,
      lat: body.location.lat,
      lng: body.location.lng,
      accuracy: body.location.accuracy,
      selfieSha256Hex: await sha256Hex(sentBytes),
    });
    expect(mocks.signWithPasskey).toHaveBeenCalledWith({
      challenge: expected,
      rpId: "localhost",
      allowCredentials: [{ id: "cred-1", transports: ["internal"] }],
    });
  });

  it("passkey dibatalkan: gagal dengan pesan, absen tidak dipanggil", async () => {
    const { DeviceError } = await import("@/absensi/device/errors");
    mocks.signWithPasskey.mockRejectedValueOnce(new DeviceError("PASSKEY_DIBATALKAN"));
    const hook = await runToPasskey();
    await act(async () => hook.result.current.confirmPasskey());
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));
    expect(hook.result.current.error).toBe("Konfirmasi sidik jari dibatalkan.");
    expect(mocks.absen).not.toHaveBeenCalled();
  });
});
