import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, CheckCheck, Clock, ChefHat, Package, AlertCircle, Loader2, Upload } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

import { ApiError } from "@/services/apiClient";
import { transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import { ProductImage } from "@/components/ProductImage";


function CookingTimer({ timerEnd, status }: { timerEnd?: string; status: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (status !== "IN_PRODUCTION" || !timerEnd) {
      setTimeLeft(0);
      return;
    }

    const calculateTime = () => {
      const difference = new Date(timerEnd).getTime() - Date.now();
      return Math.max(0, Math.floor(difference / 1000));
    };

    setTimeLeft(calculateTime());

    const interval = setInterval(() => {
      const remaining = calculateTime();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timerEnd, status]);

  if (status !== "IN_PRODUCTION" || !timerEnd) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isOvertime = timeLeft <= 0;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      isOvertime 
        ? "bg-red-50 border-red-200 text-red-700 animate-pulse" 
        : "bg-amber-50 border-amber-200 text-amber-800"
    } mb-4 font-['Manrope',system-ui,sans-serif]`}>
      <span className="text-xs font-bold flex items-center gap-1.5">
        <Clock className="h-4 w-4 shrink-0" />
        {isOvertime ? "Waktu Memasak Habis!" : "Sisa Waktu Memasak:"}
      </span>
      <span className="text-base font-mono font-extrabold tracking-wider">{formatted}</span>
    </div>
  );
}

function OrderCard({ order, busyId, onStart, onComplete }: {
  order: Order;
  busyId: string | null;
  onStart: (o: Order, duration: number, photoId: string, kitchen: string) => Promise<void>;
  onComplete: (o: Order) => void;
}) {
  const isBusy = busyId === order.id;
  const isInProduction = order.status === "IN_PRODUCTION";
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  const [showStartForm, setShowStartForm] = useState(false);
  const [duration, setDuration] = useState<number | "">("");
  const [selectedKitchen, setSelectedKitchen] = useState<string>("");
  const [customKitchen, setCustomKitchen] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cardError, setCardError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setCardError("MIME tipe tidak diijinkan. Gunakan JPG, PNG, atau WebP.");
      } else {
        setCardError("Ukuran file terlalu besar. Maksimal 15 MB.");
      }
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setCardError(null);
  };

  const handleConfirmStart = async () => {
    if (!selectedKitchen) {
      setCardError("Dapur produksi wajib dipilih.");
      return;
    }
    if (selectedKitchen === "Dapur Eksternal" && !customKitchen.trim()) {
      setCardError("Nama dapur eksternal wajib diisi.");
      return;
    }
    if (!photoFile) {
      setCardError("Foto mulai memasak wajib diunggah.");
      return;
    }
    if (!duration) {
      setCardError("Estimasi waktu memasak wajib diisi.");
      return;
    }
    setUploading(true);
    setCardError(null);
    try {
      const result = await uploadFileInChunks(photoFile, {
        orderId: order.id,
        onProgress: (p) => setUploadProgress(Math.round(p.fraction * 100)),
      });
      const kitchenName = selectedKitchen === "Dapur Eksternal" ? customKitchen.trim() : selectedKitchen;
      await onStart(order, duration as number, result.fileId, kitchenName);
      setShowStartForm(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setSelectedKitchen("");
      setCustomKitchen("");
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setUploadProgress(0);
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

        <div className="p-4 sm:p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                {order.customerName}
              </p>
              <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">
                #{order.id.slice(0, 10)}…
              </p>
            </div>

            {/* Status chip */}
            <span className={
              "shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold " +
              (isInProduction
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700")
            }>
              {isInProduction
                ? <><ChefHat className="h-3 w-3" /> Sedang Masak</>
                : <><Clock className="h-3 w-3" /> Menunggu</>}
            </span>
          </div>

          {/* Delivery time */}
          <div className="flex items-center gap-2 mb-4 bg-[#F9FAFB] rounded-lg px-3 py-2 border border-[#E5E7EB]">
            <Clock className="h-3.5 w-3.5 text-[#6B7280] shrink-0" />
            <span className="text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#6B7280]">
              Target pengiriman:
            </span>
            <span className="text-xs font-bold text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {order.deliveryTime}
            </span>
          </div>

          {/* Dapur Produksi badge */}
          {order.kitchen && (
            <div className="flex items-center gap-2 mb-4 bg-purple-50/50 rounded-lg px-3 py-2 border border-purple-100">
              <ChefHat className="h-3.5 w-3.5 text-purple-600 shrink-0" />
              <span className="text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-purple-700 font-semibold">
                Dapur:
              </span>
              <span className="text-xs font-bold text-purple-950 font-['Hanken_Grotesk',system-ui,sans-serif]">
                {order.kitchen}
              </span>
            </div>
          )}

          {/* Cooking timer */}
          {isInProduction && <CookingTimer timerEnd={order.productionTimerEnd} status={order.status} />}

          {/* Items list */}
          <div className="mb-4 rounded-lg border border-[#E5E7EB] overflow-hidden">
            <div className="bg-[#F9FAFB] px-3 py-1.5 border-b border-[#E5E7EB] flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide font-['Manrope',system-ui,sans-serif]">Item Pesanan</span>
              <span className="text-[10px] font-bold text-[#6B7280] font-['Manrope',system-ui,sans-serif]">{totalQty} unit</span>
            </div>
            <ul className="divide-y divide-[#F3F4F6]">
              {order.items.map((it) => (
                <li key={it.itemId} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-9 h-9 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                    <ProductImage
                      imageUrl={it.imageUrl || ""}
                      alt={it.itemName}
                      className="h-full w-full object-cover"
                      fallbackClassName="h-3.5 w-3.5 text-neutral-400"
                    />
                  </div>
                  <span className="text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#374151] truncate flex-1">
                    {it.itemName}
                  </span>
                  <span className="shrink-0 inline-flex items-center justify-center h-6 w-8 rounded bg-[#F3F4F6] text-xs font-bold text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
                    ×{it.quantity}
                  </span>
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

                {/* Kitchen Selector */}
                <div className="space-y-1">
                  <label htmlFor="kitchen-select" className="block text-[11px] font-bold text-[#374151]">
                    Pilih Dapur Produksi <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="kitchen-select"
                    aria-label="Pilih Dapur Produksi"
                    value={selectedKitchen}
                    onChange={(e) => setSelectedKitchen(e.target.value)}
                    className="w-full bg-white border border-[#D1D5DB] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-200 cursor-pointer"
                  >
                    <option value="">-- Pilih Dapur --</option>
                    <option value="Dapur Bakrie">Dapur Bakrie</option>
                    <option value="Dapur Katring">Dapur Katring</option>
                    <option value="Dapur Hangat Saji">Dapur Hangat Saji</option>
                    <option value="Dapur Eksternal">Dapur Eksternal (Input Manual)</option>
                  </select>
                </div>

                {selectedKitchen === "Dapur Eksternal" && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="block text-[11px] font-bold text-[#374151]">
                      Nama Dapur Eksternal <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customKitchen}
                      onChange={(e) => setCustomKitchen(e.target.value)}
                      className="w-full bg-white border border-[#D1D5DB] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-200"
                      placeholder="Masukkan nama dapur eksternal..."
                    />
                  </div>
                )}

                {/* Duration selector */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-[#374151]">
                    Estimasi Waktu Memasak (Menit) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDuration(val === "" ? "" : Math.max(1, Number(val)));
                    }}
                    title="Estimasi Waktu Memasak"
                    aria-label="Estimasi Waktu Memasak"
                    className="w-full bg-white border border-[#D1D5DB] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-200"
                    placeholder="Contoh: 10"
                  />
                </div>

                {/* Photo file picker - centered */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-[#374151]">
                    Foto Mulai Memasak
                  </label>
                  <div className="flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-4 bg-white hover:bg-neutral-50 transition relative cursor-pointer min-h-[90px] text-center">
                    <input
                      type="file"
                      accept="image/*"
                      title="Pilih Foto Mulai Masak"
                      aria-label="Pilih Foto Mulai Masak"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="h-5 w-5 text-[#9CA3AF] mb-1.5" />
                    <span className="text-[11px] font-bold text-[#4B5563]">
                      {photoFile ? "Ubah Foto Terpilih" : "Pilih Foto Mulai Masak"}
                    </span>
                    <span className="text-[9px] text-[#9CA3AF] mt-0.5">JPEG, PNG, atau WebP (Maks 15MB)</span>
                  </div>
                  
                  {photoPreview && (
                    <div className="mt-2 flex items-center justify-center">
                      <img
                        src={photoPreview}
                        alt="Preview mulai masak"
                        className="h-20 w-20 object-cover rounded-lg border border-[#E5E7EB]"
                      />
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-[#6B7280]">
                      <span>Mengunggah foto…</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div
                      role="progressbar"
                      title="Progres Upload"
                      aria-label="Progres Upload"
                      className="h-1.5 w-full bg-[#E5E7EB] rounded-full overflow-hidden"
                    >
                      <div
                        className="h-full bg-amber-500 transition-all duration-150"
                        ref={(el) => { if (el) el.style.width = `${uploadProgress}%`; }}
                      />
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmStart}
                    disabled={uploading || isBusy}
                    className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-[#111827] font-bold rounded-lg transition-colors text-center cursor-pointer"
                  >
                    {uploading ? "Mengunggah…" : "Mulai"}
                  </button>
                  <button
                    onClick={() => {
                      setShowStartForm(false);
                      setPhotoFile(null);
                      setPhotoPreview(null);
                      setCardError(null);
                    }}
                    disabled={uploading}
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

export function ProductionPage() {
  const { lang } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const confirmed = orders.filter((o) => o.status === "PENDING").sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const inProduction = orders.filter((o) => o.status === "IN_PRODUCTION").sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const queue = [...inProduction, ...confirmed];

  const start = async (o: Order, durationMinutes: number, photoId: string, kitchen: string) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "start-production" });
      const now = new Date();
      const timerEnd = new Date(now.getTime() + durationMinutes * 60 * 1000);
      await updateDoc(doc(db, "orders", o.id), {
        productionStartPhotoId: photoId,
        productionDurationMinutes: durationMinutes,
        productionTimerEnd: timerEnd.toISOString(),
        kitchen: kitchen,
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
            {lang === "id" ? "Dapur Produksi" : "Production"}
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            {lang === "id" ? "Kelola pesanan yang sedang dan menunggu dimasak" : "Manage orders currently cooking and waiting to be cooked"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-lg font-extrabold text-amber-700 font-['Manrope',system-ui,sans-serif]">{inProduction.length}</span>
            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">{lang === "id" ? "Masak" : "Cooking"}</span>
          </div>
          <div className="flex flex-col items-center bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2">
            <span className="text-lg font-extrabold text-[#374151] font-['Manrope',system-ui,sans-serif]">{confirmed.length}</span>
            <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wide">{lang === "id" ? "Antri" : "Queue"}</span>
          </div>
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
      {queue.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
          <Package className="h-14 w-14 mx-auto text-emerald-400 bg-emerald-50 rounded-full p-3" />
          <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">Antrian Kosong</p>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Belum ada pesanan yang perlu dimasak sekarang.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {queue.map((o) => (
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
