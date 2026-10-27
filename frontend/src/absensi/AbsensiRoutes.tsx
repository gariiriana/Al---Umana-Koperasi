import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "@/absensi/admin/AdminLayout";
import { AbsensiSessionProvider, useAbsensiSession } from "@/absensi/AbsensiSession";
import { AbsensiLoginPage } from "@/absensi/pages/AbsensiLoginPage";
import { AktivasiPage } from "@/absensi/pages/AktivasiPage";
import { BerandaPage } from "@/absensi/pages/BerandaPage";
import { messageFor } from "@/absensi/messages";
import type { AbsensiRole } from "@/absensi/types";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

function AbsensiScreen({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111827] px-4">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white">{title}</h1>
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300">{message}</p>
        {children}
      </div>
    </div>
  );
}

/** Butuh sesi Absensi (dan role tertentu kalau diisi); tanpa sesi → /absensi/login. */
function RequireAbsensi({ role, children }: { role?: AbsensiRole; children: ReactNode }) {
  const { user, me, loading, error, reloadMe, signOut } = useAbsensiSession();
  if (loading) return <LoadingScreen message="Memuat..." />;
  if (!user) return <Navigate to="/absensi/login" replace />;
  if (!me) {
    return (
      <AbsensiScreen title="Absensi" message={messageFor(error)}>
        <div className="flex justify-center gap-2">
          <Button variant="primary" onClick={() => void reloadMe()}>Coba lagi</Button>
          <Button variant="secondary" onClick={() => void signOut()}>Keluar</Button>
        </div>
      </AbsensiScreen>
    );
  }
  if (role && me.role !== role) return <Navigate to="/absensi" replace />;
  return <>{children}</>;
}

function AbsensiHome() {
  const { me } = useAbsensiSession();
  if (me?.role === "admin_absensi") return <Navigate to="/absensi/admin/hari-ini" replace />;
  if (me && !me.activated) return <Navigate to="/absensi/aktivasi" replace />;
  return <BerandaPage />;
}

/** Semua rute /absensi/*; sesinya terpisah dari AuthContext KASMA JOB. */
export function AbsensiRoutes() {
  return (
    <AbsensiSessionProvider>
      <Routes>
        <Route path="login" element={<AbsensiLoginPage />} />
        <Route index element={<RequireAbsensi><AbsensiHome /></RequireAbsensi>} />
        <Route
          path="aktivasi"
          element={<RequireAbsensi role="absen_karyawan"><AktivasiPage /></RequireAbsensi>}
        />
        <Route path="admin" element={<Navigate to="/absensi/admin/hari-ini" replace />} />
        <Route
          path="admin/:tab"
          element={<RequireAbsensi role="admin_absensi"><AdminLayout /></RequireAbsensi>}
        />
        <Route path="*" element={<Navigate to="/absensi" replace />} />
      </Routes>
    </AbsensiSessionProvider>
  );
}

export default AbsensiRoutes;
