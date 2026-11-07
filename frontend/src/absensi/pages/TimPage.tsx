import { Navigate, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { getTeamApprovals, reviewTeamRequest, reviewTeamZone } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ApprovalBoard } from "@/absensi/components/ApprovalBoard";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";

/** Kepala unit: setujui / tolak cuti, pergantian shift, dan absen luar zona anggota unitnya. */
export function TimPage() {
  const navigate = useNavigate();
  const { me, reloadMe } = useAbsensiSession();
  const units = me?.headOf ?? [];
  if (me && units.length === 0) return <Navigate to="/absensi" replace />;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <button
            type="button"
            aria-label="Kembali"
            onClick={() => navigate("/absensi")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            Persetujuan Tim
          </h1>
          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          Kamu kepala unit <strong>{units.map((u) => u.name).join(", ")}</strong>. Pengajuan & absen luar zona anggota
          unit ini bisa kamu setujui, admin absensi juga bisa.
        </p>
        <ApprovalBoard
          title="Menunggu Persetujuan"
          subtitle="Tidak ada pengajuan anggota tim yang tertunda"
          load={getTeamApprovals}
          reviewRequest={reviewTeamRequest}
          reviewZone={reviewTeamZone}
          photoScope="tim"
          onChanged={reloadMe}
        />
      </main>

      <EmployeeBottomNav />
    </div>
  );
}
