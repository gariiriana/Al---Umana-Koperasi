import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceError } from "@/absensi/device/errors";
import { getBestPosition } from "@/absensi/device/gps";

// Di luar kotak Indonesia supaya cek zona waktu di gpsVerification tidak bergantung pada mesin tes.
const LAT = 51.5;
const LNG = -0.12;

function fakeGeolocation() {
  let onSuccess: PositionCallback = () => {};
  let onError: PositionErrorCallback = () => {};
  const geo = {
    watchPosition: vi.fn<Geolocation["watchPosition"]>((success, error) => {
      onSuccess = success;
      onError = error ?? (() => {});
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  return {
    geo: geo as unknown as Geolocation,
    watchPosition: geo.watchPosition,
    clearWatch: geo.clearWatch,
    fix: (accuracy: number, lat = LAT, lng = LNG) =>
      onSuccess({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition),
    fail: (code: number) => onError({ code, message: "x" } as GeolocationPositionError),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("getBestPosition", () => {
  it("selesai lebih awal begitu akurasi cukup bagus", async () => {
    const g = fakeGeolocation();
    const result = getBestPosition({ geolocation: g.geo });
    g.fix(40);
    g.fix(25);
    g.fix(12);
    await expect(result).resolves.toEqual({ lat: LAT, lng: LNG, accuracy: 12 });
    expect(g.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    expect(g.clearWatch).toHaveBeenCalledWith(7);
  });

  it("best, not latest: setelah waktu habis mengembalikan fix paling akurat", async () => {
    const g = fakeGeolocation();
    const result = getBestPosition({ geolocation: g.geo });
    g.fix(30);
    g.fix(45);
    vi.advanceTimersByTime(10_000);
    await expect(result).resolves.toEqual({ lat: LAT, lng: LNG, accuracy: 30 });
    expect(g.clearWatch).toHaveBeenCalledWith(7);
  });

  it("izin lokasi ditolak → IZIN_LOKASI", async () => {
    const g = fakeGeolocation();
    const result = getBestPosition({ geolocation: g.geo });
    g.fail(1);
    await expect(result).rejects.toMatchObject({ code: "IZIN_LOKASI" });
    await expect(result).rejects.toBeInstanceOf(DeviceError);
  });

  it("tanpa satu fix pun sampai waktu habis → GPS_TIDAK_ADA", async () => {
    const g = fakeGeolocation();
    const result = getBestPosition({ geolocation: g.geo });
    g.fail(3);
    vi.advanceTimersByTime(10_000);
    await expect(result).rejects.toMatchObject({ code: "GPS_TIDAK_ADA" });
  });

  it("koordinat 0,0 → GPS_PALSU", async () => {
    const g = fakeGeolocation();
    const result = getBestPosition({ geolocation: g.geo });
    g.fix(10, 0, 0);
    await expect(result).rejects.toMatchObject({ code: "GPS_PALSU" });
  });
});
