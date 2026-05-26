import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import {
  Factory,
  LayoutDashboard,
  MapPin,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { ROLE_PERMISSIONS } from "@/constants/roles";

interface MobileNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/production", label: "Production", icon: Factory },
  { to: "/admin/dispatch", label: "Dispatch", icon: Truck },
  { to: "/admin/tracking", label: "Tracking", icon: MapPin },
] as const;

const ITEM_BASE =
  "flex flex-1 flex-col items-center justify-center gap-1 py-2 " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-medium " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 rounded-2xl";

const LABEL_ACTIVE = "text-[#111827]";
const LABEL_INACTIVE = "text-[#6B7280]";

export interface MobileNavProps {
  userRole?: string;
}

export function MobileNav({ userRole }: MobileNavProps) {
  const allowedItems = MOBILE_NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    const allowedPaths = ROLE_PERMISSIONS[userRole] || [];
    return allowedPaths.includes(item.to);
  });

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5E7EB] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around px-2 py-1">
        {allowedItems.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `${ITEM_BASE} ${isActive ? LABEL_ACTIVE : LABEL_INACTIVE}`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className={
                      "inline-flex items-center justify-center h-9 w-9 rounded-full " +
                      (isActive ? "bg-[#FBBF24]" : "bg-transparent")
                    }
                    initial={false}
                    animate={{ scale: isActive ? 1 : 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <Icon
                      className={
                        "h-5 w-5 " +
                        (isActive ? "text-[#111827]" : "text-[#6B7280]")
                      }
                      aria-hidden="true"
                    />
                  </motion.span>
                  <span className="truncate">{label}</span>
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
