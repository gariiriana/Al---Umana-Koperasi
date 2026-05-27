import { useState } from "react";
import { NavLink, Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Home,
  LayoutGrid,
  Receipt,
  ShoppingCart,
  Bell,
  HelpCircle,
  Globe,
  Search,
  ChevronDown,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

/**
 * Responsive shell for the customer-facing Storefront.
 *
 * Desktop (lg+): Fixed sidebar on the left with vertical nav links.
 *   Content fills the remaining width with a generous max-width.
 *
 * Mobile (<lg): Sticky bottom navigation bar, full-width content.
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

/** Navigation items in display order. Exported for tests. */
export const STOREFRONT_NAV_ITEMS: readonly StorefrontNavItem[] = [
  { to: "/", label: "Beranda", icon: Home, end: true },
  { to: "/category", label: "Kategori", icon: LayoutGrid },
  { to: "/cart", label: "Keranjang", icon: ShoppingCart, badgeKey: "cart" },
  { to: "/orders", label: "Pesanan", icon: Receipt },
] as const;

/* ─── shared nav styles ──────────────────────────────────────────────── */

const BOTTOM_ITEM_BASE =
  "flex flex-col items-center justify-center gap-0.5 w-full min-h-11 min-w-11 " +
  "px-2 py-1.5 rounded-2xl " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-medium " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

const BOTTOM_ACTIVE = "text-[#FBBF24]";
const BOTTOM_INACTIVE = "text-[#6B7280] hover:text-[#111827]";



/* ─── component ─────────────────────────────────────────────────────── */

const DICTIONARY = {
  id: {
    cooperativeName: "Koperasi Al-Umanaa",
    contactUs: "Hubungi Kami",
    followUs: "Ikuti kami di",
    notifications: "Notifikasi",
    help: "Bantuan",
    languageLabel: "Bahasa Indonesia",
    register: "Daftar",
    login: "Log In",
    signOut: "Keluar",
    adminPanel: "Panel Admin",
    myOrders: "Pesanan Saya",
    searchPlaceholder: "Cari produk berkualitas di Koperasi Al-Umanaa...",
    home: "Beranda",
    category: "Kategori",
    cart: "Keranjang",
    orders: "Pesanan",
    trendingSembako: "Sembako",
    trendingMakanan: "Makanan",
    trendingMinuman: "Minuman",
    trendingKebersihan: "Kebersihan",
    trendingCamilan: "Camilan",
  },
  en: {
    cooperativeName: "Al-Umanaa Cooperative",
    contactUs: "Contact Us",
    followUs: "Follow us on",
    notifications: "Notifications",
    help: "Help Center",
    languageLabel: "English",
    register: "Register",
    login: "Log In",
    signOut: "Sign Out",
    adminPanel: "Admin Panel",
    myOrders: "My Orders",
    searchPlaceholder: "Search quality products at Al-Umanaa Cooperative...",
    home: "Home",
    category: "Category",
    cart: "Cart",
    orders: "Orders",
    trendingSembako: "Groceries",
    trendingMakanan: "Food",
    trendingMinuman: "Drinks",
    trendingKebersihan: "Cleaning",
    trendingCamilan: "Snacks",
  }
} as const;

const getLocalizedLabel = (key: string, langCode: "id" | "en") => {
  if (key === "Beranda") return langCode === "id" ? "Beranda" : "Home";
  if (key === "Kategori") return langCode === "id" ? "Kategori" : "Category";
  if (key === "Keranjang") return langCode === "id" ? "Keranjang" : "Cart";
  if (key === "Pesanan") return langCode === "id" ? "Pesanan" : "Orders";
  return key;
};

export function StorefrontLayout({
  children,
  cartBadgeCount = 0,
}: StorefrontLayoutProps) {
  const { user, profile, requestSignOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchVal, setSearchVal] = useState(searchParams.get("search") || "");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const [lang, setLang] = useState<"id" | "en">(() => {
    const saved = localStorage.getItem("al-umana-lang");
    return saved === "en" ? "en" : "id";
  });
  const [isLangOpen, setIsLangOpen] = useState(false);

  const t = DICTIONARY[lang];

  const handleLangChange = (newLang: "id" | "en") => {
    setLang(newLang);
    localStorage.setItem("al-umana-lang", newLang);
    setIsLangOpen(false);
    showToast({
      message: newLang === "id" ? "Bahasa berhasil diubah ke Bahasa Indonesia" : "Language successfully changed to English",
      variant: "success",
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      navigate(`/?search=${encodeURIComponent(searchVal.trim())}`);
    } else {
      navigate("/");
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F3F4F6]">

        {/* ── DESKTOP HORIZONTAL HEADER (lg+) ─────────────────────────── */}
        <header className="hidden lg:block bg-gradient-to-b from-[#FBBF24] to-[#F59E0B] text-[#111827] sticky top-0 z-30 shadow-sm">
          {/* Top small bar */}
          <div className="bg-[#B45309] text-amber-50 text-[11px] font-medium font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>{t.cooperativeName}</span>
                <span className="opacity-40">|</span>
                <a href="#" className="hover:opacity-85 transition-opacity">{t.contactUs}</a>
                <span className="opacity-40">|</span>
                <div className="flex items-center gap-1">
                  <span>{t.followUs}</span>
                  <a href="#" className="hover:opacity-85 font-bold">f</a>
                  <a href="#" className="hover:opacity-85 font-bold">i</a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/notifications" className="flex items-center gap-1 hover:opacity-85 transition-opacity">
                  <Bell className="h-3.5 w-3.5" />
                  <span>{t.notifications}</span>
                </Link>
                <Link to="/help" className="flex items-center gap-1 hover:opacity-85 transition-opacity">
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>{t.help}</span>
                </Link>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLangOpen(!isLangOpen)}
                    className="flex items-center gap-1 hover:opacity-85 cursor-pointer focus:outline-none text-amber-50"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>{t.languageLabel}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {isLangOpen && (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsLangOpen(false)} />
                      <div className="absolute right-0 mt-2 w-36 rounded-lg bg-white border border-[#E5E7EB] shadow-md py-1 z-50 text-neutral-800 font-sans text-xs">
                        <button
                          type="button"
                          onClick={() => handleLangChange("id")}
                          className={`w-full text-left px-3 py-2 hover:bg-[#F3F4F6] font-semibold cursor-pointer ${lang === "id" ? "text-[#F59E0B]" : ""}`}
                        >
                          Bahasa Indonesia
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLangChange("en")}
                          className={`w-full text-left px-3 py-2 hover:bg-[#F3F4F6] font-semibold cursor-pointer ${lang === "en" ? "text-[#F59E0B]" : ""}`}
                        >
                          English
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <span className="opacity-40">|</span>

                {/* Auth links or user menu */}
                {user ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                      className="flex items-center gap-1.5 font-bold text-white focus:outline-none cursor-pointer hover:opacity-85"
                    >
                      <div className="h-5 w-5 rounded-full bg-white text-[#B45309] flex items-center justify-center text-[10px] font-extrabold">
                        {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <span>{user.displayName || "User"}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>

                    {isProfileOpen && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-[#E5E7EB] shadow-lg py-1.5 z-50 text-neutral-800 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs">
                          <Link
                            to="/orders"
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold"
                          >
                            <Receipt className="h-4 w-4 text-neutral-500" />
                            <span>{t.myOrders}</span>
                          </Link>
                          {profile && ["admin", "monitoring", "tim_produksi", "distribusi"].includes(profile.role) && (
                            <Link
                              to="/admin/dashboard"
                              onClick={() => setIsProfileOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700"
                            >
                              <Settings className="h-4 w-4 text-violet-500" />
                              <span>{t.adminPanel}</span>
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setIsProfileOpen(false);
                              requestSignOut?.();
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-600 text-left font-bold cursor-pointer border-t border-neutral-100 mt-1 pt-2"
                          >
                            <LogOut className="h-4 w-4" />
                            <span>{t.signOut}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Link to="/register" className="hover:opacity-85">{t.register}</Link>
                    <span className="opacity-40 font-normal">|</span>
                    <Link to="/login" className="hover:opacity-85">{t.login}</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Header Bar */}
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-8">
            {/* Logo / Brand */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img
                src="/logo.png"
                alt="Al Umanaa"
                className="h-11 w-11 object-contain bg-white rounded-full p-1 border border-amber-200"
              />
              <span className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-white tracking-wide">
                Al-Umanaa <span className="font-light text-amber-100 text-sm">{lang === "id" ? "Koperasi" : "Cooperative"}</span>
              </span>
            </Link>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <form onSubmit={handleSearchSubmit} className="flex bg-white rounded-lg overflow-hidden shadow-xs border border-transparent focus-within:border-[#B45309]">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  className="flex-1 px-4 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-6 bg-[#B45309] hover:bg-[#92400E] text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Cari"
                >
                  <Search className="h-4 w-4" />
                </button>
              </form>
              {/* Trending categories below search */}
              <div className="flex gap-4 mt-1.5 text-[11px] text-amber-100 font-medium">
                <Link to={`/?search=${lang === 'id' ? 'Sembako' : 'Groceries'}`} className="hover:text-white transition-colors">{t.trendingSembako}</Link>
                <Link to={`/?search=${lang === 'id' ? 'Makanan' : 'Food'}`} className="hover:text-white transition-colors">{t.trendingMakanan}</Link>
                <Link to={`/?search=${lang === 'id' ? 'Minuman' : 'Drinks'}`} className="hover:text-white transition-colors">{t.trendingMinuman}</Link>
                <Link to={`/?search=${lang === 'id' ? 'Kebersihan' : 'Cleaning'}`} className="hover:text-white transition-colors">{t.trendingKebersihan}</Link>
                <Link to={`/?search=${lang === 'id' ? 'Camilan' : 'Snacks'}`} className="hover:text-white transition-colors">{t.trendingCamilan}</Link>
              </div>
            </div>

            {/* Cart Icon */}
            <div className="flex items-center gap-6 shrink-0">
              <Link to="/cart" className="relative p-2 text-white hover:opacity-85 transition-opacity" aria-label="Keranjang Belanja">
                <ShoppingCart className="h-6 w-6" />
                {cartBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border border-white">
                    {cartBadgeCount > 99 ? "99+" : cartBadgeCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT AREA ────────────────────────────────────── */}
        <div className="flex flex-col min-h-screen">
          <main
            className={
              "flex-1 pb-20 lg:pb-8 w-full " +
              "font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827]"
            }
          >
            {/* Content wrapper: full width on desktop, capped for readability */}
            <div className="w-full max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAV (<lg) ───────────────────────────────── */}
        <nav
          aria-label="Navigasi utama"
          className={
            "lg:hidden fixed bottom-0 inset-x-0 z-40 " +
            "bg-white border-t border-[#E5E7EB] " +
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
                      `${BOTTOM_ITEM_BASE} ${isActive ? BOTTOM_ACTIVE : BOTTOM_INACTIVE}`
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
                    <span className="truncate">{getLocalizedLabel(label, lang)}</span>
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

      </div>
    </ToastProvider>
  );
}

export default StorefrontLayout;
