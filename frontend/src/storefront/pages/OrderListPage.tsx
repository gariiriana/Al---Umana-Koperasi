import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, ClipboardList, AlertCircle, RefreshCw, Wallet, Package, Truck, Star } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { listMyOrders } from "@/services/orderService";
import type { Order } from "@/types/order";
import { STATUS_LABELS, getStatusBadgeClass } from "@/lib/orderHelpers";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProductImage } from "@/components/ProductImage";
import { db } from "@/lib/firebase";

const DICTIONARY = {
  id: {
    title: "Pesanan Saya",
    timeoutError: "Koneksi lambat atau server tidak merespons. Silakan coba lagi.",
    fetchError: "Gagal memuat daftar pesanan Anda.",
    notLoggedIn: "Belum Masuk Akun",
    loginPrompt: "Silakan masuk ke akun koperasi Anda untuk melihat riwayat pembelian Anda.",
    loginNow: "Masuk Sekarang",
    loadingHistory: "Memuat riwayat pesanan…",
    tryAgain: "Coba Lagi",
    noOrders: "Belum Ada Pesanan",
    emptyPrompt: "Sepertinya Anda belum pernah berbelanja di koperasi. Yuk beli barang kesukaanmu!",
    startShopping: "Mulai Belanja",
    unknownDate: "Tanggal tidak dikenal",
    otherProducts: "dan {count} produk lainnya",
    itemsCount: "{count} barang",
    loading: "Memuat…",
    showMore: "Tampilkan Pesanan Lainnya",
  },
  en: {
    title: "My Orders",
    timeoutError: "Slow connection or server is not responding. Please try again.",
    fetchError: "Failed to load your order list.",
    notLoggedIn: "Not Logged In",
    loginPrompt: "Please log in to your cooperative account to view your purchase history.",
    loginNow: "Log In Now",
    loadingHistory: "Loading order history...",
    tryAgain: "Try Again",
    noOrders: "No Orders Yet",
    emptyPrompt: "It looks like you haven't shopped at the cooperative yet. Let's buy your favorite items!",
    startShopping: "Start Shopping",
    unknownDate: "Unknown date",
    otherProducts: "and {count} other products",
    itemsCount: "{count} item(s)",
    loading: "Loading...",
    showMore: "Show More Orders",
  }
} as const;

// Global in-memory cache for mapping itemId -> imageUrl
const itemImageCache: Record<string, string> = {};

function OrderItemImage({ itemId, itemName, initialImageUrl }: { itemId: string; itemName: string; initialImageUrl?: string }) {
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialImageUrl || itemImageCache[itemId]);

  useEffect(() => {
    if (imageUrl) return;

    if (itemImageCache[itemId]) {
      setImageUrl(itemImageCache[itemId]);
      return;
    }

    let isMounted = true;
    async function fetchImageUrl() {
      try {
        const docRef = doc(db, "inventory", itemId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const fetchedUrl = data?.imageUrl || "";
          itemImageCache[itemId] = fetchedUrl;
          if (isMounted) {
            setImageUrl(fetchedUrl);
          }
        }
      } catch (err) {
        console.error("Error fetching product image for order item list:", err);
      }
    }

    void fetchImageUrl();
    return () => {
      isMounted = false;
    };
  }, [itemId, imageUrl]);

  return (
    <div className="w-12 h-12 bg-[#F3F4F6] rounded-xl overflow-hidden border border-[#E5E7EB] shrink-0 relative flex items-center justify-center">
      {imageUrl ? (
        <ProductImage
          imageUrl={imageUrl}
          alt={itemName}
          className="absolute inset-0 h-full w-full object-cover"
          fallbackClassName="h-5 w-5 text-[#9CA3AF]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F3F4F6]">
          <span className="text-[10px] text-neutral-400 font-bold">Foto</span>
        </div>
      )}
    </div>
  );
}

export function OrderListPage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"unpaid" | "preparing" | "shipped" | "reviewed">("unpaid");

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    // Set 10-second timeout per Requirement 9.7
    let requestCompleted = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        if (!requestCompleted) {
          reject(new Error("TIMEOUT"));
        }
      }, 10000);
    });

    try {
      const result = await Promise.race([
        listMyOrders({ cursor, limit: 50 }),
        timeoutPromise,
      ]);

      requestCompleted = true;

      if (!cursor) {
        setOrders(result.orders);
      } else {
        setOrders((prev) => [...prev, ...result.orders]);
      }
      setNextCursor(result.nextCursor);
    } catch (err: unknown) {
      requestCompleted = true;
      const errorObj = err as { message?: string };
      if (errorObj.message === "TIMEOUT") {
        setError(t.timeoutError);
      } else {
        setError(t.fetchError);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t.timeoutError, t.fetchError]);

  useEffect(() => {
    if (user) {
      load();
    }
  }, [user, load]);

  const tabLabelsId = {
    unpaid: "Belum Bayar",
    preparing: "Dikemas",
    shipped: "Dikirim",
    reviewed: "Beri Penilaian",
  };

  const tabLabelsEn = {
    unpaid: "Unpaid",
    preparing: "Preparing",
    shipped: "Shipped",
    reviewed: "To Review",
  };

  const getTabCount = (tabId: "unpaid" | "preparing" | "shipped" | "reviewed") => {
    return orders.filter((order) => {
      switch (tabId) {
        case "unpaid":
          return [
            "PLACING",
            "AWAITING_PAYMENT_PROOF",
            "AWAITING_PAYMENT_APPROVAL",
            "PAYMENT_REJECTED",
          ].includes(order.status);
        case "preparing":
          return [
            "CONFIRMED",
            "IN_PRODUCTION",
            "READY",
          ].includes(order.status);
        case "shipped":
          return [
            "READY_TO_DELIVER",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
          ].includes(order.status);
        case "reviewed":
          return ["COMPLETED", "FAILED"].includes(order.status);
        default:
          return false;
      }
    }).length;
  };

  const getFilteredOrders = useCallback(() => {
    return orders.filter((order) => {
      switch (activeTab) {
        case "unpaid":
          return [
            "PLACING",
            "AWAITING_PAYMENT_PROOF",
            "AWAITING_PAYMENT_APPROVAL",
            "PAYMENT_REJECTED",
          ].includes(order.status);
        case "preparing":
          return [
            "CONFIRMED",
            "IN_PRODUCTION",
            "READY",
          ].includes(order.status);
        case "shipped":
          return [
            "READY_TO_DELIVER",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
          ].includes(order.status);
        case "reviewed":
          return ["COMPLETED", "FAILED"].includes(order.status);
        default:
          return true;
      }
    });
  }, [orders, activeTab]);

  const filteredOrders = getFilteredOrders();

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] pb-20 flex flex-col">
        <div className="bg-white border-b border-[#E5E7EB] sticky top-0 px-4 py-3 flex items-center gap-3">
          <Link to="/" className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.title}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="h-16 w-16 bg-amber-50 rounded-full flex items-center justify-center text-[#FBBF24]">
            <ClipboardList className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.notLoggedIn}</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              {t.loginPrompt}
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            {t.loginNow}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280] bg-[#F3F4F6] min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingHistory}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 min-h-11 px-6 rounded-2xl bg-[#FBBF24] text-sm font-semibold text-[#111827] cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          {t.tryAgain}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          aria-label={t.title}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {t.title}
        </h1>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-[53px] z-10 shadow-2xs py-1">
        <div className="max-w-[480px] mx-auto flex justify-between px-2">
          {([
            { id: "unpaid", icon: Wallet, isCircular: false },
            { id: "preparing", icon: Package, isCircular: false },
            { id: "shipped", icon: Truck, isCircular: false },
            { id: "reviewed", icon: Star, isCircular: true },
          ] as const).map((tab) => {
            const label = lang === "en" ? tabLabelsEn[tab.id] : tabLabelsId[tab.id];
            const isActive = activeTab === tab.id;
            const IconComponent = tab.icon;
            const count = getTabCount(tab.id);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 transition-all cursor-pointer relative ${
                  isActive ? "text-[#F59E0B]" : "text-neutral-800 hover:text-neutral-600"
                }`}
              >
                {/* Icon Container with optional Badge */}
                <div className="relative flex items-center justify-center h-8 mb-1">
                  {tab.isCircular ? (
                    <div className={`h-7 w-7 rounded-full border flex items-center justify-center transition-colors ${
                      isActive ? "border-[#F59E0B]" : "border-neutral-800"
                    }`}>
                      <IconComponent className="h-4 w-4 stroke-[1.8] fill-transparent" />
                    </div>
                  ) : (
                    <IconComponent className="h-6 w-6 stroke-[1.8]" />
                  )}

                  {/* Red Notification Badge */}
                  {count > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center border border-white">
                      {count}
                    </span>
                  )}
                </div>

                {/* Label Text */}
                <span className={`text-[11px] leading-tight text-center font-['Manrope',system-ui,sans-serif] transition-colors ${
                  isActive ? "font-extrabold" : "font-semibold text-neutral-600"
                }`}>
                  {label}
                </span>

                {/* Active Underline Indicator */}
                <div className={`absolute bottom-0 left-6 right-6 h-0.5 rounded-full transition-all ${
                  isActive ? "bg-[#F59E0B]" : "bg-transparent"
                }`} />
              </button>
            );
          })}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 py-20 text-center space-y-4">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-[#9CA3AF] shadow-xs">
            <ClipboardList className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.noOrders}</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              {t.emptyPrompt}
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            {t.startShopping}
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-3 max-w-[480px] mx-auto">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 py-20 text-center space-y-4">
              <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-[#9CA3AF] shadow-xs">
                <ClipboardList className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                  {lang === "en" ? "No Orders" : "Tidak Ada Pesanan"}
                </h2>
                <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
                  {lang === "en"
                    ? `You have no orders in the "${tabLabelsEn[activeTab]}" stage.`
                    : `Belum ada pesanan dalam status "${tabLabelsId[activeTab]}".`}
                </p>
              </div>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const dateObj = new Date(order.createdAt);
              const formattedDate = isNaN(dateObj.getTime())
                ? t.unknownDate
                : dateObj.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

              // Calculate total quantity
              const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <Link
                  key={order.id}
                  to={`/orders/${encodeURIComponent(order.id)}`}
                  className="block bg-white rounded-3xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow space-y-3"
                >
                  {/* ID & Date */}
                  <div className="flex items-center justify-between text-[11px] font-['Hanken_Grotesk',system-ui,sans-serif]">
                    <span className="font-mono text-[#6B7280]">#{order.id.slice(-6).toUpperCase()}</span>
                    <span className="text-[#9CA3AF] font-medium">{formattedDate}</span>
                  </div>

                  {/* Complete Products Preview List */}
                  <div className="space-y-2 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#4B5563]">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-2">
                        <OrderItemImage
                          itemId={item.itemId}
                          itemName={item.itemName}
                          initialImageUrl={item.imageUrl}
                        />
                        <span className="font-bold text-[#111827] truncate flex-1">{item.itemName}</span>
                        <span className="text-neutral-500 font-extrabold shrink-0 pr-1">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status Badge & Total Quantity */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#F3F4F6]">
                    <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                      {t.itemsCount.replace("{count}", String(totalQty))}
                    </span>
                    <span
                      className={
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold " +
                        getStatusBadgeClass(order.status)
                      }
                    >
                      {STATUS_LABELS[lang][order.status] || order.status}
                    </span>
                  </div>
                </Link>
              );
            })
          )}

          {/* Load More Button */}
          {nextCursor && (
            <button
              onClick={() => load(nextCursor)}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-2 min-h-11 border border-[#E5E7EB] bg-white text-xs font-bold text-[#111827] rounded-2xl cursor-pointer"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
                  {t.loading}
                </>
              ) : (
                t.showMore
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OrderListPage;
