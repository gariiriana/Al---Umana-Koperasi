import { NavLink } from "react-router-dom";
import { ClipboardCheck, Home, User } from "lucide-react";

const ITEMS = [
  { to: "/absensi", end: true, label: "Beranda", Icon: Home },
  { to: "/absensi/persetujuan", end: false, label: "Persetujuan", Icon: ClipboardCheck },
  { to: "/absensi/profil", end: false, label: "Profil", Icon: User },
] as const;

/** Navigasi bawah karyawan seperti referensi SS 1 dengan palet putih-kuning. */
export function EmployeeBottomNav() {
  return (
    <nav
      aria-label="Navigasi utama absensi"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200/70 bg-white/95 shadow-[0_-6px_24px_-8px_rgba(17,24,39,0.08)] backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 px-2 py-1.5">
        {ITEMS.map(({ to, end, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold transition-colors ${
                isActive
                  ? "bg-amber-100/80 text-amber-900"
                  : "text-neutral-500 hover:text-neutral-800"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-5 w-5 ${isActive ? "text-amber-600" : "text-neutral-400"}`} aria-hidden="true" />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

