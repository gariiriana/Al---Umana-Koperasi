// Format jam/tanggal/durasi untuk karyawan; semua dalam WIB, sama dengan tanggal kerja Worker.
import { workDateWIB } from "../../../../workers/absensi/shared/time.js";

const WIB_OFFSET_MS = 7 * 3600_000;
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const pad = (n: number) => String(n).padStart(2, "0");

function dateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** "07:02" */
export function formatJam(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "26 Okt" dari `YYYY-MM-DD` atau waktu (ms). */
export function formatTanggalPendek(value: string | number): string {
  const { month, day } = dateParts(typeof value === "number" ? workDateWIB(value) : value);
  return `${day} ${BULAN_PENDEK[month - 1]}`;
}

/** "26 Oktober 2026" */
export function formatTanggalPanjang(workDate: string): string {
  const { year, month, day } = dateParts(workDate);
  return `${day} ${BULAN_PANJANG[month - 1]} ${year}`;
}

/** "9 jam 3 menit", "2 jam", "45 menit" */
export function formatDurasi(min: number): string {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes} menit`;
  return minutes === 0 ? `${hours} jam` : `${hours} jam ${minutes} menit`;
}

/** "Oktober 2026" dari `YYYY-MM`. */
export function formatBulan(bulan: string): string {
  const [year, month] = bulan.split("-").map(Number);
  return `${BULAN_PANJANG[month - 1]} ${year}`;
}

/** `YYYY-MM` bulan WIB untuk waktu `ms`. */
export function bulanWIB(ms: number): string {
  return workDateWIB(ms).slice(0, 7);
}

/** Bulan ini lalu `count - 1` bulan ke belakang, terbaru dulu. */
export function recentBulan(nowMs: number, count = 12): string[] {
  const { year, month } = dateParts(`${bulanWIB(nowMs)}-01`);
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) - i;
    return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
  });
}
