import { NavLink } from "react-router-dom";
import {
  Home,
  LayoutGrid,
  Receipt,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ToastProvider } from "@/contexts/ToastContext";

/**
 * Mobile-first shell for the customer-facing Storefront. The shell pins a
 * 4-item bottom navigation bar (Beranda, Kategori, Keranjang, Pesanan) and
 * constrains the content area to a 480px-max-width column to preserve the
 * "phone app" feel even on a desktop browser.
 *
 * Mounted toasts via {@link ToastProvider} so any storefront page (or its
 * descendants) can call `useToast()` without re-wiring the provider.
 *
 * Validates: Requirements 1.8, 1.9, 14.1, 14.2, 14.3, 14.4, 14.5.
 */

export interface StorefrontLayoutProps {
  children: ReactNode;
  /** Optional badge count rendered next to the Keranjang icon. */
  cartBadgeCount?: number;
}

interface StorefrontNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badgeKey?: "cart";
}

/** Bottom navigation items in display order. Exported for tests. */
export const STOREFRONT_NAV_ITEMS: readonly StorefrontNavItem[] = [
  { to: "/", label: "Beranda", icon: Home, end: true },
  { to: "/category", label: "Kategori", icon: LayoutGrid },
  { to: "/cart", label: "Keranjang", icon: ShoppingCart, badgeKey: "cart" },
  { to: "/orders", label: "Pesanan", icon: Receipt },
] as const;

const ITEM_BASE =
  "flex flex-col items-center justify-center gap-0.5 w-full min-h-11 min-w-11 " +
  "px-2 py-1.5 rounded-2xl " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-medium " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

const ITEM_ACTIVE = "text-[#FBBF24]";
const ITEM_INACTIVE = "text-[#6B7280] hover:text-[#111827]";

export function StorefrontLayout({
  children,
  cartBadgeCount = 0,
}: StorefrontLayoutProps) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F3F4F6] flex justify-center">
        <div className="relative w-full max-w-[480px] min-h-screen flex flex-col bg-white shadow-sm">
          <main
            className={
              "flex-1 pb-20 " +
              "font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827]"
            }
          >
            {children}
          </main>

          <nav
            aria-label="Navigasi utama"
            className={
              "fixed bottom-0 inset-x-0 z-40 mx-auto " +
              "w-full max-w-[480px] bg-white border-t border-[#E5E7EB] " +
              "pb-[env(safe-area-inset-bottom)]"
            }
          >
            <ul className="flex items-stretch justify-around px-2 py-1">
              {STOREFRONT_NAV_ITEMS.map(
                ({ to, label, icon: Icon, end, badgeKey }) => (
                  <li key={to} className="flex-1">
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_INACTIVE}`
                      }
                    >
                      <span className="relative inline-flex h-6 w-6 items-center justify-center">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                        {badgeKey === "cart" && cartBadgeCount > 0 && (
                          <span
                            aria-label={`${cartBadgeCount} item di keranjang`}
                            className={
                              "absolute -top-1.5 -right-2 min-w-[18px] h-[18px] " +
                              "px-1 rounded-full bg-[#EF4444] text-white " +
                              "text-[10px] font-semibold leading-[18px] text-center"
                            }
                          >
                            {cartBadgeCount > 99 ? "99+" : cartBadgeCount}
                          </span>
                        )}
                      </span>
                      <span className="truncate">{label}</span>
                    </NavLink>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>
      </div>
    </ToastProvider>
  );
}

export default StorefrontLayout;
