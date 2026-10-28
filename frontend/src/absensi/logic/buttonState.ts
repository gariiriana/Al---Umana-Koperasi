// Tampilan tombol Clock In / Clock Out dari status Worker (tabel spec 5.3).
import { OPEN_SHIFT_MAX_MS } from "../../../../workers/absensi/shared/constants.js";
import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { formatDurasi, formatJam, formatTanggalPendek } from "@/absensi/logic/format";
import type { ShiftStatus, ShiftView } from "@/absensi/types";

export interface ButtonView {
  clockIn: { state: "aktif" | "selesai"; label: string };
  clockOut: { state: "nonaktif" | "aktif" | "selesai" | "tidak_clock_out"; label: string };
  /** Durasi kerja setelah clock out, mis. "9 jam 3 menit". */
  durasi: string | null;
  /** "Shift 26 Okt" kalau shift terbuka berasal dari tanggal sebelumnya (shift malam). */
  shiftDateLabel: string | null;
  /** "Shift terakhir: 26 Okt, 22:00–06:00 ✓" sesudah clock out shift kemarin. */
  lastShiftLine: string | null;
}

function normalizeShift(s: ShiftView | null, nowMs: number): ShiftView | null {
  if (!s) return null;
  if (s.status === "terbuka" && nowMs - s.masukAt > OPEN_SHIFT_MAX_MS) {
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
    };
  }

  const clockIn = { state: "selesai" as const, label: `✓ Sudah clock in · ${formatJam(shift.masukAt)}` };
  const shiftDateLabel = shift.workDate !== today ? `Shift ${formatTanggalPendek(shift.workDate)}` : null;

  if (shift.status === "terbuka") {
    return { clockIn, clockOut: { state: "aktif", label: "Clock Out" }, durasi: null, shiftDateLabel, lastShiftLine: null };
  }
  if (shift.status === "lupa_pulang") {
    return {
      clockIn,
      clockOut: { state: "tidak_clock_out", label: "Tidak clock out" },
      durasi: null,
      shiftDateLabel,
      lastShiftLine: null,
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
  };
}
