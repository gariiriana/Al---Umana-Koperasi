import type { ReactNode } from "react";
import { LogIn, LogOut } from "lucide-react";

import type { ButtonView } from "@/absensi/logic/buttonState";
import type { AbsenKind } from "@/absensi/types";

type ButtonTone = ButtonView["clockIn"]["state"] | ButtonView["clockOut"]["state"];

const TONE: Record<ButtonTone, string> = {
  aktif: "bg-amber-400 text-[#111827] hover:bg-amber-300 active:bg-amber-500",
  selesai: "bg-emerald-600 text-white",
  tidak_clock_out: "bg-orange-500 text-white",
  nonaktif: "bg-white/10 text-neutral-400",
};

function ClockButton({ tone, label, icon, onPress }: { tone: ButtonTone; label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <button
      type="button"
      disabled={tone !== "aktif"}
      onClick={onPress}
      className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl px-3 py-4 text-center font-['Manrope',system-ui,sans-serif] text-base font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-default ${TONE[tone]}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Dua tombol besar berdampingan; hanya tombol `aktif` yang bisa ditekan. */
export function ClockButtons({ view, onPress }: { view: ButtonView; onPress: (kind: AbsenKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ClockButton
        tone={view.clockIn.state}
        label={view.clockIn.label}
        icon={<LogIn className="h-7 w-7" aria-hidden="true" />}
        onPress={() => onPress("masuk")}
      />
      <ClockButton
        tone={view.clockOut.state}
        label={view.clockOut.label}
        icon={<LogOut className="h-7 w-7" aria-hidden="true" />}
        onPress={() => onPress("pulang")}
      />
    </div>
  );
}
