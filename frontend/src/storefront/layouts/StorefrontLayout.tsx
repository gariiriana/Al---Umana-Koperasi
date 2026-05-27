import { useState, useEffect } from "react";
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
  Instagram,
  User,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Footer } from "@/components/layout/Footer";
import { CartAnimationProvider, type FlyDot } from "@/contexts/CartAnimationContext";
import { useCartAnimation } from "@/contexts/useCartAnimation";

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
    myAccount: "Akun Saya",
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
    myAccount: "My Account",
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
}: StorefrontLayoutProps) {
  return (
    <CartAnimationProvider>
      <StorefrontLayoutInner>{children}</StorefrontLayoutInner>
    </CartAnimationProvider>
  );
}

/** Inner layout component that can access CartAnimationContext */
function StorefrontLayoutInner({ children }: { children: ReactNode }) {
  const { user, profile, requestSignOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchVal, setSearchVal] = useState(searchParams.get("search") || "");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const { lang, setLang } = useLanguage();
  const [isLangOpen, setIsLangOpen] = useState(false);

  // CartAnimation context — provides realtime cart count + fly animation
  const { cartCount: cartBadgeCount, cartIconRef, flyDots, removeFlyDot } = useCartAnimation();

  // Animate fly dots: auto-remove after animation completes
  useEffect(() => {
    if (flyDots.length === 0) return;
    const timers = flyDots.map((dot) =>
      window.setTimeout(() => removeFlyDot(dot.id), 700)
    );
    return () => timers.forEach(clearTimeout);
  }, [flyDots, removeFlyDot]);

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
      {/* ── FLY-TO-CART ANIMATION OVERLAY ────────────────────────────── */}
      {flyDots.map((dot: FlyDot) => (
        <FlyDotEl key={dot.id} dot={dot} />
      ))}

      <div className="min-h-screen bg-[#F3F4F6]">

        {/* ── MOBILE HORIZONTAL HEADER (<lg) ─────────────────────────── */}
        <header className="lg:hidden bg-gradient-to-b from-[#FBBF24] to-[#F59E0B] text-[#111827] sticky top-0 z-30 shadow-sm px-4 py-3 flex items-center justify-between">
          {/* Logo / Brand */}
          <Link to="/" className="flex items-center gap-1.5 shrink-0">
            <img
              src="/logo.png"
              alt="Al Umanaa"
              className="h-8 w-8 object-contain bg-white rounded-full p-0.5 border border-amber-200"
            />
            <span className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-white tracking-wide">
              Al-Umanaa <span className="font-light text-amber-100 text-xs">{lang === "id" ? "Koperasi" : "Cooperative"}</span>
            </span>
          </Link>

          {/* Right side: Language + Auth / Profile */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsLangOpen(!isLangOpen);
                  setIsProfileOpen(false);
                }}
                className="flex items-center gap-0.5 hover:opacity-85 cursor-pointer focus:outline-none text-amber-50 text-xs"
                aria-label="Pilih Bahasa"
                title="Pilih Bahasa"
              >
                <Globe className="h-4 w-4" />
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

            <span className="text-amber-100 opacity-40">|</span>

            {/* Profile / Auth */}
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(!isProfileOpen);
                    setIsLangOpen(false);
                  }}
                  className="flex items-center gap-1 font-bold text-white focus:outline-none cursor-pointer hover:opacity-85 text-xs"
                >
                  <div className="h-6 w-6 rounded-full bg-white text-[#B45309] flex items-center justify-center text-[10px] font-extrabold overflow-hidden border border-white/20">
                    {(profile?.photoURL || user?.photoURL) ? (
                      <img src={profile?.photoURL || user?.photoURL || ""} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      (user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-[#E5E7EB] shadow-lg py-1.5 z-50 text-neutral-800 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs">
                      <div className="px-4 py-2 border-b border-neutral-100 font-bold text-neutral-500 truncate max-w-full">
                        {user.displayName || user.email}
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold border-b border-neutral-100"
                      >
                        <User className="h-4 w-4 text-neutral-500" />
                        <span>{t.myAccount}</span>
                      </Link>
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
              <div className="flex items-center gap-2 font-bold text-white text-xs">
                <Link to="/login" className="hover:opacity-85">{t.login}</Link>
              </div>
            )}
          </div>
        </header>

        {/* ── DESKTOP HORIZONTAL HEADER (lg+) ─────────────────────────── */}
        <header className="hidden lg:block bg-gradient-to-b from-[#FBBF24] to-[#F59E0B] text-[#111827] sticky top-0 z-30 shadow-sm">
          {/* Top small bar */}
          <div className="bg-[#B45309] text-amber-50 text-[11px] font-medium font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>{t.cooperativeName}</span>
                <span className="opacity-40">|</span>
                <a
                  href="https://wa.me/6285218731046"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-85 transition-opacity"
                >
                  {t.contactUs}
                </a>
                <span className="opacity-40">|</span>
                <div className="flex items-center gap-2">
                  <span>{t.followUs}</span>
                  <a
                    href="https://www.instagram.com/alumanaa.id?igsh=cXIxZGRwZDBiNWZ0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80 transition-opacity flex items-center"
                    title="Instagram @alumanaa.id"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href="https://www.tiktok.com/@alumanaa.id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80 transition-opacity flex items-center"
                    title="TikTok @alumanaa.id"
                    aria-label="TikTok"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                    </svg>
                  </a>
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
                      <div className="h-5 w-5 rounded-full bg-white text-[#B45309] flex items-center justify-center text-[10px] font-extrabold overflow-hidden border border-white/20">
                        {(profile?.photoURL || user?.photoURL) ? (
                          <img src={profile?.photoURL || user?.photoURL || ""} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                          (user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <span>{user.displayName || "User"}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>

                    {isProfileOpen && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-[#E5E7EB] shadow-lg py-1.5 z-50 text-neutral-800 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs">
                          <Link
                            to="/profile"
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold border-b border-neutral-100"
                          >
                            <User className="h-4 w-4 text-neutral-500" />
                            <span>{t.myAccount}</span>
                          </Link>
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
              <Link
                ref={cartIconRef}
                to="/cart"
                className="relative p-2 text-white hover:opacity-85 transition-opacity"
                aria-label="Keranjang Belanja"
              >
                <ShoppingCart className="h-6 w-6" />
                {cartBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border border-white transition-all animate-bounce-once">
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
          <Footer />
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

/* ─── FlyDotEl: animated dot that flies from product to cart ─────────── */

function FlyDotEl({ dot }: { dot: FlyDot }) {
  const dx = dot.endX - dot.startX;
  const dy = dot.endY - dot.startY;

  return (
    <span
      ref={(el) => {
        if (el) {
          el.style.left = `${dot.startX - 8}px`;
          el.style.top = `${dot.startY - 8}px`;
          el.style.setProperty("--fly-dx", `${dx}px`);
          el.style.setProperty("--fly-dy", `${dy}px`);
        }
      }}
      aria-hidden="true"
      className="fly-dot"
    />
  );
}
