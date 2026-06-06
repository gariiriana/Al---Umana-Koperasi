import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Bell,
  ShoppingBag,
  Info,
  Gift,
  User,
  LogOut,
  CheckCheck,
  Truck,
  CreditCard,
  ShieldCheck,
  Factory,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { listAvailableProducts } from "@/services/catalogService";
import {
  type NotificationItem,
  type FirestoreNotification,
  mapProductToPromoNotification,
  subscribeNotifications,
  markAllNotificationsAsRead,
  STATIC_PROMO_NOTIFICATIONS,
  STATIC_INFO_NOTIFICATIONS,
} from "@/services/notificationService";

function formatTimeAgo(dateInput: unknown, langCode: "id" | "en") {
  try {
    if (!dateInput) return "";
    let date: Date;
    if (typeof dateInput === "string") {
      date = new Date(dateInput);
    } else if (dateInput && typeof dateInput === "object") {
      const inputObj = dateInput as Record<string, unknown>;
      if ("seconds" in inputObj) {
        const secondsVal = inputObj.seconds;
        if (typeof secondsVal === "number") {
          date = new Date(secondsVal * 1000);
        } else {
          date = new Date(String(dateInput));
        }
      } else if ("toDate" in inputObj) {
        const toDateFn = inputObj.toDate;
        if (typeof toDateFn === "function") {
          date = (toDateFn as () => Date)();
        } else {
          date = new Date(String(dateInput));
        }
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        date = new Date(String(dateInput));
      }
    } else if (typeof dateInput === "number") {
      date = new Date(dateInput);
    } else {
      date = new Date(String(dateInput));
    }

    if (isNaN(date.getTime())) {
      return String(dateInput);
    }

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
    return String(dateInput);
  }
}

/** Map a FirestoreNotification type to an icon + color scheme */
function getNotifIcon(type: string) {
  switch (type) {
    case "order":
      return { icon: ShoppingBag, bg: "bg-emerald-50", text: "text-emerald-600" };
    case "production":
      return { icon: Factory, bg: "bg-violet-50", text: "text-violet-600" };
    case "delivery":
      return { icon: Truck, bg: "bg-blue-50", text: "text-blue-600" };
    case "payment":
      return { icon: CreditCard, bg: "bg-amber-50", text: "text-amber-600" };
    case "validation":
      return { icon: ShieldCheck, bg: "bg-teal-50", text: "text-teal-600" };
    case "promo":
      return { icon: Gift, bg: "bg-red-50", text: "text-red-500" };
    default:
      return { icon: Info, bg: "bg-blue-50", text: "text-blue-500" };
  }
}

export function NotificationsPage() {
  const { user, profile, requestSignOut } = useAuth();
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<"order" | "promo" | "info">("order");
  const [firestoreNotifs, setFirestoreNotifs] = useState<FirestoreNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [promos, setPromos] = useState<NotificationItem[]>(STATIC_PROMO_NOTIFICATIONS);
  const [markingRead, setMarkingRead] = useState(false);
  const [, setTick] = useState(0);

  // Force re-render every 30 seconds to keep relative time-ago descriptions updated
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to real-time Firestore notifications
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeNotifications(
      user.uid,
      (notifications) => {
        setFirestoreNotifs(notifications);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to notifications:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load promo products from catalog dynamically
  useEffect(() => {
    listAvailableProducts()
      .then((products) => {
        const discounted = products.filter((p) => (p.discountPercent ?? 0) > 0);
        const promoNotifs = discounted.map(mapProductToPromoNotification);
        setPromos([...promoNotifs, ...STATIC_PROMO_NOTIFICATIONS]);
      })
      .catch((err) => {
        console.error("Failed to load catalog products for promos:", err);
      });
  }, []);

  // Filter notifications by tab
  const orderTabTypes = ["order", "production", "delivery", "validation"];
  const orderNotifs = firestoreNotifs.filter((n) => orderTabTypes.includes(n.type));
  const paymentNotifs = firestoreNotifs.filter((n) => n.type === "payment" || n.type === "system");

  const unreadOrderCount = orderNotifs.filter((n) => !n.read).length;

  const getNotificationsList = () => {
    if (activeTab === "order") {
      return orderNotifs;
    } else if (activeTab === "promo") {
      return promos;
    } else {
      // Info tab: payment/system Firestore notifs + static info
      const infoFromFirestore: NotificationItem[] = paymentNotifs.map((n) => ({
        id: n.id,
        type: "info" as const,
        title: { id: n.title, en: n.titleEn },
        message: { id: n.message, en: n.messageEn },
        time: n.createdAt,
        orderId: n.orderId ?? undefined,
      }));
      return [...infoFromFirestore, ...STATIC_INFO_NOTIFICATIONS].sort(
        (a, b) => Date.parse(b.time) - Date.parse(a.time)
      );
    }
  };

  const currentList = getNotificationsList();

  const handleMarkAllRead = async () => {
    if (!user || markingRead) return;
    setMarkingRead(true);
    try {
      await markAllNotificationsAsRead(user.uid);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingRead(false);
    }
  };

  const t = {
    title: lang === "id" ? "Pusat Notifikasi" : "Notification Center",
    tabOrder: lang === "id" ? "Status Pesanan" : "Order Status",
    tabPromo: lang === "id" ? "Promo" : "Promos",
    tabInfo: lang === "id" ? "Info & Pembayaran" : "Info & Payments",
    noNotif: lang === "id" ? "Belum ada notifikasi baru" : "No new notifications",
    viewOrder: lang === "id" ? "Lihat Detail Pesanan" : "View Order Details",
    loading: lang === "id" ? "Memuat data..." : "Loading data...",
    navMyAccount: lang === "id" ? "Akun Saya" : "My Account",
    navNotif: lang === "id" ? "Notifikasi" : "Notifications",
    navSignOut: lang === "id" ? "Keluar" : "Logout",
    userGreeting: lang === "id" ? "Halo," : "Hello,",
    markAllRead: lang === "id" ? "Tandai Semua Dibaca" : "Mark All as Read",
  };

  const isOperational = profile && profile.role !== "admin";

  return (
    <div className={`${isOperational ? "" : "min-h-screen bg-[#F3F4F6] pb-12"} font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-800`}>
      <div className={isOperational ? "max-w-7xl mx-auto" : "max-w-7xl mx-auto px-4 py-8"}>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT SIDEBAR (Shopee-style Account Menu on Desktop) */}
          {!isOperational && (
            <aside className="hidden lg:block w-64 shrink-0 space-y-6">
              {/* User Profile Header */}
              <div className="flex items-center gap-3 px-2">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-tr from-[#FBBF24] to-[#F59E0B] flex items-center justify-center text-white text-base font-extrabold shadow-sm border border-neutral-200 shrink-0">
                  {profile?.photoURL || user?.photoURL ? (
                    <img
                      src={profile?.photoURL || user?.photoURL || ""}
                      alt="Avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()
                  )}
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
          )}

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 space-y-4">
            {/* Header Title */}
            <header className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shadow-xs">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
                    {t.title}
                  </h1>
                </div>
              </div>

              {/* Mark All as Read button */}
              {firestoreNotifs.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingRead}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FEF3C7] text-[#B45309] text-[11px] font-bold hover:bg-[#FDE68A] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>{t.markAllRead}</span>
                </button>
              )}
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
                  {unreadOrderCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                      {unreadOrderCount}
                    </span>
                  )}
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
              ) : activeTab === "order" ? (
                /* Firestore notification cards for order tab */
                (currentList as FirestoreNotification[]).map((item) => {
                  const iconInfo = getNotifIcon(item.type);
                  const IconComp = iconInfo.icon;
                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-xl border hover:border-amber-200 p-4 transition-all duration-150 shadow-xs flex gap-3.5 ${
                        item.read
                          ? "border-[#E5E7EB] opacity-75"
                          : "border-l-[3px] border-l-amber-400 border-t border-r border-b border-t-[#E5E7EB] border-r-[#E5E7EB] border-b-[#E5E7EB]"
                      }`}
                    >
                      {/* Icon type marker */}
                      <div className="shrink-0">
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center shadow-xs ${iconInfo.bg} ${iconInfo.text}`}
                        >
                          <IconComp className="h-4.5 w-4.5" />
                        </div>
                      </div>

                      {/* Text content block */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <h4 className={`text-xs leading-tight ${item.read ? "font-semibold text-neutral-600" : "font-extrabold text-neutral-800"}`}>
                            {lang === "id" ? item.title : item.titleEn}
                          </h4>
                          <span className="text-[10px] text-neutral-400 font-semibold shrink-0">
                            {formatTimeAgo(item.createdAt, lang)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-600 leading-relaxed">
                          {lang === "id" ? item.message : item.messageEn}
                        </p>

                        {/* Actor role badge */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 uppercase tracking-wider">
                            {item.actorRole}
                          </span>
                          {!item.read && (
                            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Belum dibaca" />
                          )}
                        </div>


                      </div>
                    </div>
                  );
                })
              ) : (
                /* Promo and Info tabs — use the legacy NotificationItem format */
                (currentList as NotificationItem[]).map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-[#E5E7EB] hover:border-amber-200 p-4 transition-all duration-150 shadow-xs flex gap-3.5"
                  >
                    {/* Icon type marker */}
                    <div className="shrink-0">
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center shadow-xs ${
                          item.type === "promo"
                            ? "bg-red-50 text-red-500"
                            : "bg-blue-50 text-blue-500"
                        }`}
                      >
                        {item.type === "promo" ? (
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
