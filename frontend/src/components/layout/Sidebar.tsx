import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { motion } from "motion/react";
import { ROLE_PERMISSIONS, ROLE_DEFAULT_REDIRECT } from "@/constants/roles";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Calendar,
  CheckCircle2,
  ChevronUp,
  Factory,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Package2,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const SIDEBAR_NAV_ITEMS: readonly NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/invoices", label: "Catatan", icon: FileText },
  { to: "/admin/production", label: "Production", icon: Factory },
  { to: "/admin/qc", label: "Quality Control", icon: CheckCircle2 },
  { to: "/distribusi/scheduler", label: "Delivery Scheduler", icon: Calendar },
  { to: "/distribusi/dispatch", label: "Dispatch", icon: Truck },
  { to: "/distribusi/delivery", label: "Delivery", icon: Package },
  { to: "/admin/products", label: "Daftar Produk", icon: Package2 },
] as const;

const LABELS_DICT = {
  id: {
    "/admin/dashboard": "Dasbor",
    "/admin/orders": "Pesanan",
    "/admin/invoices": "Catatan",
    "/admin/production": "Produksi",
    "/admin/qc": "Kontrol Kualitas",
    "/distribusi/scheduler": "Penjadwal Pengiriman",
    "/distribusi/dispatch": "Pengiriman",
    "/distribusi/delivery": "Pengantaran",
    "/admin/products": "Daftar Produk",
  },
  en: {
    "/admin/dashboard": "Dashboard",
    "/admin/orders": "Orders",
    "/admin/invoices": "Notes",
    "/admin/production": "Production",
    "/admin/qc": "Quality Control",
    "/distribusi/scheduler": "Delivery Scheduler",
    "/distribusi/dispatch": "Dispatch",
    "/distribusi/delivery": "Delivery",
    "/admin/products": "Product List",
  }
} as const;

export interface SidebarProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userPhotoUrl?: string;
  onSignOut?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}


const ITEM_BASE =
  "flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

const ITEM_ACTIVE = "bg-[#FBBF24] text-[#111827]";
const ITEM_INACTIVE = "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]";

const roleBadge: Record<string, string> = {
  admin: "Admin",
  tim_produksi: "Produksi",
  distribusi: "Distribusi",
  monitoring: "Monitor",
  kurir: "Kurir",
};

export function Sidebar({
  userName,
  userEmail,
  userRole,
  userPhotoUrl,
  onSignOut,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari pesanan, kurir...",
}: SidebarProps) {
  const { lang } = useLanguage();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const allowedItems = SIDEBAR_NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    if (userRole === "admin") return true;
    const allowedPaths = ROLE_PERMISSIONS[userRole] || [];
    return allowedPaths.includes(item.to);
  });

  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();

  return (
    <aside
      aria-label="Primary navigation"
      className="hidden md:flex md:w-60 md:flex-col md:shrink-0 bg-white border-r border-[#E5E7EB] h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <Link to={userRole ? (ROLE_DEFAULT_REDIRECT[userRole] ?? "/") : "/"}>
          <img
            src="/logo.png"
            alt="Pondok Pesantren Modern Al Umanaa"
            className="h-14 object-contain cursor-pointer hover:opacity-90 transition-opacity"
          />
        </Link>
      </div>

      {/* Search Input (Desktop) */}
      {onSearchChange && (
        <div className="px-4 py-3 border-b border-[#E5E7EB]">
          <label className="relative block">
            <span className="sr-only">Cari</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-full border border-[#E5E7EB] bg-[#F9FAFB] pl-9 pr-4 py-1.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent font-['Hanken_Grotesk',system-ui,sans-serif] transition"
            />
          </label>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {allowedItems.map(({ to, label, icon: Icon }) => {
            let translatedLabel: string = LABELS_DICT[lang][to as keyof typeof LABELS_DICT["en"]] || label;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_INACTIVE}`
                  }
                >
                  {({ isActive }) => (
                    <motion.span
                      className="flex items-center gap-3 w-full"
                      whileHover={{ x: isActive ? 0 : 2 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{translatedLabel}</span>
                    </motion.span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Profile Section at the Bottom */}
      {(userName || userEmail) && (
        <div className="relative p-4 border-t border-[#E5E7EB] bg-white">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center gap-3 p-1.5 rounded-xl hover:bg-[#F3F4F6] transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
          >
            <div className="h-9 w-9 rounded-full bg-[#FBBF24] flex items-center justify-center text-sm font-bold text-[#111827] shrink-0 overflow-hidden">
              {userPhotoUrl ? (
                <img src={userPhotoUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#111827] truncate">{userName || userEmail || "Pengguna"}</p>
              {userRole && (
                <span className="inline-block text-[10px] font-bold bg-[#F3F4F6] text-[#6B7280] rounded-full px-2 py-0.5 mt-0.5">
                  {roleBadge[userRole] ?? userRole}
                </span>
              )}
            </div>
            <ChevronUp className="h-4 w-4 text-[#9CA3AF] shrink-0" />
          </button>

          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute bottom-full left-4 right-4 mb-2 rounded-2xl bg-white border border-[#E5E7EB] shadow-xl py-2 z-50 font-['Hanken_Grotesk',system-ui,sans-serif]">
                <div className="px-4 py-3 border-b border-[#F3F4F6]">
                  <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">
                    {lang === "id" ? "Akun Saya" : "My Account"}
                  </p>
                  <p className="text-sm font-bold text-[#111827] truncate">{userName}</p>
                  {userEmail && <p className="text-xs text-[#6B7280] truncate">{userEmail}</p>}
                </div>
                <Link
                  to="/admin/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors border-b border-[#F3F4F6]"
                >
                  <Settings className="h-4 w-4 text-[#6B7280]" />
                  <span>{lang === "id" ? "Pengaturan" : "Settings"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onSignOut?.();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#DC2626] hover:bg-red-50 transition-colors text-left cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  {lang === "id" ? "Keluar" : "Sign Out"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
