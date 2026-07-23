import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { motion } from "motion/react";
import { ROLE_PERMISSIONS, ROLE_DEFAULT_REDIRECT } from "@/constants/roles";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeOrders } from "@/services/realtimeService";
import { isOrderPastDeadline } from "@/lib/orderHelpers";
import {
  Calendar,
  ChevronUp,
  ClipboardCheck,
  Factory,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Package2,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  History,
  UtensilsCrossed,
  Warehouse,
  X,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";


interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const SIDEBAR_NAV_ITEMS: readonly NavItem[] = [
  // --- Catering ---
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/invoices", label: "Catatan", icon: FileText },
  { to: "/admin/production", label: "Production", icon: Factory },
  { to: "/admin/production/history", label: "Riwayat", icon: History },
  { to: "/distribusi/scheduler", label: "Delivery Scheduler", icon: Calendar },
  { to: "/distribusi/schedules", label: "Jadwal Distribusi", icon: Calendar },
  { to: "/distribusi/handover", label: "Handover", icon: Truck },
  { to: "/distribusi/delivery", label: "Delivery", icon: Package },
  { to: "/admin/products", label: "Daftar Produk", icon: Package2 },
  // --- MBG (Makan Bergizi Gratis) ---
  { to: "/mbg/orders", label: "Pesanan MBG", icon: ShoppingCart },
  { to: "/mbg/admin", label: "Admin MBG", icon: ClipboardCheck },
  { to: "/mbg/archive", label: "Arsip PM", icon: History },
  { to: "/mbg/reports", label: "Laporan MBG", icon: FileText },
  { to: "/mbg/production", label: "Produksi MBG", icon: UtensilsCrossed },
  { to: "/mbg/cooking", label: "Masak MBG", icon: Factory },
  { to: "/mbg/purchasing", label: "Purchasing MBG", icon: ShoppingBag },
  { to: "/mbg/purchasing/recap", label: "Laporan Belanja", icon: FileText },
  { to: "/mbg/suppliers", label: "Supplier MBG", icon: Warehouse },
  { to: "/mbg/distribution", label: "Distribusi MBG", icon: ClipboardCheck },
  { to: "/mbg/delivery", label: "Kurir MBG", icon: Truck },
] as const;

const LABELS_DICT = {
  id: {
    "/admin/dashboard": "Dasbor",
    "/admin/orders": "Pesanan",
    "/admin/invoices": "Catatan",
    "/admin/production": "Produksi",
    "/admin/production/history": "Riwayat",
    "/distribusi/scheduler": "Penjadwal Pengiriman",
    "/distribusi/schedules": "Jadwal Distribusi",
    "/distribusi/handover": "Handover",
    "/distribusi/delivery": "Pengantaran",
    "/admin/products": "Daftar Produk",
    // MBG
    "/mbg/orders": "Pesanan MBG",
    "/mbg/admin": "Admin MBG",
    "/mbg/archive": "Arsip PM",
    "/mbg/reports": "Laporan MBG",
    "/mbg/production": "Produksi MBG",
    "/mbg/cooking": "Masak MBG",
    "/mbg/purchasing": "Purchasing MBG",
    "/mbg/purchasing/recap": "Laporan Belanja",
    "/mbg/suppliers": "Supplier MBG",
    "/mbg/distribution": "Distribusi MBG",
    "/mbg/delivery": "Kurir MBG",
  },
  en: {
    "/admin/dashboard": "Dashboard",
    "/admin/orders": "Orders",
    "/admin/invoices": "Notes",
    "/admin/production": "Production",
    "/admin/production/history": "History",
    "/distribusi/scheduler": "Delivery Scheduler",
    "/distribusi/schedules": "Distribution Schedules",
    "/distribusi/handover": "Handover",
    "/distribusi/delivery": "Delivery",
    "/admin/products": "Product List",
    // MBG
    "/mbg/orders": "MBG Orders",
    "/mbg/admin": "MBG Admin",
    "/mbg/archive": "PM Archive",
    "/mbg/reports": "MBG Reports",
    "/mbg/production": "MBG Production",
    "/mbg/cooking": "MBG Cooking",
    "/mbg/purchasing": "MBG Purchasing",
    "/mbg/purchasing/recap": "Shopping Recap",
    "/mbg/suppliers": "MBG Suppliers",
    "/mbg/distribution": "MBG Distribution",
    "/mbg/delivery": "MBG Delivery",
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
  isMobileOpen?: boolean;
  onClose?: () => void;
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
  monitoring: "Monitoring",
  kurir: "Kurir",
  // MBG roles
  admin_mbg: "Admin MBG",
  produksi_mbg: "Produksi MBG",
  purchasing_mbg: "Purchasing MBG",
  distribusi_mbg: "Distribusi MBG",
  kurir_mbg: "Kurir MBG",
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
  isMobileOpen,
  onClose,
}: SidebarProps) {
  const { lang } = useLanguage();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasPastDeadlineOrders, setHasPastDeadlineOrders] = useState(false);

  useEffect(() => {
    if (!userRole) return;
    const isRelevantRole = ["admin", "tim_produksi", "distribusi", "monitoring", "kurir"].includes(userRole);
    if (!isRelevantRole) return;

    const unsubscribe = subscribeOrders(
      (orders) => {
        const anyPast = orders.some((o) => isOrderPastDeadline(o));
        setHasPastDeadlineOrders(anyPast);
      },
      (err) => {
        console.error("Sidebar orders subscription error:", err);
      }
    );

    return () => unsubscribe();
  }, [userRole]);

  const allowedItems = SIDEBAR_NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    if (userRole === "admin") return true;
    const allowedPaths = ROLE_PERMISSIONS[userRole] || [];
    return allowedPaths.includes(item.to);
  });

  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      <aside
        aria-label="Primary navigation"
        className={`
          fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-[#E5E7EB] h-screen flex flex-col shrink-0
          transition-transform duration-300 ease-in-out
          md:sticky md:top-0 md:translate-x-0
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-center relative">
          <Link to={userRole ? (ROLE_DEFAULT_REDIRECT[userRole] ?? "/") : "/"} onClick={() => onClose?.()}>
            <img
              src="/logo.png"
              alt="Pondok Pesantren Modern Al Umanaa"
              className="h-14 object-contain cursor-pointer hover:opacity-90 transition-opacity"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[#6B7280] hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
            title="Close Menu"
            aria-label="Close Menu"
          >
            <X className="h-5 w-5" />
          </button>
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
            const translatedLabel: string = LABELS_DICT[lang][to as keyof typeof LABELS_DICT["en"]] || label;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/mbg/purchasing"}
                  onClick={() => onClose?.()}
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
                      {hasPastDeadlineOrders &&
                        [
                          "/admin/orders",
                          "/admin/production",
                          "/distribusi/scheduler",
                          "/distribusi/handover",
                          "/distribusi/delivery"
                        ].includes(to) && (
                          <span title={lang === "id" ? "Ada pesanan terlewat deadline!" : "Catering order passed deadline!"} className="ml-auto shrink-0 flex items-center">
                            <AlertCircle
                              className="h-4 w-4 text-red-500 animate-pulse"
                            />
                          </span>
                        )}
                    </motion.span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Profile Section at the Bottom (Hidden for MBG roles since they have top header profile dropdown) */}
      {(userName || userEmail) && !(userRole && userRole.includes("mbg")) && (
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
    </>
  );
}

export default Sidebar;
