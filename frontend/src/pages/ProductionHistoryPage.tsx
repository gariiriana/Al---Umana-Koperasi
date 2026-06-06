import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { History, ClipboardCheck, Clock, ChefHat, CheckCircle2, XCircle, ImageOff } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Helper component to load and render photo previews asynchronously
function PhotoPreview({ photoId }: { photoId?: string }) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!photoId) return;
    let isMounted = true;
    setLoading(true);

    const loadPhoto = async () => {
      try {
        const docRef = doc(db, "delivery_files", photoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && isMounted) {
          const data = docSnap.data();
          if (data.chunks && Array.isArray(data.chunks)) {
            // Sort chunks by index
            const sorted = [...data.chunks].sort((a, b) => a.index - b.index);
            const base64Str = sorted.map((c) => c.data).join("");
            setPhotoSrc(`data:${data.mimeType || "image/jpeg"};base64,${base64Str}`);
          }
        }
      } catch (err) {
        console.error("Failed to load photo preview:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPhoto();
    return () => {
      isMounted = false;
    };
  }, [photoId]);

  if (!photoId) return null;

  if (loading) {
    return (
      <div className="h-20 w-20 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200">
        <span className="text-[10px] text-neutral-400 font-bold">Loading...</span>
      </div>
    );
  }

  if (!photoSrc) {
    return (
      <div className="h-20 w-20 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200">
        <ImageOff className="h-5 w-5 text-neutral-300" />
      </div>
    );
  }

  return (
    <img
      src={photoSrc}
      alt="Bukti Memasak"
      className="h-20 w-20 object-cover rounded-lg border border-neutral-200 shadow-xs"
    />
  );
}

export function ProductionHistoryPage() {
  const { lang } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<"production" | "qc">("production");

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  // Filter orders that have completed production
  // Production finishes when status transitions out of PENDING & IN_PRODUCTION,
  // meaning it has been in production (productionStartPhotoId is present).
  const productionHistory = useMemo(() => {
    return orders
      .filter((o) => o.productionStartPhotoId && o.status !== "PENDING" && o.status !== "IN_PRODUCTION")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [orders]);

  // Filter orders that have been reviewed by QC
  // Checked by checking qcReviewedAt or the presence of qcFailReason (when rejected)
  // or ready/completed statuses (when passed).
  const qcHistory = useMemo(() => {
    return orders
      .filter((o) => o.qcReviewedAt || o.qcFailReason || ["READY_TO_DELIVER", "OUT_FOR_DELIVERY", "COMPLETED", "READY", "DELIVERED"].includes(o.status))
      .sort((a, b) => {
        const dateA = a.qcReviewedAt ? new Date(a.qcReviewedAt).getTime() : 0;
        const dateB = b.qcReviewedAt ? new Date(b.qcReviewedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [orders]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "QC":
        return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">Menunggu QC</span>;
      case "READY":
      case "READY_TO_DELIVER":
        return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Siap Kirim</span>;
      case "OUT_FOR_DELIVERY":
        return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">Sedang Dikirim</span>;
      case "COMPLETED":
      case "DELIVERED":
        return <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-[10px] font-bold">Selesai</span>;
      case "FAILED":
      case "DELIVERY_FAILED":
        return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Gagal</span>;
      default:
        return <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded text-[10px] font-bold">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827] flex items-center gap-2">
            <History className="h-6 w-6 text-amber-500 shrink-0" />
            {lang === "id" ? "Riwayat Produksi & QC" : "Production & QC History"}
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            {lang === "id" 
              ? "Lihat riwayat pesanan yang selesai diproduksi dan hasil pemeriksaan kualitas" 
              : "View history of orders cooked and quality review results"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] font-['Manrope',system-ui,sans-serif]">
        <button
          onClick={() => setActiveTab("production")}
          className={`flex-1 sm:flex-initial px-6 py-3 text-sm font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === "production"
              ? "border-amber-500 text-[#111827]"
              : "border-transparent text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {lang === "id" ? "Riwayat Produksi" : "Production History"} ({productionHistory.length})
        </button>
        <button
          onClick={() => setActiveTab("qc")}
          className={`flex-1 sm:flex-initial px-6 py-3 text-sm font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === "qc"
              ? "border-purple-500 text-[#111827]"
              : "border-transparent text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {lang === "id" ? "Riwayat QC" : "QC History"} ({qcHistory.length})
        </button>
      </div>

      {/* History Lists */}
      <div className="space-y-4">
        {activeTab === "production" ? (
          productionHistory.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
              <ChefHat className="h-14 w-14 mx-auto text-amber-300 bg-amber-50 rounded-full p-3" />
              <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                {lang === "id" ? "Belum Ada Riwayat" : "No Production History"}
              </p>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {lang === "id" 
                  ? "Pesanan yang selesai diproduksi akan tercatat di sini." 
                  : "Completed cooking orders will be logged here."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {productionHistory.map((o) => {
                  const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <motion.div
                      key={o.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden flex flex-col justify-between"
                    >
                      <div className="p-4 sm:p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                              {o.customerName}
                            </h3>
                            <p className="font-mono text-[9px] text-[#9CA3AF] mt-0.5">
                              #{o.id.slice(0, 12)}...
                            </p>
                          </div>
                          {renderStatusBadge(o.status)}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#6B7280] font-['Hanken_Grotesk']">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Selesai masak:</span>
                          <span className="font-bold text-[#111827]">{o.deliveryTime}</span>
                        </div>

                        <div className="border border-[#F3F4F6] rounded-lg overflow-hidden text-xs">
                          <div className="bg-[#F9FAFB] px-3 py-1.5 border-b border-[#F3F4F6] flex justify-between font-bold text-[#6B7280]">
                            <span>Item</span>
                            <span>{totalQty} unit</span>
                          </div>
                          <ul className="divide-y divide-[#F3F4F6] max-h-32 overflow-y-auto">
                            {o.items.map((it) => (
                              <li key={it.itemId} className="flex justify-between px-3 py-1.5">
                                <span className="truncate text-[#4B5563]">{it.itemName}</span>
                                <span className="font-bold text-[#111827]">×{it.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Photo proof and cooking info */}
                        <div className="flex items-center gap-3 bg-[#F9FAFB] p-3 rounded-lg border border-[#E5E7EB]">
                          <PhotoPreview photoId={o.productionStartPhotoId} />
                          <div className="space-y-1 font-['Hanken_Grotesk'] text-xs">
                            <p className="text-gray-500">Estimasi Memasak:</p>
                            <p className="font-bold text-[#111827]">
                              {o.productionDurationMinutes ?? "-"} {lang === "id" ? "Menit" : "Minutes"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        ) : (
          qcHistory.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
              <ClipboardCheck className="h-14 w-14 mx-auto text-purple-300 bg-purple-50 rounded-full p-3" />
              <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                {lang === "id" ? "Belum Ada Riwayat QC" : "No QC History"}
              </p>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {lang === "id" 
                  ? "Hasil pemeriksaan kualitas produk akan tercatat di sini." 
                  : "Quality Control review outcomes will be shown here."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {qcHistory.map((o) => {
                  const isPassed = !o.qcFailReason;
                  const formattedQCDate = o.qcReviewedAt 
                    ? new Date(o.qcReviewedAt).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })
                    : "-";

                  return (
                    <motion.div
                      key={o.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden"
                    >
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base">
                              {o.customerName}
                            </h3>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isPassed 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {isPassed 
                                ? <><CheckCircle2 className="h-3 w-3" /> Lulus QC</> 
                                : <><XCircle className="h-3 w-3" /> Gagal QC</>}
                            </span>
                          </div>
                          
                          <p className="font-mono text-[9px] text-[#9CA3AF]">
                            #{o.id.slice(0, 12)}...
                          </p>

                          <div className="text-xs font-['Hanken_Grotesk'] text-[#6B7280] flex flex-wrap gap-x-4 gap-y-1">
                            <span>{lang === "id" ? "Diperiksa pada:" : "Reviewed at:"} <strong className="text-[#374151]">{formattedQCDate}</strong></span>
                            {o.qcReviewedBy && <span>{lang === "id" ? "Oleh:" : "By:"} <strong className="text-[#374151]">{o.qcReviewedBy}</strong></span>}
                          </div>

                          {/* Items inline */}
                          <div className="text-xs font-['Hanken_Grotesk'] text-gray-500 pt-1">
                            <strong>Item:</strong> {o.items.map((it) => `${it.itemName} (x${it.quantity})`).join(", ")}
                          </div>

                          {!isPassed && o.qcFailReason && (
                            <div className="mt-2.5 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 font-['Hanken_Grotesk'] flex items-start gap-1.5">
                              <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                              <div>
                                <span className="font-bold">{lang === "id" ? "Alasan Gagal:" : "Reason:"}</span> {o.qcFailReason}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center justify-center shrink-0">
                          <PhotoPreview photoId={o.productionStartPhotoId} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default ProductionHistoryPage;
