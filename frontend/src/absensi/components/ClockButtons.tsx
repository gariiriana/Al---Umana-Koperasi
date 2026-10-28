import { ArrowRightToLine, LogOut } from "lucide-react";

import { formatJam } from "@/absensi/logic/format";
import type { ButtonView } from "@/absensi/logic/buttonState";
import type { AbsenKind, ShiftView } from "@/absensi/types";

export interface ClockButtonsProps {
  view: ButtonView;
  activeShift?: ShiftView | null;
  onPress: (kind: AbsenKind) => void;
}

/** Dua tombol pill berdampingan mengikuti layout referensi SS 1 dalam palet putih-kuning. */
export function ClockButtons({ view, activeShift, onPress }: ClockButtonsProps) {
  const inActive = view.clockIn.state === "aktif";
  const outActive = view.clockOut.state === "aktif";

  const masukTime = activeShift ? formatJam(activeShift.masukAt) : "--:--";
  const pulangTime = activeShift?.pulangAt != null
    ? formatJam(activeShift.pulangAt)
    : view.clockOut.state === "tidak_clock_out"
      ? "Tidak clock out"
      : "--:--";

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* CLOCK IN Pill */}
      <button
        type="button"
        disabled={!inActive}
        aria-label={view.clockIn.label}
        onClick={() => onPress("masuk")}
        className={`flex min-h-[62px] flex-col items-center justify-center rounded-full px-4 py-2.5 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          inActive
            ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-neutral-900 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] hover:from-amber-500 hover:to-yellow-500 active:scale-[0.98]"
            : "cursor-default border border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        <span className="inline-flex items-center gap-1.5 font-['Manrope',system-ui,sans-serif] text-xs font-extrabold tracking-wide uppercase sm:text-sm">
          <span>CLOCK IN</span>
          <ArrowRightToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
        <span className="mt-0.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-bold opacity-85">
          {masukTime}
        </span>
      </button>

      {/* CLOCK OUT Pill */}
      <button
        type="button"
        disabled={!outActive}
        aria-label={view.clockOut.label}
        onClick={() => onPress("pulang")}
        className={`flex min-h-[62px] flex-col items-center justify-center rounded-full px-4 py-2.5 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          outActive
            ? "border-2 border-amber-500 bg-white text-amber-950 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.3)] hover:bg-amber-50 active:scale-[0.98]"
            : view.clockOut.state === "selesai"
              ? "cursor-default border border-emerald-200 bg-emerald-50/70 text-emerald-800"
              : view.clockOut.state === "tidak_clock_out"
                ? "cursor-default border border-orange-200 bg-orange-50 text-orange-800"
                : "cursor-default border border-rose-200/80 bg-white text-rose-700/70"
        }`}
      >
        <span className="inline-flex items-center gap-1.5 font-['Manrope',system-ui,sans-serif] text-xs font-extrabold tracking-wide uppercase sm:text-sm">
          <span>CLOCK OUT</span>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
        <span className="mt-0.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-bold opacity-85">
          {pulangTime}
        </span>
      </button>
    </div>
  );
}
