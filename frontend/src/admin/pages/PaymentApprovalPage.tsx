import { useEffect, useState, useRef } from "react";
import { Loader2, Check, X, ImageOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

import { subscribeToPaymentApprovalQueue, approvePayment, rejectPayment } from "@/services/orderService";
import { getIdToken } from "@/services/authService";
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

const DICTIONARY = {
  id: {
    loading: "Memuat antrean pembayaran…",
    title: "Persetujuan Pembayaran Koperasi",
    subtitle: "Tinjau bukti pembayaran transfer bank/e-wallet untuk menyetujui pesanan pelanggan ke antrean masak.",
    queueError: "Gagal memuat antrean persetujuan bukti pembayaran.",
    emptyQueue: "Antrean Kosong",
    emptyQueueDesc: "Semua pembayaran pesanan koperasi telah diselesaikan. Kerja bagus!",
    thCustomerOrder: "Pelanggan & Pesanan",
    thAmount: "Jumlah (IDR)",
    thActions: "Aksi",
    unknownDate: "Tanggal tidak dikenal",
    bankTransfer: "Transfer Bank",
    btnApprove: "Setujui",
    btnReject: "Tolak",
    viewerTitle: "Peninjau Bukti Transfer",
    viewerEmpty: "Pilih pesanan di tabel untuk melihat bukti transfer pembayaran.",
    imageError: "Gambar bukti bayar tidak termuat",
    imageNoProof: "Belum ada bukti pembayaran diunggah",
    senderName: "Nama Pengirim",
    totalOrder: "Total Pesanan",
    itemsText: "item",
    goodsText: "barang",
    // Approve modal
    approveModalTitle: "Konfirmasi Persetujuan",
    approveModalDesc: "Apakah Anda yakin ingin menyetujui pembayaran dari {name}?",
    approveModalNote: "Pesanan akan masuk ke antrean masak setelah disetujui.",
    btnApproveConfirm: "Ya, Setujui",
    // Reject modal
    modalTitle: "Tolak Pembayaran",
    modalDesc: "Masukkan alasan penolakan untuk pesanan {name}. Alasan ini akan ditampilkan kepada pelanggan.",
    modalInfo: "Pelanggan akan melihat alasan ini di halaman status pesanan dan dapat mengunggah ulang bukti pembayaran.",
    modalPlaceholder: "Masukkan alasan penolakan (misal: nominal transfer tidak sesuai, bukti transfer buram/tidak terbaca, nama pengirim berbeda)...",
    modalErrorLen: "Alasan penolakan harus di antara 1 dan 500 karakter.",
    btnCancel: "Batal",
    btnSubmitReject: "Tolak Pembayaran",
    // Toast messages
    toastApproveSuccess: "Pembayaran berhasil disetujui.",
    toastRejectSuccess: "Pembayaran ditolak. Pelanggan akan melihat alasan penolakan.",
    toastConflictState: "Status pesanan sudah berubah, muat ulang halaman.",
    toastApproveError: "Gagal menyetujui pembayaran: ",
    toastRejectError: "Gagal menolak pembayaran: ",
    dateLocale: "id-ID",
  },
  en: {
    loading: "Loading payment queue…",
    title: "Cooperative Payment Approval",
    subtitle: "Review bank transfer/e-wallet payment proofs to approve customer orders to the cooking queue.",
    queueError: "Failed to load payment proof approval queue.",
    emptyQueue: "Queue Empty",
    emptyQueueDesc: "All cooperative order payments have been processed. Great job!",
    thCustomerOrder: "Customer & Order",
    thAmount: "Amount (IDR)",
    thActions: "Actions",
    unknownDate: "Unknown date",
    bankTransfer: "Bank Transfer",
    btnApprove: "Approve",
    btnReject: "Reject",
    viewerTitle: "Payment Proof Viewer",
    viewerEmpty: "Select an order in the table to view its payment proof.",
    imageError: "Payment proof image could not be loaded",
    imageNoProof: "No payment proof uploaded yet",
    senderName: "Sender Name",
    totalOrder: "Total Order",
    itemsText: "item(s)",
    goodsText: "qty",
    // Approve modal
    approveModalTitle: "Confirm Approval",
    approveModalDesc: "Are you sure you want to approve the payment from {name}?",
    approveModalNote: "The order will enter the cooking queue after approval.",
    btnApproveConfirm: "Yes, Approve",
    // Reject modal
    modalTitle: "Reject Payment",
    modalDesc: "Enter the rejection reason for order {name}. This reason will be shown to the customer.",
    modalInfo: "The customer will see this reason on their order status page and can re-upload payment proof.",
    modalPlaceholder: "Enter rejection reason (e.g., incorrect transfer amount, blurry/unreadable proof)...",
    modalErrorLen: "Rejection reason must be between 1 and 500 characters.",
    btnCancel: "Cancel",
    btnSubmitReject: "Reject Payment",
    // Toast messages
    toastApproveSuccess: "Payment successfully approved.",
    toastRejectSuccess: "Payment rejected. Customer will see the rejection reason.",
    toastConflictState: "Order status has changed, please reload the page.",
    toastApproveError: "Failed to approve payment: ",
    toastRejectError: "Failed to reject payment: ",
    dateLocale: "en-US",
  }
} as const;

// ── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";

interface ToastState {
  message: string;
  type: ToastType;
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  return (
    <div
      className={
        "fixed top-5 right-5 z-[200] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-lg text-sm font-semibold font-['Hanken_Grotesk',system-ui,sans-serif] animate-in slide-in-from-top-2 duration-300 max-w-sm " +
        (toast.type === "success"
          ? "bg-emerald-600 text-white"
          : "bg-red-600 text-white")
      }
    >
      {toast.type === "success" ? (
        <CheckCircle2 className="h-5 w-5 shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 shrink-0" />
      )}
      <span className="flex-1">{toast.message}</span>
      <button onClick={onClose} aria-label="Tutup notifikasi" className="ml-1 opacity-80 hover:opacity-100 cursor-pointer">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PaymentApprovalPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  // Selected order details
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const selectedOrderRef = useRef<Order | null>(null);
  selectedOrderRef.current = selectedOrder;

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Approve confirmation modal
  const [approvalTarget, setApprovalTarget] = useState<Order | null>(null);

  // Reject modal
  const [rejectionTarget, setRejectionTarget] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: ToastType) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  };

  // Image fetch states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // ── Load payment proof image ────────────────────────────────────────────

  useEffect(() => {
    const fileRef = selectedOrder?.paymentProofFileId;
    if (!fileRef) {
      setImageSrc(null);
      setImageError(false);
      setImageLoading(false);
      return;
    }

    const url = resolvePaymentProofURL(fileRef);
    if (!url) {
      setImageSrc(null);
      setImageError(false);
      setImageLoading(false);
      return;
    }

    let active = true;
    setImageLoading(true);
    setImageError(false);
    setImageSrc(null);

    const loadImage = async () => {
      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("Failed to fetch image");
        const blob = await res.blob();
        if (!active) return;
        setImageSrc(URL.createObjectURL(blob));
      } catch (err) {
        console.error("Failed to load payment proof image:", err);
        if (active) setImageError(true);
      } finally {
        if (active) setImageLoading(false);
      }
    };

    loadImage();
    return () => { active = false; };
  }, [selectedOrder?.paymentProofFileId]);

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  // ── Subscribe to approval queue ─────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToPaymentApprovalQueue(
      (pendingOrders) => {
        setOrders(pendingOrders);
        setLoading(false);

        const currentSelected = selectedOrderRef.current;
        if (currentSelected) {
          const fresh = pendingOrders.find((o) => o.id === currentSelected.id);
          setSelectedOrder(fresh ?? null);
        }
      },
      (err) => {
        console.error("Gagal berlangganan antrean persetujuan:", err);
        setError(DICTIONARY[lang].queueError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [lang]);

  // ── Approve flow ────────────────────────────────────────────────────────

  const handleApproveConfirm = async () => {
    if (!approvalTarget) return;
    const targetId = approvalTarget.id;
    setApprovalTarget(null);
    setProcessingId(targetId);
    try {
      await approvePayment(targetId);
      showToast(t.toastApproveSuccess, "success");
      if (selectedOrder?.id === targetId) setSelectedOrder(null);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string; message?: string };
      if (e.status === 409 && e.code === "INVALID_STATE_TRANSITION") {
        showToast(t.toastConflictState, "error");
      } else {
        showToast(t.toastApproveError + (e.message ?? "Error tidak dikenal"), "error");
      }
    } finally {
      setProcessingId(null);
    }
  };

  // ── Reject flow ─────────────────────────────────────────────────────────

  const handleRejectSubmit = async () => {
    if (!rejectionTarget) return;
    setRejectionError(null);
    const trimmedReason = rejectionReason.trim();
    if (trimmedReason.length < 1 || trimmedReason.length > 500) {
      setRejectionError(t.modalErrorLen);
      return;
    }

    const targetId = rejectionTarget.id;
    setRejectionTarget(null);
    setRejectionReason("");
    setProcessingId(targetId);

    try {
      await rejectPayment(targetId, trimmedReason);
      showToast(t.toastRejectSuccess, "success");
      if (selectedOrder?.id === targetId) setSelectedOrder(null);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string; message?: string };
      if (e.status === 409 && e.code === "INVALID_STATE_TRANSITION") {
        showToast(t.toastConflictState, "error");
      } else {
        showToast(t.toastRejectError + (e.message ?? "Error tidak dikenal"), "error");
      }
    } finally {
      setProcessingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
          {t.title}
        </h1>
        <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
          {t.subtitle}
        </p>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-950 p-5 rounded-2xl text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center space-y-3 border border-[#E5E7EB]">
          <Check className="h-14 w-14 mx-auto text-emerald-500 bg-emerald-50 rounded-full p-3" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            {t.emptyQueue}
          </h2>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            {t.emptyQueueDesc}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* ── Card list ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-3">
            {orders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              const dateObj = new Date(order.createdAt);
              const formattedDate = isNaN(dateObj.getTime())
                ? t.unknownDate
                : dateObj.toLocaleDateString(t.dateLocale, {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  });
              const total = formatIDR(order.items.reduce((sum, i) => sum + 1000 * i.quantity, 0) + 12000);
              const isBusy = processingId === order.id;

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={
                    "bg-white rounded-lg border shadow-xs overflow-hidden cursor-pointer transition-all " +
                    (isSelected
                      ? "border-amber-300 ring-2 ring-amber-100"
                      : "border-[#E5E7EB] hover:border-[#D1D5DB]")
                  }
                >
                  <div className={
                    "h-1 " +
                    (isSelected ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-transparent")
                  } />

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-sm truncate">
                          {order.customerName}
                        </p>
                        <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">#{order.id.slice(0, 10)}…</p>
                        <p className="text-[10px] text-[#9CA3AF] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">{formattedDate}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-sm">{total}</p>
                        <span className="inline-block px-1.5 py-0.5 bg-[#F3F4F6] border border-[#E5E7EB] text-[9px] font-bold rounded text-neutral-600 uppercase mt-0.5">
                          {t.bankTransfer}
                        </span>
                      </div>
                    </div>

                    {/* Inline proof image on mobile when selected */}
                    {isSelected && (
                      <div className="lg:hidden mt-3 mb-4 space-y-3 border-t border-[#F3F4F6] pt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative border border-[#E5E7EB] rounded-lg overflow-hidden bg-[#F3F4F6] aspect-square flex items-center justify-center text-[#9CA3AF]">
                          {imageLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
                          ) : imageError ? (
                            <div className="flex flex-col items-center gap-1 text-center">
                              <ImageOff className="h-8 w-8" />
                              <span className="text-[10px]">{t.imageError}</span>
                            </div>
                          ) : imageSrc ? (
                            <img src={imageSrc} alt="Bukti Transfer" className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-center">
                              <ImageOff className="h-8 w-8" />
                              <span className="text-[10px]">{t.imageNoProof}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[#6B7280]">{t.senderName}</span>
                            <span className="font-bold text-[#111827]">{order.customerName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#6B7280]">{t.totalOrder}</span>
                            <span className="font-bold text-[#111827]">
                              {order.items.length} {t.itemsText} ({order.items.reduce((s, i) => s + i.quantity, 0)} {t.goodsText})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setApprovalTarget(order)}
                        disabled={isBusy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white rounded-lg cursor-pointer transition-all disabled:opacity-50 active:scale-[0.98]"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {t.btnApprove}
                      </button>
                      <button
                        onClick={() => { setRejectionTarget(order); setRejectionReason(""); setRejectionError(null); }}
                        disabled={isBusy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#FCA5A5] bg-red-50 hover:bg-red-100 text-xs font-bold text-[#DC2626] rounded-lg cursor-pointer transition-all disabled:opacity-50 active:scale-[0.98]"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t.btnReject}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Proof Viewer (Desktop only) ─────────────────────────── */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-white rounded-lg p-5 shadow-xs border border-[#E5E7EB] space-y-4 lg:sticky lg:top-20">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                {t.viewerTitle}
              </h3>

              {selectedOrder ? (
                <div className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  <div className="relative border border-[#E5E7EB] rounded-lg overflow-hidden bg-[#F3F4F6] aspect-square flex items-center justify-center text-[#9CA3AF]">
                    {imageLoading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
                    ) : imageError ? (
                      <div className="flex flex-col items-center gap-1 text-center">
                        <ImageOff className="h-10 w-10" />
                        <span className="text-[10px]">{t.imageError}</span>
                      </div>
                    ) : imageSrc ? (
                      <img src={imageSrc} alt="Bukti Transfer" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-center">
                        <ImageOff className="h-10 w-10" />
                        <span className="text-[10px]">{t.imageNoProof}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">{t.senderName}</span>
                      <span className="font-bold text-[#111827]">{selectedOrder.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">{t.totalOrder}</span>
                      <span className="font-bold text-[#111827]">
                        {selectedOrder.items.length} {t.itemsText} ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)} {t.goodsText})
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setApprovalTarget(selectedOrder)}
                      disabled={!!processingId}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-[11px] font-bold text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t.btnApprove}
                    </button>
                    <button
                      onClick={() => {
                        setRejectionTarget(selectedOrder);
                        setRejectionReason("");
                        setRejectionError(null);
                      }}
                      disabled={!!processingId}
                      className="flex-1 py-2 border border-[#FCA5A5] bg-red-50 hover:bg-red-100 text-[11px] font-bold text-[#DC2626] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t.btnReject}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[#9CA3AF] space-y-2">
                  <ImageOff className="h-8 w-8 mx-auto text-[#D1D5DB]" />
                  <p>{t.viewerEmpty}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Confirmation Modal ──────────────────────────────────── */}
      {approvalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl space-y-5 font-['Hanken_Grotesk',system-ui,sans-serif]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon + title */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">
                  {t.approveModalTitle}
                </h3>
                <p className="text-xs text-[#6B7280] leading-relaxed mt-1.5 max-w-xs">
                  {t.approveModalDesc.replace("{name}", approvalTarget.customerName)}
                </p>
              </div>
            </div>

            {/* Note */}
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[10px] text-emerald-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{t.approveModalNote}</span>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setApprovalTarget(null)}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-lg cursor-pointer transition-colors"
              >
                {t.btnCancel}
              </button>
              <button
                onClick={handleApproveConfirm}
                className="flex-1 min-h-10 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              >
                <Check className="h-4 w-4" />
                {t.btnApproveConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection Modal ─────────────────────────────────────────────── */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon + title */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-red-50 border-4 border-red-100 flex items-center justify-center">
                <X className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">
                  {t.modalTitle}
                </h3>
                <p className="text-xs text-[#6B7280] leading-relaxed mt-1.5 max-w-xs">
                  {t.modalDesc.replace("{name}", rejectionTarget.customerName)}
                </p>
              </div>
            </div>

            {/* Info box */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{t.modalInfo}</span>
            </div>

            {/* Textarea */}
            <div className="space-y-1">
              <textarea
                rows={4}
                maxLength={500}
                autoFocus
                placeholder={t.modalPlaceholder}
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-4 py-3 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
              <div className="flex justify-between items-center px-1">
                {rejectionError
                  ? <p className="text-[10px] font-semibold text-[#EF4444]">{rejectionError}</p>
                  : <span />}
                <span className="text-[10px] text-[#9CA3AF]">{rejectionReason.length}/500</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectionTarget(null);
                  setRejectionReason("");
                  setRejectionError(null);
                }}
                disabled={processingId === rejectionTarget.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-lg cursor-pointer transition-colors"
              >
                {t.btnCancel}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={processingId === rejectionTarget.id || rejectionReason.trim().length === 0}
                className="flex-1 min-h-10 bg-red-600 hover:bg-red-700 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed transition-colors"
              >
                {processingId === rejectionTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    {t.btnSubmitReject}
                  </>
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
