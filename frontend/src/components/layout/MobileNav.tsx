import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import {
  BadgeCheck,
  CheckCircle2,
  Factory,
  LayoutDashboard,
  Package2,
  Send,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { ROLE_PERMISSIONS } from "@/constants/roles";

interface MobileNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// All possible nav items — filtered per role via ROLE_PERMISSIONS
export const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { to: "/admin/dashboard",         label: "Dashboard",     icon: LayoutDashboard },
  { to: "/admin/products",          label: "Produk",        icon: Package2 },
  { to: "/admin/payment-approvals", label: "Pembayaran",    icon: BadgeCheck },
  { to: "/admin/production",        label: "Produksi",      icon: Factory },
  { to: "/admin/qc",               label: "QC",            icon: CheckCircle2 },
  { to: "/distribusi/dispatch",     label: "Pengiriman",    icon: Send },
  { to: "/distribusi/delivery",     label: "Antar",         icon: Truck },
] as const;

export interface MobileNavProps {
  userRole?: string;
}

export function MobileNav({ userRole }: MobileNavProps) {
  let allowedItems = MOBILE_NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    const allowedPaths = ROLE_PERMISSIONS[userRole] || [];
    return allowedPaths.includes(item.to);
  });

  if (userRole === "monitoring") {
    allowedItems = allowedItems
      .filter((item) => item.to === "/admin/dashboard")
      .map((item) => ({
        ...item,
        label: "Performa",
      }));
  }

  if (allowedItems.length === 0) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E7EB] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {allowedItems.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1 max-w-[80px]">
            <NavLink
              to={to}
              className="flex flex-col items-center gap-0.5 py-1 px-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2"
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className={
                      "inline-flex items-center justify-center h-8 w-10 rounded-2xl transition-colors " +
                      (isActive ? "bg-[#FBBF24]" : "bg-transparent")
                    }
                    initial={false}
                    animate={{ scale: isActive ? 1 : 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Icon
                      className={
                        "h-[18px] w-[18px] transition-colors " +
                        (isActive ? "text-[#111827]" : "text-[#9CA3AF]")
                      }
                      aria-hidden="true"
                    />
                  </motion.span>
                  <span
                    className={
                      "text-[10px] font-semibold font-['Hanken_Grotesk',system-ui,sans-serif] transition-colors " +
                      (isActive ? "text-[#111827]" : "text-[#9CA3AF]")
                    }
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MobileNav;
