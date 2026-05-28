import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, ClipboardList, AlertCircle, RefreshCw } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { listMyOrders } from "@/services/orderService";
import type { Order } from "@/types/order";
import { STATUS_LABELS, getStatusBadgeClass } from "@/lib/orderHelpers";
import { useLanguage } from "@/contexts/LanguageContext";

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

export function OrderListPage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (cursor?: string) => {
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
  };

  useEffect(() => {
    if (user) {
      load();
    }
  }, [user]);

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
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
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

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 py-20 text-center space-y-4">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-[#9CA3AF] shadow-sm">
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
          {orders.map((order) => {
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
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#6B7280]">#{order.id.slice(0, 8)}...</span>
                  <span className="text-[#9CA3AF]">{formattedDate}</span>
                </div>

                {/* Products Preview */}
                <div className="space-y-1">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827] truncate">
                    {order.items[0]?.itemName || "Pesanan Produk"}
                  </h3>
                  {order.items.length > 1 && (
                    <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                      {t.otherProducts.replace("{count}", String(order.items.length - 1))}
                    </p>
                  )}
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
          })}

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
