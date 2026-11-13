// Tampilan tombol Clock In / Clock Out dari status Worker (tabel spec 5.3).
import { isLateClockOut, isShiftExpired, workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { formatDurasi, formatJam, formatTanggalPendek } from "@/absensi/logic/format";
import type { ShiftStatus, ShiftView } from "@/absensi/types";

/** Shift tanggal sebelumnya yang belum di-clock out (masih bisa ditutup sampai 23:59 hari berikutnya). */
export interface CarryOverView {
  workDate: string;
  masukAt: number;
  /** Sudah ganti hari: clock out perlu alasan + persetujuan (pop-up "Sudah ganti hari"). */
  late: boolean;
}

export interface ButtonView {
  /** "terkunci" = Clock In hari ini menunggu clock out shift kemarin (`carryOver`). */
  clockIn: { state: "aktif" | "selesai" | "terkunci"; label: string };
  clockOut: { state: "nonaktif" | "aktif" | "selesai" | "tidak_clock_out"; label: string };
  /** Durasi kerja setelah clock out, mis. "9 jam 3 menit". */
  durasi: string | null;
  /** "Shift 26 Okt" kalau shift terbuka berasal dari tanggal sebelumnya (shift malam). */
  shiftDateLabel: string | null;
  /** "Shift terakhir: 26 Okt, 22:00–06:00 ✓" sesudah clock out shift kemarin. */
  lastShiftLine: string | null;
  /** Kartu "Absensi <tanggal kemarin>" di atas tombol hari ini; null kalau tidak ada. */
  carryOver: CarryOverView | null;
}

function normalizeShift(s: ShiftView | null, nowMs: number): ShiftView | null {
  if (!s) return null;
  if (s.status === "terbuka" && isShiftExpired(s.workDate, nowMs)) {
    return { ...s, status: "lupa_pulang" };
  }
  return s;
}

export function buttonState(status: ShiftStatus, nowMs: number): ButtonView {
  const today = workDateWIB(nowMs);
  const rawOpen = normalizeShift(status.open, nowMs);
  const rawToday = normalizeShift(status.today, nowMs);
  const openShift = rawOpen?.status === "terbuka" ? rawOpen : null;
  const todayShift = rawToday?.workDate === today
    ? rawToday
    : (rawOpen?.workDate === today ? rawOpen : null);
  const shift = openShift ?? todayShift;

  // Lupa clock out kemarin (atau shift malam yang masih berjalan): kartu kemarin dulu, Clock In hari ini menunggu.
  if (openShift && openShift.workDate < today) {
    return {
      clockIn: { state: "terkunci", label: `Selesaikan clock out ${formatTanggalPendek(openShift.workDate)} dulu` },
      clockOut: { state: "nonaktif", label: "Clock in dulu" },
      durasi: null,
      shiftDateLabel: null,
      lastShiftLine: null,
      carryOver: { workDate: openShift.workDate, masukAt: openShift.masukAt, late: isLateClockOut(openShift.masukAt, nowMs) },
    };
  }

  if (!shift) {
    const last = rawToday && rawToday.workDate !== today && rawToday.status !== "terbuka"
      ? rawToday
      : normalizeShift(status.last, nowMs);
    const lastShiftLine =
      last?.status === "selesai" && last.pulangAt !== null && workDateWIB(last.pulangAt) === today && last.workDate !== today
        ? `Shift terakhir: ${formatTanggalPendek(last.workDate)}, ${formatJam(last.masukAt)}–${formatJam(last.pulangAt)} ✓`
        : null;
    return {
      clockIn: { state: "aktif", label: "Clock In" },
      clockOut: { state: "nonaktif", label: "Clock in dulu" },
      durasi: null,
      shiftDateLabel: null,
      lastShiftLine,
      carryOver: null,
    };
  }

  const clockIn = { state: "selesai" as const, label: `✓ Sudah clock in · ${formatJam(shift.masukAt)}` };
  const shiftDateLabel = shift.workDate !== today ? `Shift ${formatTanggalPendek(shift.workDate)}` : null;

  if (shift.status === "terbuka") {
    return { clockIn, clockOut: { state: "aktif", label: "Clock Out" }, durasi: null, shiftDateLabel, lastShiftLine: null, carryOver: null };
  }
  if (shift.status === "lupa_pulang") {
    return {
      clockIn,
      clockOut: { state: "tidak_clock_out", label: "Tidak clock out" },
      durasi: null,
      shiftDateLabel,
      lastShiftLine: null,
      carryOver: null,
    };
  }
  return {
    clockIn,
    clockOut: {
      state: "selesai",
      label: shift.pulangAt !== null ? `✓ Sudah clock out · ${formatJam(shift.pulangAt)}` : "✓ Sudah clock out",
    },
    durasi: shift.durationMin !== null ? formatDurasi(shift.durationMin) : null,
    shiftDateLabel,
    lastShiftLine: null,
    carryOver: null,
  };
}
