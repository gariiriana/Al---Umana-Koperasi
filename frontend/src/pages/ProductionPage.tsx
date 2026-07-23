import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, CheckCheck, Clock, ChefHat, Package, AlertCircle, Loader2, Search, X, MapPin, FileDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

import { ApiError } from "@/services/apiClient";
import { transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { ProductImage } from "@/components/ProductImage";
import { parseIngredients } from "@/lib/ingredientsParser";
import { getProduct } from "@/services/catalogService";
import { useToast } from "@/contexts/ToastContext";
import { isOrderPastDeadline } from "@/lib/orderHelpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const formatSimpleAddress = (address: string) => {
  if (!address) return "";
  const parts = address.split(" | ");
  if (parts.length === 7) {
    const [kabupaten, kecamatan, desa, rtRw] = parts;
    return `Desa ${desa}, RT/RW ${rtRw}, Kec. ${kecamatan}, ${kabupaten}`;
  }
  if (parts.length === 3) {
    return parts[0];
  }
  return address.replace(/https?:\/\/[^\s]+/, "").trim();
};

const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.error("Error converting URL to Base64:", err);
    return null;
  }
};

function OrderCard({ order, busyId, onStart, onComplete }: {
  order: Order;
  busyId: string | null;
  onStart: (
    o: Order,
    itemKitchens: Record<string, string>,
    qaChecklist: { kebersihan: boolean; kelengkapanBahan: boolean; suhuPenyimpanan: boolean }
  ) => Promise<void>;
  onComplete: (o: Order) => void;
}) {
  const isBusy = busyId === order.id;
  const isInProduction = order.status === "IN_PRODUCTION";
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const isPast = isOrderPastDeadline(order);

  const [showStartForm, setShowStartForm] = useState(false);
  const [itemKitchens, setItemKitchens] = useState<Record<string, string>>({});
  const [itemCustomKitchens, setItemCustomKitchens] = useState<Record<string, string>>({});
  const [cardError, setCardError] = useState<string | null>(null);

  // QA Checklist states
  const [qaKebersihan, setQaKebersihan] = useState(false);
  const [qaKelengkapan, setQaKelengkapan] = useState(false);
  const [qaSuhu, setQaSuhu] = useState(false);

  const allItemsHaveKitchen = order.items.every((it) => {
    const k = itemKitchens[it.itemId];
    if (!k) return false;
    if (k === "Dapur Eksternal") return !!(itemCustomKitchens[it.itemId] || "").trim();
    return true;
  });

  const handleConfirmStart = async () => {
    if (!allItemsHaveKitchen) {
      setCardError("Semua item harus dipilih dapur produksinya.");
      return;
    }
    if (!qaKebersihan || !qaKelengkapan || !qaSuhu) {
      setCardError("Semua checklist QA wajib dicentang.");
      return;
    }
    setCardError(null);
    try {
      // Build resolved kitchens map
      const resolvedKitchens: Record<string, string> = {};
      for (const it of order.items) {
        const k = itemKitchens[it.itemId];
        resolvedKitchens[it.itemId] = k === "Dapur Eksternal" ? (itemCustomKitchens[it.itemId] || "").trim() : k;
      }
      await onStart(order, resolvedKitchens, {
        kebersihan: qaKebersihan,
        kelengkapanBahan: qaKelengkapan,
        suhuPenyimpanan: qaSuhu,
      });
      setShowStartForm(false);
      setItemKitchens({});
      setItemCustomKitchens({});
      setQaKebersihan(false);
      setQaKelengkapan(false);
      setQaSuhu(false);
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className={
        "bg-white rounded-lg shadow-xs border overflow-hidden transition-all " +
        (isInProduction ? "border-amber-300 ring-2 ring-amber-100" : "border-[#E5E7EB]")
      }>
        {/* Status bar top */}
        <div className={
          "h-1.5 w-full " +
          (isInProduction ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-gradient-to-r from-emerald-400 to-teal-300")
        } />

        <div className="p-2.5 sm:p-5">
          {/* Header row */}
          <div className="flex flex-col xs:flex-row xs:items-start justify-between gap-1.5 xs:gap-3 mb-3">
            <div className="min-w-0">
              <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-xs sm:text-base truncate">
                {order.institutionName || order.customerName}
              </p>
              <p className="font-mono text-[9px] sm:text-[10px] text-[#9CA3AF] mt-0.5">
                #{order.id.slice(0, 8)}…
              </p>
            </div>

            {/* Status chip */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={
                "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[11px] font-bold self-start " +
                (isInProduction
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700")
              }>
                {isInProduction
                  ? <><ChefHat className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Masak</>
                  : <><Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Antri</>}
              </span>
              {isPast && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold bg-red-100 text-red-700 animate-pulse border border-red-300">
                  <AlertCircle className="h-2.5 w-2.5 text-red-600" /> TERLEWAT
                </span>
              )}
            </div>
          </div>

          {/* Delivery time */}
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-3 bg-[#F9FAFB] rounded-lg px-2 py-1.5 md:px-3 md:py-2 border border-[#E5E7EB]">
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3 md:h-3.5 md:w-3.5 text-[#6B7280]" />
              <span className="text-[10px] md:text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#6B7280]">
                Target:
              </span>
            </div>
            <span className="text-[10px] md:text-xs font-bold text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif] md:ml-auto truncate">
              {order.deliveryTime}
            </span>
          </div>

          {/* Recipient & Destination Info */}
          {(order.recipientName || order.deliveryAddress) && (
            <div className="space-y-1.5 mb-3 bg-[#F9FAFB] rounded-lg p-2.5 border border-[#E5E7EB] font-['Hanken_Grotesk'] text-xs text-[#4B5563]">
              {order.customerName ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#374151] text-[10px] uppercase tracking-wide">Pemesan:</span>
                    <span className="font-semibold text-[#111827] truncate">{order.customerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#374151] text-[10px] uppercase tracking-wide">Penerima:</span>
                    <span className="font-semibold text-[#111827] truncate">{order.recipientName}</span>
                  </div>
                </>
              ) : (
                order.recipientName && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#374151] text-[10px] uppercase tracking-wide">Pemesan:</span>
                    <span className="font-semibold text-[#111827] truncate">{order.recipientName}</span>
                  </div>
                )
              )}
              {order.deliveryAddress && (
                <div className="flex items-start gap-1">
                  <MapPin className="h-3 w-3 text-[#9CA3AF] shrink-0 mt-0.5" />
                  <span className="leading-relaxed text-[11px] text-[#4B5563]">
                    {formatSimpleAddress(order.deliveryAddress)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Dapur Produksi per-item badges */}
          {order.itemKitchens && Object.keys(order.itemKitchens).length > 0 && (
            <div className="mb-3 space-y-1">
              <p className="text-[9px] sm:text-[10px] font-bold text-purple-600 uppercase tracking-wide flex items-center gap-1">
                <ChefHat className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                Dapur Produksi
              </p>
              <div className="flex flex-wrap gap-1">
                {order.items.map((it) => {
                  const kitchen = order.itemKitchens?.[it.itemId];
                  if (!kitchen) return null;
                  return (
                    <span key={it.itemId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-100 text-[9px] sm:text-[10px] font-semibold text-purple-800">
                      <span className="font-bold">{it.itemName}:</span> {kitchen}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {/* Legacy single kitchen badge */}
          {!order.itemKitchens && order.kitchen && (
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-3 bg-purple-50/50 rounded-lg px-2 py-1.5 md:px-3 md:py-2 border border-purple-100">
              <div className="flex items-center gap-1 shrink-0">
                <ChefHat className="h-3 w-3 md:h-3.5 md:w-3.5 text-purple-600 shrink-0" />
                <span className="text-[10px] md:text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-purple-700 font-semibold">
                  Dapur:
                </span>
              </div>
              <span className="text-[10px] md:text-xs font-bold text-purple-950 font-['Hanken_Grotesk',system-ui,sans-serif] md:ml-auto">
                {order.kitchen}
              </span>
            </div>
          )}

          {/* Items list */}
          <div className="mb-3 rounded-lg border border-[#E5E7EB] overflow-hidden">
            <div className="bg-[#F9FAFB] px-2 py-1 md:px-3 md:py-1.5 border-b border-[#E5E7EB] flex items-center justify-between">
              <span className="text-[9px] md:text-[10px] font-bold text-[#6B7280] uppercase tracking-wide font-['Manrope',system-ui,sans-serif]">Item Pesanan</span>
              <span className="text-[9px] md:text-[10px] font-bold text-[#6B7280] font-['Manrope',system-ui,sans-serif]">
                {order.isPreOrder ? "Pra-pesanan" : `${totalQty} unit`}
              </span>
            </div>
            <ul className="divide-y divide-[#F3F4F6]">
              {order.items.map((it) => (
                <li key={it.itemId} className="px-2 py-1.5 md:px-3 md:py-2 space-y-1">
                  <div className="flex items-center gap-1.5 md:gap-3">
                    <div className="w-7 h-7 md:w-9 md:h-9 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                      <ProductImage
                        imageUrl={it.imageUrl || ""}
                        alt={it.itemName}
                        className="h-full w-full object-cover"
                        fallbackClassName="h-3 w-3 text-neutral-400"
                      />
                    </div>
                    <span className="text-xs md:text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#374151] truncate flex-1">
                      {it.itemName}
                    </span>
                    {order.isPreOrder ? (
                      <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[8px] md:text-[10px] font-bold text-amber-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
                        Pra
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center justify-center h-5 w-7 rounded bg-[#F3F4F6] text-[10px] md:text-xs font-bold text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
                        ×{it.quantity}
                      </span>
                    )}
                  </div>
                  {it.ingredients && (() => {
                    const parsed = parseIngredients(it.ingredients);
                    if (parsed.length === 0) return null;
                    const multiplier = order.isPreOrder ? 1 : (it.quantity || 1);
                    return (
                      <div className="ml-8 md:ml-12 text-[9px] md:text-[10px] text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2.5 py-1.5 leading-relaxed space-y-1">
                        <span className="font-bold text-[#374151] text-[8px] uppercase tracking-wider block mb-0.5">
                          Bahan (Kebutuhan untuk {multiplier} porsi):
                        </span>
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {parsed.map((ing, idx) => {
                            const scaledAmount = ing.amount * multiplier;
                            return (
                              <span key={idx} className="bg-white border border-[#E5E7EB] px-1.5 py-0.5 rounded text-[#4B5563] font-medium text-[9px] md:text-[10px] inline-block">
                                {ing.name}
                                {scaledAmount > 0 ? (
                                  <>
                                    : <span className="font-bold text-amber-700">{scaledAmount} {ing.unit}</span>
                                  </>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </div>

          {/* Sub-form start cooking */}
          <AnimatePresence>
            {showStartForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-4 border border-amber-200 rounded-lg p-3.5 bg-amber-50/30 space-y-3.5 text-xs font-['Hanken_Grotesk']"
              >
                {cardError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {cardError}
                  </div>
                )}

                {/* Kitchen Selector — Per Item */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-[#374151]">
                    Pilih Dapur Produksi Per Item <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {order.items.map((it) => (
                      <div key={it.itemId} className="bg-white border border-[#E5E7EB] rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-neutral-100 rounded-md overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                            <ProductImage
                              imageUrl={it.imageUrl || ""}
                              alt={it.itemName}
                              className="h-full w-full object-cover"
                              fallbackClassName="h-3 w-3 text-neutral-400"
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#111827] truncate flex-1">{it.itemName}</span>
                          {!order.isPreOrder && <span className="text-[10px] font-bold text-[#6B7280]">×{it.quantity}</span>}
                        </div>
                        <select
                          value={itemKitchens[it.itemId] || ""}
                          onChange={(e) => setItemKitchens((prev) => ({ ...prev, [it.itemId]: e.target.value }))}
                          title="Pilih Dapur Produksi"
                          aria-label="Pilih Dapur Produksi"
                          className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-md px-2 py-1 text-[11px] font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-200 cursor-pointer"
                        >
                          <option value="">-- Pilih Dapur --</option>
                          <option value="Dapur Bakrie">Dapur Bakrie</option>
                          <option value="Dapur Katring">Dapur Katring</option>
                          <option value="Dapur Hangat Saji">Dapur Hangat Saji</option>
                          <option value="Dapur Eksternal">Dapur Eksternal (Input Manual)</option>
                        </select>
                        {itemKitchens[it.itemId] === "Dapur Eksternal" && (
                          <input
                            type="text"
                            value={itemCustomKitchens[it.itemId] || ""}
                            onChange={(e) => setItemCustomKitchens((prev) => ({ ...prev, [it.itemId]: e.target.value }))}
                            className="w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-md px-2 py-1 text-[11px] font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-200"
                            placeholder="Nama dapur eksternal..."
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* QA Checklist */}
                <div className="space-y-2 bg-amber-50/50 p-3 rounded-lg border border-amber-200/50">
                  <span className="block text-[11px] font-extrabold text-[#374151] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCheck className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                    Verifikasi Kualitas Awal (QA) <span className="text-red-500">*</span>
                  </span>
                  <div className="space-y-1.5 font-semibold text-[#4B5563]">
                    <label className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-neutral-200 hover:border-amber-300 cursor-pointer transition select-none">
                      <input
                        type="checkbox"
                        checked={qaKebersihan}
                        onChange={() => setQaKebersihan(!qaKebersihan)}
                        className="text-amber-500 focus:ring-amber-400 rounded border-neutral-300 h-3.5 w-3.5"
                      />
                      <span className="text-[11px]">Kebersihan Dapur & Peralatan</span>
                    </label>
                    <label className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-neutral-200 hover:border-amber-300 cursor-pointer transition select-none">
                      <input
                        type="checkbox"
                        checked={qaKelengkapan}
                        onChange={() => setQaKelengkapan(!qaKelengkapan)}
                        className="text-amber-500 focus:ring-amber-400 rounded border-neutral-300 h-3.5 w-3.5"
                      />
                      <span className="text-[11px]">Kelengkapan Bahan Baku</span>
                    </label>
                    <label className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-neutral-200 hover:border-amber-300 cursor-pointer transition select-none">
                      <input
                        type="checkbox"
                        checked={qaSuhu}
                        onChange={() => setQaSuhu(!qaSuhu)}
                        className="text-amber-500 focus:ring-amber-400 rounded border-neutral-300 h-3.5 w-3.5"
                      />
                      <span className="text-[11px]">Suhu & Penyimpanan Bahan</span>
                    </label>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmStart}
                    disabled={isBusy}
                    className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-[#111827] font-bold rounded-lg transition-colors text-center cursor-pointer"
                  >
                    {isBusy ? "Memproses…" : "Mulai"}
                  </button>
                  <button
                    onClick={() => {
                      setShowStartForm(false);
                      setCardError(null);
                      setQaKebersihan(false);
                      setQaKelengkapan(false);
                      setQaSuhu(false);
                    }}
                    disabled={isBusy}
                    className="px-3 py-1.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-bold rounded-lg transition-colors text-center cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action button */}
          {order.status === "PENDING" && !showStartForm && (
            <button
              onClick={() => setShowStartForm(true)}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-[#111827] font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Mulai Produksi
            </button>
          )}
          {order.status === "IN_PRODUCTION" && (
            <button
              onClick={() => onComplete(order)}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Selesai Produksi
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const getOrderDeadline = (order: Order): number => {
  if (!order.eventDate) return Infinity;
  const datePart = order.eventDate.slice(0, 10);
  let time = "12:00";
  if (order.deliveryTime) {
    const match = order.deliveryTime.match(/(\d{2})[:.](\d{2})/);
    if (match) {
      time = `${match[1]}:${match[2]}`;
    }
  }
  const ts = Date.parse(`${datePart}T${time}`);
  return isNaN(ts) ? Infinity : ts;
};

export function ProductionPage() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const confirmed = orders.filter((o) => o.status === "PENDING").sort((a, b) => {
    const deadlineA = getOrderDeadline(a);
    const deadlineB = getOrderDeadline(b);
    if (deadlineA !== deadlineB) {
      return deadlineA - deadlineB;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const inProduction = orders.filter((o) => o.status === "IN_PRODUCTION").sort((a, b) => {
    const deadlineA = getOrderDeadline(a);
    const deadlineB = getOrderDeadline(b);
    if (deadlineA !== deadlineB) {
      return deadlineA - deadlineB;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const [searchQuery, setSearchQuery] = useState("");

  const filteredQueue = useMemo(() => {
    let rawQueue = [...inProduction, ...confirmed];

    if (startDate) {
      rawQueue = rawQueue.filter((o) => {
        const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
        return oDate >= startDate;
      });
    }
    if (endDate) {
      rawQueue = rawQueue.filter((o) => {
        const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
        return oDate <= endDate;
      });
    }

    if (!searchQuery.trim()) return rawQueue;
    const q = searchQuery.toLowerCase().trim();
    return rawQueue.filter(
      (o) =>
        o.institutionName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(q))
    );
  }, [inProduction, confirmed, searchQuery, startDate, endDate]);

  const start = async (
    o: Order,
    kitchens: Record<string, string>,
    qaChecklist: { kebersihan: boolean; kelengkapanBahan: boolean; suhuPenyimpanan: boolean }
  ) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "start-production" });
      await updateDoc(doc(db, "orders", o.id), {
        itemKitchens: kitchens,
        qaStartChecklist: qaChecklist,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "complete-production" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const exportOrdersToPDF = async () => {
    if (filteredQueue.length === 0) {
      showToast({
        message: lang === "id" ? "Tidak ada pesanan aktif untuk diekspor." : "No active orders to export.",
        variant: "info",
      });
      return;
    }

    setExporting(true);
    try {
      showToast({
        message: lang === "id" ? "Sedang memproses data dan foto produk..." : "Processing data and product photos...",
        variant: "info",
      });

      // 1. Fetch product data and convert images to Base64 in parallel
      const allItemIds = Array.from(new Set(filteredQueue.flatMap(o => o.items.map(it => it.itemId))));
      const productMap: Record<string, string | null> = {};
      await Promise.all(
        allItemIds.map(async (id) => {
          try {
            const product = await getProduct(id);
            if (product && product.imageUrl) {
              const base64 = await getBase64ImageFromUrl(product.imageUrl);
              productMap[id] = base64;
            } else {
              productMap[id] = null;
            }
          } catch (e) {
            console.error("Failed to fetch product image for bulk export:", e);
            productMap[id] = null;
          }
        })
      );

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      
      const brandGold: [number, number, number] = [217, 119, 6];       // #D97706
      const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309
      const brandYellowCream: [number, number, number] = [255, 253, 245]; // #FFFDF5
      const brandYellowBorder: [number, number, number] = [253, 230, 138]; // #FDE68A
      const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280
      const white: [number, number, number] = [255, 255, 255];

      // Draw PDF Header
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 14, 10, 16, 16);
      }
      const titleX = logoBase64 ? 33 : 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...brandAmberDark);
      doc.text("AL-UMANA KOPERASI - ANTRIAN PRODUKSI", titleX, 15);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text(lang === "id" ? "DAFTAR ANTRIAN PRODUKSI DAPUR" : "KITCHEN PRODUCTION QUEUE LIST", titleX, 20);

      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text("Sistem Informasi Manajemen Order & Logistik", titleX, 24);

      // Header Metadata (Right-Aligned)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      const now = new Date();
      const timestampStr = `${now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} • ${now.toLocaleTimeString("id-ID")}`;
      doc.text(`Dicetak: ${timestampStr}`, pageW - 14, 14, { align: "right" });

      let metaY = 18;
      const filterDesc: string[] = [];
      if (searchQuery) filterDesc.push(`Cari: "${searchQuery}"`);
      if (startDate || endDate) {
        const startStr = startDate ? new Date(startDate).toLocaleDateString("id-ID") : "Awal";
        const endStr = endDate ? new Date(endDate).toLocaleDateString("id-ID") : "Akhir";
        filterDesc.push(`Periode: ${startStr} - ${endStr}`);
      }

      if (filterDesc.length > 0) {
        doc.text(`Filter: ${filterDesc.join(" | ")}`, pageW - 14, metaY, { align: "right" });
        metaY += 4;
      }
      doc.text(`Menampilkan ${filteredQueue.length} dari ${orders.length} pesanan`, pageW - 14, metaY, { align: "right" });

      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.line(14, 28, pageW - 14, 28);

      const statusLabels: Record<string, string> = {
        PENDING: "Antre Masak",
        IN_PRODUCTION: "Sedang Dimasak",
      };

      const tableBody = filteredQueue.map((o, idx) => {
        const itemsText = o.items.map(it => {
          return `${it.itemName}${o.isPreOrder ? " (Pra-pesanan)" : ` (x${it.quantity})`}`;
        }).join("\n");

        const kitchenText = o.itemKitchens 
          ? Object.entries(o.itemKitchens).map(([itemId, kName]) => {
              const itemName = o.items.find(it => it.itemId === itemId)?.itemName || "Item";
              return `${itemName}: ${kName}`;
            }).join("\n")
          : o.kitchen || "-";

        return [
          String(idx + 1),
          `#${o.id.slice(-6).toUpperCase()}`,
          o.institutionName || o.customerName || "-",
          o.deliveryTime || "—",
          "", // photo column
          itemsText,
          kitchenText,
          statusLabels[o.status] || o.status
        ];
      });

      autoTable(doc, {
        startY: 34,
        head: [["No", "ID", "Instansi / Pemesan", "Target Pengiriman", "Foto", "Detail Item", "Dapur Produksi", "Status"]],
        body: tableBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3 },
        bodyStyles: { fontSize: 8, textColor: slateDark, cellPadding: 3, minCellHeight: 14, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 20, halign: "center", fontStyle: "bold" },
          2: { cellWidth: 45 },
          3: { cellWidth: 35, halign: "center" },
          4: { cellWidth: 16 }, // Foto
          5: { cellWidth: 70 }, // Detail Item
          6: { cellWidth: 50 }, // Dapur
          7: { cellWidth: 24, halign: "center", fontStyle: "bold" }
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            const orderObj = filteredQueue[data.row.index];
            if (orderObj && orderObj.items && orderObj.items.length > 0) {
              const cell = data.cell;
              const imgSize = 8;
              const firstItem = orderObj.items[0];
              const imgBase64 = productMap[firstItem.itemId];
              if (imgBase64) {
                const imgX = cell.x + (cell.width - imgSize) / 2;
                const imgY = cell.y + (cell.height - imgSize) / 2;
                try {
                  doc.addImage(imgBase64, "PNG", imgX, imgY, imgSize, imgSize);
                } catch (e) {
                  console.error("Failed to add image to production PDF:", e);
                }
              }
            }
          }
        }
      });

      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `Koperasi Al-Umana • Daftar Antrian Dapur Produksi • Halaman ${p} dari ${totalPages}`,
          pageW / 2, pageH - 8,
          { align: "center" }
        );
        doc.setFillColor(...brandGold);
        doc.rect(0, 0, pageW, 2, "F");
        doc.setDrawColor(...brandYellowBorder);
        doc.setLineWidth(0.25);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);
      }

      doc.save(`AlUmana_Antrian_Dapur_${now.toISOString().slice(0, 10)}.pdf`);
      showToast({
        message: lang === "id" ? "Daftar antrian dapur berhasil diunduh sebagai PDF!" : "Kitchen queue downloaded successfully as PDF!",
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: lang === "id" ? "Gagal memproses ekspor PDF" : "Failed to process PDF export",
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            {lang === "id" ? "Dapur Produksi" : "Production"}
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            {lang === "id" ? "Kelola pesanan yang sedang dan menunggu dimasak" : "Manage orders currently cooking and waiting to be cooked"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportOrdersToPDF}
            disabled={exporting}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#0F172A] disabled:opacity-50 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            title="Download antrian produksi sebagai PDF"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <FileDown className="w-4 h-4 shrink-0" />
            )}
            <span>Export PDF</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <span className="text-base font-extrabold text-amber-700 font-['Manrope',system-ui,sans-serif]">{inProduction.length}</span>
              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">{lang === "id" ? "Masak" : "Cooking"}</span>
            </div>
            <div className="flex flex-col items-center bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl px-3 py-1.5">
              <span className="text-base font-extrabold text-[#374151] font-['Manrope',system-ui,sans-serif]">{confirmed.length}</span>
              <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wide">{lang === "id" ? "Antri" : "Queue"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Date Filters */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs space-y-4">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[#9CA3AF]" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari antrean produksi berdasarkan nama instansi, pemesan, atau produk..."
            className="w-full rounded-xl border border-[#D1D5DB] bg-white pl-9 pr-10 py-2 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40 transition font-['Hanken_Grotesk']"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="Bersihkan pencarian"
              aria-label="Bersihkan pencarian"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center border-t border-[#F3F4F6] pt-3 font-['Hanken_Grotesk']">
          <span className="text-xs font-bold text-[#4B5563] self-start sm:self-center shrink-0">Filter Tanggal Acara:</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#374151] focus:border-[#FBBF24] focus:outline-none w-full sm:w-40 font-semibold"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Tanggal Mulai"
            />
            <span className="text-xs text-neutral-400">s/d</span>
            <input
              type="date"
              className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#374151] focus:border-[#FBBF24] focus:outline-none w-full sm:w-40 font-semibold"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Tanggal Akhir"
            />
          </div>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer ml-auto sm:ml-0"
            >
              Reset Tanggal
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Queue */}
      {filteredQueue.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
          <Package className="h-14 w-14 mx-auto text-emerald-400 bg-emerald-50 rounded-full p-3" />
          <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
            {searchQuery ? "Hasil Pencarian Kosong" : "Antrian Kosong"}
          </p>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            {searchQuery
              ? "Tidak ada pesanan antrian yang cocok dengan kata kunci pencarian Anda."
              : "Belum ada pesanan yang perlu dimasak sekarang."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
          <AnimatePresence>
            {filteredQueue.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                busyId={busyId}
                onStart={start}
                onComplete={complete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default ProductionPage;
