import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send, Truck, RotateCcw, AlertCircle, MapPin, Clock,
  User, Package, Loader2, Camera, X, ChevronDown, Navigation,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/apiClient";
import { assignCourier, dispatchOrder, transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";

// ── Inline Dispatch Form ────────────────────────────────────────

interface DispatchFormProps {
  order: Order;
  onSuccess: () => void;
  onCancel: () => void;
}

function DispatchForm({ order, onSuccess, onCancel }: DispatchFormProps) {
  const [duration, setDuration] = useState<number>(20);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      setFormError(
        validation.reason === "mime"
          ? "Format tidak didukung. Gunakan JPG, PNG, atau WebP."
          : "Ukuran file terlalu besar. Maksimal 15 MB."
      );
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFormError(null);
  };

  const handleDispatch = async () => {
    if (!photoFile) {
      setFormError("Foto bukti keberangkatan wajib diunggah.");
      return;
    }
    setUploading(true);
    setFormError(null);

    try {
      // 1. Upload photo in chunks
      const result = await uploadFileInChunks(photoFile, {
        orderId: order.id,
        onProgress: (p) => {
          setUploadProgress(Math.round(p.fraction * 100));
          if (progressRef.current) {
            progressRef.current.style.width = `${Math.round(p.fraction * 100)}%`;
          }
        },
      });

      // 2. Dispatch order → sets status to OUT_FOR_DELIVERY
      await dispatchOrder(order.id);

      // 3. Save photo + timer data to Firestore
      const now = new Date();
      const timerEnd = new Date(now.getTime() + duration * 60 * 1000);
      await updateDoc(doc(db, "orders", order.id), {
        deliveryStartPhotoId: result.fileId,
        deliveryDurationMinutes: duration,
        deliveryStartedAt: now.toISOString(),
        deliveryTimerEnd: timerEnd.toISOString(),
      });

      onSuccess();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 border border-blue-200 rounded-lg p-4 bg-blue-50/30 space-y-4 text-xs font-['Hanken_Grotesk']">
        {/* Form header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#111827] font-['Manrope']">
            Konfirmasi Pengiriman
          </span>
          <button
            onClick={onCancel}
            disabled={uploading}
            title="Batal"
            aria-label="Batal"
            className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-blue-100 text-[#9CA3AF] hover:text-[#374151] transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Error */}
        {formError && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {formError}
          </div>
        )}

        {/* Duration selector */}
        <div className="space-y-1">
          <label
            htmlFor={`duration-${order.id}`}
            className="block text-[11px] font-bold text-[#374151]"
          >
            Estimasi Waktu Perjalanan
          </label>
          <div className="relative">
            <select
              id={`duration-${order.id}`}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              title="Estimasi Waktu Perjalanan"
              aria-label="Estimasi Waktu Perjalanan"
              className="w-full appearance-none bg-white border border-[#D1D5DB] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
            >
              <option value={10}>10 Menit</option>
              <option value={20}>20 Menit</option>
              <option value={30}>30 Menit</option>
              <option value={45}>45 Menit</option>
              <option value={60}>60 Menit</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF] pointer-events-none" />
          </div>
        </div>

        {/* Photo upload — centered */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-[#374151]">
            Foto Bukti Keberangkatan Kurir
          </label>
          <div className="relative flex flex-col items-center justify-center border-2 border-dashed border-[#D1D5DB] rounded-lg p-5 bg-white hover:bg-[#F9FAFB] transition cursor-pointer min-h-[90px] text-center">
            <input
              type="file"
              accept="image/*"
              title="Pilih Foto Bukti Keberangkatan"
              aria-label="Pilih Foto Bukti Keberangkatan"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <Camera className="h-5 w-5 text-[#9CA3AF] mb-1.5" />
            <span className="text-[11px] font-bold text-[#4B5563]">
              {photoFile ? photoFile.name : "Pilih Foto Keberangkatan"}
            </span>
            <span className="text-[9px] text-[#9CA3AF] mt-0.5">
              JPG, PNG, atau WebP — Maks 15 MB
            </span>
          </div>

          {photoPreview && (
            <div className="mt-2 flex justify-center">
              <img
                src={photoPreview}
                alt="Preview foto keberangkatan"
                className="h-20 w-20 object-cover rounded-lg border border-[#E5E7EB] shadow-xs"
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
                ref={progressRef}
                className="h-full bg-blue-500 transition-all duration-150 w-0"
              />
            </div>
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleDispatch}
          disabled={uploading || !photoFile}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:from-blue-300 disabled:to-cyan-300 disabled:cursor-not-allowed text-white font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs cursor-pointer active:scale-[0.98]"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Kirimkan Sekarang
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export function DispatchPage() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [courierIds, setCourierIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatchFormId, setDispatchFormId] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "denied" | "error">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watcherRef = useRef<number | null>(null);
  const gpsThrottleRef = useRef<number>(0);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const ready = useMemo(() => orders.filter((o) => o.status === "READY_TO_DELIVER"), [orders]);
  const enRoute = useMemo(() => orders.filter((o) => o.status === "OUT_FOR_DELIVERY"), [orders]);

  // ── Real-time GPS broadcast when ANY order is OUT_FOR_DELIVERY ──
  useEffect(() => {
    const activeOrders = orders.filter((o) => o.status === "OUT_FOR_DELIVERY");

    if (activeOrders.length === 0) {
      // No active deliveries — stop watching
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      setGpsStatus("idle");
      return;
    }

    // Start watching if not already
    if (watcherRef.current !== null) return;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    const writeToFirestore = (lat: number, lng: number) => {
      const now = Date.now();
      // Throttle Firestore writes to at most once every 5 seconds
      if (now - gpsThrottleRef.current < 5000) return;
      gpsThrottleRef.current = now;

      const current = orders.filter((o) => o.status === "OUT_FOR_DELIVERY");
      current.forEach((o) => {
        updateDoc(doc(db, "orders", o.id), {
          courierLat: lat,
          courierLng: lng,
        }).catch((err) => console.error("GPS write failed:", err));
      });
    };

    watcherRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsStatus("active");
        setGpsCoords({ lat: latitude, lng: longitude });
        writeToFirestore(latitude, longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
        } else {
          setGpsStatus("error");
        }
        console.warn("Geolocation error:", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );

    return () => {
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enRoute.length]);

  const onAssign = async (o: Order) => {
    // If empty, auto-populate with the logged in user's profile display name or email prefix
    const loggedInName = profile?.displayName || user?.email?.split("@")[0] || "";
    const cid = (courierIds[o.id] ?? "").trim() || o.assignedCourierId || loggedInName;
    
    if (!cid) { setError("Nama kurir wajib diisi."); return; }
    setBusyId(o.id); setError(null);
    try { await assignCourier(o.id, cid); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); }
    finally { setBusyId(null); }
  };

  const onReschedule = async (o: Order) => {
    setBusyId(o.id); setError(null);
    try { await transitionOrder(o.id, { action: "reschedule" }); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
            Pengiriman
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            Tugaskan kurir dan proses pengiriman pesanan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="text-lg font-extrabold text-blue-700 font-['Manrope',system-ui,sans-serif]">{ready.length}</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Siap</span>
          </div>
          <div className="flex flex-col items-center bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <span className="text-lg font-extrabold text-orange-700 font-['Manrope',system-ui,sans-serif]">{enRoute.length}</span>
            <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wide">Jalan</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer text-lg leading-none">×</button>
        </div>
      )}

      {/* ── READY TO DELIVER ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            Siap Dikirim
          </h2>
          <span className="ml-1 text-xs font-bold text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">{ready.length}</span>
        </div>

        {ready.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center space-y-2">
            <Package className="h-10 w-10 mx-auto text-[#D1D5DB]" />
            <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk',system-ui,sans-serif]">Belum ada pesanan siap kirim.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {ready.map((o) => {
                const isBusy = busyId === o.id;
                const hasAssigned = !!o.assignedCourierId;
                
                // Auto-populate with the logged in user's profile display name or email prefix as default
                const loggedInName = profile?.displayName || user?.email?.split("@")[0] || "";
                const courierValue = courierIds[o.id] ?? o.assignedCourierId ?? loggedInName;
                const isDispatchFormOpen = dispatchFormId === o.id;

                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={`bg-white rounded-lg border shadow-xs overflow-hidden transition-all ${
                      isDispatchFormOpen ? "border-blue-300 ring-2 ring-blue-100" : "border-[#E5E7EB]"
                    }`}>
                      <div className="h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400" />
                      <div className="p-4 sm:p-5 space-y-4">
                        {/* Info */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                              {o.customerName}
                            </p>
                            <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">#{o.id.slice(0, 10)}…</p>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700">
                            <Package className="h-3 w-3" />
                            Siap Kirim
                          </span>
                        </div>

                        {/* Meta chips */}
                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            <Clock className="h-3 w-3 text-[#6B7280]" />
                            {o.deliveryTime}
                          </div>
                          <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-[200px]">
                            <MapPin className="h-3 w-3 text-[#6B7280] shrink-0" />
                            <span className="truncate">{o.deliveryAddress}</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            <Package className="h-3 w-3 text-[#6B7280]" />
                            {o.items.length} item
                          </div>
                        </div>

                        {/* Courier input */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`courier-${o.id}`}
                            className="text-xs font-bold text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]"
                          >
                            Nama Kurir
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] pointer-events-none" />
                              <input
                                id={`courier-${o.id}`}
                                type="text"
                                value={courierValue}
                                onChange={(e) => setCourierIds((s) => ({ ...s, [o.id]: e.target.value }))}
                                placeholder="contoh: Ahmad"
                                className="w-full pl-9 pr-3 py-2 border border-[#D1D5DB] bg-[#F9FAFB] rounded-lg text-sm text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition"
                              />
                            </div>
                            <button
                              onClick={() => onAssign(o)}
                              disabled={isBusy}
                              className="px-4 py-2 border border-[#D1D5DB] bg-white hover:bg-[#F3F4F6] text-sm font-bold text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tugaskan"}
                            </button>
                          </div>
                        </div>

                        {/* Dispatch trigger button — opens form */}
                        {!isDispatchFormOpen && (
                          <button
                            onClick={() => {
                              // If it has not been assigned, we can auto-assign to the logged in user directly!
                              if (!hasAssigned) {
                                onAssign(o).then(() => setDispatchFormId(o.id));
                              } else {
                                setDispatchFormId(o.id);
                              }
                            }}
                            disabled={isBusy}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Kirimkan Sekarang
                          </button>
                        )}

                        {/* Inline dispatch form */}
                        <AnimatePresence>
                          {isDispatchFormOpen && (
                            <DispatchForm
                              order={o}
                              onSuccess={() => setDispatchFormId(null)}
                              onCancel={() => setDispatchFormId(null)}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── EN ROUTE ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            Sedang Dikirim
          </h2>
          <span className="ml-1 text-xs font-bold text-orange-600 bg-orange-100 rounded px-1.5 py-0.5">{enRoute.length}</span>
        </div>

        {/* GPS Status Banner */}
        {enRoute.length > 0 && (
          <div className={`mb-3 flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-xs font-bold font-['Hanken_Grotesk'] border ${
            gpsStatus === "active"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : gpsStatus === "denied"
              ? "bg-red-50 border-red-200 text-red-700"
              : gpsStatus === "error"
              ? "bg-orange-50 border-orange-200 text-orange-700"
              : "bg-blue-50 border-blue-200 text-blue-700"
          }`}>
            <Navigation className={`h-3.5 w-3.5 shrink-0 ${
              gpsStatus === "active" ? "animate-pulse" : ""
            }`} />
            <span>
              {gpsStatus === "active"
                ? `GPS Aktif — Lokasi terbaru: ${gpsCoords?.lat.toFixed(5)}, ${gpsCoords?.lng.toFixed(5)}`
                : gpsStatus === "denied"
                ? "Akses GPS ditolak. Izinkan lokasi di pengaturan browser."
                : gpsStatus === "error"
                ? "GPS tidak tersedia. Periksa koneksi perangkat Anda."
                : "Menginisialisasi GPS tracker…"}
            </span>
            {gpsStatus === "active" && (
              <span className="ml-auto flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                LIVE
              </span>
            )}
          </div>
        )}

        {enRoute.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center space-y-2">
            <Truck className="h-10 w-10 mx-auto text-[#D1D5DB]" />
            <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk',system-ui,sans-serif]">Tidak ada pengiriman aktif.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enRoute.map((o) => (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-white rounded-lg border border-orange-200 shadow-xs overflow-hidden">
                  <div className="h-1.5 bg-gradient-to-r from-orange-400 to-amber-400" />
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                        <Truck className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] truncate">
                          {o.customerName}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] flex items-center gap-1">
                            <User className="h-3 w-3" />{o.assignedCourierId ?? "—"}
                          </span>
                          <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] flex items-center gap-1">
                            <Clock className="h-3 w-3" />{o.deliveryTime}
                          </span>
                          {o.deliveryTimerEnd && (
                            <span className="text-xs text-orange-600 font-bold font-['Hanken_Grotesk',system-ui,sans-serif] flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Target: {new Date(o.deliveryTimerEnd).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onReschedule(o)}
                        disabled={busyId === o.id}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] bg-white hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg cursor-pointer transition disabled:opacity-50 active:scale-[0.97]"
                      >
                        {busyId === o.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RotateCcw className="h-3.5 w-3.5" />}
                        Jadwalkan Ulang
                      </button>
                    </div>
                    <div className="mt-3 flex items-start gap-1.5 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                      <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="truncate">{o.deliveryAddress}</span>
                    </div>
                    {/* Per-order GPS coordinate chip */}
                    {gpsStatus === "active" && gpsCoords && (
                      <div className="mt-2.5 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                        <Navigation className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-[10px] font-bold text-emerald-700 font-['Hanken_Grotesk']">Broadcasting GPS ke pelanggan</span>
                        <span className="ml-auto font-mono text-[10px] text-emerald-600">{gpsCoords.lat.toFixed(4)}, {gpsCoords.lng.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default DispatchPage;
