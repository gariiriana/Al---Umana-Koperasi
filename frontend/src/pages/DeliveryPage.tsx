import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, Clock, Package, CheckCircle2, ChevronRight, ArrowLeft, AlertCircle, Loader2, Navigation, Phone, MessageCircle, Search, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order, KitchenSignature } from "@/types/order";
import { PICConfirmation } from "@/components/delivery/PICConfirmation";
import { ProofCapture } from "@/components/delivery/ProofCapture";
import { ProofModal } from "@/components/delivery/ProofModal";
import { SignaturePad } from "@/components/delivery/SignaturePad";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
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



interface StartDeliveryFormProps {
  order: Order;
  onStart: (kitchenSignatures: KitchenSignature[]) => Promise<void>;
  onCancel: () => void;
}

function StartDeliveryForm({ order, onStart, onCancel }: StartDeliveryFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QC Checklist states
  const [qcProductCheck, setQcProductCheck] = useState<Record<string, boolean>>({});
  const [qcQuantityCheck, setQcQuantityCheck] = useState<Record<string, boolean>>({});

  // Kitchen signatures and staff names states
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const uniqueKitchens = useMemo(() => {
    const kitchens = new Set<string>();
    order.items.forEach((item) => {
      const k = order.itemKitchens?.[item.itemId];
      if (k && k.trim() !== "") {
        kitchens.add(k);
      }
    });
    if (kitchens.size === 0) {
      kitchens.add("Dapur Produksi");
    }
    return Array.from(kitchens);
  }, [order]);

  const isQcComplete = order.items.every(
    (item) => qcProductCheck[item.itemId] && qcQuantityCheck[item.itemId]
  );

  const isSignaturesComplete = uniqueKitchens.every(
    (k) => signatures[k] && staffNames[k]?.trim().length > 0
  );

  const isFormValid = isQcComplete && isSignaturesComplete;

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError("Semua checklist QC dan tanda tangan serah terima dapur wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const kitchenSignaturesList: KitchenSignature[] = uniqueKitchens.map((k) => ({
        kitchenName: k,
        signatureDataUrl: signatures[k]!,
        staffName: staffNames[k].trim(),
        signedAt: now,
      }));
      await onStart(kitchenSignaturesList);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 space-y-6 font-['Hanken_Grotesk'] text-xs shadow-xs">
      <div>
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827]">
          Mulai Pengantaran
        </h3>
        <p className="text-[#6B7280] leading-relaxed mt-1">
          Lakukan pengecekan QC dan kumpulkan tanda tangan serah terima dari staf dapur sebelum berangkat.
        </p>
      </div>

      {/* Address Details for Courier */}
      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 flex gap-3">
        <MapPin className="h-5 w-5 text-[#4B5563] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="font-bold text-[#111827] text-sm block mb-1">Alamat Pengantaran</span>
          {renderFormattedAddress(order.deliveryAddress)}
        </div>
      </div>

      {/* SECTION 1: QUALITY CONTROL */}
      <div className="border border-blue-100 bg-blue-50/20 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-black text-blue-700">1</span>
          <h4 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-sm">
            Checklist Kelayakan (QC) Produk & Jumlah
          </h4>
        </div>

        <div className="divide-y divide-neutral-100 bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
          {order.items.map((item) => (
            <div key={item.itemId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-neutral-800 text-sm">{item.itemName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 font-extrabold px-1.5 py-0.5 rounded">
                    Jumlah: x{item.quantity}
                  </span>
                  {order.itemKitchens?.[item.itemId] && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                      Dapur: {order.itemKitchens[item.itemId]}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!qcProductCheck[item.itemId]}
                    onChange={(e) => setQcProductCheck(prev => ({ ...prev, [item.itemId]: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#D1D5DB] text-[#FBBF24] focus:ring-[#FBBF24]"
                  />
                  <span className="font-semibold text-neutral-600">Produk Sesuai</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!qcQuantityCheck[item.itemId]}
                    onChange={(e) => setQcQuantityCheck(prev => ({ ...prev, [item.itemId]: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#D1D5DB] text-[#FBBF24] focus:ring-[#FBBF24]"
                  />
                  <span className="font-semibold text-neutral-600">Jumlah Sesuai</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: KITCHEN SIGNATURES */}
      <div className="border border-orange-100 bg-orange-50/20 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center text-xs font-black text-orange-700">2</span>
          <h4 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-sm">
            Tanda Tangan Serah Terima Staf Dapur
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {uniqueKitchens.map((kitchen) => (
            <div key={kitchen} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex justify-between items-center bg-[#FDF2E9] border border-orange-100 rounded-lg px-2.5 py-1">
                <span className="font-black text-[#B45309] text-xs uppercase tracking-wider">{kitchen}</span>
                {signatures[kitchen] ? (
                  <span className="text-[10px] font-bold text-emerald-600">✓ TTD Berhasil</span>
                ) : (
                  <span className="text-[10px] font-bold text-red-500">* Wajib TTD</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Nama Petugas Dapur</label>
                <input
                  type="text"
                  value={staffNames[kitchen] || ""}
                  onChange={(e) => setStaffNames(prev => ({ ...prev, [kitchen]: e.target.value }))}
                  placeholder="Ketik nama staf dapur..."
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent focus:outline-none font-semibold text-xs text-neutral-800 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Coretan Tanda Tangan</label>
                <SignaturePad
                  height={120}
                  onDrawEnd={(dataUrl) => {
                    setSignatures(prev => ({ ...prev, [kitchen]: dataUrl }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !isFormValid}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold rounded-xl transition shadow-md shadow-amber-700/15 disabled:from-neutral-100 disabled:to-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer text-center text-xs"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Mulai Pengantaran (Sudah QC & Serah Terima)
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-3 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-bold text-[#374151] rounded-xl transition cursor-pointer"
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
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [selectedProofFiles, setSelectedProofFiles] = useState<string[]>([]);
  const [selectedStartPhotoId, setSelectedStartPhotoId] = useState<string | undefined>(undefined);
  const [selectedKitchenSignatures, setSelectedKitchenSignatures] = useState<KitchenSignature[] | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

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

  const myCompletedDeliveries = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === "DELIVERED" || o.status === "COMPLETED") &&
          (!user || 
            o.assignedCourierId === user.uid || 
            o.assignedCourierId === profile?.displayName ||
            o.assignedCourierId === user.email?.split("@")[0] ||
            (profile?.displayName && o.assignedCourierId?.toLowerCase() === profile.displayName.toLowerCase()))
      ).sort((a, b) => {
        const timeA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const timeB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return timeB - timeA;
      }),
    [orders, user, profile]
  );

  const filteredDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return myDeliveries;
    const q = searchQuery.toLowerCase().trim();
    return myDeliveries.filter(
      (o) =>
        o.institutionName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(q))
    );
  }, [myDeliveries, searchQuery]);

  const filteredCompletedDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return myCompletedDeliveries;
    const q = searchQuery.toLowerCase().trim();
    return myCompletedDeliveries.filter(
      (o) =>
        o.institutionName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(q))
    );
  }, [myCompletedDeliveries, searchQuery]);

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

        </div>
      )}

      {/* ── DELIVERY LIST ─────────────────────────────────────────────── */}
      {step === "list" && (
        <>
          {/* Tab selector */}
          <div className="flex border-b border-[#E5E7EB] mb-4">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 py-2.5 text-center text-xs font-bold font-['Hanken_Grotesk',system-ui,sans-serif] transition-all border-b-2 ${
                activeTab === "active"
                  ? "border-[#FBBF24] text-[#111827]"
                  : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
              }`}
            >
              Tugas Aktif ({myDeliveries.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-2.5 text-center text-xs font-bold font-['Hanken_Grotesk',system-ui,sans-serif] transition-all border-b-2 ${
                activeTab === "history"
                  ? "border-[#FBBF24] text-[#111827]"
                  : "border-transparent text-[#6B7280] hover:text-[#4B5563]"
              }`}
            >
              Riwayat Selesai ({myCompletedDeliveries.length})
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[#9CA3AF]" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama instansi, penerima, produk, atau ID pesanan..."
              className="w-full rounded-full border border-[#E5E7EB] bg-[#F9FAFB] pl-9 pr-10 py-2 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition font-['Hanken_Grotesk']"
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

          {activeTab === "active" ? (
            filteredDeliveries.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
                <Package className="h-14 w-14 mx-auto text-[#D1D5DB] bg-[#F3F4F6] rounded-full p-3" />
                <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                  {searchQuery ? "Hasil Pencarian Kosong" : "Tidak Ada Pengantaran"}
                </p>
                <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs mx-auto">
                  {searchQuery
                    ? "Tidak ada tugas aktif yang cocok dengan kata kunci pencarian Anda."
                    : "Belum ada pesanan yang ditugaskan ke Anda untuk diantarkan."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredDeliveries.map((o, idx) => (
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
            )
          ) : (
            filteredCompletedDeliveries.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
                <CheckCircle2 className="h-14 w-14 mx-auto text-[#D1D5DB] bg-[#F3F4F6] rounded-full p-3" />
                <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                  {searchQuery ? "Hasil Pencarian Kosong" : "Belum Ada Riwayat"}
                </p>
                <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs mx-auto">
                  {searchQuery
                    ? "Tidak ada riwayat selesai yang cocok dengan kata kunci pencarian Anda."
                    : "Anda belum menyelesaikan pengantaran pesanan apa pun."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredCompletedDeliveries.map((o, idx) => {
                    const shortId = o.id.length > 6 ? o.id.slice(-6).toUpperCase() : o.id.toUpperCase();
                    return (
                      <motion.div
                        key={o.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05, duration: 0.2 }}
                        className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden p-4 sm:p-5 flex flex-col gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border bg-emerald-50 border-emerald-200 text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                                {o.institutionName || o.customerName}
                              </p>
                              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                Selesai Diantar
                              </span>
                            </div>
                            <p className="text-xs text-[#6B7280] font-medium mt-0.5">
                              ID Pesanan: #{shortId}
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-[#F3F4F6] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                              <span>Waktu Jadwal: <strong>{o.deliveryTime}</strong></span>
                            </div>
                            {o.deliveredAt && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                                <span>Sampai pada: {new Date(o.deliveredAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
                              </div>
                            )}
                            <div className="flex items-start gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <span className="font-bold">Alamat:</span>
                                {renderFormattedAddress(o.deliveryAddress)}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 bg-[#F9FAFB] rounded-xl p-3 border border-[#E5E7EB]">
                            <span className="font-extrabold text-[#111827] block text-[10px] uppercase tracking-wider">
                              Detail Pesanan
                            </span>
                            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-medium text-[#4B5563]">
                              {o.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex justify-between items-center gap-2">
                                  <span className="truncate">{item.itemName}</span>
                                  {o.isPreOrder ? (
                                    <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[9px] font-bold text-amber-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
                                      Pra-pesanan
                                    </span>
                                  ) : (
                                    <span className="font-bold text-[#111827] shrink-0">x{item.quantity}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            {o.proofFileIds && o.proofFileIds.length > 0 && (
                              <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-emerald-800 shrink-0">
                                  ✓ Bukti & TTD Tersimpan
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProofFiles(o.proofFileIds || []);
                                    setSelectedStartPhotoId(o.deliveryStartPhotoId || undefined);
                                    setSelectedKitchenSignatures(o.kitchenSignatures || undefined);
                                    setIsProofModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded-lg transition cursor-pointer border border-emerald-200"
                                >
                                  Lihat Bukti Foto
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )
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
            onStart={async (kitchenSignatures) => {
              const now = new Date();
              await dispatchOrder(active.id);
              await updateDoc(doc(db, "orders", active.id), {
                deliveryStartedAt: now.toISOString(),
                kitchenSignatures,
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
