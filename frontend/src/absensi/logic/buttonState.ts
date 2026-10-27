// Tampilan tombol Clock In / Clock Out dari status Worker (tabel spec 5.3).
import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { formatDurasi, formatJam, formatTanggalPendek } from "@/absensi/logic/format";
import type { ShiftStatus } from "@/absensi/types";

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

export function buttonState(status: ShiftStatus, nowMs: number): ButtonView {
  const today = workDateWIB(nowMs);
  const shift = status.open ?? status.today;

  if (!shift) {
    const last = status.last;
    const lastShiftLine =
      last?.status === "selesai" && last.pulangAt !== null && workDateWIB(last.pulangAt) === today
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
