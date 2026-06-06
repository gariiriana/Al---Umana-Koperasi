import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, Clock, Package, CheckCircle2, ChevronRight, ArrowLeft, Camera, AlertCircle, Loader2, Navigation, Phone, MessageCircle } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";
import { PICConfirmation } from "@/components/delivery/PICConfirmation";
import { ProofCapture } from "@/components/delivery/ProofCapture";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import { dispatchOrder } from "@/services/orderService";

const renderFormattedAddress = (address: string) => {
  if (!address) return null;
  const parts = address.split(" | ");

  if (parts.length === 7) {
    const [kabupaten, kecamatan, desa, rtRw, postalCode, mapsUrl, specDetails] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-extrabold text-[#111827]">Desa/Kel. {desa}, RT/RW {rtRw}</p>
        <p className="font-semibold">Kec. {kecamatan}, {kabupaten}</p>
        <p className="text-[11px] font-medium text-neutral-500">Kode Pos: {postalCode}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specDetails}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  if (parts.length === 3) {
    const [fullAddr, mapsUrl, specAddr] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-semibold text-[#111827]">{fullAddr}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specAddr}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
  const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
  const cleanAddress = mapsUrl ? address.replace(mapsUrl, "").replace(/\s+/g, " ").trim() : address;

  return (
    <div className="space-y-0.5">
      {cleanAddress && <p className="text-xs text-[#374151] leading-relaxed font-medium">{cleanAddress}</p>}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer font-['Hanken_Grotesk']"
          onClick={(e) => e.stopPropagation()}>
          <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
          <span>Buka Link Peta ↗</span>
        </a>
      )}
    </div>
  );
};

type DeliveryStep = "list" | "start" | "pic" | "proof";

function DeliveryTimer({ timerEnd, status }: { timerEnd?: string; status: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (status !== "OUT_FOR_DELIVERY" || !timerEnd) {
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

  if (status !== "OUT_FOR_DELIVERY" || !timerEnd) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isOvertime = timeLeft <= 0;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      isOvertime 
        ? "bg-red-50 border-red-200 text-red-700 animate-pulse" 
        : "bg-orange-50 border-orange-200 text-orange-800"
    } mb-4 font-['Manrope',system-ui,sans-serif]`}>
      <span className="text-xs font-bold flex items-center gap-1.5">
        <Clock className="h-4 w-4 shrink-0" />
        {isOvertime ? "Waktu Pengantaran Habis!" : "Sisa Waktu Pengantaran:"}
      </span>
      <span className="text-base font-mono font-extrabold tracking-wider">{formatted}</span>
    </div>
  );
}

interface StartDeliveryFormProps {
  order: Order;
  onStart: (duration: number, photoId: string) => Promise<void>;
  onCancel: () => void;
}

function StartDeliveryForm({ order, onStart, onCancel }: StartDeliveryFormProps) {
  const [duration, setDuration] = useState<number | "">("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setError("MIME tipe tidak diijinkan. Gunakan JPG, PNG, atau WebP.");
      } else {
        setError("Ukuran file terlalu besar. Maksimal 15 MB.");
      }
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!photoFile) {
      setError("Foto mulai pengantaran wajib diunggah.");
      return;
    }
    if (!duration) {
      setError("Estimasi durasi perjalanan wajib diisi.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFileInChunks(photoFile, {
        orderId: order.id,
        onProgress: (p) => setUploadProgress(Math.round(p.fraction * 100)),
      });
      await onStart(duration as number, result.fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-5 space-y-4 font-['Hanken_Grotesk'] text-xs">
      <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
        Mulai Pengantaran
      </h3>
      <p className="text-[#6B7280] leading-relaxed">
        Unggah foto saat kurir akan berangkat dan pilih estimasi waktu perjalanan untuk pesanan <span className="font-bold text-[#111827]">{order.customerName}</span>.
      </p>

      {/* Address Details for Courier */}
      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 flex gap-2">
        <MapPin className="h-4 w-4 text-[#6B7280] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="font-bold text-[#111827] block mb-0.5">Alamat Pengantaran</span>
          {renderFormattedAddress(order.deliveryAddress)}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg font-medium flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Estimasi durasi */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-[#374151]">
          Estimasi Durasi Perjalanan (Menit)
        </label>
        <input
          type="number"
          min={1}
          value={duration}
          onChange={(e) => {
            const val = e.target.value;
            setDuration(val === "" ? "" : Math.max(1, Number(val)));
          }}
          title="Estimasi Durasi Perjalanan"
          aria-label="Estimasi Durasi Perjalanan"
          className="w-full bg-white border border-[#D1D5DB] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-orange-200"
          placeholder="Contoh: 20"
        />
      </div>

      {/* Foto mulai pengantaran - centered file button */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-[#374151]">
          Foto Keberangkatan (Start Delivery)
        </label>
        
        <div className="flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-5 bg-[#F9FAFB] hover:bg-[#F3F4F6] transition relative cursor-pointer min-h-[100px] text-center">
          <input
            type="file"
            accept="image/*"
            title="Pilih Foto Mulai Pengantaran"
            aria-label="Pilih Foto Mulai Pengantaran"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Camera className="h-5 w-5 text-[#9CA3AF] mb-1.5" />
          <span className="text-[11px] font-bold text-[#4B5563]">
            {photoFile ? "Ubah Foto Terpilih" : "Pilih Foto Mulai Pengantaran"}
          </span>
          <span className="text-[9px] text-[#9CA3AF] mt-0.5">JPEG, PNG, atau WebP (Maks 15MB)</span>
        </div>

        {photoPreview && (
          <div className="mt-2 flex justify-center">
            <img
              src={photoPreview}
              alt="Preview keberangkatan"
              className="h-20 w-20 object-cover rounded-lg border border-[#E5E7EB]"
            />
          </div>
        )}
      </div>

      {/* Upload progress */}
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
              className="h-full bg-orange-500 transition-all duration-150"
              ref={(el) => { if (el) el.style.width = `${uploadProgress}%`; }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer text-center"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Mulai Pengantaran
        </button>
        <button
          onClick={onCancel}
          disabled={uploading}
          className="px-3 py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-bold text-[#374151] rounded-lg transition cursor-pointer"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

export function DeliveryPage() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [step, setStep] = useState<DeliveryStep>("list");

  const active = activeId ? orders.find((o) => o.id === activeId) ?? null : null;

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const myDeliveries = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === "OUT_FOR_DELIVERY" || o.status === "READY_TO_DELIVER") &&
          (!user || 
            o.assignedCourierId === user.uid || 
            o.assignedCourierId === profile?.displayName ||
            o.assignedCourierId === user.email?.split("@")[0] ||
            (profile?.displayName && o.assignedCourierId?.toLowerCase() === profile.displayName.toLowerCase()))
      ),
    [orders, user, profile]
  );

  const activeEnRouteOrderIds = useMemo(() => {
    return myDeliveries.filter((o) => o.status === "OUT_FOR_DELIVERY").map((o) => o.id);
  }, [myDeliveries]);

  useEffect(() => {
    if (activeEnRouteOrderIds.length === 0) return;

    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await Promise.all(
            activeEnRouteOrderIds.map((id) =>
              updateDoc(doc(db, "orders", id), {
                courierLat: latitude,
                courierLng: longitude,
              })
            )
          );
        } catch (err) {
          console.error("Gagal mengupdate lokasi kurir:", err);
        }
      },
      (error) => {
        console.error("Error watching geolocation:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeEnRouteOrderIds]);

  const reset = () => {
    setActiveId(null);
    setStep("list");
  };

  const open = (o: Order) => {
    setActiveId(o.id);
    if (o.status === "READY_TO_DELIVER") {
      setStep("start");
    } else {
      setStep("pic");
    }
  };

  // Step indicators
  const steps = [
    { key: "pic", label: "Konfirmasi PIC" },
    { key: "proof", label: "Foto Bukti" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      {step === "list" ? (
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
            Pengantaran Saya
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            Konfirmasi penerimaan dan ambil foto bukti pengiriman
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#6B7280] hover:text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </button>
          {active && (
            <>
              <span className="text-[#D1D5DB]">/</span>
              <span className="text-sm font-bold text-[#111827] truncate font-['Hanken_Grotesk',system-ui,sans-serif]">
                {active.institutionName || active.customerName}
              </span>
            </>
          )}
        </div>
      )}

      {/* Customer Info Card (placed when in any active delivery step) */}
      {active && step !== "list" && (
        <CustomerInfoCard
          order={active}
        />
      )}

      {/* Step progress (only when active and not starting) */}
      {active && step !== "list" && step !== "start" && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
            <div className="flex items-center gap-0">
              {steps.map((s, idx) => {
                const isDone = step === "proof" && s.key === "pic";
                const isActive = step === s.key;
                return (
                  <div key={s.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={
                        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all " +
                        (isDone ? "bg-emerald-500 text-white" :
                          isActive ? "bg-[#FBBF24] text-[#111827]" :
                            "bg-[#F3F4F6] text-[#9CA3AF]")
                      }>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={
                        "text-[10px] font-semibold font-['Hanken_Grotesk',system-ui,sans-serif] text-center " +
                        (isActive ? "text-[#111827]" : "text-[#9CA3AF]")
                      }>
                        {s.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={
                        "h-0.5 w-8 mb-4 mx-1 rounded-full transition-all " +
                        (step === "proof" ? "bg-emerald-400" : "bg-[#E5E7EB]")
                      } />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {active.status === "OUT_FOR_DELIVERY" && (
            <DeliveryTimer timerEnd={active.deliveryTimerEnd} status={active.status} />
          )}
        </div>
      )}

      {/* ── DELIVERY LIST ─────────────────────────────────────────────── */}
      {step === "list" && (
        <>
          {myDeliveries.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
              <Package className="h-14 w-14 mx-auto text-[#D1D5DB] bg-[#F3F4F6] rounded-full p-3" />
              <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">Tidak Ada Pengantaran</p>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs mx-auto">
                Belum ada pesanan yang ditugaskan ke Anda untuk diantarkan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {myDeliveries.map((o, idx) => (
                  <motion.div
                    key={o.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.2 }}
                  >
                    <div
                      onClick={() => open(o)}
                      className="w-full text-left bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden hover:border-[#FBBF24] hover:shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                    >
                      <div className={
                        "h-1.5 " +
                        (o.status === "READY_TO_DELIVER" 
                          ? "bg-gradient-to-r from-blue-400 to-cyan-400" 
                          : "bg-gradient-to-r from-orange-400 to-amber-400")
                      } />
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center gap-4">
                          {/* Number badge */}
                          <div className={
                            "h-11 w-11 rounded-lg flex items-center justify-center shrink-0 border " +
                            (o.status === "READY_TO_DELIVER"
                              ? "bg-blue-50 border-blue-200 text-blue-600"
                              : "bg-orange-50 border-orange-200 text-orange-600")
                          }>
                            <span className="text-lg font-extrabold font-['Manrope',system-ui,sans-serif]">
                              {idx + 1}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                                {o.institutionName || o.customerName}
                              </p>
                              <span className={
                                "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold " +
                                (o.status === "READY_TO_DELIVER"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700")
                              }>
                                {o.status === "READY_TO_DELIVER" ? "Siap Diambil" : "Sedang Jalan"}
                              </span>
                            </div>
                            {o.recipientName && (
                              <p className="text-xs text-[#4B5563] font-semibold mt-0.5">
                                Penerima: {o.recipientName}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              <span className="inline-flex items-center gap-1 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                                <Clock className="h-3 w-3" />{o.deliveryTime}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                                <Package className="h-3 w-3" />{o.items.length} item
                              </span>
                            </div>
                            <div className="flex items-start gap-1 mt-1">
                              <MapPin className="h-3 w-3 text-[#9CA3AF] shrink-0 mt-0.5" />
                              {renderFormattedAddress(o.deliveryAddress)}
                            </div>
                          </div>

                          {/* Chevron */}
                          <ChevronRight className="h-5 w-5 text-[#D1D5DB] shrink-0" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* ── START DELIVERY ────────────────────────────────────────────── */}
      {step === "start" && active && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <StartDeliveryForm
            order={active}
            onStart={async (durationMinutes, photoId) => {
              const now = new Date();
              const timerEnd = new Date(now.getTime() + durationMinutes * 60 * 1000);
              await dispatchOrder(active.id);
              await updateDoc(doc(db, "orders", active.id), {
                deliveryStartPhotoId: photoId,
                deliveryDurationMinutes: durationMinutes,
                deliveryStartedAt: now.toISOString(),
                deliveryTimerEnd: timerEnd.toISOString(),
              });
              setStep("pic");
            }}
            onCancel={reset}
          />
        </motion.div>
      )}

      {/* ── PIC CONFIRMATION ──────────────────────────────────────────── */}
      {step === "pic" && active && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <PICConfirmation
            customerName={(active.recipientName || active.customerName || "") as string}
            onConfirm={() => setStep("proof")}
            onCancel={reset}
          />
        </motion.div>
      )}

      {/* ── PROOF CAPTURE ─────────────────────────────────────────────── */}
      {step === "proof" && active && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ProofCapture
            orderId={active.id}
            customerName={(active.recipientName || active.customerName || "") as string}
            onComplete={reset}
          />
        </motion.div>
      )}
    </div>
  );
}

function CustomerInfoCard({
  order,
}: {
  order: Order;
}) {
  const displayName = order.recipientName || order.customerName || "Penerima";
  const institutionName = order.institutionName;
  const phoneNumber = order.recipientPhone;
  const recipientNotes = order.recipientNotes;

  const shortId = order.id.length > 6 ? order.id.slice(-6).toUpperCase() : order.id.toUpperCase();
  const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";
  const whatsappNumber = cleanPhone.startsWith("0") 
    ? "62" + cleanPhone.slice(1) 
    : cleanPhone.startsWith("8") 
      ? "62" + cleanPhone 
      : cleanPhone;

  const templateMsg = encodeURIComponent(
    `Halo Kak ${displayName},\n\nSaya kurir Koperasi Al-Umanaa ingin mengantarkan pesanan Anda dengan nomor #${shortId}.`
  );
  const waUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${templateMsg}` : "";

  return (
    <div className="bg-white rounded-lg p-4 border border-[#E5E7EB] shadow-xs space-y-3 font-['Hanken_Grotesk'] text-xs">
      <div className="flex items-center justify-between">
        <h4 className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
          Detail Penerima & Instansi
        </h4>
        <span className="text-[9px] font-extrabold text-[#B45309] bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
          {order.orderType === "event" ? "Event" : "Rutin"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          {institutionName && (
            <p className="font-black text-[#111827] text-sm">
              {institutionName}
            </p>
          )}
          <p className="font-bold text-[#4B5563] text-xs">
            Penerima: {displayName}
          </p>
          {phoneNumber ? (
            <p className="text-[10px] text-[#6B7280] font-medium">
              No. HP: {phoneNumber}
            </p>
          ) : (
            <p className="text-[10px] text-red-500 font-semibold">
              Nomor handphone tidak tersedia
            </p>
          )}
          {recipientNotes && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2 mt-1">
              <span className="font-bold text-amber-800 text-[10px] block mb-0.5">Catatan Penerima:</span>
              <p className="text-[11px] text-amber-900 leading-relaxed font-medium">{recipientNotes}</p>
            </div>
          )}
        </div>

        {phoneNumber && (
          <div className="flex gap-2 shrink-0">
            <a
              href={`tel:${phoneNumber}`}
              className="flex items-center justify-center p-2 border border-[#D1D5DB] rounded-xl hover:bg-[#F9FAFB] transition cursor-pointer"
              title="Telepon Pelanggan"
              aria-label="Telepon Pelanggan"
            >
              <Phone className="h-4 w-4 text-[#4B5563]" />
            </a>
            {whatsappNumber && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center p-2 bg-[#10B981] hover:bg-[#059669] text-white rounded-xl transition cursor-pointer"
                title="Kirim WhatsApp"
                aria-label="Kirim WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DeliveryPage;
