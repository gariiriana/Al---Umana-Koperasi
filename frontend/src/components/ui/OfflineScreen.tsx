import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OfflineScreenProps {
  onRetry?: () => void;
}

export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-[#111827] via-[#1c1005] to-[#78350F]/90 text-white px-4">
      {/* Background soft glow */}
      <div className="absolute w-72 h-72 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none animate-pulse" />

      <div className="relative z-10 w-full max-w-md text-center">
        {/* Brand Logo */}
        <img
          src="/logo.png"
          alt="Al-Umanaa"
          className="h-16 mx-auto object-contain mb-8 opacity-90"
        />

        {/* Offline Icon with Pulsing border */}
        <div className="relative inline-flex items-center justify-center p-6 bg-red-500/10 border border-red-500/20 rounded-full mb-6">
          {/* Animated red rings */}
          <div className="absolute inset-0 rounded-full border border-red-500/30 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
          <WifiOff className="w-12 h-12 text-red-400" />
        </div>

        {/* Texts */}
        <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white tracking-wide">
          Koneksi Internet Terputus
        </h2>
        
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300 mt-3 leading-relaxed max-w-sm mx-auto">
          Perangkat Anda tidak terhubung ke jaringan. Silakan periksa koneksi Wi-Fi atau data seluler Anda untuk melanjutkan.
        </p>

        {/* Retry Button */}
        <Button
          variant="primary"
          onClick={handleRetry}
          className="mt-8 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 font-semibold flex items-center justify-center gap-2 mx-auto"
        >
          <RefreshCw className="w-4 h-4 animate-[spin_3s_linear_infinite]" />
          Coba Hubungkan Kembali
        </Button>

        {/* Note */}
        <p className="text-xs text-neutral-500 mt-6 font-['Hanken_Grotesk']">
          Sistem akan memuat halaman secara otomatis setelah koneksi pulih.
        </p>
      </div>
    </div>
  );
}

export default OfflineScreen;
