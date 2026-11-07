import { useEffect, useState } from "react";

import { fetchPhotoUrl } from "@/absensi/api";
import { formatTerlambat } from "@/absensi/logic/format";
import { Button } from "@/components/ui/Button";

export interface ShiftPhotoProps {
  label: string;
  photoId: string | null;
  /** selfie: potret 3:4 dipotong penuh; bukti: foto alasan terlambat utuh (bisa landscape). */
  variant?: "selfie" | "bukti";
}

/** Satu foto absen dari Worker; dimuat hanya saat komponen tampil. */
export function ShiftPhoto({ label, photoId, variant = "selfie" }: ShiftPhotoProps) {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: photoId !== null });

  useEffect(() => {
    if (!photoId) {
      setState({ url: null, loading: false });
      return undefined;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, loading: true });
    fetchPhotoUrl(photoId).then(
      (result) => {
        url = result;
        if (!cancelled) setState({ url: result, loading: false });
      },
      () => {
        if (!cancelled) setState({ url: null, loading: false });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);

  const isBukti = variant === "bukti";
  let content: React.ReactNode;
  if (!photoId) content = isBukti ? "Tidak ada foto bukti" : "Tidak ada foto";
  else if (state.loading) content = "Memuat...";
  else if (!state.url) content = "Foto sudah dihapus (lebih dari 90 hari)";
  else if (isBukti) {
    content = (
      <a href={state.url} target="_blank" rel="noreferrer" className="block h-full w-full" title="Buka ukuran penuh">
        <img src={state.url} alt="Foto bukti alasan terlambat" className="h-full w-full object-contain" />
      </a>
    );
  } else {
    content = <img src={state.url} alt={`Selfie ${label.toLowerCase()}`} className="h-full w-full object-cover" />;
  }

  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-bold text-neutral-700">{label}</figcaption>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 text-center text-xs text-neutral-500 ${
          isBukti ? "aspect-[4/3]" : "aspect-[3/4] p-2"
        }`}
      >
        {content}
      </div>
    </figure>
  );
}

export interface LatePhotoDialogProps {
  name: string;
  masukAt: number;
  lateReason: string | null;
  latePhotoId: string | null;
  onClose: () => void;
}

/** Pop-up admin: alasan + foto bukti clock in terlambat satu karyawan. */
export function LatePhotoDialog({ name, masukAt, lateReason, latePhotoId, onClose }: LatePhotoDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto bukti ${name}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-8 backdrop-blur-xs sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-3xl border border-amber-100 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">{name}</h3>
          <p className="text-xs font-semibold text-orange-700">{formatTerlambat(masukAt) ?? "Clock in"}</p>
        </div>
        {lateReason && (
          <p className="break-words rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-900">
            Alasan: {lateReason}
          </p>
        )}
        <ShiftPhoto label="Foto bukti" photoId={latePhotoId} variant="bukti" />
        <Button variant="primary" className="w-full" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
