import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ChevronRight, Fingerprint, ShoppingBag } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useAbsensiAuthUser } from "@/absensi/authUser";
import { ROLE_DEFAULT_REDIRECT } from "@/constants/roles";
import { HoneycombBackdrop } from "@/components/layout/HoneycombBackdrop";

interface DoorProps {
  to: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** "Lanjut sebagai …" when this door already has a session on this device. */
  continueAs: string | null;
}

function Door({ to, icon, title, subtitle, continueAs }: DoorProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">{title}</span>
        <span className="block font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300">{subtitle}</span>
        {continueAs && (
          <span className="mt-1 block truncate font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-amber-300">
            {continueAs}
          </span>
        )}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
    </Link>
  );
}

/** Pintu masuk aplikasi: pilih KASMA JOB (akun kerja) atau Absensi (clock in/out). */
export function MasukPage() {
  const { profile } = useAuth();
  const { user: absensiUser } = useAbsensiAuthUser();

  const absensiName = absensiUser ? absensiUser.displayName || absensiUser.email : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0E2E24] px-4 py-8">
      <HoneycombBackdrop />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-[#FCE7A6]/12 bg-[#0A231B]/75 p-4 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-md sm:p-8">
          <div className="mb-6 text-center">
            <img
              src="/logo-mark.png?v=2"
              alt="Pondok Pesantren Modern Al Umanaa"
              className="mx-auto h-20 object-contain drop-shadow-md"
            />
            <h1 className="mt-3 font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white">Mau masuk ke mana?</h1>
          </div>

          <div className="space-y-3">
            <Door
              to={profile ? ROLE_DEFAULT_REDIRECT[profile.role] ?? "/" : "/login"}
              icon={<Briefcase className="h-6 w-6" aria-hidden="true" />}
              title="KASMA JOB"
              subtitle="Masuk ke sistem kerja"
              continueAs={profile ? `Lanjut sebagai ${profile.displayName}` : null}
            />
            <Door
              to={absensiUser ? "/absensi" : "/absensi/login"}
              icon={<Fingerprint className="h-6 w-6" aria-hidden="true" />}
              title="Absensi"
              subtitle="Clock in & clock out karyawan"
              continueAs={absensiName ? `Lanjut sebagai ${absensiName}` : null}
            />
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-amber-300 hover:text-amber-400 hover:underline"
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
              Belanja di toko
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
