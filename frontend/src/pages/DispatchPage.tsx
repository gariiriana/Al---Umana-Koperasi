import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Truck, RotateCcw, AlertCircle, MapPin, Clock,
  User, Package, Loader2, Navigation, ChevronDown,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/apiClient";
import { assignCourier, transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const renderFormattedAddress = (address: string) => {
  if (!address) return null;
  const parts = address.split(" | ");

  // 7-part step-by-step format: kabupaten | kecamatan | desa | rtRw | postalCode | mapsUrl | specificDetails
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

  // 3-part format: fullAddr | mapsUrl | specAddr
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

  // Fallback for legacy address format
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

// ── Main Page ───────────────────────────────────────────────────

export function DispatchPage() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [courierIds, setCourierIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "denied" | "error">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watcherRef = useRef<number | null>(null);
  const gpsThrottleRef = useRef<number>(0);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const [availableCouriers, setAvailableCouriers] = useState<{ uid: string; displayName: string; email: string }[]>([]);

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
            displayName: data.displayName || "",
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

  const ready = useMemo(() => orders.filter((o) => o.status === "READY_TO_DELIVER"), [orders]);
  const enRoute = useMemo(() => orders.filter((o) => o.status === "OUT_FOR_DELIVERY"), [orders]);

  const busyCourierIds = useMemo(() => {
    const busy = new Set<string>();
    orders.forEach((o) => {
      if (o.status === "OUT_FOR_DELIVERY" && o.assignedCourierId) {
        busy.add(o.assignedCourierId);
      }
    });
    return busy;
  }, [orders]);

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
    const cid = (courierIds[o.id] ?? o.assignedCourierId ?? "").trim();
    
    if (!cid) { setError("Kurir wajib dipilih."); return; }
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
                const courierValue = courierIds[o.id] ?? o.assignedCourierId ?? "";

                const isBusy = busyId === o.id;
                const isAlreadyAssigned = !!o.assignedCourierId && o.assignedCourierId === courierValue;

                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden transition-all">
                      <div className="h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400" />
                      <div className="p-4 sm:p-5 space-y-4">
                        {/* Info */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                              {o.institutionName || o.customerName}
                            </p>
                            {o.recipientName && (
                              <p className="text-xs text-[#4B5563] font-semibold mt-0.5">
                                Penerima: {o.recipientName}
                              </p>
                            )}
                            <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">#{o.id.slice(0, 10)}…</p>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700">
                            <Package className="h-3 w-3" />
                            Siap Kirim
                          </span>
                        </div>

                        {/* Meta chips */}
                        <div className="flex flex-wrap gap-2 items-center">
                          <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            <Clock className="h-3 w-3 text-[#6B7280]" />
                            {o.deliveryTime}
                          </div>
                          <div className="flex items-start gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif] flex-1 min-w-[150px]">
                            <MapPin className="h-3 w-3 text-[#6B7280] shrink-0 mt-0.5" />
                            {renderFormattedAddress(o.deliveryAddress)}
                          </div>
                          {o.deliveryLat && o.deliveryLng && (
                            <a
                              href={`https://www.google.com/maps?q=${o.deliveryLat},${o.deliveryLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg px-2.5 py-1.5 text-xs font-bold font-['Hanken_Grotesk',system-ui,sans-serif] transition shrink-0 cursor-pointer"
                            >
                              <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                              <span>Lihat Peta</span>
                            </a>
                          )}
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
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] pointer-events-none z-10" />
                              <select
                                id={`courier-${o.id}`}
                                value={courierValue}
                                onChange={(e) => setCourierIds((s) => ({ ...s, [o.id]: e.target.value }))}
                                className="w-full pl-9 pr-8 py-2 border border-[#D1D5DB] bg-[#F9FAFB] rounded-lg text-sm text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif] focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition appearance-none cursor-pointer"
                              >
                                <option value="">-- Pilih Kurir --</option>
                                {availableCouriers.map((c) => {
                                  const isCourierBusy = busyCourierIds.has(c.uid);
                                  return (
                                    <option key={c.uid} value={c.uid}>
                                      {c.displayName || c.email} {isCourierBusy ? "🔴 (Sedang Mengantar)" : "🟢 (Tersedia)"}
                                    </option>
                                  );
                                })}
                                {availableCouriers.length === 0 && (
                                  <option value={user?.uid}>{profile?.displayName || user?.email?.split("@")[0] || "Distributor"} (Distributor)</option>
                                )}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF] pointer-events-none" />
                            </div>
                            <button
                              onClick={() => onAssign(o)}
                              disabled={isBusy || isAlreadyAssigned}
                              className={`px-4 py-2 border text-sm font-bold font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition cursor-pointer disabled:opacity-50 ${
                                isAlreadyAssigned
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default"
                                  : "bg-white hover:bg-[#F3F4F6] border-[#D1D5DB] text-[#374151] active:scale-[0.98]"
                              }`}
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : isAlreadyAssigned ? (
                                "✓ Ditugaskan"
                              ) : (
                                "Tugaskan"
                              )}
                            </button>
                          </div>
                          {courierValue && busyCourierIds.has(courierValue) && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 px-1 pt-1">
                              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              <span>Kurir sedang aktif mengantarkan pesanan lain.</span>
                            </div>
                          )}
                        </div>


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
                          {o.institutionName || o.customerName}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {availableCouriers.find((c) => c.uid === o.assignedCourierId)?.displayName || o.assignedCourierId || "—"}
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
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-1.5 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] min-w-0 flex-1">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                        {renderFormattedAddress(o.deliveryAddress)}
                      </div>
                      {o.deliveryLat && o.deliveryLng && (
                        <a
                          href={`https://www.google.com/maps?q=${o.deliveryLat},${o.deliveryLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg px-2.5 py-1 text-xs font-bold font-['Hanken_Grotesk',system-ui,sans-serif] transition shrink-0 cursor-pointer"
                        >
                          <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                          <span>Lihat Peta</span>
                        </a>
                      )}
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
