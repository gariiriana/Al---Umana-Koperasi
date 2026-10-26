import { useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { applyAppUpdate, isAppUpdateReady, onAppUpdateChange } from "@/services/appUpdate";

/**
 * Muncul setelah ada deploy baru dan tetap tampil sampai "Perbarui" ditekan; versi baru baru
 * aktif setelah itu. Sengaja tidak menutupi layar: isian yang belum tersimpan bisa disimpan
 * dulu. Posisinya sama dengan OfflineBanner, di atas navigasi bawah HP.
 */
export function AppUpdatePrompt() {
  const ready = useSyncExternalStore(onAppUpdateChange, isAppUpdateReady);
  const [applying, setApplying] = useState(false);
  if (!ready) return null;

  const update = () => {
    setApplying(true);
    void applyAppUpdate();
  };

  return (
    <div role="alertdialog" aria-labelledby="app-update-title" aria-describedby="app-update-desc"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[10000] flex justify-center px-4 lg:bottom-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-[#111827] p-4 text-white shadow-2xl">
        <RefreshCw className="h-5 w-5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p id="app-update-title" className="text-sm font-bold">Versi baru aplikasi tersedia</p>
          <p id="app-update-desc" className="text-xs text-white/70">Simpan dulu isian yang belum tersimpan, lalu tekan Perbarui.</p>
        </div>
        <button type="button" onClick={update} disabled={applying}
          className="shrink-0 rounded-xl bg-[#FBBF24] px-4 py-2.5 text-sm font-extrabold text-[#111827] disabled:opacity-70">
          {applying ? "Memperbarui…" : "Perbarui"}
        </button>
      </div>
    </div>
  );
}

export default AppUpdatePrompt;
