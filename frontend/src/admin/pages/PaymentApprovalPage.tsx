import { useEffect, useState, useRef } from "react";
import { Loader2, Check, X, ImageOff } from "lucide-react";

import { subscribeToPaymentApprovalQueue, approvePayment, rejectPayment } from "@/services/orderService";
import type { Order } from "@/types/order";
import { formatIDR } from "@/lib/format";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function resolvePaymentProofURL(ref: string | undefined): string | null {
  if (!ref) return null;
  const segments = ref.trim().split("/");
  if (segments.length === 0) return null;
  const fileId = segments[segments.length - 1];
  if (!fileId) return null;
  return `${API_BASE_URL}/api/files/payment_proofs/${encodeURIComponent(fileId)}/download`;
}

export function PaymentApprovalPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected order details
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const selectedOrderRef = useRef<Order | null>(null);
  selectedOrderRef.current = selectedOrder;

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Subscribe to approval queue (Requirement 8.2)
    const unsubscribe = subscribeToPaymentApprovalQueue(
      (pendingOrders) => {
        setOrders(pendingOrders);
        setLoading(false);

        // Update selected order in real-time if it's still in the list
        const currentSelected = selectedOrderRef.current;
        if (currentSelected) {
          const fresh = pendingOrders.find((o) => o.id === currentSelected.id);
          if (fresh) {
            setSelectedOrder(fresh);
          } else {
            setSelectedOrder(null);
          }
        }
      },
      (err) => {
        console.error("Gagal berlangganan antrean persetujuan:", err);
        setError("Gagal memuat antrean persetujuan bukti pembayaran.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleApprove = async (orderId: string) => {
    if (confirm("Setujui pembayaran untuk pesanan ini?")) {
      setProcessingId(orderId);
      try {
        await approvePayment(orderId);
        alert("Pembayaran berhasil disetujui.");
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(null);
        }
      } catch (err: unknown) {
        const errorObj = err as { status?: number; code?: string; message?: string };
        if (errorObj.status === 409 && errorObj.code === "INVALID_STATE_TRANSITION") {
          alert("Status pesanan sudah berubah, muat ulang.");
        } else {
          alert("Gagal menyetujui pembayaran: " + (errorObj.message || "Error tidak dikenal"));
        }
      } finally {
        setProcessingId(null);
      }
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionTarget) return;

    setRejectionError(null);
    const trimmedReason = rejectionReason.trim();

    if (trimmedReason.length < 1 || trimmedReason.length > 500) {
      setRejectionError("Alasan penolakan harus di antara 1 dan 500 karakter.");
      return;
    }

    setProcessingId(rejectionTarget.id);

    try {
      await rejectPayment(rejectionTarget.id, trimmedReason);
      alert("Pembayaran berhasil ditolak.");
      setRejectionTarget(null);
      setRejectionReason("");
      if (selectedOrder?.id === rejectionTarget.id) {
        setSelectedOrder(null);
      }
    } catch (err: unknown) {
      const errorObj = err as { status?: number; code?: string; message?: string };
      if (errorObj.status === 409 && errorObj.code === "INVALID_STATE_TRANSITION") {
        alert("Status pesanan sudah berubah, muat ulang.");
      } else {
        alert("Gagal menolak pembayaran: " + (errorObj.message || "Error tidak dikenal"));
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat antrean pembayaran…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
          Persetujuan Pembayaran Koperasi
        </h1>
        <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
          Tinjau bukti pembayaran transfer bank/e-wallet untuk menyetujui pesanan pelanggan ke antrean masak.
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-950 p-6 rounded-3xl text-center space-y-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <p>{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-[32px] p-12 text-center space-y-4 shadow-sm border border-[#E5E7EB]">
          <Check className="h-16 w-16 mx-auto text-emerald-500 bg-emerald-50 rounded-full p-3" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            Antrean Kosong
          </h2>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-sm mx-auto">
            Semua pembayaran pesanan koperasi telah diselesaikan. Kerja bagus!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main List Table (Requirement 8.3) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl shadow-sm border border-[#E5E7EB] overflow-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-xs font-extrabold text-[#4B5563] uppercase font-['Manrope',system-ui,sans-serif]">
                    <th className="p-4 w-[40%]">Pelanggan & Pesanan</th>
                    <th className="p-4 w-[25%]">Jumlah (IDR)</th>
                    <th className="p-4 w-[35%]">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-xs font-medium text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {orders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    const dateObj = new Date(order.createdAt);
                    const formattedDate = isNaN(dateObj.getTime())
                      ? "Tanggal tidak dikenal"
                      : dateObj.toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className={
                          "cursor-pointer transition-colors " +
                          (isSelected
                            ? "bg-amber-50/50 hover:bg-amber-50"
                            : "hover:bg-[#F9FAFB]")
                        }
                      >
                        {/* ID, Name & Date */}
                        <td className="p-4 space-y-1">
                          <p className="font-bold text-[#111827] truncate">
                            {order.customerName}
                          </p>
                          <p className="font-mono text-[10px] text-[#6B7280]">
                            #{order.id.slice(0, 8)}...
                          </p>
                          <p className="text-[10px] text-[#9CA3AF] font-semibold">
                            {formattedDate}
                          </p>
                        </td>

                        {/* Total Amount & Payment Method */}
                        <td className="p-4 space-y-1">
                          <p className="font-bold text-sm text-[#111827]">
                            {/* Assuming subtotal + flat fees 12000 for non-COD */}
                            {formatIDR(
                              order.items.reduce((sum, i) => sum + 1000 * i.quantity, 0) + 12000
                            )}
                          </p>
                          <span className="inline-block px-1.5 py-0.5 bg-[#F3F4F6] border border-[#E5E7EB] text-[9px] font-bold rounded-lg text-neutral-600 uppercase">
                            Transfer Bank
                          </span>
                        </td>

                        {/* Actions (Requirement 8.3) */}
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleApprove(order.id)}
                              disabled={processingId === order.id}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-[10px] font-bold text-white rounded-xl flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                            >
                              {processingId === order.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Setujui
                            </button>

                            <button
                              onClick={() => setRejectionTarget(order)}
                              disabled={processingId === order.id}
                              className="px-2.5 py-1.5 border border-[#FCA5A5] bg-red-50 hover:bg-red-100 text-[10px] font-bold text-[#DC2626] rounded-xl flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Tolak
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar Proof Details Viewer (Requirement 8.4) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#E5E7EB] space-y-4">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                Peninjau Bukti Transfer
              </h3>

              {selectedOrder ? (
                <div className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {/* Image Canvas (Requirement 8.4) */}
                  <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-square flex items-center justify-center text-[#9CA3AF]">
                    {resolvePaymentProofURL(selectedOrder.paymentProofFileId) ? (
                      <img
                        src={resolvePaymentProofURL(selectedOrder.paymentProofFileId) || ""}
                        alt="Bukti Transfer Asli"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center space-y-1">
                        <ImageOff className="h-10 w-10" />
                        <span className="text-[10px]">Gambar bukti bayar tidak termuat</span>
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Nama Pengirim</span>
                      <span className="font-bold text-[#111827]">{selectedOrder.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Total Pesanan</span>
                      <span className="font-bold text-[#111827]">
                        {selectedOrder.items.length} item ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)} barang)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[#9CA3AF] space-y-2">
                  <ImageOff className="h-8 w-8 mx-auto text-[#D1D5DB]" />
                  <p>Pilih pesanan di tabel untuk melihat bukti transfer pembayaran.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal Dialog (Requirement 8.6 & 8.7) */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="space-y-1">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Tolak Pembayaran</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Silakan masukkan alasan penolakan bukti pembayaran untuk pesanan **{rejectionTarget.customerName}**.
              </p>
            </div>

            {/* Input textarea (Requirement 8.6) */}
            <div className="space-y-1">
              <textarea
                rows={4}
                maxLength={500}
                placeholder="Masukkan alasan penolakan (misal: nominal transfer tidak sesuai, bukti transfer buram/tidak terbaca)..."
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            {rejectionError && (
              <p className="text-xs font-semibold text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {rejectionError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectionTarget(null);
                  setRejectionReason("");
                  setRejectionError(null);
                }}
                disabled={processingId === rejectionTarget.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-2xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={processingId === rejectionTarget.id || rejectionReason.trim().length === 0}
                className="flex-1 min-h-10 bg-red-600 hover:bg-red-700 text-xs font-bold text-white rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed"
              >
                {processingId === rejectionTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Tolak Pembayaran"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentApprovalPage;
