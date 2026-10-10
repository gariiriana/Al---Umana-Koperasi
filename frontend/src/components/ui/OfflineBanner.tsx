import { WifiOff } from "lucide-react";

/**
 * Pemberitahuan koneksi terputus. Sengaja hanya pil kecil (bukan layar pengganti):
 * aplikasi tetap terpasang sehingga isian form yang belum disubmit tidak hilang,
 * dan Firestore otomatis menyinkronkan perubahan setelah koneksi pulih.
 * Posisinya di bawah (di atas navigasi bawah HP) supaya tidak menutupi header,
 * dan tembus klik supaya tidak pernah menghalangi tombol di belakangnya.
 */
export function OfflineBanner() {
  return (
    <div role="status" aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[9999] flex justify-center px-4 lg:bottom-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div className="flex max-w-md items-center gap-2 rounded-full bg-[#111827]/95 px-4 py-2 text-xs sm:text-sm text-white shadow-lg">
        <WifiOff className="h-4 w-4 shrink-0 text-[#FBBF24]" aria-hidden="true" />
        <span><b>Offline.</b> Isian tetap aman, tersinkron otomatis saat online.</span>
      </div>
    </div>
  );
}

export default OfflineBanner;
