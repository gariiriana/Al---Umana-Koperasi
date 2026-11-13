import { useEffect, useId, useState } from "react";
import { CalendarClock } from "lucide-react";

import { LATE_REASON_MAX } from "../../../../workers/absensi/shared/constants.js";
import { normalizeLateReason } from "@/absensi/flow/useClockFlow";
import { formatHariTanggal, formatJam } from "@/absensi/logic/format";

/** Pilihan cepat; tetap bisa diubah sebelum lanjut. */
const LATE_OUT_REASON_PRESETS = [
  "Lupa menekan clock out",
  "Lembur sampai lewat tengah malam",
  "HP mati / tidak ada sinyal",
];

export interface LateOutNoticeModalProps {
  open: boolean;
  /** `YYYY-MM-DD` tanggal shift yang belum di-clock out. */
  workDate: string;
  masukAt: number;
  /** Jam sekarang (perangkat), untuk teks "akan tercatat pukul". */
  now: number;
  /** Alasan sudah dirapikan (3–300 karakter); lanjut ke peta lokasi + selfie. */
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/**
 * Ditampilkan saat karyawan clock out shift yang sudah lewat ganti hari (lupa clock out).
 * Clock out tetap tercatat jam sebenarnya dan menunggu persetujuan kepala unit / admin absensi.
 */
export function LateOutNoticeModal({ open, workDate, masukAt, now, onSubmit, onClose }: LateOutNoticeModalProps) {
  const fieldId = useId();
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);

  if (!open) return null;
  const reason = normalizeLateReason(text);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sudah ganti hari"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) onSubmit(reason);
        }}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-orange-100 bg-white p-6 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600">
          <CalendarClock className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Sudah ganti hari
          </h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            Absensi <strong>{formatHariTanggal(workDate)}</strong> (clock in {formatJam(masukAt)}) belum di-clock out.
          </p>
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed font-semibold text-amber-900 sm:text-sm">
            Clock out sekarang akan tercatat pukul <strong>{formatJam(now)}</strong> dan menunggu persetujuan{" "}
            <strong>kepala unit</strong> atau <strong>admin absensi</strong>.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {LATE_OUT_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setText(preset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                text === preset
                  ? "border-orange-500 bg-orange-50 text-orange-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 text-left">
          <label htmlFor={fieldId} className="block text-xs font-bold text-neutral-700">
            Alasan clock out terlambat
          </label>
          <textarea
            id={fieldId}
            rows={3}
            maxLength={LATE_REASON_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contoh: lupa menekan clock out kemarin"
            className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
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
            Lanjut Clock Out
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
