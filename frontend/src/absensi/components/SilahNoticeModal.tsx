import { CalendarOff } from "lucide-react";

import { SILAH_DAY_NAMES, weekdayOf } from "../../../../workers/absensi/shared/silah.js";

export interface SilahNoticeModalProps {
  open: boolean;
  /** `YYYY-MM-DD` hari ini (WIB). */
  date: string;
  onClose: () => void;
}

/** Ditampilkan saat karyawan menekan Clock In di hari Silah (libur mingguan) miliknya. */
export function SilahNoticeModal({ open, date, onClose }: SilahNoticeModalProps) {
  if (!open) return null;
  const day = SILAH_DAY_NAMES[weekdayOf(date)];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hari Ini Jadwal Silah Anda"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-teal-100 bg-white p-6 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-600">
          <CalendarOff className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Hari Ini Jadwal Silah Anda
          </h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            Hari ini, <strong>{day}</strong>, adalah hari libur (Silah) Anda, sehingga clock in tidak dapat dilakukan.
          </p>
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed font-semibold text-amber-900 sm:text-sm">
            Jika Anda tetap perlu masuk kerja hari ini, mohon hubungi <strong>Ustadzah Santi</strong> terlebih dahulu
            untuk mengubah jadwal Silah. Setelah jadwal diubah, Anda bisa clock in seperti biasa.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-3 text-sm font-extrabold text-neutral-900 shadow-sm transition hover:brightness-105 active:scale-[0.98]"
        >
          Baik, Mengerti
        </button>
      </div>
    </div>
  );
}
