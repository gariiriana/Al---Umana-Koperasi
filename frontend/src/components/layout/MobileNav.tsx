import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { MOBILE_SHORT_LABELS, mobileTabsForRole } from "./navItems";

export interface MobileNavProps {
  userRole?: string;
  /** Membuka menu lengkap (drawer sidebar) untuk menu yang tidak muat di tab. */
  onOpenMenu?: () => void;
}

const TAB =
  "flex flex-col items-center justify-center gap-0.5 w-full min-h-[52px] rounded-2xl px-1 " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-semibold leading-tight " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] transition-colors";

/**
 * Navigasi bawah HP (di bawah md) — jangkauan jempol, seperti aplikasi.
 * Menu diambil dari daftar yang sama dengan sidebar desktop.
 */
export function MobileNav({ userRole, onOpenMenu }: MobileNavProps) {
  const { tabs, hasMore } = mobileTabsForRole(userRole);
  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Navigasi utama"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E7EB] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
    >
      <ul className="flex items-stretch justify-around gap-0.5 px-1.5 py-1">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1 min-w-0">
            <NavLink to={to} end={to === "/admin/orders" || to === "/admin/production"} className={({ isActive }) => `${TAB} ${isActive ? "text-[#111827]" : "text-[#6B7280]"}`}>
              {({ isActive }) => (
                <>
                  <span className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FBBF24]" : ""}`}>
                    <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate">{MOBILE_SHORT_LABELS[to] ?? label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        {hasMore && (
          <li className="flex-1 min-w-0">
            <button type="button" onClick={onOpenMenu} className={`${TAB} text-[#6B7280]`} aria-label="Menu lainnya">
              <span className="inline-flex h-7 w-12 items-center justify-center rounded-full">
                <Menu className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <span>Lainnya</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

export default MobileNav;
