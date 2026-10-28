import { GOOD_ACCURACY_M, GPS_SAMPLE_MS } from "../../../../workers/absensi/shared/constants.js";
import { verifyGpsLocation } from "@/services/gpsVerification";
import { DeviceError } from "@/absensi/device/errors";

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface GetBestPositionOptions {
  maxMs?: number;
  goodAccuracyM?: number;
  geolocation?: Geolocation;
}

const DEV_GPS_KEY = "absensi:devGps";

// Hanya build dev: localStorage["absensi:devGps"] = "lat,lng,acc" untuk tes di laptop.
export function getDevGpsFix(): GpsFix | null {
  if (!import.meta.env.DEV) return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DEV_GPS_KEY);
  } catch {
    return null;
  }
  const parts = raw?.split(",").map(Number);
  if (!parts || parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  return { lat: parts[0], lng: parts[1], accuracy: parts[2] };
}

/**
 * Mengamati GPS secara kontinu untuk peta konfirmasi lokasi.
 * Memanggil `onFix` setiap ada posisi valid baru, atau `onError` bila izin ditolak / GPS mati.
 */
export function subscribeGpsPosition(
  onFix: (fix: GpsFix) => void,
  onError: (code: string) => void,
  geolocation: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation,
): () => void {
  const dev = getDevGpsFix();
  if (dev) {
    const id = setTimeout(() => onFix(dev), 50);
    return () => clearTimeout(id);
  }
  if (!geolocation) {
    onError("GPS_TIDAK_ADA");
    return () => {};
  }
  let stopped = false;
  const watchId = geolocation.watchPosition(
    (position) => {
      if (stopped) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (!verifyGpsLocation(latitude, longitude, accuracy).isValid) {
        onError("GPS_PALSU");
        return;
      }
      onFix({ lat: latitude, lng: longitude, accuracy });
    },
    (error) => {
      if (stopped) return;
      onError(error.code === 1 ? "IZIN_LOKASI" : "GPS_TIDAK_ADA");
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15_000 },
  );
  return () => {
    stopped = true;
    geolocation.clearWatch(watchId);
  };
}

/**
 * Mengamati GPS sampai `maxMs` dan mengembalikan fix paling akurat (bukan yang terakhir).
 * Selesai lebih awal begitu akurasi ≤ `goodAccuracyM`.
 */
export function getBestPosition({
  maxMs = GPS_SAMPLE_MS,
  goodAccuracyM = GOOD_ACCURACY_M,
  geolocation = typeof navigator === "undefined" ? undefined : navigator.geolocation,
}: GetBestPositionOptions = {}): Promise<GpsFix> {
  const dev = getDevGpsFix();
  if (dev) return Promise.resolve(dev);

  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new DeviceError("GPS_TIDAK_ADA"));
      return;
    }
    let best: GpsFix | null = null;
    let done = false;
    let watchId: number | null = null;

    const stop = () => {
      done = true;
      clearTimeout(timer);
      if (watchId !== null) geolocation.clearWatch(watchId);
    };
    const finish = () => {
      if (done) return;
      stop();
      if (!best) reject(new DeviceError("GPS_TIDAK_ADA"));
      else if (!verifyGpsLocation(best.lat, best.lng, best.accuracy).isValid) reject(new DeviceError("GPS_PALSU"));
      else resolve(best);
    };
    const timer = setTimeout(finish, maxMs);

    watchId = geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!best || accuracy < best.accuracy) best = { lat: latitude, lng: longitude, accuracy };
        if (best.accuracy <= goodAccuracyM) finish();
      },
      (error) => {
        // 1 = PERMISSION_DENIED. Posisi belum ada atau timeout: tetap tunggu sampai maxMs.
        if (error.code !== 1 || done) return;
        stop();
        reject(new DeviceError("IZIN_LOKASI"));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    if (done) geolocation.clearWatch(watchId);
  });
}
