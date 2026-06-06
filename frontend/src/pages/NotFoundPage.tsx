import { Link } from "react-router-dom";
import { ArrowLeft, Home, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#111827] via-[#1c1005] to-[#78350F]/80 text-white px-4 overflow-hidden">
      
      {/* Background patterns */}
      <div className="absolute w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] -top-40 -left-40 pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[120px] -bottom-40 -right-40 pointer-events-none" />

      {/* Decorative center icon glowing shadow */}
      <div className="absolute w-72 h-72 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md text-center">
        {/* Brand Logo */}
        <img
          src="/logo.png"
          alt="Al-Umanaa"
          className="h-16 mx-auto object-contain mb-8 drop-shadow-md"
        />

        {/* 404 Figure */}
        <div className="relative inline-block mb-4">
          <h1 className="font-['Manrope',system-ui,sans-serif] text-8xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 drop-shadow-[0_4px_10px_rgba(245,158,11,0.3)]">
            404
          </h1>
          <div className="absolute -right-4 -top-2 bg-amber-500/20 text-amber-300 text-xs border border-amber-500/40 rounded-full px-2 py-0.5 backdrop-blur-md flex items-center gap-1 font-semibold">
            <FileQuestion className="w-3.5 h-3.5" /> NOT FOUND
          </div>
        </div>

        {/* Informational Texts */}
        <h2 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-white tracking-wide">
          Halaman Tidak Ditemukan
        </h2>
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-300 mt-3 text-sm leading-relaxed max-w-sm mx-auto">
          Maaf, halaman yang Anda tuju tidak tersedia, telah dihapus, atau sedang dalam pemeliharaan.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            variant="outlined"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto border-white/20 hover:border-amber-400/50 hover:bg-amber-400/10 text-white font-semibold flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4 text-amber-300" />
            Kembali
          </Button>

          <Link to="/" className="w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all font-semibold flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Ke Beranda
            </Button>
          </Link>
        </div>

        {/* Footer info */}
        <div className="mt-12 text-xs text-neutral-500 font-['Hanken_Grotesk']">
          © {new Date().getFullYear()} Koperasi Pondok Pesantren Modern Al-Umanaa
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
