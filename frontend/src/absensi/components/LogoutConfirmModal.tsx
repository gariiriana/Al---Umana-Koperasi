import { LogOut } from "lucide-react";

export interface LogoutConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Pop-up konfirmasi sebelum keluar (logout) dari akun Absensi. */
export function LogoutConfirmModal({ open, onCancel, onConfirm }: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi Keluar"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-amber-100 bg-white p-6 text-center shadow-2xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <LogOut className="h-7 w-7" aria-hidden="true" />
        </div>

        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Keluar dari Akun?
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Apakah Anda yakin ingin keluar dari akun Absensi saat ini?
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-xs font-extrabold text-neutral-700 transition hover:bg-neutral-200 sm:text-sm"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-rose-700 sm:text-sm"
          >
            Ya, Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

