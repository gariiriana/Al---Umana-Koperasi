import { Navigate, NavLink, useParams } from "react-router-dom";

import { AreaTab } from "@/absensi/admin/AreaTab";
import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { KaryawanTab } from "@/absensi/admin/KaryawanTab";
import { RekapTab } from "@/absensi/admin/RekapTab";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { Button } from "@/components/ui/Button";

const TABS = [
  { id: "hari-ini", label: "Hari ini" },
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
    case "karyawan":
      return <KaryawanTab />;
    case "area":
      return <AreaTab />;
    case "rekap":
      return <RekapTab />;
  }
}

/** Halaman admin absensi dengan tab di /absensi/admin/:tab. */
export function AdminLayout() {
  const { tab } = useParams();
  const { me, signOut } = useAbsensiSession();
  if (!isTab(tab)) return <Navigate to="/absensi/admin/hari-ini" replace />;

  return (
    <div className="min-h-screen bg-[#111827] px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-amber-300">Admin Absensi</p>
            <h1 className="truncate font-['Manrope',system-ui,sans-serif] text-2xl font-bold text-white">{me?.name}</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>Keluar</Button>
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-1">
          {TABS.map((item) => (
            <NavLink
              key={item.id}
              to={`/absensi/admin/${item.id}`}
              className={({ isActive }) =>
                `shrink-0 rounded-xl px-4 py-2 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-bold transition-colors ${
                  isActive ? "bg-amber-400 text-[#111827]" : "text-neutral-300 hover:bg-white/10"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <TabContent tab={tab} />
      </div>
    </div>
  );
}
