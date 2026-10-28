// Format jam/tanggal/durasi untuk karyawan; semua dalam WIB, sama dengan tanggal kerja Worker.
import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import type { LeaveType, RequestStatus, ShiftStatusName } from "@/absensi/types";

const WIB_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
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

/** "07:02:45" */
export function formatJamDetik(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** "27/Okt/2026 17:03" */
export function formatLogWaktu(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  const day = pad(d.getUTCDate());
  const mon = BULAN_PENDEK[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day}/${mon}/${year} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Selasa, 27 Okt 2026" dari `YYYY-MM-DD`. */
export function formatHariTanggal(workDate: string): string {
  const { year, month, day } = dateParts(workDate);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return `${HARI_PANJANG[utc.getUTCDay()]}, ${day} ${BULAN_PENDEK[month - 1]} ${year}`;
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

/** Geser `YYYY-MM` sebanyak `delta` bulan. */
export function geserBulan(bulan: string, delta: number): string {
  const [year, month] = bulan.split("-").map(Number);
  const idx = year * 12 + (month - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad(((idx % 12) + 12) % 12 + 1)}`;
}

/** Jumlah hari di bulan `YYYY-MM`. */
export function daysInMonth(bulan: string): number {
  const [year, month] = bulan.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Ekspansi rentang tanggal inklusif `startDate..endDate` (opsional dipotong `clipFrom..clipTo`). */
export function expandDatesInRange(startDate: string, endDate: string, clipFrom?: string, clipTo?: string): string[] {
  const from = clipFrom && clipFrom > startDate ? clipFrom : startDate;
  const to = clipTo && clipTo < endDate ? clipTo : endDate;
  if (from > to) return [];
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const endMs = Date.parse(`${to}T00:00:00Z`);
  const out: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
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

/** Label status shift di riwayat dan rekap. */
export const SHIFT_STATUS_LABEL: Record<ShiftStatusName, string> = {
  selesai: "Lengkap",
  terbuka: "Belum clock out",
  lupa_pulang: "Tidak clock out",
};

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  sakit: "Sakit",
  izin: "Izin",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};
