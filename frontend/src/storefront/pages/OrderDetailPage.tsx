import { useEffect, useState, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, MapPin, Clock, FileImage, ShieldAlert, Navigation, Phone, MessageCircle, Star, Camera, Send, AlertCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import type * as LType from "leaflet";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToOrder, submitReview } from "@/services/orderService";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import type { Order } from "@/types/order";
import { STATUS_LABELS, getStatusBadgeClass } from "@/lib/orderHelpers";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    invalidOrderId: "ID Pesanan tidak valid.",
    orderNotFound: "Pesanan tidak ditemukan atau Anda tidak memiliki akses.",
    loadingOrder: "Memuat detail pesanan…",
    invalidOrder: "Pesanan tidak valid.",
    backToOrders: "Kembali ke Daftar Pesanan",
    unknownDate: "Tanggal tidak dikenal",
    title: "Rincian Pesanan",
    trackOrder: "Lacak Pesanan Anda",
    currentStatus: "Status Terkini",
    stepProgress: "Step {current} dari {total}",
    productList: "Daftar Produk Belanja",
    itemsCount: "{count} barang",
    paymentProof: "Bukti Pembayaran",
    loadingProof: "Memuat bukti pembayaran…",
    loadProofFailed: "Bukti transfer gagal dimuat",
    proofDesc: "Foto bukti transfer pembayaran yang Anda kirimkan.",
    orderStatusHeader: "Status Pesanan",
    orderIdHeader: "ID Pesanan",
    createdOn: "Dibuat pada:",
    rejectionTitle: "Alasan Penolakan Pembayaran:",
    outOfStockTitle: "Gagal karena Stok Kosong:",
    outOfStockDesc: "Beberapa item dalam pesanan Anda tidak memiliki stok yang cukup di koperasi.",
    deliveryInfo: "Informasi Pengiriman",
    deliveryAddress: "Alamat Pengantaran",
    deliveryTime: "Waktu Pengantaran",
    uploadProofBtn: "Kirim Bukti Pembayaran",
  },
  en: {
    invalidOrderId: "Invalid Order ID.",
    orderNotFound: "Order not found or access denied.",
    loadingOrder: "Loading order details...",
    invalidOrder: "Invalid order.",
    backToOrders: "Back to Order List",
    unknownDate: "Unknown date",
    title: "Order Details",
    trackOrder: "Track Your Order",
    currentStatus: "Current Status",
    stepProgress: "Step {current} of {total}",
    productList: "Shopping Item List",
    itemsCount: "{count} item(s)",
    paymentProof: "Payment Proof",
    loadingProof: "Loading payment proof...",
    loadProofFailed: "Failed to load transfer proof",
    proofDesc: "The photo of payment proof you submitted.",
    orderStatusHeader: "Order Status",
    orderIdHeader: "Order ID",
    createdOn: "Created on:",
    rejectionTitle: "Payment Rejection Reason:",
    outOfStockTitle: "Failed due to Out of Stock:",
    outOfStockDesc: "Some items in your order do not have enough stock in the cooperative.",
    deliveryInfo: "Delivery Information",
    deliveryAddress: "Delivery Address",
    deliveryTime: "Delivery Time",
    uploadProofBtn: "Send Payment Proof",
  }
} as const;

const getSteps = (lang: string) => [
  {
    title: lang === "en" ? "Order Placed" : "Pesanan Dibuat",
    desc: (_status: string, step: number) => 
      step > 1 
        ? (lang === "en" ? "Order accepted" : "Pesanan dikonfirmasi") 
        : (lang === "en" ? "Awaiting kitchen processing" : "Menunggu diproses dapur"),
  },
  {
    title: lang === "en" ? "Kitchen Processing" : "Proses Dapur",
    desc: (status: string, step: number) => {
      if (status === "IN_PRODUCTION") return lang === "en" ? "Order is being prepared in the kitchen" : "Pesanan sedang dimasak di dapur koperasi";
      if (step > 2) return lang === "en" ? "Finished processing & packaging" : "Selesai diproses & dikemas";
      return lang === "en" ? "Awaiting kitchen queue" : "Menunggu antrean masuk dapur";
    }
  },
  {
    title: lang === "en" ? "Quality Control (QC)" : "Uji Kelayakan (QC)",
    desc: (status: string, step: number) => {
      if (status === "QC") return lang === "en" ? "Order is being quality checked (QC)" : "Pesanan sedang diuji kelayakan (QC) di dapur";
      if (step > 3) return lang === "en" ? "Passed quality control" : "Lolos uji kelayakan (QC)";
      return lang === "en" ? "Awaiting quality check" : "Menunggu pengujian kelayakan (QC)";
    }
  },
  {
    title: lang === "en" ? "Ready for Delivery" : "Siap Dikirim",
    desc: (status: string, step: number) => {
      if (status === "READY_TO_DELIVER") return lang === "en" ? "Order packed & awaiting courier dispatch" : "Pesanan dikemas & menunggu kurir berangkat";
      if (step > 4) return lang === "en" ? "Order handed over to courier" : "Pesanan diserahkan ke kurir";
      return lang === "en" ? "Awaiting product readiness" : "Menunggu kesiapan produk";
    }
  },
  {
    title: lang === "en" ? "Out for Delivery" : "Dalam Pengantaran",
    desc: (status: string, step: number) => {
      if (status === "OUT_FOR_DELIVERY") return lang === "en" ? "Courier is on the way to your address" : "Kurir dalam perjalanan ke alamat Anda";
      if (step > 5) return lang === "en" ? "Finished delivering to destination" : "Selesai diantar ke lokasi tujuan";
      return lang === "en" ? "Awaiting delivery schedule" : "Menunggu jadwal pengiriman";
    }
  },
  {
    title: lang === "en" ? "Completed" : "Selesai",
    desc: (_status: string, step: number) => {
      if (step === 6) return lang === "en" ? "Order successfully completed. Thank you!" : "Pesanan telah selesai. Terima kasih!";
      return lang === "en" ? "Awaiting confirmation and review" : "Menunggu konfirmasi dan ulasan";
    }
  }
];

const translateTime = (time: string, lang: string) => {
  if (lang === "id") return time;
  switch (time) {
    case "Segera (30 - 60 Menit)":
      return "Immediate (30 - 60 Minutes)";
    case "Makan Siang (12:00 - 13:00)":
      return "Lunch (12:00 - 13:00)";
    case "Makan Sore (15:00 - 16:00)":
      return "Afternoon (15:00 - 16:00)";
    case "Makan Malam (18:00 - 19:00)":
      return "Dinner (18:00 - 19:00)";
    default:
      return time;
  }
};

function getStatusStepIndex(status: string): number {
  switch (status) {
    case "PENDING":
      return 1;
    case "IN_PRODUCTION":
      return 2;
    case "QC":
      return 3;
    case "READY_TO_DELIVER":
      return 4;
    case "OUT_FOR_DELIVERY":
      return 5;
    case "COMPLETED":
      return 6;
    default:
      return 1;
  }
}

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

interface CourierProfile {
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
}

function CourierInfoCard({
  profile,
  loading,
  orderId,
  lang,
}: {
  profile: CourierProfile | null;
  loading: boolean;
  orderId: string;
  lang: "id" | "en";
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-[#FBBF24]" />
        <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] ml-2">
          {lang === "en" ? "Loading courier profile..." : "Memuat profil kurir..."}
        </span>
      </div>
    );
  }

  if (!profile) return null;

  const shortId = orderId.length > 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  const cleanPhone = profile.phoneNumber ? profile.phoneNumber.replace(/\D/g, "") : "";
  const whatsappNumber = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  
  const templateMsg = encodeURIComponent(
    lang === "en"
      ? `Hello ${profile.displayName || "Courier"},\n\nI want to ask about my order #${shortId} delivery.`
      : `Halo Kak ${profile.displayName || "Kurir"},\n\nSaya ingin menanyakan tentang pengantaran pesanan #${shortId} saya.`
  );
  const waUrl = `https://wa.me/${whatsappNumber}?text=${templateMsg}`;

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
          {lang === "en" ? "Delivery Courier Info" : "Informasi Kurir Pengantar"}
        </h3>
        <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          {lang === "en" ? "Courier Assigned" : "Kurir Ditugaskan"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt={profile.displayName || "Kurir"}
            className="h-12 w-12 rounded-2xl object-cover border border-[#E5E7EB] shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-amber-600 font-extrabold text-lg">
            {(profile.displayName || "K")[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#111827] truncate">
            {profile.displayName || (lang === "en" ? "Courier" : "Kurir")}
          </p>
          <p className="text-[10px] text-[#6B7280] font-['Hanken_Grotesk'] font-medium">
            {lang === "en" ? "Official Al-Umanaa Courier" : "Kurir Resmi Al-Umanaa"}
          </p>
        </div>
      </div>

      {profile.phoneNumber && (
        <div className="flex gap-2 pt-1">
          <a
            href={`tel:${profile.phoneNumber}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] hover:bg-[#F9FAFB] transition cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5 text-[#6B7280]" />
            <span>{lang === "en" ? "Call" : "Hubungi"}</span>
          </a>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#10B981] hover:bg-[#059669] rounded-xl text-xs font-bold text-white transition cursor-pointer"
          >
            <MessageCircle className="h-3.5 w-3.5 text-white" />
            <span>WhatsApp</span>
          </a>
        </div>
      )}
    </div>
  );
}

// ── DYNAMIC LEAFLET COURIER TRACKING MAP ───────────────────────

const ORIGIN: [number, number] = [-6.9034, 106.9696]; // PP Modern Al-Umanaa
const FALLBACK_DEST: [number, number] = [-6.9080, 106.9780]; // Fallback customer coords

/** Build a realistic-looking road path between two points with minor intermediate offsets */
function buildRoute(origin: [number, number], dest: [number, number]): [number, number][] {
  const steps = 8;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = origin[0] + (dest[0] - origin[0]) * t;
    const lng = origin[1] + (dest[1] - origin[1]) * t;
    // Add small perpendicular wobble to simulate real road curves
    const offset = Math.sin(t * Math.PI) * 0.0008;
    points.push([lat + offset * 0.4, lng + offset]);
  }
  return points;
}

function getInterpolatedPoint(coords: [number, number][], t: number): [number, number] {
  if (t <= 0) return coords[0];
  if (t >= 1) return coords[coords.length - 1];
  const fractionalIndex = t * (coords.length - 1);
  const index = Math.floor(fractionalIndex);
  const remainder = fractionalIndex - index;
  const startPt = coords[index];
  const endPt = coords[index + 1];
  return [
    startPt[0] + (endPt[0] - startPt[0]) * remainder,
    startPt[1] + (endPt[1] - startPt[1]) * remainder,
  ];
}

function CourierTrackingMap({
  progress,
  courierLat,
  courierLng,
  customerLat,
  customerLng,
}: {
  progress: number;
  courierLat?: number;
  courierLng?: number;
  customerLat?: number | null;
  customerLng?: number | null;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const courierMarkerRef = useRef<LType.Marker | null>(null);
  const polylineRef = useRef<LType.Polyline | null>(null);
  const destMarkerRef = useRef<LType.Marker | null>(null);
  const routeRef = useRef<[number, number][]>([]);

  // Determine destination coordinates
  const destLat = (customerLat != null && !isNaN(customerLat)) ? customerLat : FALLBACK_DEST[0];
  const destLng = (customerLng != null && !isNaN(customerLng)) ? customerLng : FALLBACK_DEST[1];
  const dest: [number, number] = [destLat, destLng];

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const L = (window as unknown as { L: typeof LType }).L;
    if (!L) return;

    if (!mapRef.current) {
      // Build initial route
      routeRef.current = buildRoute(ORIGIN, dest);

      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([
        (ORIGIN[0] + dest[0]) / 2,
        (ORIGIN[1] + dest[1]) / 2,
      ], 14);

      // Voyager map tiles (clean, like Gojek)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Emerald green route polyline
      polylineRef.current = L.polyline(routeRef.current, {
        color: "#10B981",
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);

      // Origin (Al-Umanaa) marker
      const startIcon = L.divIcon({
        className: "bg-transparent",
        html: `<div style="display:flex;align-items:center;justify-content:center;height:32px;width:32px;border-radius:50%;background:#10B981;color:white;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:14px;width:14px;"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker(ORIGIN, { icon: startIcon }).addTo(mapRef.current);

      // Destination (Customer) marker
      const destIcon = L.divIcon({
        className: "bg-transparent",
        html: `<div style="display:flex;align-items:center;justify-content:center;height:32px;width:32px;border-radius:50%;background:#3B82F6;color:white;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:14px;width:14px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      destMarkerRef.current = L.marker(dest, { icon: destIcon }).addTo(mapRef.current);

      // Courier marker (orange truck)
      const courierIcon = L.divIcon({
        className: "bg-transparent",
        html: `<div style="display:flex;align-items:center;justify-content:center;height:40px;width:40px;border-radius:50%;background:#F97316;color:white;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:18px;width:18px;"><rect x="1" y="3" width="15" height="13" rx="2" ry="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      courierMarkerRef.current = L.marker(ORIGIN, { icon: courierIcon }).addTo(mapRef.current);

      // Fit map to route
      mapRef.current.fitBounds(routeRef.current, { padding: [40, 40] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update route + destination marker when customer location changes
  useEffect(() => {
    const L = (window as unknown as { L: typeof LType }).L;
    if (!L || !mapRef.current || !polylineRef.current || !destMarkerRef.current) return;

    const destCoord: [number, number] = [destLat, destLng];
    const newRoute = buildRoute(ORIGIN, destCoord);
    routeRef.current = newRoute;
    polylineRef.current.setLatLngs(newRoute);
    destMarkerRef.current.setLatLng(destCoord);
    mapRef.current.fitBounds(newRoute, { padding: [40, 40] });
  }, [destLat, destLng]);

  // Smooth courier marker update from real GPS or interpolated progress
  useEffect(() => {
    if (!courierMarkerRef.current || !mapRef.current) return;

    let lat: number;
    let lng: number;

    if (courierLat && courierLng) {
      // Real GPS from courier device
      lat = courierLat;
      lng = courierLng;
    } else {
      // Fallback: interpolate along route based on timer progress
      const pt = getInterpolatedPoint(routeRef.current, progress / 100);
      lat = pt[0];
      lng = pt[1];
    }

    courierMarkerRef.current.setLatLng([lat, lng]);
    mapRef.current.panTo([lat, lng], { animate: true, duration: 1 });
  }, [progress, courierLat, courierLng]);

  return (
    <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#E5E7EB] space-y-4 overflow-hidden relative">
      <div className="flex justify-between items-center">
        <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
          Pelacakan Kurir Real-Time
        </h3>
        <span className="text-[10px] font-extrabold text-[#F59E0B] bg-[#FEF3C7] px-2 py-0.5 rounded-full uppercase tracking-wider">
          Kurir OTW
        </span>
      </div>

      {/* Real Map Container */}
      <div className="relative w-full h-[220px] rounded-2xl border border-emerald-100 overflow-hidden shadow-inner z-0">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Progress detail text */}
      <div className="flex justify-between items-center text-[10px] text-[#6B7280] font-['Hanken_Grotesk'] font-bold">
        <span>PP Modern Al-Umanaa</span>
        <span className="text-amber-600 font-extrabold">
          {courierLat && courierLng ? (
            <span className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              GPS Live
            </span>
          ) : (
            `${Math.round(progress)}% Perjalanan`
          )}
        </span>
        <span>{(customerLat != null && customerLng != null) ? "📍 Lokasi GPS Anda" : "Lokasi Anda"}</span>
      </div>
    </div>
  );
}

function CustomerDeliveryCountdown({ order }: { order: Order }) {
  const [deliveryPhotoSrc, setDeliveryPhotoSrc] = useState<string | null>(null);
  const [loadingDeliveryPhoto, setLoadingDeliveryPhoto] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  // Customer's own GPS coordinates for dynamic destination pin
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [gpsPermission, setGpsPermission] = useState<"pending" | "granted" | "denied">("pending");

  // Request customer's geolocation for real destination marker
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsPermission("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomerLat(pos.coords.latitude);
        setCustomerLng(pos.coords.longitude);
        setGpsPermission("granted");
      },
      () => {
        setGpsPermission("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    const photoId = order?.deliveryStartPhotoId;
    if (!photoId) {
      setDeliveryPhotoSrc(null);
      return;
    }

    const loadDeliveryPhoto = async () => {
      setLoadingDeliveryPhoto(true);
      try {
        const fileId = photoId.replace("delivery_files/", "");
        const parentRef = doc(db, "delivery_files", fileId);
        const parentSnap = await getDoc(parentRef);
        
        if (parentSnap.exists()) {
          const meta = parentSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "delivery_files", fileId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          setDeliveryPhotoSrc(fullDataUri);
        }
      } catch (err) {
        console.error("Gagal memuat foto keberangkatan:", err);
      } finally {
        setLoadingDeliveryPhoto(false);
      }
    };

    loadDeliveryPhoto();
  }, [order?.deliveryStartPhotoId]);

  useEffect(() => {
    if (order.status !== "OUT_FOR_DELIVERY" || !order.deliveryTimerEnd || !order.deliveryStartedAt) {
      setTimeLeft(0);
      setProgress(0);
      return;
    }

    const calculateTimer = () => {
      const now = Date.now();
      const start = new Date(order.deliveryStartedAt!).getTime();
      const end = new Date(order.deliveryTimerEnd!).getTime();

      const totalDuration = end - start;
      const timeElapsed = now - start;

      const newProgress = totalDuration > 0
        ? Math.min(100, Math.max(0, (timeElapsed / totalDuration) * 100))
        : 100;

      const remaining = Math.max(0, Math.floor((end - now) / 1000));

      return { remaining, progress: newProgress };
    };

    const initial = calculateTimer();
    setTimeLeft(initial.remaining);
    setProgress(initial.progress);

    const interval = setInterval(() => {
      const updated = calculateTimer();
      setTimeLeft(updated.remaining);
      setProgress(updated.progress);
      if (updated.remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order.status, order.deliveryTimerEnd, order.deliveryStartedAt]);

  if (order.status !== "OUT_FOR_DELIVERY") return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isOvertime = timeLeft <= 0;

  return (
    <div className="space-y-4">
      {/* Waktu tiba & Status */}
      <div className={`p-4 rounded-3xl border ${
        isOvertime 
          ? "bg-red-50 border-red-200 text-red-800 animate-pulse" 
          : "bg-orange-50 border-orange-200 text-orange-900"
      } flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
            {isOvertime ? "Keterlambatan Pengiriman" : "Estimasi Pesanan Tiba"}
          </span>
          <span className="text-xs sm:text-sm font-['Manrope'] font-bold">
            {isOvertime ? "Kurir akan segera sampai di lokasi" : "Kurir sedang dalam perjalanan ke alamat Anda"}
          </span>
        </div>
        <div className="text-right">
          <span className="text-lg font-mono font-extrabold tracking-wider block">{formatted}</span>
        </div>
      </div>

      {/* Real Interactive Leaflet Courier Tracking Map */}
      <CourierTrackingMap
        progress={progress}
        courierLat={order.courierLat}
        courierLng={order.courierLng}
        customerLat={customerLat}
        customerLng={customerLng}
      />

      {/* GPS Permission Notice (if denied) */}
      {gpsPermission === "denied" && (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-['Hanken_Grotesk'] text-amber-800">
          <span className="text-base leading-none mt-0.5">📍</span>
          <div>
            <p className="font-bold">Izinkan akses lokasi agar peta lebih akurat.</p>
            <p className="text-[10px] text-amber-600 mt-0.5">Titik tujuan pada peta menggunakan lokasi estimasi karena izin GPS ditolak atau tidak tersedia.</p>
          </div>
        </div>
      )}

      {/* Live GPS Coordinates Info */}
      {order.courierLat && order.courierLng && (
        <div className="p-3 bg-emerald-50/30 border border-emerald-100 rounded-2xl flex items-center justify-between text-[11px] font-['Hanken_Grotesk'] text-[#065F46] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-bold uppercase tracking-wider text-[9px] text-emerald-600">Live GPS</span>
            <span className="text-neutral-500 font-medium">Lokasi Kurir Terkini:</span>
          </div>
          <span className="font-mono font-bold bg-white border border-emerald-100 rounded-lg px-2 py-0.5 shadow-2xs">
            {order.courierLat.toFixed(5)}, {order.courierLng.toFixed(5)}
          </span>
        </div>
      )}

      {/* Bukti Foto Keberangkatan Kurir */}
      {order.deliveryStartPhotoId && (
        <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <h4 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827]">
              Foto Bukti Keberangkatan Kurir (Otw)
            </h4>
          </div>
          <p className="text-[10px] text-[#6B7280] font-['Hanken_Grotesk'] leading-relaxed">
            Foto ini diambil langsung oleh kurir kami ({order.assignedCourierId || "Kurir"}) sesaat sebelum berangkat mengantarkan pesanan Anda.
          </p>
          <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video flex items-center justify-center text-[#9CA3AF]">
            {loadingDeliveryPhoto ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk']">Memuat foto keberangkatan…</p>
              </div>
            ) : deliveryPhotoSrc ? (
              <img
                src={deliveryPhotoSrc}
                alt="Foto Bukti Keberangkatan Kurir"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <FileImage className="h-8 w-8 text-[#9CA3AF] mb-2" />
                <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk']">Foto gagal dimuat</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerCookingCountdown({ order }: { order: Order }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (order.status !== "IN_PRODUCTION" || !order.productionTimerEnd) {
      setTimeLeft(0);
      return;
    }

    const calculateTimer = () => {
      const now = Date.now();
      const end = new Date(order.productionTimerEnd!).getTime();
      return Math.max(0, Math.floor((end - now) / 1000));
    };

    setTimeLeft(calculateTimer());

    const interval = setInterval(() => {
      const remaining = calculateTimer();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order.status, order.productionTimerEnd]);

  if (order.status !== "IN_PRODUCTION") return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isOvertime = timeLeft <= 0;

  return (
    <div className={`p-4 rounded-3xl border ${
      isOvertime 
        ? "bg-red-50 border-red-200 text-red-800 animate-pulse" 
        : "bg-amber-50 border-amber-200 text-amber-900"
    } flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
      <div className="space-y-0.5">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
          {isOvertime ? "Sedang finishing penyajian" : "Estimasi Waktu Memasak"}
        </span>
        <span className="text-xs sm:text-sm font-['Manrope'] font-bold">
          {isOvertime ? "Koki sedang mengemas pesanan Anda" : "Pesanan Anda sedang diracik & dimasak secara higienis"}
        </span>
      </div>
      <div className="text-right">
        <span className="text-lg font-mono font-extrabold tracking-wider block">{formatted}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];
  const steps = getSteps(lang);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [proofImageSrc, setProofImageSrc] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [cookingStartImageSrc, setCookingStartImageSrc] = useState<string | null>(null);
  const [loadingCookingStart, setLoadingCookingStart] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const [courierProfile, setCourierProfile] = useState<{ displayName?: string; phoneNumber?: string; photoURL?: string } | null>(null);
  const [loadingCourier, setLoadingCourier] = useState(false);

  // Delivery confirm & review states
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhotoFile, setReviewPhotoFile] = useState<File | null>(null);
  const [reviewPhotoPreview, setReviewPhotoPreview] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewUploadProgress, setReviewUploadProgress] = useState(0);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPhotoSrc, setReviewPhotoSrc] = useState<string | null>(null);
  const [loadingReviewPhoto, setLoadingReviewPhoto] = useState(false);

  const handleReviewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setReviewError(lang === "en" ? "Allowed types: JPG, PNG, WebP." : "MIME tipe tidak diijinkan. Gunakan JPG, PNG, atau WebP.");
      } else {
        setReviewError(lang === "en" ? "File size limit: 15 MB." : "Ukuran file terlalu besar. Maksimal 15 MB.");
      }
      return;
    }
    setReviewPhotoFile(file);
    setReviewPhotoPreview(URL.createObjectURL(file));
    setReviewError(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (rating === 0) {
      setReviewError(lang === "en" ? "Please select a rating (1-5 stars)." : "Silakan pilih rating (1-5 bintang).");
      return;
    }
    setSubmittingReview(true);
    setReviewError(null);
    try {
      let photoId = "";
      if (reviewPhotoFile) {
        const result = await uploadFileInChunks(reviewPhotoFile, {
          collection: "delivery_files",
          orderId: order.id,
          onProgress: (p) => setReviewUploadProgress(Math.round(p.fraction * 100)),
        });
        photoId = "delivery_files/" + result.fileId;
      }
      await submitReview(order.id, rating, reviewText, photoId);
      // Reset review form state
      setRating(0);
      setReviewText("");
      setReviewPhotoFile(null);
      setReviewPhotoPreview(null);
    } catch (err) {
      console.error("Gagal mengirim ulasan:", err);
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingReview(false);
      setReviewUploadProgress(0);
    }
  };

  // Load review photo chunks if review contains a photo
  useEffect(() => {
    const photoId = order?.reviewPhotoId;
    if (!photoId) {
      setReviewPhotoSrc(null);
      return;
    }

    const loadReviewPhoto = async () => {
      setLoadingReviewPhoto(true);
      try {
        const fileId = photoId.replace("delivery_files/", "");
        const parentRef = doc(db, "delivery_files", fileId);
        const parentSnap = await getDoc(parentRef);
        
        if (parentSnap.exists()) {
          const meta = parentSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "delivery_files", fileId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          setReviewPhotoSrc(fullDataUri);
        }
      } catch (err) {
        console.error("Gagal memuat foto ulasan:", err);
      } finally {
        setLoadingReviewPhoto(false);
      }
    };

    loadReviewPhoto();
  }, [order?.reviewPhotoId]);

  // Fetch courier profile details for display
  useEffect(() => {
    const courierId = order?.assignedCourierId;
    if (!courierId) {
      setCourierProfile(null);
      return;
    }

    const loadCourierProfile = async () => {
      setLoadingCourier(true);
      try {
        const courierRef = doc(db, "users", courierId);
        const courierSnap = await getDoc(courierRef);
        if (courierSnap.exists()) {
          const data = courierSnap.data();
          setCourierProfile({
            displayName: data.displayName || "",
            phoneNumber: data.phoneNumber || "",
            photoURL: data.photoURL || "",
          });
        } else {
          // Fallback if the assignedCourierId is not a doc ID or doesn't exist (e.g. legacy name string)
          setCourierProfile({
            displayName: courierId,
          });
        }
      } catch (err) {
        console.error("Gagal memuat profil kurir:", err);
        setCourierProfile({
          displayName: courierId,
        });
      } finally {
        setLoadingCourier(false);
      }
    };

    loadCourierProfile();
  }, [order?.assignedCourierId]);

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

  // Dynamic Base64 Chunk Assembler for production start photo (cooking photo)
  useEffect(() => {
    const photoId = order?.productionStartPhotoId;
    if (!photoId) {
      setCookingStartImageSrc(null);
      return;
    }

    const loadCookingPhoto = async () => {
      setLoadingCookingStart(true);
      try {
        const fileId = photoId.replace("delivery_files/", "");
        const parentRef = doc(db, "delivery_files", fileId);
        const parentSnap = await getDoc(parentRef);
        
        if (parentSnap.exists()) {
          const meta = parentSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "delivery_files", fileId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          setCookingStartImageSrc(fullDataUri);
        }
      } catch (err) {
        console.error("Gagal memuat foto mulai memasak:", err);
      } finally {
        setLoadingCookingStart(false);
      }
    };

    loadCookingPhoto();
  }, [order?.productionStartPhotoId]);

  useEffect(() => {
    if (!id) {
      setError(t.invalidOrderId);
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
        setError(t.orderNotFound);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id, t.invalidOrderId, t.orderNotFound]);

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
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingOrder}</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error || t.invalidOrder}
        </p>
        <Link to="/orders" className="inline-flex min-h-11 px-6 bg-[#111827] text-white hover:bg-neutral-800 rounded-2xl items-center font-bold">
          {t.backToOrders}
        </Link>
      </div>
    );
  }

  const dateObj = new Date(order.createdAt);
  const formattedDate = isNaN(dateObj.getTime())
    ? t.unknownDate
    : dateObj.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

  // If the status is AWAITING_PAYMENT_PROOF or PAYMENT_REJECTED, let them upload proof
  const needsProofUpload = false;
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-28">
      {/* Sticky Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to="/orders"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          aria-label={t.backToOrders}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {t.title}
        </h1>
      </div>

      <div className="p-4 max-w-[480px] lg:max-w-6xl mx-auto">
        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-6 items-start gap-4">
          {/* Left Column (col-span-2) */}
          <div className="w-full lg:col-span-2 space-y-4">
            {/* Lacak Pesanan (Order Tracking Stepper - Horizontal) */}
            <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-5">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                {t.trackOrder}
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
                      if (order.status === "DELIVERY_FAILED") {
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
                    const shortLabels = lang === "en" 
                      ? ["Created", "Kitchen", "QC", "Ready", "Ship", "Done"]
                      : ["Dibuat", "Dapur", "QC", "Siap", "Kirim", "Selesai"];

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
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{t.currentStatus}</span>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {t.stepProgress.replace("{current}", String(currentStepIndex)).replace("{total}", "6")}
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

            {/* REAL-TIME ESTIMATED COOKING COUNTDOWN FOR IN_PRODUCTION */}
            {order.status === "IN_PRODUCTION" && (
              <CustomerCookingCountdown order={order} />
            )}

            {/* REAL-TIME ESTIMATED courier DELIVERY COUNTDOWN FOR OUT_FOR_DELIVERY */}
            {order.status === "OUT_FOR_DELIVERY" && (
              <CustomerDeliveryCountdown order={order} />
            )}

            {/* Foto Mulai Memasak Card */}
            {order.productionStartPhotoId && (
              <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  <h4 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827]">
                    {lang === "en" ? "Cooking Start Photo Evidence" : "Bukti Foto Mulai Memasak"}
                  </h4>
                </div>
                <p className="text-[10px] text-[#6B7280] font-['Hanken_Grotesk'] leading-relaxed">
                  {lang === "en"
                    ? "This photo was taken directly by our chef when they began preparing your order in the kitchen."
                    : "Foto ini diambil langsung oleh koki kami sesaat sebelum mulai memasak pesanan Anda di dapur."}
                </p>
                <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video flex items-center justify-center text-[#9CA3AF]">
                  {loadingCookingStart ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk']">
                        {lang === "en" ? "Loading cooking photo..." : "Memuat foto memasak…"}
                      </p>
                    </div>
                  ) : cookingStartImageSrc ? (
                    <img
                      src={cookingStartImageSrc}
                      alt="Foto Mulai Memasak"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <FileImage className="h-8 w-8 text-[#9CA3AF] mb-2" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk']">
                        {lang === "en" ? "Failed to load photo" : "Foto gagal dimuat"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* COMPLETED state: Review submission form / details */}
            {order.status === "COMPLETED" && (
              <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
                {order.rating ? (
                  /* Show submitted review */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                        {lang === "en" ? "Your Review" : "Ulasan Anda"}
                      </h4>
                      <span className="text-[10px] text-neutral-400 font-['Hanken_Grotesk']">
                        {order.reviewedAt ? new Date(order.reviewedAt).toLocaleDateString(lang === "en" ? "en" : "id") : ""}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-5 w-5 ${
                            star <= (order.rating ?? 0)
                              ? "fill-[#FBBF24] text-[#FBBF24]"
                              : "text-neutral-200"
                          }`}
                        />
                      ))}
                    </div>

                    {order.review && (
                      <p className="text-xs text-[#374151] italic leading-relaxed font-['Hanken_Grotesk'] bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3">
                        "{order.review}"
                      </p>
                    )}

                    {order.reviewPhotoId && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-neutral-400 block font-['Hanken_Grotesk'] uppercase tracking-wider">Foto Ulasan</span>
                        <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video max-w-xs flex items-center justify-center">
                          {loadingReviewPhoto ? (
                            <Loader2 className="h-5 w-5 animate-spin text-[#FBBF24]" />
                          ) : reviewPhotoSrc ? (
                            <img
                              src={reviewPhotoSrc}
                              alt="Foto Ulasan"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4">
                              <FileImage className="h-6 w-6 text-[#9CA3AF] mb-1" />
                              <span className="text-[10px] text-neutral-400 font-['Hanken_Grotesk']">Foto gagal dimuat</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Show review form */
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                        {lang === "en" ? "Review Your Order" : "Berikan Ulasan Anda"}
                      </h4>
                      <p className="text-[11px] text-[#6B7280] font-['Hanken_Grotesk'] leading-relaxed">
                        {lang === "en" 
                          ? "Rate your experience to help us improve." 
                          : "Bagikan pengalaman belanja Anda untuk membantu kami menjadi lebih baik."}
                      </p>
                    </div>

                    {/* Star selection */}
                    <div className="flex items-center gap-2 py-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          className="p-1 focus:outline-none transition-transform hover:scale-110 cursor-pointer"
                          aria-label={lang === "en" ? `Rate ${star} star${star > 1 ? "s" : ""}` : `Beri rating ${star} bintang`}
                          title={lang === "en" ? `Rate ${star} star${star > 1 ? "s" : ""}` : `Beri rating ${star} bintang`}
                        >
                          <Star
                            className={`h-7 w-7 ${
                              star <= (hoveredRating || rating)
                                ? "fill-[#FBBF24] text-[#FBBF24]"
                                : "text-neutral-300"
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Review text comment */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#374151] font-['Hanken_Grotesk']">
                        {lang === "en" ? "Comment (Optional)" : "Komentar / Ulasan (Opsional)"}
                      </label>
                      <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder={lang === "en" ? "How was the service, delivery, and food?" : "Bagaimana rasa makanan, kecepatan pengiriman, dan pelayanan kurir?"}
                        rows={3}
                        className="w-full text-xs p-3 border border-[#D1D5DB] rounded-2xl focus:ring-1 focus:ring-amber-400 focus:outline-none placeholder-neutral-400 font-['Hanken_Grotesk'] resize-none leading-relaxed"
                      />
                    </div>

                    {/* Optional Photo Upload */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-[#374151] font-['Hanken_Grotesk']">
                        {lang === "en" ? "Add Photo (Optional)" : "Tambahkan Foto (Opsional)"}
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex min-h-9 px-4 bg-white border border-[#D1D5DB] rounded-xl items-center text-xs font-bold text-[#374151] hover:bg-[#F9FAFB] cursor-pointer transition">
                          <Camera className="h-4 w-4 text-[#6B7280] mr-1.5 shrink-0" />
                          <span>{lang === "en" ? "Choose Photo" : "Pilih Foto"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleReviewFileChange}
                            className="hidden"
                          />
                        </label>
                        {reviewPhotoPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewPhotoFile(null);
                              setReviewPhotoPreview(null);
                            }}
                            className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                          >
                            {lang === "en" ? "Remove" : "Hapus"}
                          </button>
                        )}
                      </div>
                      
                      {reviewPhotoPreview && (
                        <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video max-w-xs mt-2">
                          <img
                            src={reviewPhotoPreview}
                            alt="Preview ulasan"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {reviewError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-2xl text-[11px] font-medium flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {reviewError}
                      </div>
                    )}

                    {submittingReview && reviewUploadProgress > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-neutral-500 font-bold font-['Hanken_Grotesk']">
                          <span>{lang === "en" ? "Uploading photo..." : "Mengunggah foto..."}</span>
                          <span>{reviewUploadProgress}%</span>
                        </div>
                        <div className="w-full bg-[#E5E7EB] h-1.5 rounded-full overflow-hidden">
                          <div
                            ref={(el) => {
                              if (el) el.style.width = `${reviewUploadProgress}%`;
                            }}
                            className="bg-[#F59E0B] h-full transition-all duration-300"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full min-h-11 flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-md transition disabled:opacity-50 cursor-pointer"
                    >
                      {submittingReview ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#111827]" />
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>{lang === "en" ? "Submit Review" : "Kirim Ulasan"}</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Product Items List Card */}
            <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                {t.productList} ({t.itemsCount.replace("{count}", String(totalQty))})
              </h3>
              <div className="space-y-3 pt-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs">
                     <div className="space-y-0.5 max-w-[70%]">
                       <p className="font-bold text-[#111827] leading-relaxed">{item.itemName}</p>
                       <p className="text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">{t.itemsCount.replace("{count}", String(item.quantity))}</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bukti Pembayaran Card */}
            {order.paymentProofFileId && (
              <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
                <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                  {t.paymentProof}
                </h3>
                <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-square flex items-center justify-center text-[#9CA3AF]">
                  {loadingProof ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingProof}</p>
                    </div>
                  ) : proofImageSrc ? (
                    <img
                      src={proofImageSrc}
                      alt={t.paymentProof}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <FileImage className="h-8 w-8 text-[#9CA3AF] mb-2" />
                      <p className="text-[10px] text-neutral-500 font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadProofFailed}</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-center text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] pt-1">
                  {t.proofDesc}
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
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase">{t.orderStatusHeader}</span>
                  <div className="pt-0.5">
                    <span
                      className={
                        "rounded-full border px-2.5 py-0.5 text-xs font-bold " +
                        getStatusBadgeClass(order.status)
                      }
                    >
                      {STATUS_LABELS[lang][order.status] || order.status}
                    </span>
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase">{t.orderIdHeader}</span>
                  <p className="font-mono text-xs font-bold text-[#111827]">{order.id}</p>
                </div>
              </div>

              <div className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {t.createdOn} <span className="font-semibold text-[#111827]">{formattedDate}</span>
              </div>

              {order.status === "DELIVERY_FAILED" && (order.paymentRejectionReason || order.rejectionReason) && (
                <div className="bg-red-50 border border-red-200 text-red-900 p-3.5 rounded-2xl text-xs font-['Hanken_Grotesk',system-ui,sans-serif] space-y-1">
                  <span className="font-bold">{t.rejectionTitle}</span>
                  <p className="leading-relaxed">{order.paymentRejectionReason || order.rejectionReason}</p>
                </div>
              )}

              {order.status === "DELIVERY_FAILED" && order.outOfStockItems && order.outOfStockItems.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-900 p-3.5 rounded-2xl text-xs font-['Hanken_Grotesk',system-ui,sans-serif] space-y-1">
                  <span className="font-bold">{t.outOfStockTitle}</span>
                  <p className="leading-relaxed">{t.outOfStockDesc}</p>
                </div>
              )}

              {needsProofUpload && (
                <div className="pt-2">
                  <Link
                    to={`/checkout/payment-proof/${encodeURIComponent(order.id)}`}
                    className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-md transition-all"
                  >
                    <FileImage className="h-5 w-5" />
                    {t.uploadProofBtn}
                  </Link>
                </div>
              )}
            </div>

            {/* Delivery Address & Time Card */}
            <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                {t.deliveryInfo}
              </h3>

              <div className="flex gap-3 items-start text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#4B5563]">
                <MapPin className="h-5 w-5 text-[#9CA3AF] shrink-0" />
                <div>
                  <span className="font-bold block text-[#111827] mb-0.5">{t.deliveryAddress}</span>
                  {renderFormattedAddress(order.deliveryAddress)}
                </div>
              </div>

              <div className="flex gap-3 items-start text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#4B5563]">
                <Clock className="h-5 w-5 text-[#9CA3AF] shrink-0" />
                <div>
                  <span className="font-bold block text-[#111827] mb-0.5">{t.deliveryTime}</span>
                  <p>{translateTime(order.deliveryTime, lang)}</p>
                </div>
              </div>
            </div>

            {/* Courier Info Card */}
            {order.assignedCourierId && (
              <CourierInfoCard
                profile={courierProfile}
                loading={loadingCourier}
                orderId={order.id}
                lang={lang}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderDetailPage;
