import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import {
  Bell,
  ShoppingBag,
  Info,
  Gift,
  ChevronRight,
  User,
  Receipt,
  LogOut,
} from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Order } from "@/types/order";
import { listAvailableProducts } from "@/services/catalogService";
import {
  type NotificationItem,
  mapOrderToNotification,
  mapProductToPromoNotification,
  STATIC_PROMO_NOTIFICATIONS,
  STATIC_INFO_NOTIFICATIONS,
} from "@/services/notificationService";

function formatTimeAgo(dateStr: string, langCode: "id" | "en") {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return langCode === "id" ? "Baru saja" : "Just now";
    if (diffMins < 60) return langCode === "id" ? `${diffMins} menit lalu` : `${diffMins}m ago`;
    if (diffHours < 24) return langCode === "id" ? `${diffHours} jam lalu` : `${diffHours}h ago`;

    return date.toLocaleDateString(langCode === "id" ? "id-ID" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function NotificationsPage() {
  const { user, requestSignOut } = useAuth();
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<"order" | "promo" | "info">("order");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [promos, setPromos] = useState<NotificationItem[]>(STATIC_PROMO_NOTIFICATIONS);

  // Firestore real-time subscription for current user's orders
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "orders"),
      where("customerId", "==", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: Order[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            ...data,
          } as Order);
        });
        setOrders(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to order updates:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load promo products from catalog dynamically
  useEffect(() => {
    listAvailableProducts()
      .then((products) => {
        const discounted = products.filter((p) => {
          const discountPercent =
            p.price % 3 === 0 ? 10 : p.price % 5 === 0 ? 15 : 0;
          return discountPercent > 0;
        });
        const promoNotifs = discounted.map(mapProductToPromoNotification);
        setPromos([...promoNotifs, ...STATIC_PROMO_NOTIFICATIONS]);
      })
      .catch((err) => {
        console.error("Failed to load catalog products for promos:", err);
      });
  }, []);

  // Map order state transitions to notification items
  const orderNotifications = orders.map(mapOrderToNotification);

  // Combine static and dynamic notifications
  const getNotificationsList = (): NotificationItem[] => {
    if (activeTab === "order") return orderNotifications;
    if (activeTab === "promo") return promos;
    return STATIC_INFO_NOTIFICATIONS;
  };

  const currentList = getNotificationsList();

  const t = {
    title: lang === "id" ? "Pusat Notifikasi" : "Notification Center",
    tabOrder: lang === "id" ? "Status Pesanan" : "Order Status",
    tabPromo: lang === "id" ? "Promo" : "Promos",
    tabInfo: lang === "id" ? "Info Koperasi" : "Cooperative Info",
    noNotif: lang === "id" ? "Belum ada notifikasi baru" : "No new notifications",
    viewOrder: lang === "id" ? "Lihat Detail Pesanan" : "View Order Details",
    loading: lang === "id" ? "Memuat data..." : "Loading data...",
    navMyAccount: lang === "id" ? "Akun Saya" : "My Account",
    navMyOrders: lang === "id" ? "Pesanan Saya" : "My Orders",
    navNotif: lang === "id" ? "Notifikasi" : "Notifications",
    navSignOut: lang === "id" ? "Keluar" : "Logout",
    userGreeting: lang === "id" ? "Halo," : "Hello,",
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-12 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-800">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT SIDEBAR (Shopee-style Account Menu on Desktop) */}
          <aside className="hidden lg:block w-64 shrink-0 space-y-6">
            {/* User Profile Header */}
            <div className="flex items-center gap-3 px-2">
              <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-[#FBBF24] to-[#F59E0B] flex items-center justify-center text-white text-base font-extrabold shadow-sm">
                {(user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-neutral-500 font-semibold">{t.userGreeting}</span>
                <h3 className="text-sm font-bold text-neutral-800 truncate max-w-[170px]">
                  {user?.displayName || user?.email || "Customer"}
                </h3>
              </div>
            </div>

            {/* Navigation links */}
            <nav aria-label="Menu Akun" className="bg-white rounded-xl border border-[#E5E7EB] p-2 space-y-1 shadow-xs">
              <Link
                to="/cart"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-[#F3F4F6] transition-colors"
              >
                <User className="h-4.5 w-4.5 text-neutral-400" />
                <span>{t.navMyAccount}</span>
              </Link>
              <Link
                to="/orders"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-[#F3F4F6] transition-colors"
              >
                <Receipt className="h-4.5 w-4.5 text-neutral-400" />
                <span>{t.navMyOrders}</span>
              </Link>
              <Link
                to="/notifications"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-extrabold bg-[#FEF3C7] text-[#B45309] transition-colors"
              >
                <Bell className="h-4.5 w-4.5 text-[#F59E0B]" />
                <span>{t.navNotif}</span>
              </Link>
              <button
                type="button"
                onClick={requestSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer border-t border-neutral-100 mt-2 pt-3"
              >
                <LogOut className="h-4.5 w-4.5 text-red-500" />
                <span>{t.navSignOut}</span>
              </button>
            </nav>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 space-y-4">
            {/* Header Title */}
            <header className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shadow-xs">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
                  {t.title}
                </h1>
              </div>
            </header>

            {/* Tab switchers */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-1.5 shadow-xs flex items-center justify-stretch">
              <button
                type="button"
                onClick={() => setActiveTab("order")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  activeTab === "order"
                    ? "bg-[#FEF3C7] text-[#B45309] shadow-xs"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <ShoppingBag className="h-4 w-4" />
                  <span>{t.tabOrder}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("promo")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  activeTab === "promo"
                    ? "bg-[#FEF3C7] text-[#B45309] shadow-xs"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Gift className="h-4 w-4" />
                  <span>{t.tabPromo}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("info")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  activeTab === "info"
                    ? "bg-[#FEF3C7] text-[#B45309] shadow-xs"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Info className="h-4 w-4" />
                  <span>{t.tabInfo}</span>
                </div>
              </button>
            </div>

            {/* Notifications list Container */}
            <div className="space-y-3">
              {loading ? (
                <div className="bg-white rounded-xl p-8 text-center text-xs text-neutral-500 shadow-xs border border-[#E5E7EB]">
                  {t.loading}
                </div>
              ) : currentList.length === 0 ? (
                <div className="bg-white rounded-xl p-12 text-center text-neutral-400 shadow-xs border border-[#E5E7EB] flex flex-col items-center justify-center space-y-3">
                  <div className="h-16 w-16 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-300">
                    <Bell className="h-8 w-8" />
                  </div>
                  <p className="text-xs font-bold text-neutral-500">{t.noNotif}</p>
                </div>
              ) : (
                currentList.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-[#E5E7EB] hover:border-amber-200 p-4 transition-all duration-150 shadow-xs flex gap-3.5"
                  >
                    {/* Icon type marker */}
                    <div className="shrink-0">
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center shadow-xs ${
                          item.type === "order"
                            ? "bg-emerald-50 text-emerald-600"
                            : item.type === "promo"
                            ? "bg-red-50 text-red-500"
                            : "bg-blue-50 text-blue-500"
                        }`}
                      >
                        {item.type === "order" ? (
                          <ShoppingBag className="h-4.5 w-4.5" />
                        ) : item.type === "promo" ? (
                          <Gift className="h-4.5 w-4.5" />
                        ) : (
                          <Info className="h-4.5 w-4.5" />
                        )}
                      </div>
                    </div>

                    {/* Text content block */}
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <h4 className="text-xs font-extrabold text-neutral-800 leading-tight">
                          {item.title[lang]}
                        </h4>
                        <span className="text-[10px] text-neutral-400 font-semibold shrink-0">
                          {formatTimeAgo(item.time, lang)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        {item.message[lang]}
                      </p>

                      {/* View details button for orders */}
                      {item.orderId && (
                        <div className="pt-1.5">
                          <Link
                            to={`/orders/${item.orderId}`}
                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#B45309] hover:text-[#92400E] transition-colors"
                          >
                            <span>{t.viewOrder}</span>
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;
