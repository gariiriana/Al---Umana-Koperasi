import { useEffect, useId, useState } from "react";
import { CalendarOff } from "lucide-react";

import { LATE_REASON_MAX } from "../../../../workers/absensi/shared/constants.js";
import { SILAH_DAY_NAMES, weekdayOf } from "../../../../workers/absensi/shared/silah.js";
import { normalizeLateReason } from "@/absensi/flow/useClockFlow";

/** Pilihan cepat; tetap bisa diubah sebelum lanjut. */
const SILAH_REASON_PRESETS = [
  "Menggantikan rekan yang izin / sakit",
  "Diminta masuk oleh atasan",
  "Pekerjaan sedang banyak",
  "Tukar hari libur",
];

export interface SilahNoticeModalProps {
  open: boolean;
  /** `YYYY-MM-DD` hari ini (WIB). */
  date: string;
  /** Alasan sudah dirapikan (3–300 karakter); lanjut ke peta lokasi + selfie. */
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/**
 * Ditampilkan saat karyawan menekan Clock In di hari Silah (libur mingguan) miliknya.
 * Tetap bisa clock in dengan alasan; clock in itu menunggu persetujuan kepala unit / admin absensi.
 */
export function SilahNoticeModal({ open, date, onSubmit, onClose }: SilahNoticeModalProps) {
  const fieldId = useId();
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);

  if (!open) return null;
  const day = SILAH_DAY_NAMES[weekdayOf(date)];
  const reason = normalizeLateReason(text);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hari Ini Jadwal Silah Anda"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) onSubmit(reason);
        }}
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
            Hari ini, <strong>{day}</strong>, adalah hari libur (Silah) Anda.
          </p>
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed font-semibold text-amber-900 sm:text-sm">
            Jika tetap perlu masuk kerja, cantumkan alasan clock in di bawah. Clock in Anda akan menunggu
            persetujuan <strong>kepala unit</strong> atau <strong>admin absensi</strong>.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {SILAH_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setText(preset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                text === preset
                  ? "border-teal-500 bg-teal-50 text-teal-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 text-left">
          <label htmlFor={fieldId} className="block text-xs font-bold text-neutral-700">
            Alasan clock in di hari Silah
          </label>
          <textarea
            id={fieldId}
            rows={3}
            maxLength={LATE_REASON_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contoh: menggantikan Ani yang sakit"
            className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
          <p className="text-right text-[11px] font-medium text-neutral-400 tabular-nums">
            {text.length}/{LATE_REASON_MAX}
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={!reason}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-3 text-sm font-extrabold text-neutral-900 shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lanjut Clock In
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50"
          >
            Batal, saya libur hari ini
          </button>
        </div>
      </form>
    </div>
  );
}
