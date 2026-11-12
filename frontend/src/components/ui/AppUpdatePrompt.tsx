import { useEffect, useRef, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { applyAppUpdate, dismissAppUpdate, getAppUpdateStatus, onAppUpdateChange } from "@/services/appUpdate";

/**
 * Muncul setelah ada deploy baru dan menutup seluruh layar sampai "Perbarui" ditekan; versi
 * baru baru aktif setelah itu. Sengaja tidak bisa ditutup (tanpa tombol tutup, Escape, atau klik
 * latar), supaya semua HP pindah ke versi terbaru. Di atas semua modal; hanya toast yang lebih tinggi.
 * Hanya bila versi baru tertunda setelah Perbarui ditekan, pengguna boleh lanjut dulu.
 */
export function AppUpdatePrompt() {
  const status = useSyncExternalStore(onAppUpdateChange, getAppUpdateStatus);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const visible = status === "ready" || status === "applying" || status === "stuck";
  const applying = status === "applying";
  const stuck = status === "stuck";

  useEffect(() => {
    if (!visible) return;
    buttonRef.current?.focus();
    // Tab di keyboard laptop tidak boleh membawa fokus ke halaman di balik latar gelap.
    const keepFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const buttons = Array.from(dialogRef.current?.querySelectorAll("button") ?? []);
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = buttons[(at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length] ?? buttonRef.current;
      next?.focus();
    };
    document.addEventListener("keydown", keepFocus, true);
    return () => document.removeEventListener("keydown", keepFocus, true);
  }, [visible, stuck]);

  if (!visible) return null;

  const update = () => {
    void applyAppUpdate();
  };

  return (
    <div data-testid="app-update-backdrop"
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby="app-update-desc"
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FEF3C7]">
          <RefreshCw className={`h-7 w-7 text-[#D97706] ${applying ? "animate-spin" : ""}`} aria-hidden="true" />
        </div>
        <p id="app-update-title" className="text-lg font-extrabold text-[#111827]">
          {stuck ? "Pembaruan tertunda" : "Versi baru aplikasi tersedia"}
        </p>
        <p id="app-update-desc" className="mt-1 text-sm text-[#6B7280]">
          {stuck
            ? "Versi baru belum bisa dipasang karena aplikasi masih tersambung. Tutup aplikasi sepenuhnya (keluarkan dari daftar aplikasi yang terbuka), tunggu sebentar, lalu buka lagi."
            : "Tekan Perbarui untuk memakai versi terbaru. Aplikasi akan dimuat ulang sebentar."}
        </p>
        <button ref={buttonRef} type="button" onClick={update} disabled={applying}
          className="mt-5 w-full rounded-2xl bg-[#FBBF24] px-4 py-3 text-base font-extrabold text-[#111827] shadow-sm transition-colors hover:bg-[#F59E0B] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FDE68A] disabled:opacity-70">
          {applying ? "Memperbarui…" : stuck ? "Coba lagi" : "Perbarui"}
        </button>
        {stuck && (
          <button type="button" onClick={dismissAppUpdate}
            className="mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold text-[#6B7280] transition-colors hover:bg-[#F3F4F6] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E5E7EB]">
            Lanjutkan dulu
          </button>
        )}
      </div>
    </div>
  );
}

export default AppUpdatePrompt;
