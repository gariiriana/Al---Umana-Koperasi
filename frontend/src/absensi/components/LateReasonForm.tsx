import { useId, useState } from "react";
import { AlarmClock } from "lucide-react";

import { LATE_REASON_MAX } from "../../../../workers/absensi/shared/constants.js";
import { normalizeLateReason } from "@/absensi/flow/useClockFlow";
import { formatJam } from "@/absensi/logic/format";
import { Button } from "@/components/ui/Button";

/** Pilihan cepat supaya karyawan cukup sekali ketuk; tetap bisa diubah sebelum lanjut. */
const LATE_REASON_PRESETS = [
  "Lupa absen pagi",
  "Terlambat datang",
  "Ada tugas di luar",
  "Masuk shift siang / malam",
  "Kendala HP / aplikasi",
];

export interface LateReasonFormProps {
  now: number;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

/** Pop-up alasan sebelum Clock In yang lewat jam 08:00 WIB; alasan ini tampil di admin absensi. */
export function LateReasonForm({ now, onSubmit, onCancel }: LateReasonFormProps) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const reason = normalizeLateReason(text);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onSubmit(reason);
      }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlarmClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-0.5 text-left">
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-amber-950">
            Clock in lewat jam 08:00
          </p>
          <p className="text-xs font-semibold text-amber-900/80">
            Sekarang pukul {formatJam(now)}. Tulis alasannya dulu, nanti dilihat admin absensi.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LATE_REASON_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setText(preset)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              text === preset
                ? "border-amber-500 bg-amber-400 text-neutral-900"
                : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 text-left">
        <label htmlFor={fieldId} className="block text-xs font-bold text-neutral-700">
          Alasan clock in terlambat
        </label>
        <textarea
          id={fieldId}
          rows={3}
          maxLength={LATE_REASON_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Contoh: lupa absen pagi, HP ketinggalan di rumah"
          className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <p className="text-right text-[11px] font-medium text-neutral-400 tabular-nums">
          {text.length}/{LATE_REASON_MAX}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" className="w-full" disabled={!reason}>
          Lanjut
        </Button>
        <Button type="button" variant="outlined" className="w-full" onClick={onCancel}>
          Batal
        </Button>
      </div>
    </form>
  );
}
