import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, MapPin, Clock, FileImage, ShieldAlert } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToOrder } from "@/services/orderService";
import type { Order } from "@/types/order";
import { STATUS_LABELS, getStatusBadgeClass } from "@/lib/orderHelpers";

function getStatusStepIndex(status: string): number {
  switch (status) {
    case "PLACING":
    case "AWAITING_PAYMENT_PROOF":
      return 1;
    case "AWAITING_PAYMENT_APPROVAL":
    case "PAYMENT_REJECTED":
      return 2;
    case "CONFIRMED":
    case "IN_PRODUCTION":
      return 3;
    case "READY":
    case "READY_TO_DELIVER":
      return 4;
    case "OUT_FOR_DELIVERY":
      return 5;
    case "DELIVERED":
      return 6;
    default:
      return 1;
  }
}

const steps = [
  {
    title: "Pesanan Dibuat",
    desc: (_status: string, step: number) => 
      step > 1 ? "Pesanan berhasil dibuat" : "Menunggu kelengkapan data pesanan",
  },
  {
    title: "Persetujuan Pembayaran",
    desc: (status: string, step: number) => {
      if (status === "PAYMENT_REJECTED") return "Bukti transfer ditolak oleh pengurus";
      if (status === "AWAITING_PAYMENT_APPROVAL") return "Bukti bayar diunggah, menunggu persetujuan";
      if (step > 2) return "Pembayaran berhasil diverifikasi";
      return "Menunggu pembayaran bukti transfer";
    }
  },
  {
    title: "Proses Dapur",
    desc: (status: string, step: number) => {
      if (status === "IN_PRODUCTION") return "Pesanan sedang dimasak di dapur koperasi";
      if (step > 3) return "Selesai diproses & dikemas";
      return "Menunggu antrean masuk dapur";
    }
  },
  {
    title: "Siap Dikirim",
    desc: (status: string, step: number) => {
      if (status === "READY" || status === "READY_TO_DELIVER") return "Pesanan dikemas & menunggu kurir berangkat";
      if (step > 4) return "Pesanan diserahkan ke kurir";
      return "Menunggu kesiapan produk";
    }
  },
  {
    title: "Dalam Pengantaran",
    desc: (status: string, step: number) => {
      if (status === "OUT_FOR_DELIVERY") return "Kurir dalam perjalanan ke alamat Anda";
      if (step > 5) return "Selesai diantar ke lokasi tujuan";
      return "Menunggu jadwal pengiriman";
    }
  },
  {
    title: "Pesanan Diterima",
    desc: (_status: string, step: number) => {
      if (step === 6) return "Pesanan telah sukses diterima. Terima kasih!";
      return "Menunggu pesanan sampai";
    }
  }
];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [proofImageSrc, setProofImageSrc] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Dynamic Base64 Chunk Assembler for Firestore direct storage (Requirement 7.6–7.7)
  useEffect(() => {
    const proofFileId = order?.paymentProofFileId;
    if (!proofFileId) {
      setProofImageSrc(null);
      return;
    }

    const loadProof = async () => {
      setLoadingProof(true);
      try {
        const fileId = proofFileId.replace("payment_proofs/", "");
        const parentRef = doc(db, "payment_proofs", fileId);
        const parentSnap = await getDoc(parentRef);
        
        if (parentSnap.exists()) {
          const meta = parentSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "payment_proofs", fileId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          setProofImageSrc(fullDataUri);
        }
      } catch (err) {
        console.error("Gagal memuat bukti pembayaran:", err);
      } finally {
        setLoadingProof(false);
      }
    };

    loadProof();
  }, [order?.paymentProofFileId]);

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

  const currentStepIndex = getStatusStepIndex(order?.status || "");

  useEffect(() => {
    if (progressRef.current) {
      const widthVal = `${Math.min(84, Math.max(0, (currentStepIndex - 1) * 16.8))}%`;
      progressRef.current.style.width = widthVal;
    }
  }, [currentStepIndex]);

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

      <div className="p-4 max-w-[480px] lg:max-w-6xl mx-auto">
        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-6 items-start gap-4">
          {/* Left Column (col-span-2) */}
          <div className="w-full lg:col-span-2 space-y-4">
            {/* Lacak Pesanan (Order Tracking Stepper - Horizontal) */}
            <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-5">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                Lacak Pesanan Anda
              </h3>
              
              {/* Horizontal Stepper Timeline */}
              <div className="relative pt-1">
                {/* The horizontal timeline line connecting circles */}
                <div className="absolute left-[8%] right-[8%] top-[13px] h-0.5 bg-[#E5E7EB] z-0" />
                
                {/* Progress bar fill for completed steps */}
                <div 
                  ref={progressRef}
                  className="absolute left-[8%] top-[13px] h-0.5 bg-[#10B981] z-0 transition-all duration-500" 
                />

                <div className="flex justify-between items-start relative z-10">
                  {steps.map((_step, idx) => {
                    const stepNum = idx + 1;
                    const isCompleted = currentStepIndex > stepNum;
                    const isActive = currentStepIndex === stepNum;

                    let circleBg = "bg-gray-50 border border-gray-200 text-gray-400";
                    let ringColor = "";
                    let textColor = "text-[#9CA3AF]";
                    let labelFont = "font-medium";
                    let pulseClass = "";

                    if (isCompleted) {
                      circleBg = "bg-[#10B981] text-white border-transparent";
                      textColor = "text-[#10B981]";
                      labelFont = "font-semibold";
                    } else if (isActive) {
                      if (order.status === "PAYMENT_REJECTED" || order.status === "FAILED") {
                        circleBg = "bg-red-500 text-white border-transparent";
                        textColor = "text-red-500";
                        ringColor = "ring-4 ring-red-100";
                        labelFont = "font-bold";
                      } else {
                        circleBg = "bg-[#FBBF24] text-[#111827] border-transparent";
                        textColor = "text-[#111827]";
                        ringColor = "ring-4 ring-amber-100";
                        labelFont = "font-extrabold";
                        pulseClass = "animate-pulse";
                      }
                    }

                    // Short label mappings for horizontal layout to avoid squishing
                    const shortLabels = ["Dibuat", "Bayar", "Dapur", "Siap", "Kirim", "Selesai"];

                    return (
                      <div key={idx} className="flex flex-col items-center flex-1 text-center">
                        {/* Circle Indicator */}
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${circleBg} ${ringColor} ${pulseClass} transition-all duration-300 shrink-0`}>
                          {isCompleted ? (
                            <span>✓</span>
                          ) : (
                            <span>{stepNum}</span>
                          )}
                        </div>
                        {/* Short Label */}
                        <span className={`text-[10px] ${labelFont} ${textColor} mt-1.5 font-['Hanken_Grotesk'] whitespace-nowrap`}>
                          {shortLabels[idx]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Step Highlight Banner */}
              <div className="bg-[#F9FAFB] rounded-2xl p-4 border border-[#E5E7EB] font-['Hanken_Grotesk',system-ui,sans-serif] text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Status Terkini</span>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Step {currentStepIndex} dari 6
                  </span>
                </div>
                <h4 className="font-bold text-[#111827] text-sm pt-0.5">
                  {steps[currentStepIndex - 1]?.title || order.status}
                </h4>
                <p className="text-[#4B5563] leading-relaxed">
                  {steps[currentStepIndex - 1]?.desc(order.status, currentStepIndex)}
                </p>
              </div>
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

            {/* Bukti Pembayaran Card */}
            {order.paymentProofFileId && (
              <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
                <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                  Bukti Pembayaran
                </h3>
                <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-square flex items-center justify-center text-[#9CA3AF]">
                  {loadingProof ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat bukti pembayaran…</p>
                    </div>
                  ) : proofImageSrc ? (
                    <img
                      src={proofImageSrc}
                      alt="Bukti Pembayaran"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <FileImage className="h-8 w-8 text-[#9CA3AF] mb-2" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk',system-ui,sans-serif]">Bukti transfer gagal dimuat</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-center text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] pt-1">
                  Foto bukti transfer pembayaran yang Anda kirimkan.
                </p>
              </div>
            )}
          </div>

          {/* Right Column (col-span-1) */}
          <div className="w-full lg:col-span-1 space-y-4">
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
