import { useState } from "react";
import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
  fullscreen?: boolean;
}

export function LoadingScreen({ message = "Memuat data...", fullscreen = true }: LoadingScreenProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#111827] via-[#1c1005] to-[#78350F]/80 text-white ${
        fullscreen ? "fixed inset-0 z-50 min-h-screen" : "w-full py-12 rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md"
      }`}
    >
      {/* Outer ambient glow */}
      <div className="absolute w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none animate-pulse" />

      {/* Decorative spinning ring */}
      <div className="relative flex items-center justify-center">
        {/* Animated outer dashed ring */}
        <div className="absolute w-20 h-20 border-2 border-dashed border-amber-400/30 rounded-full animate-[spin_10s_linear_infinite]" />
        
        {/* Inner solid spinning ring */}
        <div className="absolute w-16 h-16 border-2 border-t-amber-400 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />

        {/* Center Logo/Icon Container */}
        <div className="relative w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          {!imgError ? (
            <img
              src="/logo.png"
              alt="Al-Umanaa"
              className="w-8 h-8 object-contain animate-[pulse_2s_infinite]"
              onError={() => setImgError(true)}
            />
          ) : (
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Loading Texts */}
      <div className="mt-8 text-center px-4 relative z-10">
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold tracking-wide text-amber-200">
          Koperasi Al-Umanaa
        </h3>
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300 mt-2 tracking-wide animate-pulse">
          {message}
        </p>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}

export default LoadingScreen;
