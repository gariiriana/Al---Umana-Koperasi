// Isi watermark foto bukti alasan terlambat. Semua waktu dalam WIB.
import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { formatHariTanggal, formatJamDetik } from "@/absensi/logic/format";

export interface WatermarkLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface WatermarkInput {
  now: number;
  name: string;
  source: "kamera" | "galeri";
  location?: WatermarkLocation | null;
}

/** Contoh: ["Sabtu, 7 Nov 2026 · 12:28:15 WIB", "Gari Iriana", "-6.912345, 106.931100 (±12 m)", "Kamera langsung · Absensi Al-Umana"] */
export function lateProofWatermark({ now, name, source, location }: WatermarkInput): string[] {
  const when = `${formatHariTanggal(workDateWIB(now))} · ${formatJamDetik(now)} WIB`;
  const where = location
    ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)} m)`
    : source === "kamera"
      ? "Lokasi tidak tersedia"
      : "";
  const origin = source === "kamera" ? "Kamera langsung · Absensi Al-Umana" : "Dari galeri · Absensi Al-Umana";
  const lines = [source === "galeri" ? `Diunggah ${when}` : when, name.trim()];
  if (where) lines.push(where);
  lines.push(origin);
  return lines.filter(Boolean);
}
