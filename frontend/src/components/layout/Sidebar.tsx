import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { ROLE_PERMISSIONS } from "@/constants/roles";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  BadgeCheck,
  CheckCircle2,
  Factory,
  LayoutDashboard,
  MapPin,
  Package,
  Package2,
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
  { to: "/admin/production", label: "Production", icon: Factory },
  { to: "/admin/qc", label: "Quality Control", icon: CheckCircle2 },
  { to: "/admin/dispatch", label: "Dispatch", icon: Truck },
  { to: "/admin/delivery", label: "Delivery", icon: Package },
  { to: "/admin/tracking", label: "Tracking", icon: MapPin },
  { to: "/admin/products", label: "Daftar Produk", icon: Package2 },
  { to: "/admin/payment-approvals", label: "Persetujuan Pembayaran", icon: BadgeCheck },
] as const;

const LABELS_DICT = {
  id: {
    "/admin/dashboard": "Dashboard",
    "/admin/orders": "Pesanan",
    "/admin/production": "Produksi",
    "/admin/qc": "Kontrol Kualitas",
    "/admin/dispatch": "Pengiriman",
    "/admin/delivery": "Pengantaran",
    "/admin/tracking": "Pelacakan",
    "/admin/products": "Daftar Produk",
    "/admin/payment-approvals": "Persetujuan Pembayaran",
  },
  en: {
    "/admin/dashboard": "Dashboard",
    "/admin/orders": "Orders",
    "/admin/production": "Production",
    "/admin/qc": "Quality Control",
    "/admin/dispatch": "Dispatch",
    "/admin/delivery": "Delivery",
    "/admin/tracking": "Tracking",
    "/admin/products": "Product List",
    "/admin/payment-approvals": "Payment Approval",
  }
} as const;

export interface SidebarProps {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
}


const ITEM_BASE =
  "flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

const ITEM_ACTIVE = "bg-[#FBBF24] text-[#111827]";
const ITEM_INACTIVE = "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]";

export function Sidebar({ userRole }: SidebarProps) {
  const { lang } = useLanguage();
  const allowedItems = SIDEBAR_NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    const allowedPaths = ROLE_PERMISSIONS[userRole] || [];
    return allowedPaths.includes(item.to);
  });
  return (
    <aside
      aria-label="Primary navigation"
      className="hidden md:flex md:w-60 md:flex-col md:shrink-0 bg-white border-r border-[#E5E7EB] h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="px-6 py-4 border-b border-[#E5E7EB]">
        <img
          src="/logo.png"
          alt="Pondok Pesantren Modern Al Umanaa"
          className="h-14 object-contain"
        />
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {allowedItems.map(({ to, label, icon: Icon }) => {
            const translatedLabel = LABELS_DICT[lang][to as keyof typeof LABELS_DICT["en"]] || label;
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


    </aside>
  );
}

export default Sidebar;
