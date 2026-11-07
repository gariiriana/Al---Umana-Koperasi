import { useEffect, useId, useState } from "react";
import { AlarmClock, Camera, ImagePlus, Loader2, X } from "lucide-react";

import { LATE_REASON_MAX } from "../../../../workers/absensi/shared/constants.js";
import { compressPhoto } from "@/absensi/device/photo";
import { normalizeLateReason } from "@/absensi/flow/useClockFlow";
import { formatJam } from "@/absensi/logic/format";
import { messageFor } from "@/absensi/messages";
import { Button } from "@/components/ui/Button";

/** Pilihan cepat supaya karyawan cukup sekali ketuk; tetap bisa diubah sebelum lanjut. */
const LATE_REASON_PRESETS = [
  "Lupa absen pagi",
  "Terlambat datang",
  "Ada tugas di luar",
  "Masuk shift siang / malam",
  "Kendala HP / aplikasi",
];

const pickerClass =
  "flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 px-3 text-sm font-bold text-amber-900 transition focus-within:ring-2 focus-within:ring-amber-400 hover:bg-amber-50 active:scale-[0.98]";

export interface LateReasonFormProps {
  now: number;
  onSubmit: (reason: string, photo: Blob) => void;
  onCancel: () => void;
}

/** Pop-up alasan + foto bukti sebelum Clock In yang lewat jam 08:00 WIB; keduanya tampil di admin absensi. */
export function LateReasonForm({ now, onSubmit, onCancel }: LateReasonFormProps) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const reason = normalizeLateReason(text);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const handleFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    // Kosongkan supaya memilih file yang sama lagi tetap memicu onChange.
    input.value = "";
    if (!file) return;
    setProcessing(true);
    setPhotoError(null);
    try {
      setPhoto(await compressPhoto(file));
    } catch {
      setPhoto(null);
      setPhotoError(messageFor("FOTO_ALASAN_TIDAK_VALID"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason && photo) onSubmit(reason, photo);
      }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlarmClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-0.5 text-left">
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-amber-950">
            Clock in lewat jam 08:00
          </p>
          <p className="text-xs font-semibold text-amber-900/80">
            Sekarang pukul {formatJam(now)}. Tulis alasan dan lampirkan foto bukti, nanti dilihat admin absensi.
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

      <div className="space-y-1.5 text-left">
        <p className="text-xs font-bold text-neutral-700">Foto bukti</p>
        {photo && previewUrl ? (
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
            <img src={previewUrl} alt="Foto bukti alasan" className="max-h-56 w-full object-contain" />
            <button
              type="button"
              aria-label="Hapus foto bukti"
              onClick={() => setPhoto(null)}
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        ) : processing ? (
          <div className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-neutral-50 text-sm font-semibold text-neutral-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Menyiapkan foto...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {/* capture="environment": langsung membuka kamera belakang di HP. */}
            <label className={pickerClass}>
              <Camera className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <span>Kamera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Kamera"
                className="sr-only"
                onChange={(e) => void handleFile(e.currentTarget)}
              />
            </label>
            <label className={pickerClass}>
              <ImagePlus className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <span>Galeri</span>
              <input
                type="file"
                accept="image/*"
                aria-label="Galeri"
                className="sr-only"
                onChange={(e) => void handleFile(e.currentTarget)}
              />
            </label>
          </div>
        )}
        {photoError && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {photoError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" className="w-full" disabled={!reason || !photo || processing}>
          Lanjut
        </Button>
        <Button type="button" variant="outlined" className="w-full" onClick={onCancel}>
          Batal
        </Button>
      </div>
    </form>
  );
}
