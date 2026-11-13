import { ArrowRightToLine, LogOut } from "lucide-react";

import type { CarryOverView } from "@/absensi/logic/buttonState";
import { formatHariTanggal, formatJam, formatTanggalPendek } from "@/absensi/logic/format";

export interface CarryOverCardProps {
  carryOver: CarryOverView;
  onClockOut: () => void;
}

/**
 * Kartu absensi tanggal sebelumnya yang belum di-clock out (lupa clock out / shift malam).
 * Clock In hari ini baru terbuka sesudah Clock Out di kartu ini.
 */
export function CarryOverCard({ carryOver, onClockOut }: CarryOverCardProps) {
  const title = `Absensi ${formatHariTanggal(carryOver.workDate)}`;
  return (
    <section
      aria-label={title}
      className="rounded-3xl border border-orange-200 bg-orange-50/60 p-4 shadow-[0_12px_32px_-14px_rgba(17,24,39,0.12)]"
    >
      <h2 className="text-center font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">{title}</h2>
      <p className="mt-0.5 text-center text-xs font-semibold text-orange-800">
        {carryOver.late
          ? "Belum di-clock out. Sudah ganti hari, clock out perlu alasan dan persetujuan."
          : "Belum di-clock out. Selesaikan dulu sebelum clock in hari ini."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex min-h-[62px] w-full flex-col items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-amber-950">
          <span className="inline-flex items-center gap-1.5 font-['Manrope',system-ui,sans-serif] text-xs font-extrabold tracking-wide uppercase sm:text-sm">
            <span>CLOCK IN</span>
            <ArrowRightToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
          </span>
          <span className="mt-0.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-bold opacity-85">
            ✓ {formatJam(carryOver.masukAt)}
          </span>
        </div>
        <button
          type="button"
          aria-label={`Clock Out absensi ${formatTanggalPendek(carryOver.workDate)}`}
          onClick={onClockOut}
          className="flex min-h-[62px] w-full flex-col items-center justify-center rounded-full border-2 border-amber-500 bg-white px-4 py-2.5 text-center text-amber-950 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.3)] transition-all hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.98]"
        >
          <span className="inline-flex items-center gap-1.5 font-['Manrope',system-ui,sans-serif] text-xs font-extrabold tracking-wide uppercase sm:text-sm">
            <span>CLOCK OUT</span>
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          </span>
          <span className="mt-0.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-bold opacity-85">--:--</span>
        </button>
      </div>
    </section>
  );
}
