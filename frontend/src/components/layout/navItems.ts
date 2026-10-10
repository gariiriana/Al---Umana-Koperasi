import {
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Package2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { ROLE_DEFAULT_REDIRECT, ROLE_PERMISSIONS } from "@/constants/roles";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Satu daftar menu untuk sidebar desktop dan navigasi bawah HP (selalu sinkron). */
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
  // --- Katering Operational ---
  { to: "/katering/mo/jobdesk", label: "Manajemen Job Desk", icon: ClipboardCheck },
  { to: "/katering/jobdesk", label: "Job Desk Saya", icon: ClipboardCheck },
  { to: "/katering/co-mo/review", label: "Review Job Desk", icon: ClipboardCheck },
  // --- MBG (Makan Bergizi Gratis) ---
  { to: "/mbg/admin", label: "Admin MBG", icon: ClipboardList },
  { to: "/mbg/archive", label: "Arsip PM", icon: History },
  { to: "/mbg/production", label: "Produksi MBG", icon: UtensilsCrossed },
  { to: "/mbg/distribution", label: "Distribusi MBG", icon: ClipboardCheck },
  { to: "/mbg/persiapan", label: "Persiapan", icon: ClipboardCheck },
  { to: "/mbg/delivery", label: "Kurir MBG", icon: Truck },
  { to: "/performance", label: "Performa Saya", icon: Trophy },
  { to: "/super-admin/control-center", label: "Control Center SDM", icon: ShieldCheck },
  { to: "/developer/control-center", label: "Developer Control", icon: ShieldCheck },
] as const;

/** Menu yang boleh dibuka role ini, urutan sama dengan sidebar. */
export function navItemsForRole(role: string | undefined): NavItem[] {
  if (!role) return [];
  const allowed = ROLE_PERMISSIONS[role] || [];
  return SIDEBAR_NAV_ITEMS.filter((item) => {
    if (item.to === "/performance") return allowed.includes("/performance");
    if (item.to === "/super-admin/control-center") return role === "super_admin";
    if (item.to === "/developer/control-center") return role === "developer";
    if (role === "admin") return true;
    return allowed.includes(item.to);
  });
}

/** Label pendek untuk tab bawah (lebar ±75px per tab di HP). */
export const MOBILE_SHORT_LABELS: Record<string, string> = {
  "/admin/dashboard": "Dasbor",
  "/admin/orders": "Pesanan",
  "/admin/invoices": "Catatan",
  "/admin/production": "Produksi",
  "/admin/production/history": "Riwayat",
  "/distribusi/scheduler": "Penjadwal",
  "/distribusi/schedules": "Jadwal",
  "/distribusi/handover": "Handover",
  "/distribusi/delivery": "Antar",
  "/admin/products": "Produk",
  "/katering/mo/jobdesk": "Job Desk",
  "/katering/jobdesk": "Job Desk",
  "/katering/co-mo/review": "Review",
  "/mbg/admin": "Admin",
  "/mbg/archive": "Arsip",
  "/mbg/production": "Produksi",
  "/mbg/distribution": "Distribusi",
  "/mbg/persiapan": "Persiapan",
  "/mbg/delivery": "Kurir",
  "/performance": "Performa",
  "/super-admin/control-center": "KPI",
  "/developer/control-center": "Developer",
};

export const MAX_MOBILE_TABS = 5;

/**
 * Tab bawah HP: halaman utama role dulu, lalu urutan sidebar. Lebih dari 5 menu →
 * 4 tab + "Lainnya" (membuka menu lengkap).
 */
export function mobileTabsForRole(role: string | undefined): { tabs: NavItem[]; hasMore: boolean } {
  const items = navItemsForRole(role);
  const home = role ? ROLE_DEFAULT_REDIRECT[role] : undefined;
  const ordered = [...items].sort((a, b) => Number(b.to === home) - Number(a.to === home));
  if (ordered.length <= MAX_MOBILE_TABS) return { tabs: ordered, hasMore: false };
  return { tabs: ordered.slice(0, MAX_MOBILE_TABS - 1), hasMore: true };
}
