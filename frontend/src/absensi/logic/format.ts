// Format jam/tanggal/durasi untuk karyawan; semua dalam WIB, sama dengan tanggal kerja Worker.
import { LATE_AFTER_MINUTE_WIB } from "../../../../workers/absensi/shared/constants.js";
import { isLateClockIn, minuteOfDayWIB, workDateWIB } from "../../../../workers/absensi/shared/time.js";
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

/** "Terlambat 11 jam" untuk clock in lewat 08:00 WIB; null kalau tepat waktu. */
export function formatTerlambat(masukAt: number): string | null {
  if (!isLateClockIn(masukAt)) return null;
  return `Terlambat ${formatDurasi(minuteOfDayWIB(masukAt) - LATE_AFTER_MINUTE_WIB)}`;
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

/** Label absen di luar zona; selama belum disetujui ditulis "Perlu verifikasi". */
export const ZONE_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Perlu verifikasi · absen di luar zona",
  approved: "Luar zona · disetujui",
  rejected: "Luar zona · ditolak",
};

/** Label clock in di hari Silah; selama belum disetujui ditulis "Perlu verifikasi". */
export const SILAH_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Perlu verifikasi · masuk di hari Silah",
  approved: "Masuk di hari Silah · disetujui",
  rejected: "Masuk di hari Silah · ditolak",
};

type ApprovalStatusFields = {
  zoneMasuk?: { status: RequestStatus; reason: string } | null;
  zonePulang?: { status: RequestStatus; reason: string } | null;
  silahMasuk?: { status: RequestStatus; reason: string } | null;
};

/**
 * Catatan yang butuh persetujuan untuk satu shift (luar zona + masuk di hari Silah):
 * ["Clock in: Perlu verifikasi · absen di luar zona (alasan)", ...].
 */
export function zoneNotes(shift: ApprovalStatusFields): string[] {
  const notes: string[] = [];
  if (shift.silahMasuk) notes.push(`${SILAH_STATUS_LABEL[shift.silahMasuk.status]} (${shift.silahMasuk.reason})`);
  if (shift.zoneMasuk) notes.push(`Clock in: ${ZONE_STATUS_LABEL[shift.zoneMasuk.status]} (${shift.zoneMasuk.reason})`);
  if (shift.zonePulang) notes.push(`Clock out: ${ZONE_STATUS_LABEL[shift.zonePulang.status]} (${shift.zonePulang.reason})`);
  return notes;
}

/** Status persetujuan (luar zona / hari Silah) yang paling perlu perhatian: menunggu > ditolak > disetujui. */
export function worstZoneStatus(shift: {
  zoneMasuk?: { status: RequestStatus } | null;
  zonePulang?: { status: RequestStatus } | null;
  silahMasuk?: { status: RequestStatus } | null;
}): RequestStatus | null {
  const all = [shift.zoneMasuk?.status, shift.zonePulang?.status, shift.silahMasuk?.status]
    .filter((s): s is RequestStatus => Boolean(s));
  if (all.includes("pending")) return "pending";
  if (all.includes("rejected")) return "rejected";
  return all.length ? "approved" : null;
}

/** Teks badge untuk shift yang ditolak: "Masuk Silah ditolak" atau "Luar zona ditolak". */
export function rejectedLabel(shift: {
  zoneMasuk?: { status: RequestStatus } | null;
  zonePulang?: { status: RequestStatus } | null;
  silahMasuk?: { status: RequestStatus } | null;
}): string {
  return shift.silahMasuk?.status === "rejected" ? "Masuk Silah ditolak" : "Luar zona ditolak";
}

/** Clock in yang ditolak (luar zona atau masuk di hari Silah) tidak dihitung hadir. */
export function isClockInRejected(shift: {
  zoneMasuk?: { status: RequestStatus } | null;
  silahMasuk?: { status: RequestStatus } | null;
}): boolean {
  return shift.zoneMasuk?.status === "rejected" || shift.silahMasuk?.status === "rejected";
}
