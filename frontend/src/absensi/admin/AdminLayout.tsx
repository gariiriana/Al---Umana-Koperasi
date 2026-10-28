import { useState } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";

import { AreaTab } from "@/absensi/admin/AreaTab";
import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { KaryawanTab } from "@/absensi/admin/KaryawanTab";
import { PersetujuanTab } from "@/absensi/admin/PersetujuanTab";
import { RekapTab } from "@/absensi/admin/RekapTab";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { LogoutConfirmModal } from "@/absensi/components/LogoutConfirmModal";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { Button } from "@/components/ui/Button";

const TABS = [
  { id: "hari-ini", label: "Hari ini" },
  { id: "persetujuan", label: "Persetujuan" },
  { id: "rekap", label: "Rekap" },
  { id: "karyawan", label: "Karyawan" },
  { id: "area", label: "Area" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const isTab = (value: string | undefined): value is TabId => TABS.some((tab) => tab.id === value);

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case "hari-ini":
      return <HariIniTab />;
    case "persetujuan":
      return <PersetujuanTab />;
    case "karyawan":
      return <KaryawanTab />;
    case "area":
      return <AreaTab />;
    case "rekap":
      return <RekapTab />;
  }
}

/** Halaman admin absensi dengan palet mayoritas putih + khas kuning di /absensi/admin/:tab. */
export function AdminLayout() {
  const { tab } = useParams();
  const { me, signOut } = useAbsensiSession();
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!isTab(tab)) return <Navigate to="/absensi/admin/hari-ini" replace />;

  const pendingCount = me?.pendingRequests ?? 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      {/* Header Kuning Khas Seragam */}
      <div className="relative overflow-hidden rounded-b-[2.25rem] bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-4 pb-16 pt-7 shadow-xs">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/20" />
        <header className="relative mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/95 font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-800 shadow-xs">
              {(me?.name ?? "AD").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="inline-block rounded-full bg-white/75 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-amber-950 uppercase">
                Admin Absensi
              </span>
              <h1 className="mt-0.5 truncate font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-neutral-900 sm:text-2xl">
                {me?.name}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <NotificationBellButton variant="header" />
            <Button
              variant="outlined"
              size="sm"
              className="!border-neutral-900/20 !bg-white/90 !text-neutral-900 hover:!bg-white"
              onClick={() => setConfirmLogout(true)}
            >
              Keluar
            </Button>
          </div>
        </header>
      </div>

      {/* Konten Utama */}
      <div className="relative z-10 mx-auto -mt-8 w-full max-w-4xl space-y-5 px-4">
        <nav className="flex gap-1.5 overflow-x-auto rounded-2xl border border-amber-100 bg-white p-1.5 shadow-md">
          {TABS.map((item) => (
            <NavLink
              key={item.id}
              to={`/absensi/admin/${item.id}`}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-neutral-900 shadow-2xs"
                    : "text-neutral-600 hover:bg-amber-50 hover:text-neutral-900"
                }`
              }
            >
              <span>{item.label}</span>
              {item.id === "persetujuan" && pendingCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-extrabold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <TabContent tab={tab} />
      </div>

      <LogoutConfirmModal
        open={confirmLogout}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void signOut();
        }}
      />
    </div>
  );
}
