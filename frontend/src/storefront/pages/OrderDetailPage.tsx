import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, MapPin, Clock, FileImage, ShieldAlert } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { subscribeToOrder } from "@/services/orderService";
import type { Order } from "@/types/order";
import { STATUS_LABELS, getStatusBadgeClass } from "@/lib/orderHelpers";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("ID Pesanan tidak valid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to Order for real-time status updates (Requirement 8.10 / 9.6)
    const unsubscribe = subscribeToOrder(
      id,
      (updatedOrder) => {
        setOrder(updatedOrder);
        setLoading(false);
      },
      (err) => {
        console.error("Gagal berlangganan pesanan:", err);
        setError("Pesanan tidak ditemukan atau Anda tidak memiliki akses.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280] bg-[#F3F4F6] min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat detail pesanan…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error || "Pesanan tidak valid."}
        </p>
        <Link to="/orders" className="inline-flex min-h-11 px-6 bg-[#111827] text-white hover:bg-neutral-800 rounded-2xl items-center font-bold">
          Kembali ke Daftar Pesanan
        </Link>
      </div>
    );
  }

  const dateObj = new Date(order.createdAt);
  const formattedDate = isNaN(dateObj.getTime())
    ? "Tanggal tidak dikenal"
    : dateObj.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // If the status is AWAITING_PAYMENT_PROOF or PAYMENT_REJECTED, let them upload proof
  const needsProofUpload = order.status === "AWAITING_PAYMENT_PROOF" || order.status === "PAYMENT_REJECTED";

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-28">
      {/* Sticky Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to="/orders"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          Rincian Pesanan
        </h1>
      </div>

      <div className="p-4 space-y-4 max-w-[480px] mx-auto">
        {/* Status Card */}
        <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#9CA3AF] uppercase">Status Pesanan</span>
              <div className="pt-0.5">
                <span
                  className={
                    "rounded-full border px-2.5 py-0.5 text-xs font-bold " +
                    getStatusBadgeClass(order.status)
                  }
                >
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
            </div>
            <div className="text-right space-y-0.5">
              <span className="text-[10px] font-bold text-[#9CA3AF] uppercase">ID Pesanan</span>
              <p className="font-mono text-xs font-bold text-[#111827]">{order.id}</p>
            </div>
          </div>

          <div className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Dibuat pada: <span className="font-semibold text-[#111827]">{formattedDate}</span>
          </div>

          {order.status === "PAYMENT_REJECTED" && order.rejectionReason && (
            <div className="bg-red-50 border border-red-200 text-red-900 p-3.5 rounded-2xl text-xs font-['Hanken_Grotesk',system-ui,sans-serif] space-y-1">
              <span className="font-bold">Alasan Penolakan Pembayaran:</span>
              <p className="leading-relaxed">{order.rejectionReason}</p>
            </div>
          )}

          {order.status === "FAILED" && order.outOfStockItems && order.outOfStockItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-900 p-3.5 rounded-2xl text-xs font-['Hanken_Grotesk',system-ui,sans-serif] space-y-1">
              <span className="font-bold">Gagal karena Stok Kosong:</span>
              <p className="leading-relaxed">Beberapa item dalam pesanan Anda tidak memiliki stok yang cukup di koperasi.</p>
            </div>
          )}
        </div>

        {/* Product Items List Card */}
        <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
            Daftar Produk Belanja ({totalQty} barang)
          </h3>
          <div className="space-y-3 pt-1">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start text-xs">
                <div className="space-y-0.5 max-w-[70%]">
                  <p className="font-bold text-[#111827] leading-relaxed">{item.itemName}</p>
                  <p className="text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">{item.quantity} barang</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Address & Time Card */}
        <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
            Informasi Pengiriman
          </h3>

          <div className="flex gap-3 items-start text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#4B5563]">
            <MapPin className="h-5 w-5 text-[#9CA3AF] shrink-0" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">Alamat Pengantaran</span>
              <p className="leading-relaxed">{order.deliveryAddress}</p>
            </div>
          </div>

          <div className="flex gap-3 items-start text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#4B5563]">
            <Clock className="h-5 w-5 text-[#9CA3AF] shrink-0" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">Waktu Pengantaran</span>
              <p>{order.deliveryTime}</p>
            </div>
          </div>
        </div>

        {/* Floating Upload Proof Button if pending proof */}
        {needsProofUpload && (
          <div className="bg-white border-t border-[#E5E7EB] fixed bottom-14 left-0 right-0 p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] max-w-[480px] mx-auto z-10">
            <Link
              to={`/checkout/payment-proof/${encodeURIComponent(order.id)}`}
              className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-md transition-all"
            >
              <FileImage className="h-5 w-5" />
              Kirim Bukti Pembayaran
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrderDetailPage;
