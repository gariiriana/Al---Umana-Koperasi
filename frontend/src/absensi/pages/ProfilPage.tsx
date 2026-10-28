import { LogOut, MapPin, ShieldCheck, Smartphone } from "lucide-react";

import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { hasDeviceMarker } from "@/absensi/deviceMarker";
import { Button } from "@/components/ui/Button";

/** Halaman Profil karyawan dengan palet putih-kuning. */
export function ProfilPage() {
  const { me, signOut } = useAbsensiSession();
  if (!me) return null;

  const deviceRegistered = hasDeviceMarker(me.uid);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            Profil Saya
          </h1>
          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
        <section className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50/70 p-6 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400 font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-neutral-900 shadow-sm">
            {me.name.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="mt-3 font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            {me.name}
          </h2>
          <p className="text-xs font-medium text-neutral-500">{me.email}</p>
          <span className="mt-2.5 inline-block rounded-full bg-amber-400/90 px-3 py-0.5 text-[11px] font-extrabold text-neutral-900">
            Karyawan Absensi
          </span>
        </section>

        <section className="divide-y divide-neutral-100 rounded-3xl border border-neutral-200/80 bg-white px-5 py-2 shadow-xs">
          <div className="flex items-center gap-3 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Status Perangkat</p>
              <p className="text-sm font-bold text-neutral-900">
                {deviceRegistered ? "Perangkat ini terhubung" : "Passkey terdaftar di akun"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Metode Verifikasi</p>
              <p className="text-sm font-bold text-neutral-900">
                {me.faceRequired ? "Pencocokan Wajah + Biometrik HP" : "Foto Selfie + Biometrik HP"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Zona Kantor Aktif</p>
              <p className="text-sm font-bold text-neutral-900">
                {me.areas.length > 0 ? me.areas.map((a) => a.name).join(", ") : "Belum diatur"}
              </p>
            </div>
          </div>
        </section>

        <Button
          variant="outlined"
          className="w-full !border-rose-300 !text-rose-700 hover:!bg-rose-50"
          leftIcon={<LogOut className="h-4 w-4" />}
          onClick={() => void signOut()}
        >
          Keluar dari Akun
        </Button>
      </main>

      <EmployeeBottomNav />
    </div>
  );
}

