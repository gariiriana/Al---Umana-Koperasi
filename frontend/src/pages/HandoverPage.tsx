import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Truck, RotateCcw, AlertCircle, MapPin, Clock,
  User, Package, Loader2, Navigation, ChevronDown,
  History, Eye, ChevronUp
} from "lucide-react";
import { ApiError } from "@/services/apiClient";
import { transitionOrder, dispatchOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order, KitchenSignature } from "@/types/order";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { ProofModal } from "@/components/delivery/ProofModal";

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
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
          onClick={(e) => e.stopPropagation()}>
          <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
          <span>Buka Link Peta ↗</span>
        </a>
      )}
    </div>
  );
};

export function HandoverPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "denied" | "error">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watcherRef = useRef<number | null>(null);
  const gpsThrottleRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<"ready" | "preparation" | "enroute" | "completed">("ready");
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [selectedProofFiles, setSelectedProofFiles] = useState<string[]>([]);
  const [selectedStartPhotoId, setSelectedStartPhotoId] = useState<string | undefined>(undefined);
  const [selectedKitchenSignatures, setSelectedKitchenSignatures] = useState<KitchenSignature[] | undefined>(undefined);

  const [availableCouriers, setAvailableCouriers] = useState<{ uid: string; displayName: string; email: string }[]>([]);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  useEffect(() => {
    const fetchCouriers = async () => {
      try {
        const { collection, getDocs, query, where } = await import("firebase/firestore");
        const q = query(collection(db, "users"), where("role", "==", "kurir"));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            displayName: data.displayName || data.email?.split("@")[0] || "Kurir",
            email: data.email || "",
          };
        });
        setAvailableCouriers(list);
      } catch (err) {
        console.error("Gagal mengambil daftar kurir:", err);
      }
    };
    fetchCouriers();
  }, []);

  // Filter only orders that have been assigned to a courier
  const assignedOrders = useMemo(() => {
    return orders.filter((o) => !!o.assignedCourierId);
  }, [orders]);

  // Group by tab status
  const preparation = useMemo(() => {
    return assignedOrders.filter((o) => o.status === "PENDING" || o.status === "IN_PRODUCTION");
  }, [assignedOrders]);

  const ready = useMemo(() => {
    return assignedOrders.filter((o) => o.status === "READY_TO_DELIVER" || o.status === "READY");
  }, [assignedOrders]);

  const enRoute = useMemo(() => {
    return assignedOrders.filter((o) => o.status === "OUT_FOR_DELIVERY");
  }, [assignedOrders]);

  const completed = useMemo(() => {
    return assignedOrders
      .filter((o) => o.status === "COMPLETED" || o.status === "DELIVERED" || o.status === "DELIVERY_FAILED" || o.status === "FAILED")
      .sort((a, b) => {
        const timeA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const timeB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [assignedOrders]);

  // Real-time GPS tracking broadcast
  useEffect(() => {
    const activeOrders = orders.filter((o) => o.status === "OUT_FOR_DELIVERY");

    if (activeOrders.length === 0) {
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      setGpsStatus("idle");
      return;
    }

    if (watcherRef.current !== null) return;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    const writeToFirestore = (lat: number, lng: number) => {
      const now = Date.now();
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

  // Handover action: transitions status to OUT_FOR_DELIVERY
  const onHandover = async (orderId: string) => {
    setBusyId(orderId);
    setError(null);
    try {
      const now = new Date();
      await dispatchOrder(orderId);
      await updateDoc(doc(db, "orders", orderId), {
        deliveryStartedAt: now.toISOString(),
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof ApiError ? err.message : "Gagal menyerahkan paket.");
    } finally {
      setBusyId(null);
    }
  };

  const onReschedule = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "reschedule" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Handover Paket
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            Serahkan pesanan yang telah ditugaskan ke kurir dan pantau proses pengantaran secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <span className="text-lg font-extrabold text-blue-700 font-['Manrope',system-ui,sans-serif]">{ready.length}</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Siap Kirim</span>
          </div>
          <div className="flex flex-col items-center bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
            <span className="text-lg font-extrabold text-orange-700 font-['Manrope',system-ui,sans-serif]">{enRoute.length}</span>
            <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wide">Sedang Jalan</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-['Hanken_Grotesk']">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer text-lg leading-none">×</button>
        </div>
      )}

      {/* Tab selectors */}
      <div className="flex border-b border-[#E5E7EB] bg-white rounded-t-2xl px-2">
        <button
          onClick={() => setActiveTab("ready")}
          className={`flex-1 py-3 text-center text-xs font-bold font-['Hanken_Grotesk'] transition-all border-b-2 ${
            activeTab === "ready"
              ? "border-[#FBBF24] text-[#111827] font-black"
              : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
          }`}
        >
          Siap Diserahkan ({ready.length})
        </button>
        <button
          onClick={() => setActiveTab("preparation")}
          className={`flex-1 py-3 text-center text-xs font-bold font-['Hanken_Grotesk'] transition-all border-b-2 ${
            activeTab === "preparation"
              ? "border-[#FBBF24] text-[#111827] font-black"
              : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
          }`}
        >
          Dalam Persiapan ({preparation.length})
        </button>
        <button
          onClick={() => setActiveTab("enroute")}
          className={`flex-1 py-3 text-center text-xs font-bold font-['Hanken_Grotesk'] transition-all border-b-2 ${
            activeTab === "enroute"
              ? "border-[#FBBF24] text-[#111827] font-black"
              : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
          }`}
        >
          Sedang Dikirim ({enRoute.length})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 py-3 text-center text-xs font-bold font-['Hanken_Grotesk'] transition-all border-b-2 ${
            activeTab === "completed"
              ? "border-[#FBBF24] text-[#111827] font-black"
              : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
          }`}
        >
          Riwayat Selesai ({completed.length})
        </button>
      </div>

      <div className="space-y-4">
        {/* Tab 1: READY FOR HANDOVER */}
        {activeTab === "ready" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {ready.map((o) => {
                const isBusy = busyId === o.id;
                const courierName = availableCouriers.find((c) => c.uid === o.assignedCourierId)?.displayName || o.assignedCourierId || "Kurir";

                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden"
                  >
                    <div className="h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400" />
                    <div className="p-5 space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="font-['Manrope'] font-black text-base text-[#111827] leading-snug">
                            {o.institutionName}
                          </h4>
                          <p className="text-xs text-[#4B5563] font-bold mt-0.5">Penerima: {o.recipientName}</p>
                          <span className="font-mono text-[9px] text-[#9CA3AF]">#{o.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 border border-blue-200 text-blue-700 uppercase tracking-wide shrink-0">
                          Selesai Masak
                        </span>
                      </div>

                      <div className="space-y-2 text-xs text-[#4B5563]">
                        <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span>Kurir ditugaskan: <strong>{courierName}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>Jadwal Pengantaran: <strong>{o.deliveryTime}</strong></span>
                        </div>
                        <div className="flex items-start gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">{renderFormattedAddress(o.deliveryAddress)}</div>
                        </div>
                      </div>

                      <div className="flex gap-2.5 pt-2">
                        <button
                          onClick={() => onHandover(o.id)}
                          disabled={isBusy}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white font-extrabold rounded-xl transition shadow-md shadow-amber-700/15 cursor-pointer text-xs"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Truck className="h-4 w-4" />}
                          <span>Serahkan ke Kurir</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {ready.length === 0 && (
                <div className="col-span-full bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-2">
                  <Package className="h-10 w-10 mx-auto text-[#D1D5DB]" />
                  <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk'] font-medium">Belum ada paket yang siap diserahkan.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Tab 2: IN PREPARATION */}
        {activeTab === "preparation" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {preparation.map((o) => {
                const courierName = availableCouriers.find((c) => c.uid === o.assignedCourierId)?.displayName || o.assignedCourierId || "Kurir";

                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden"
                  >
                    <div className="h-1.5 bg-[#FCD34D]" />
                    <div className="p-5 space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="font-['Manrope'] font-black text-base text-[#111827] leading-snug">
                            {o.institutionName}
                          </h4>
                          <p className="text-xs text-[#4B5563] font-bold mt-0.5">Penerima: {o.recipientName}</p>
                          <span className="font-mono text-[9px] text-[#9CA3AF]">#{o.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide shrink-0 ${
                          o.status === "IN_PRODUCTION" 
                            ? "bg-amber-50 border border-amber-200 text-amber-700" 
                            : "bg-blue-50 border border-blue-200 text-blue-700"
                        }`}>
                          {o.status === "IN_PRODUCTION" ? "Sedang Dimasak" : "Menunggu Antrean"}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs text-[#4B5563]">
                        <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span>Kurir ditugaskan: <strong>{courierName}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>Jadwal Pengantaran: <strong>{o.deliveryTime}</strong></span>
                        </div>
                        <div className="flex items-start gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                          <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">{renderFormattedAddress(o.deliveryAddress)}</div>
                        </div>
                      </div>
                      
                      <div className="pt-2 text-[10px] text-[#6B7280] italic text-center bg-amber-50/30 border border-amber-100 rounded-xl p-2">
                        Menunggu tim produksi menyelesaikan masakan sebelum paket dapat diserahkan ke kurir.
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {preparation.length === 0 && (
                <div className="col-span-full bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-2">
                  <Package className="h-10 w-10 mx-auto text-[#D1D5DB]" />
                  <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk'] font-medium">Tidak ada paket ter-asinyasi yang sedang diproduksi.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Tab 3: EN ROUTE */}
        {activeTab === "enroute" && (
          <div className="space-y-4">
            {/* GPS Tracker Banner */}
            {enRoute.length > 0 && (
              <div className={`flex items-center gap-2.5 px-4 py-3 border rounded-xl text-xs font-bold ${
                gpsStatus === "active"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : gpsStatus === "denied"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : gpsStatus === "error"
                  ? "bg-orange-50 border-orange-200 text-orange-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              }`}>
                <Navigation className={`h-4 w-4 shrink-0 ${gpsStatus === "active" ? "animate-pulse" : ""}`} />
                <span>
                  {gpsStatus === "active"
                    ? `GPS Tracker Aktif — Lokasi terbaru: ${gpsCoords?.lat.toFixed(5)}, ${gpsCoords?.lng.toFixed(5)}`
                    : gpsStatus === "denied"
                    ? "Akses lokasi ditolak. Aktifkan GPS pada perangkat browser kurir."
                    : gpsStatus === "error"
                    ? "Sinyal GPS lemah atau tidak terdeteksi."
                    : "Mencari lokasi kurir…"}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {enRoute.map((o) => {
                  const isBusy = busyId === o.id;
                  const courierName = availableCouriers.find((c) => c.uid === o.assignedCourierId)?.displayName || o.assignedCourierId || "Kurir";

                  return (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden"
                    >
                      <div className="h-1.5 bg-gradient-to-r from-orange-400 to-amber-400" />
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-['Manrope'] font-black text-base text-[#111827] leading-snug">
                              {o.institutionName}
                            </h4>
                            <p className="text-xs text-[#4B5563] font-bold mt-0.5">Penerima: {o.recipientName}</p>
                            <span className="font-mono text-[9px] text-[#9CA3AF]">#{o.id.slice(-6).toUpperCase()}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 border border-orange-200 text-orange-700 uppercase tracking-wide shrink-0">
                            Sedang Jalan
                          </span>
                        </div>

                        <div className="space-y-2 text-xs text-[#4B5563]">
                          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                            <User className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span>Kurir pengantar: <strong>{courierName}</strong></span>
                          </div>
                          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                            <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                            <span>Jadwal Pengantaran: <strong>{o.deliveryTime}</strong></span>
                          </div>
                          <div className="flex items-start gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-2.5">
                            <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">{renderFormattedAddress(o.deliveryAddress)}</div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 justify-between items-center">
                          {o.deliveryLat && o.deliveryLng ? (
                            <a
                              href={`https://www.google.com/maps?q=${o.deliveryLat},${o.deliveryLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg px-2.5 py-1.5 text-xs font-bold transition shrink-0 cursor-pointer"
                            >
                              <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                              <span>Lacak Lokasi Kurir</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-semibold">Broadcasting offline...</span>
                          )}

                          <button
                            onClick={() => onReschedule(o)}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E7EB] bg-white hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-lg cursor-pointer transition disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Jadwal Ulang
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {enRoute.length === 0 && (
                  <div className="col-span-full bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-2">
                    <Truck className="h-10 w-10 mx-auto text-[#D1D5DB]" />
                    <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk'] font-medium">Tidak ada kurir yang sedang di perjalanan.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Tab 4: COMPLETED HISTORY */}
        {activeTab === "completed" && (
          <div className="space-y-4">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="flex items-center justify-between w-full font-['Manrope'] text-base font-bold text-[#111827] focus:outline-none cursor-pointer px-2"
            >
              <div className="flex items-center gap-2">
                <History className="h-4.5 w-4.5 text-emerald-600" />
                <span>Riwayat Pengantaran Kurir</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">{completed.length}</span>
              </div>
              {isHistoryOpen ? <ChevronUp className="h-5 w-5 text-neutral-400" /> : <ChevronDown className="h-5 w-5 text-neutral-400" />}
            </button>

            <AnimatePresence>
              {isHistoryOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden"
                >
                  {completed.map((o) => {
                    const hasProof = o.proofFileIds && o.proofFileIds.length > 0;
                    const courierName = availableCouriers.find((c) => c.uid === o.assignedCourierId)?.displayName || o.assignedCourierId || "Kurir";

                    return (
                      <div key={o.id} className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
                          <div className="p-5 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-['Manrope'] font-black text-base text-[#111827] truncate">
                                  {o.institutionName}
                                </h4>
                                <p className="text-xs text-[#4B5563] font-bold mt-0.5">Penerima: {o.recipientName || "—"}</p>
                                <span className="font-mono text-[9px] text-[#9CA3AF]">#{o.id.slice(-6).toUpperCase()}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-wide shrink-0">
                                Selesai
                              </span>
                            </div>

                            <div className="space-y-1.5 text-xs text-[#374151]">
                              <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5">
                                <User className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                                <span>Kurir: <strong>{courierName}</strong></span>
                              </div>
                              {o.deliveredAt && (
                                <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5">
                                  <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                                  <span>Tiba: <strong>{new Date(o.deliveredAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })} WIB</strong></span>
                                </div>
                              )}
                              <div className="flex items-start gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5">
                                <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">{renderFormattedAddress(o.deliveryAddress)}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {(hasProof || o.deliveryStartPhotoId) && (
                          <div className="px-5 pb-5 pt-1 flex justify-end">
                            <button
                              onClick={() => {
                                setSelectedProofFiles(o.proofFileIds || []);
                                setSelectedStartPhotoId(o.deliveryStartPhotoId || undefined);
                                setSelectedKitchenSignatures(o.kitchenSignatures || undefined);
                                setIsProofModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-emerald-700 font-bold text-xs rounded-lg transition cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Lihat Bukti Foto & TTD
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {completed.length === 0 && (
                    <div className="col-span-full bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-2">
                      <History className="h-10 w-10 mx-auto text-[#D1D5DB]" />
                      <p className="text-sm text-[#9CA3AF] font-['Hanken_Grotesk'] font-medium">Belum ada riwayat pengiriman selesai.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ProofModal
        isOpen={isProofModalOpen}
        onClose={() => setIsProofModalOpen(false)}
        proofFileIds={selectedProofFiles}
        deliveryStartPhotoId={selectedStartPhotoId}
        kitchenSignatures={selectedKitchenSignatures}
      />
    </div>
  );
}

export default HandoverPage;
