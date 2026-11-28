import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarCheck, CalendarOff, ChartColumn, ChevronLeft, ClipboardCheck, type LucideIcon } from "lucide-react";

import {
  getTeamApprovals, listEmployees, reviewTeamLateOut, reviewTeamRequest, reviewTeamSilah, reviewTeamZone,
} from "@/absensi/api";
import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { RekapTab } from "@/absensi/admin/RekapTab";
import { AbsensiScopeContext } from "@/absensi/admin/scope";
import { SilahPanel } from "@/absensi/admin/SilahPanel";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ApprovalBoard } from "@/absensi/components/ApprovalBoard";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { errorMessage } from "@/absensi/errorMessage";
import { canApproveTeam, hasTeamAccess } from "@/absensi/teamAccess";
import type { EmployeeView } from "@/absensi/types";

type TabId = "persetujuan" | "hari-ini" | "rekap" | "silah";

const TABS: Array<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "persetujuan", label: "Persetujuan", Icon: ClipboardCheck },
  { id: "hari-ini", label: "Hari Ini", Icon: CalendarCheck },
  { id: "rekap", label: "Rekap", Icon: ChartColumn },
  { id: "silah", label: "Silah", Icon: CalendarOff },
];

/** Jadwal Silah anggota tim. Silah kepala unit sendiri tetap diatur admin. */
function TimSilahTab({ selfUid }: { selfUid: string }) {
  const [employees, setEmployees] = useState<EmployeeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEmployees((await listEmployees("tim")).employees);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>;
  if (!employees) return <p className="text-sm text-neutral-500">Memuat jadwal Silah…</p>;
  return <SilahPanel employees={employees} onChanged={load} lockedUid={selfUid} />;
}

/**
 * Halaman Tim kepala unit: Persetujuan (anggota unit yang dikepalai), Hari Ini, Rekap + export, foto absen, dan
 * jadwal Silah anggota tim. Yang diberi izin "lihat semua unit" oleh admin melihat semua karyawan di
 * Hari Ini / Rekap / Silah. Data disaring di Worker (/tim/*), layar hanya menampilkan.
 */
export function TimPage() {
  const navigate = useNavigate();
  const { me, reloadMe } = useAbsensiSession();
  const [params, setParams] = useSearchParams();
  if (me && !hasTeamAccess(me)) return <Navigate to="/absensi" replace />;

  const units = me?.headOf ?? [];
  const approver = canApproveTeam(me);
  const tabs = TABS.filter((t) => t.id !== "persetujuan" || approver);
  const requested = params.get("tab") as TabId | null;
  const tab: TabId = tabs.some((t) => t.id === requested) ? (requested as TabId) : tabs[0].id;
  const wide = tab === "hari-ini" || tab === "rekap";
  const scopeLabel = me?.viewAllUnits ? "semua unit" : `unit ${units.map((u) => u.name).join(", ")}`;

  return (
    <div className="min-h-screen bg-transparent pb-28 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
        <div className={`mx-auto flex h-14 items-center justify-between px-4 ${wide ? "max-w-5xl" : "max-w-md"}`}>
          <button
            type="button"
            aria-label="Kembali"
            onClick={() => navigate("/absensi")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">Tim Saya</h1>
          <NotificationBellButton variant="plain" />
        </div>
        {/* Kolom sama lebar (ikon di atas label) supaya 4 tab muat di layar HP tanpa geser. */}
        <nav
          aria-label="Menu tim"
          className={`mx-auto grid gap-1.5 px-4 pb-2 ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"} ${wide ? "max-w-5xl" : "max-w-md"}`}
        >
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setParams({ tab: id }, { replace: true })}
              className={`relative flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-extrabold transition ${
                tab === id ? "bg-amber-400 text-neutral-900 shadow-xs" : "bg-neutral-100 text-neutral-600 hover:bg-amber-50"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
              {id === "persetujuan" && (me?.teamPending ?? 0) > 0 && (
                <span className="absolute right-1 top-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] leading-4 text-white">
                  {me?.teamPending}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className={`mx-auto w-full space-y-4 px-4 pt-4 ${wide ? "max-w-5xl" : "max-w-md"}`}>
        {tab === "persetujuan" ? (
          <>
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
              reviewSilah={reviewTeamSilah}
              reviewLateOut={reviewTeamLateOut}
              photoScope="tim"
              onChanged={reloadMe}
            />
          </>
        ) : (
          <AbsensiScopeContext.Provider value="tim">
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
              Menampilkan karyawan <strong>{scopeLabel}</strong>.
            </p>
            {tab === "hari-ini" && <HariIniTab />}
            {tab === "rekap" && <RekapTab />}
            {tab === "silah" && me && <TimSilahTab selfUid={me.uid} />}
          </AbsensiScopeContext.Provider>
        )}
      </main>

      <EmployeeBottomNav />
    </div>
  );
}
