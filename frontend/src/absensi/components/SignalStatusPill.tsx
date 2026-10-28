import { useEffect, useState } from "react";
import { MapPin, MapPinOff, Wifi, WifiOff } from "lucide-react";

import { subscribeGpsPosition, type GpsFix } from "@/absensi/device/gps";

/** Memantau status koneksi internet browser secara reaktif. */
// eslint-disable-next-line react-refresh/only-export-components
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Memantau ketersediaan sinyal GPS perangkat di latar Beranda. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAmbientGps(): { gpsConnected: boolean; fix: GpsFix | null } {
  const [fix, setFix] = useState<GpsFix | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeGpsPosition(
      (nextFix) => setFix(nextFix),
      () => setFix(null),
    );
    return unsubscribe;
  }, []);
  return { gpsConnected: fix !== null, fix };
}

/** Dua ikon status vertikal (Pin Lokasi + WiFi) seperti pada kartu Beranda dan layar peta. */
export function SignalStatusPill({
  gpsConnected,
  online,
  floating = false,
}: {
  gpsConnected: boolean;
  online: boolean;
  floating?: boolean;
}) {
  const wrapper = floating
    ? "flex flex-col items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white/95 px-2.5 py-3 shadow-md backdrop-blur-sm"
    : "flex flex-col items-center gap-2";

  return (
    <div
      className={wrapper}
      aria-label={`Status GPS ${gpsConnected ? "terhubung" : "belum terhubung"}, internet ${online ? "terhubung" : "terputus"}`}
    >
      <span title={gpsConnected ? "GPS Terhubung" : "GPS Belum Terhubung"}>
        {gpsConnected ? (
          <MapPin className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <MapPinOff className="h-5 w-5 text-rose-600" aria-hidden="true" />
        )}
      </span>
      <span title={online ? "Internet Terhubung" : "Internet Terputus"}>
        {online ? (
          <Wifi className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <WifiOff className="h-5 w-5 text-rose-600" aria-hidden="true" />
        )}
      </span>
    </div>
  );
}

