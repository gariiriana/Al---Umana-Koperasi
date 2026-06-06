import { useState, useEffect, useRef } from "react";
import { NavLink, Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  Home,
  LayoutGrid,
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
  LayoutDashboard,
  FileText,
  Factory,
  Truck,
  Package,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Footer } from "@/components/layout/Footer";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { type FlyDot } from "@/contexts/CartAnimationContextCore";
import { useCartAnimation } from "@/contexts/useCartAnimation";

import { collection, query, where, onSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Order } from "@/types/order";
import { subscribeUnreadCount, markAllNotificationsAsRead } from "@/services/notificationService";

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
    help: "Tutorial",
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
    help: "Tutorials",
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
  const adminPanelLink = (() => {
    if (!profile) return "/";
    if (profile.role === "admin" || profile.role === "monitoring") return "/admin/dashboard";
    if (profile.role === "tim_produksi") return "/admin/production";
    if (profile.role === "distribusi") return "/distribusi/dispatch";
    if (profile.role === "kurir") return "/distribusi/delivery";
    return "/";
  })();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchVal, setSearchVal] = useState(searchParams.get("search") || "");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const { lang, setLang } = useLanguage();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // CartAnimation context — provides realtime cart count + fly animation
  const { cartCount: cartBadgeCount, cartIconRef, flyDots, removeFlyDot } = useCartAnimation();
  const [isBouncing, setIsBouncing] = useState(false);
  const prevCountRef = useRef(cartBadgeCount);

  // Trigger pop/bounce animation when cart count increases (timed to dot arrival)
  useEffect(() => {
    if (cartBadgeCount > prevCountRef.current) {
      const delayTimer = setTimeout(() => {
        setIsBouncing(true);
        const bounceTimer = setTimeout(() => setIsBouncing(false), 400);
        return () => clearTimeout(bounceTimer);
      }, 350); // Starts right when the dot arrives (350ms)
      
      prevCountRef.current = cartBadgeCount;
      return () => clearTimeout(delayTimer);
    } else {
      prevCountRef.current = cartBadgeCount;
    }
  }, [cartBadgeCount]);

  // Animate fly dots: auto-remove after animation completes
  useEffect(() => {
    if (flyDots.length === 0) return;
    const timers = flyDots.map((dot) =>
      window.setTimeout(() => removeFlyDot(dot.id), 450)
    );
    return () => timers.forEach(clearTimeout);
  }, [flyDots, removeFlyDot]);

  // Real-time order status change Toast notifications (kept for live toast UX)
  useEffect(() => {
    if (!user) {
      return;
    }

    let isInitialLoad = true;
    const previousStatuses: Record<string, { status: string; paymentStatus?: string }> = {};

    const mapDocToOrder = (id: string, data: DocumentData): Order => {
      return {
        id,
        customerId: data.customerId || "",
        customerName: data.customerName || "",
        items: data.items || [],
        deliveryAddress: data.deliveryAddress || "",
        deliveryTime: data.deliveryTime || "",
        status: data.status || "PLACING",
        paymentMethod: data.paymentMethod || "cod",
        paymentStatus: data.paymentStatus,
        paymentProofFileId: data.paymentProofFileId,
        rejectionReason: data.rejectionReason,
        paymentRejectionReason: data.paymentRejectionReason,
        createdAt: data.createdAt
          ? typeof data.createdAt.toDate === "function"
            ? data.createdAt.toDate().toISOString()
            : data.createdAt
          : new Date().toISOString(),
        updatedAt: data.updatedAt
          ? typeof data.updatedAt.toDate === "function"
            ? data.updatedAt.toDate().toISOString()
            : data.updatedAt
          : new Date().toISOString(),
      } as unknown as Order;
    };

    const q = query(
      collection(db, "orders"),
      where("customerId", "==", user.uid)
    );

    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const orderId = change.doc.id;
        const data = change.doc.data();
        const orderObj = mapDocToOrder(orderId, data);

        const status = orderObj.status;
        const paymentStatus = orderObj.paymentStatus;
        const shortId = orderId.slice(-6).toUpperCase();

        if (change.type === "added") {
          if (!isInitialLoad) {
            showToast({
              message: lang === "id"
                ? `Pesanan #${shortId} berhasil ditempatkan!`
                : `Order #${shortId} successfully placed!`,
              variant: "success",
            });
          }
          previousStatuses[orderId] = { status, paymentStatus };
        } else if (change.type === "modified") {
          const prev = previousStatuses[orderId];
          if (prev) {
            if (prev.status !== status) {
              let statusTextId = "";
              let statusTextEn = "";
              switch (status) {
                case "PENDING":
                  statusTextId = "dikonfirmasi";
                  statusTextEn = "confirmed";
                  break;
                case "IN_PRODUCTION":
                  statusTextId = "sedang diproduksi";
                  statusTextEn = "in production";
                  break;
                case "QC":
                  statusTextId = "sedang diuji kelayakan (QC)";
                  statusTextEn = "being quality checked (QC)";
                  break;
                case "READY_TO_DELIVER":
                  statusTextId = "siap dikirim";
                  statusTextEn = "ready to deliver";
                  break;
                case "OUT_FOR_DELIVERY":
                  statusTextId = "sedang dikirim oleh kurir";
                  statusTextEn = "out for delivery";
                  break;
                case "COMPLETED":
                  statusTextId = "selesai";
                  statusTextEn = "completed";
                  break;
                case "DELIVERY_FAILED":
                  statusTextId = `gagal dikirim: ${orderObj.rejectionReason || "-"}`;
                  statusTextEn = `delivery failed: ${orderObj.rejectionReason || "-"}`;
                  break;
                default:
                  statusTextId = (status as string).toLowerCase();
                  statusTextEn = (status as string).toLowerCase();
              }

              showToast({
                message: lang === "id"
                  ? `Pesanan #${shortId} ${statusTextId}!`
                  : `Order #${shortId} is ${statusTextEn}!`,
                variant: status === "DELIVERY_FAILED" ? "error" : "info",
              });
            }

            if (prev.paymentStatus !== paymentStatus && paymentStatus) {
              if (paymentStatus === "SUDAH_DIBAYAR") {
                showToast({
                  message: lang === "id"
                    ? `Pembayaran Pesanan #${shortId} disetujui!`
                    : `Payment for Order #${shortId} approved!`,
                  variant: "success",
                });
              } else if (paymentStatus === "JATUH_TEMPO") {
                showToast({
                  message: lang === "id"
                    ? `Pembayaran Pesanan #${shortId} telah jatuh tempo!`
                    : `Payment for Order #${shortId} is overdue!`,
                  variant: "error",
                });
              }
            }
          }
          previousStatuses[orderId] = { status, paymentStatus };
        } else if (change.type === "removed") {
          delete previousStatuses[orderId];
        }
      });

      isInitialLoad = false;
    });

    return () => {
      unsubscribeOrders();
    };
  }, [user, lang, showToast]);

  // Real-time unread notification count from Firestore
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeUnreadCount(
      user.uid,
      (count) => setUnreadCount(count),
      (err) => console.error("Failed to subscribe to unread count:", err)
    );

    return () => unsubscribe();
  }, [user]);

  // Auto-mark all as read when visiting /notifications
  useEffect(() => {
    if (location.pathname === "/notifications" && user) {
      markAllNotificationsAsRead(user.uid).catch((err) =>
        console.error("Failed to auto-mark notifications as read:", err)
      );
    }
  }, [location.pathname, user]);

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
        <header className="lg:hidden bg-gradient-to-b from-[#FBBF24] to-[#F59E0B] text-[#111827] sticky top-0 z-30 shadow-sm px-4 py-3 flex items-center justify-between gap-2">
          {/* Logo / Brand & Order List Icon */}
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/" className="flex items-center gap-1.5">
              <img
                src="/logo.png"
                alt="Al Umanaa"
                className="h-8 w-8 object-contain bg-white rounded-full p-0.5 border border-amber-200"
              />
              <span className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-white tracking-wide">
                Al-Umanaa <span className="font-light text-amber-100 text-xs">{lang === "id" ? "Koperasi" : "Cooperative"}</span>
              </span>
            </Link>
            {profile && ["admin", "monitoring"].includes(profile.role) && (
              <>
                <span className="inline-block h-4 w-px bg-white/20 shrink-0 self-center" />
                {profile.role !== "admin" && (
                  <>
                    <Link to="/admin/dashboard" className="p-1 text-white hover:opacity-85 transition-opacity" title={lang === "id" ? "Dasbor Monitoring" : "Monitoring Dashboard"}>
                      <LayoutDashboard className="h-5 w-5" />
                    </Link>
                    <Link to="/admin/orders" className="p-1 text-white hover:opacity-85 transition-opacity" title={lang === "id" ? "Pesanan & Pembayaran" : "Orders & Payment"}>
                      <ShoppingCart className="h-5 w-5" />
                    </Link>
                  </>
                )}
                {profile.role === "admin" && (
                  <Link to="/admin/orders" className="p-1 text-white hover:opacity-85 transition-opacity" title={lang === "id" ? "Catatan" : "Invoices"}>
                    <FileText className="h-5 w-5" />
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Right side: Language + Auth / Profile */}
          <div className="flex items-center gap-2">
            {profile && ["admin", "monitoring"].includes(profile.role) && user && (
              <span className="inline-block h-4 w-px bg-white/20 shrink-0 self-center" />
            )}

            {/* Notification Bell for Mobile */}
            {user && (
              <Link to="/notifications" className="relative p-1 text-white hover:opacity-85 transition-opacity">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-[#F59E0B] shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && <span className="inline-block h-4 w-px bg-white/20 shrink-0 self-center" />}

            {/* Language Switcher */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  setIsLangOpen(!isLangOpen);
                  setIsProfileOpen(false);
                }}
                className="flex items-center hover:opacity-85 cursor-pointer focus:outline-none text-amber-50 text-xs p-1"
                aria-label="Pilih Bahasa"
                title="Pilih Bahasa"
              >
                <Globe className="h-4 w-4" />
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

            <span className="inline-block h-4 w-px bg-white/20 shrink-0 self-center" />

            {/* Profile / Auth */}
            {user ? (
              <div className="relative flex items-center">
                <button
                  type="button"
                  id="profile-menu-button-mobile"
                  onClick={() => {
                    setIsProfileOpen(!isProfileOpen);
                    setIsLangOpen(false);
                  }}
                  className="flex items-center font-bold text-white focus:outline-none cursor-pointer hover:opacity-85 text-xs p-1"
                >
                  <div className="h-6 w-6 rounded-full bg-white text-[#B45309] flex items-center justify-center text-[10px] font-extrabold overflow-hidden border border-white/20 shrink-0">
                    {(profile?.photoURL || user?.photoURL) ? (
                      <img src={profile?.photoURL || user?.photoURL || ""} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      (user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>
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

                      {profile && ["admin", "monitoring", "tim_produksi", "distribusi", "kurir"].includes(profile.role) && (
                        <>
                          {["tim_produksi", "distribusi", "kurir"].includes(profile.role) && (
                            <Link
                              to={adminPanelLink}
                              onClick={() => setIsProfileOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700"
                            >
                              <Settings className="h-4 w-4 text-violet-500" />
                              <span>{t.adminPanel}</span>
                            </Link>
                          )}
                          {profile.role !== "admin" && (
                            <Link
                              to="/admin/settings"
                              onClick={() => setIsProfileOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700 border-t border-neutral-100"
                            >
                              <Settings className="h-4 w-4 text-violet-500" />
                              <span>{lang === "id" ? "Pengaturan" : "Settings"}</span>
                            </Link>
                          )}
                        </>
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
                {profile && ["admin", "monitoring"].includes(profile.role) && (
                  <>
                    {profile.role !== "admin" && (
                      <>
                        <Link to="/admin/dashboard" className="flex items-center gap-1 hover:opacity-85 transition-opacity font-bold text-amber-200">
                          <LayoutDashboard className="h-3.5 w-3.5" />
                          <span>{lang === "id" ? "Dasbor" : "Dashboard"}</span>
                        </Link>
                        <Link to="/admin/orders" className="flex items-center gap-1 hover:opacity-85 transition-opacity font-bold text-amber-200">
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span>{lang === "id" ? "Pesanan" : "Orders"}</span>
                        </Link>
                      </>
                    )}
                    {profile.role === "admin" && (
                      <Link to="/admin/orders" className="flex items-center gap-1 hover:opacity-85 transition-opacity font-bold text-amber-200">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{lang === "id" ? "Catatan" : "Invoices"}</span>
                      </Link>
                    )}
                  </>
                )}
                <Link to="/notifications" className="flex items-center gap-1 hover:opacity-85 transition-opacity relative">
                  <Bell className="h-3.5 w-3.5" />
                  <span>{t.notifications}</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-white shadow-xs">
                      {unreadCount}
                    </span>
                  )}
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
                      id="profile-menu-button"
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
                          {profile?.role === "admin" && (
                            <>
                              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-neutral-100">
                                {lang === "id" ? "Akses Peran" : "Role Access"}
                              </div>
                              <Link
                                to="/admin/dashboard"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-amber-700 border-b border-neutral-100"
                              >
                                <LayoutDashboard className="h-4 w-4 text-amber-500" />
                                <span>{lang === "id" ? "Fitur Monitoring" : "Monitoring Features"}</span>
                              </Link>
                              <Link
                                to="/admin/production"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-emerald-700 border-b border-neutral-100"
                              >
                                <Factory className="h-4 w-4 text-emerald-500" />
                                <span>{lang === "id" ? "Fitur Tim Produksi" : "Production Features"}</span>
                              </Link>
                              <Link
                                to="/distribusi/dispatch"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-blue-700 border-b border-neutral-100"
                              >
                                <Truck className="h-4 w-4 text-blue-500" />
                                <span>{lang === "id" ? "Fitur Distribusi" : "Distribution Features"}</span>
                              </Link>
                              <Link
                                to="/distribusi/scheduler"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-sky-700 border-b border-neutral-100"
                              >
                                <Calendar className="h-4 w-4 text-sky-500" />
                                <span>{lang === "id" ? "Fitur Penjadwal Pengiriman" : "Delivery Scheduler"}</span>
                              </Link>
                              <Link
                                to="/distribusi/delivery"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-indigo-700 border-b border-neutral-100"
                              >
                                <Package className="h-4 w-4 text-indigo-500" />
                                <span>{lang === "id" ? "Fitur Kurir" : "Courier Features"}</span>
                              </Link>
                              <Link
                                to="/admin/settings"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700 border-b border-neutral-100"
                              >
                                <Settings className="h-4 w-4 text-violet-500" />
                                <span>{lang === "id" ? "Pengaturan" : "Settings"}</span>
                              </Link>
                            </>
                          )}
                          {profile && profile.role !== "admin" && ["monitoring", "tim_produksi", "distribusi", "kurir"].includes(profile.role) && (
                            <>
                              {["tim_produksi", "distribusi", "kurir"].includes(profile.role) && (
                                <Link
                                  to={adminPanelLink}
                                  onClick={() => setIsProfileOpen(false)}
                                  className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700"
                                >
                                  <Settings className="h-4 w-4 text-violet-500" />
                                  <span>{t.adminPanel}</span>
                                </Link>
                              )}
                              <Link
                                to="/admin/settings"
                                onClick={() => setIsProfileOpen(false)}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-[#F3F4F6] font-semibold text-violet-700 border-t border-neutral-100"
                              >
                                <Settings className="h-4 w-4 text-violet-500" />
                                <span>{lang === "id" ? "Pengaturan" : "Settings"}</span>
                              </Link>
                            </>
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
                className={`relative p-2 text-white hover:opacity-85 transition-opacity ${isBouncing ? "animate-cart-pop" : ""}`}
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
        <div className="flex flex-col min-h-screen min-w-0 w-full">
          <main
            className={
              "flex-1 pb-20 lg:pb-8 w-full min-w-0 " +
              "font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827]"
            }
          >
            {/* Content wrapper: full width on desktop, capped for readability */}
            <div className="w-full max-w-7xl mx-auto min-w-0">
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
                    id={badgeKey === "cart" ? "mobile-cart-btn" : undefined}
                    className={({ isActive }) =>
                      `${BOTTOM_ITEM_BASE} ${isActive ? BOTTOM_ACTIVE : BOTTOM_INACTIVE}`
                    }
                  >
                    <span className={`relative inline-flex h-6 w-6 items-center justify-center ${badgeKey === "cart" && isBouncing ? "animate-cart-pop" : ""}`}>
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
              )
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
