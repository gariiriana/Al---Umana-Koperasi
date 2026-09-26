import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin, Clock, Package, CheckCircle2, ChevronRight, ArrowLeft,
  AlertCircle, Loader2, Navigation, Phone, Search, X, FileDown,
  FolderOpen, Calendar, CalendarDays, Filter, ChevronDown, RotateCcw
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order, KitchenSignature } from "@/types/order";
import { ProofCapture } from "@/components/delivery/ProofCapture";
import { ProofModal } from "@/components/delivery/ProofModal";
import { ProductImage } from "@/components/ProductImage";
import { LiveCamera } from "@/components/LiveCamera";
import { Camera, Trash2 } from "lucide-react";
import { exportCateringDeliveryProofPdf } from "@/utils/cateringDeliveryReceiptPdfExporter";

import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { dispatchOrder } from "@/services/orderService";
import { pushNotification } from "@/services/notificationWriter";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import {
  canStartCourierDelivery,
  isActiveCourierAssignment,
  isAssignedToCourier,
} from "@/lib/deliveryAssignment";

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

type DeliveryStep = "list" | "start" | "proof";



interface StartDeliveryFormProps {
  order: Order;
  onStart: (kitchenSignatures: KitchenSignature[]) => Promise<void>;
  onCancel: () => void;
}

interface HandoverPhoto {
  file: File;
  previewUrl: string;
}

function StartDeliveryForm({ order, onStart, onCancel }: StartDeliveryFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitLabel, setSubmitLabel] = useState("Mulai Pengantaran (Sudah QC & Serah Terima)");

  // QC Checklist states
  const [qcProductCheck, setQcProductCheck] = useState<Record<string, boolean>>({});
  const [qcQuantityCheck, setQcQuantityCheck] = useState<Record<string, boolean>>({});

  // Kitchen signatures (now photos) and staff names states
  const [signatures, setSignatures] = useState<Record<string, HandoverPhoto[]>>({});
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [activeKitchenCamera, setActiveKitchenCamera] = useState<string | null>(null);

  const handleCapturePhoto = (kitchen: string, file: File) => {
    const photo: HandoverPhoto = { file, previewUrl: URL.createObjectURL(file) };
    setSignatures((prev) => {
      const existing = prev[kitchen] || [];
      return { ...prev, [kitchen]: [...existing, photo] };
    });
  };

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

  const isSignaturesComplete = useMemo(() => {
    const completedKitchens = uniqueKitchens.filter(
      (k) => (signatures[k] || []).length >= 2 && staffNames[k]?.trim().length > 0
    );
    if (completedKitchens.length === 0) return false;

    const isAnyPartial = uniqueKitchens.some((k) => {
      const photoCount = (signatures[k] || []).length;
      const hasStaff = (staffNames[k] || "").trim().length > 0;
      const hasStarted = photoCount > 0 || hasStaff;
      const isComplete = photoCount >= 2 && hasStaff;
      return hasStarted && !isComplete;
    });

    return !isAnyPartial;
  }, [uniqueKitchens, signatures, staffNames]);

  const isFormValid = isQcComplete && isSignaturesComplete;

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError("Semua checklist QC wajib diisi dan minimal satu serah terima dapur (dengan minimal 2 foto) harus lengkap.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const completedKitchens = uniqueKitchens.filter(
        (k) => (signatures[k] || []).length >= 2 && staffNames[k]?.trim().length > 0,
      );
      const totalPhotos = completedKitchens.reduce((sum, kitchen) => sum + signatures[kitchen].length, 0);
      let uploadedPhotos = 0;
      const kitchenSignaturesList: KitchenSignature[] = [];

      for (const kitchen of completedKitchens) {
        const photoFileIds: string[] = [];
        for (const photo of signatures[kitchen]) {
          setSubmitLabel(`Mengunggah dokumentasi ${uploadedPhotos + 1}/${totalPhotos}…`);
          const result = await uploadFileInChunks(photo.file, {
            orderId: order.id,
            description: `Serah terima dapur ${kitchen}`,
          });
          photoFileIds.push(result.fileId);
          uploadedPhotos += 1;
        }
        kitchenSignaturesList.push({
          kitchenName: kitchen,
          photoFileIds,
          staffName: staffNames[kitchen].trim(),
          signedAt: now,
        });
      }

      setSubmitLabel("Memulai pengantaran…");
      await onStart(kitchenSignaturesList);
    } catch (err) {
      console.error("Gagal memulai pengantaran:", err);
      setError(
        err instanceof Error
          ? `Gagal memulai pengantaran: ${err.message}`
          : "Gagal memulai pengantaran. Silakan coba lagi.",
      );
    } finally {
      setSubmitting(false);
      setSubmitLabel("Mulai Pengantaran (Sudah QC & Serah Terima)");
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
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                  <ProductImage
                    imageUrl={item.imageUrl || ""}
                    alt={item.itemName}
                    className="h-full w-full object-cover"
                    fallbackClassName="h-3 w-3 text-neutral-400"
                  />
                </div>
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
                  {(item.deliveryAddress || item.deliveryTime || item.recipientName) && (
                    <div className="text-[10px] text-[#4B5563] border-t border-[#E5E7EB] pt-1.5 mt-1.5 space-y-0.5 font-medium leading-tight">
                      {item.recipientName && (
                        <p><strong className="text-neutral-500">Penerima:</strong> {item.recipientName}</p>
                      )}
                      {item.deliveryTime && (
                        <p><strong className="text-neutral-500">Jadwal:</strong> {item.deliveryTime.replace("T", " ")}</p>
                      )}
                      {item.deliveryAddress && (
                        <p className="break-words line-clamp-2" title={item.deliveryAddress}>
                          <strong className="text-neutral-500">Alamat:</strong> {item.deliveryAddress.split(" | ")[0]}
                        </p>
                      )}
                    </div>
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

      {/* SECTION 2: KITCHEN PHOTOS HANDOVER */}
      <div className="border border-orange-100 bg-orange-50/20 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center text-xs font-black text-orange-700">2</span>
          <h4 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-sm">
            Foto Serah Terima Dapur (Kamera Live)
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {uniqueKitchens.map((kitchen) => (
            <div key={kitchen} className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex justify-between items-center bg-[#FDF2E9] border border-orange-100 rounded-lg px-2.5 py-1">
                <span className="font-black text-[#B45309] text-xs uppercase tracking-wider">{kitchen}</span>
                {(signatures[kitchen] || []).length >= 2 ? (
                  <span className="text-[10px] font-bold text-emerald-600">✓ {(signatures[kitchen] || []).length} Foto Berhasil</span>
                ) : (signatures[kitchen] || []).length === 1 ? (
                  <span className="text-[10px] font-bold text-amber-500">* Wajib Min. 2 Foto (Kurang 1)</span>
                ) : (
                  <span className="text-[10px] font-bold text-red-500">* Wajib Min. 2 Foto Live</span>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor={`staff-${kitchen}`} className="block text-[10px] font-bold text-neutral-500 uppercase">Nama Petugas Dapur</label>
                <input
                  id={`staff-${kitchen}`}
                  type="text"
                  value={staffNames[kitchen] || ""}
                  onChange={(e) => setStaffNames(prev => ({ ...prev, [kitchen]: e.target.value }))}
                  placeholder="Ketik nama staf dapur..."
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent focus:outline-none font-semibold text-xs text-neutral-800 transition"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Dokumentasi Live Camera</label>
                
                {/* Captured photos list */}
                {(signatures[kitchen] || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center py-1 bg-neutral-50 rounded-lg border border-neutral-100 p-2">
                    {(signatures[kitchen] || []).map((photo, imgIdx) => (
                      <div key={imgIdx} className="relative border border-[#E5E7EB] rounded-lg overflow-hidden w-20 h-20 bg-white shadow-3xs">
                        <img src={photo.previewUrl} alt={`Handover ${kitchen} #${imgIdx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setSignatures(prev => {
                            const existing = prev[kitchen] || [];
                            URL.revokeObjectURL(existing[imgIdx]?.previewUrl || "");
                            const updated = existing.filter((_, idx) => idx !== imgIdx);
                            return { ...prev, [kitchen]: updated };
                          })}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition shadow-md cursor-pointer"
                          title="Hapus foto"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setActiveKitchenCamera(kitchen)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  <Camera className="h-4 w-4 text-amber-600 animate-pulse" />
                  <span>{(signatures[kitchen] || []).length > 0 ? "Tambah Foto Live" : "Ambil Foto Live"}</span>
                </button>
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
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold rounded-xl transition shadow-md shadow-amber-700/15 disabled:from-neutral-100 disabled:to-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer text-center text-xs"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-3 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-bold text-[#374151] rounded-xl transition cursor-pointer"
        >
          Batal
        </button>
      </div>

      {activeKitchenCamera && (
        <LiveCamera
          isOpen={true}
          onClose={() => setActiveKitchenCamera(null)}
          activityType="HANDOVER"
          orderId={order.id}
          onCapture={(file) => handleCapturePhoto(activeKitchenCamera, file)}
        />
      )}
    </div>
  );
}

const getOrderDeadline = (order: Order): number => {
  const dateStr = order.eventDate || order.createdAt;
  if (!dateStr) return Infinity;
  const datePart = dateStr.slice(0, 10);
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

const getCourierStatusMeta = (status: Order["status"]) => {
  if (status === "READY_TO_DELIVER" || status === "READY") {
    return {
      label: "Siap Diambil",
      barClass: "bg-gradient-to-r from-blue-400 to-cyan-400",
      badgeClass: "bg-blue-100 text-blue-700",
      iconClass: "bg-blue-50 border-blue-200 text-blue-600",
    };
  }
  if (status === "OUT_FOR_DELIVERY") {
    return {
      label: "Sedang Jalan",
      barClass: "bg-gradient-to-r from-orange-400 to-amber-400",
      badgeClass: "bg-orange-100 text-orange-700",
      iconClass: "bg-orange-50 border-orange-200 text-orange-600",
    };
  }
  const label = status === "IN_PRODUCTION"
    ? "Sedang Dimasak"
    : status === "QC"
      ? "Menunggu QC"
      : "Menunggu Dapur";
  return {
    label,
    barClass: "bg-gradient-to-r from-slate-300 to-slate-400",
    badgeClass: "bg-slate-100 text-slate-600",
    iconClass: "bg-slate-50 border-slate-200 text-slate-500",
  };
};

const MONTHS_INDO = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

const getTodayYmd = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getThisMonthYm = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const formatIndoDate = (dateStr: string) => {
  if (!dateStr || typeof dateStr !== "string") return dateStr || "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const mIdx = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    if (!isNaN(mIdx) && months[mIdx] && !isNaN(d)) {
      return `${d} ${months[mIdx]} ${y}`;
    }
  }
  return dateStr;
};

const extractOrderDates = (order: Order): { dateYmd: string[]; year: string[]; monthYm: string[] } => {
  const ymdSet = new Set<string>();
  const yearSet = new Set<string>();
  const monthSet = new Set<string>();

  const addDateStr = (raw?: unknown) => {
    if (!raw) return;
    if (typeof raw === "string") {
      const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const y = match[1];
        const m = match[2];
        const d = match[3];
        ymdSet.add(`${y}-${m}-${d}`);
        yearSet.add(y);
        monthSet.add(`${y}-${m}`);
        return;
      }
      const ts = Date.parse(raw);
      if (!isNaN(ts)) {
        const dt = new Date(ts);
        const y = String(dt.getFullYear());
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        ymdSet.add(`${y}-${m}-${d}`);
        yearSet.add(y);
        monthSet.add(`${y}-${m}`);
      }
    } else if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
      const dt = (raw as { toDate: () => Date }).toDate();
      const y = String(dt.getFullYear());
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      ymdSet.add(`${y}-${m}-${d}`);
      yearSet.add(y);
      monthSet.add(`${y}-${m}`);
    } else if (raw instanceof Date) {
      const y = String(raw.getFullYear());
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      ymdSet.add(`${y}-${m}-${d}`);
      yearSet.add(y);
      monthSet.add(`${y}-${m}`);
    }
  };

  addDateStr(order.eventDate);
  addDateStr(order.deliveryTime);
  addDateStr(order.deliveredAt);
  addDateStr(order.createdAt);

  return {
    dateYmd: Array.from(ymdSet),
    year: Array.from(yearSet),
    monthYm: Array.from(monthSet),
  };
};

export function DeliveryPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [step, setStep] = useState<DeliveryStep>("list");
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [selectedProofFiles, setSelectedProofFiles] = useState<string[]>([]);
  const [selectedStartPhotoId, setSelectedStartPhotoId] = useState<string | undefined>(undefined);
  const [selectedKitchenSignatures, setSelectedKitchenSignatures] = useState<KitchenSignature[] | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  // Date, Month, Year Filter States
  const [dateFilterType, setDateFilterType] = useState<"all" | "today" | "this_month" | "custom_date" | "custom_month" | "custom_year">("all");
  const [customDate, setCustomDate] = useState<string>(""); // YYYY-MM-DD
  const [customMonth, setCustomMonth] = useState<string>(""); // "01" - "12"
  const [customYear, setCustomYear] = useState<string>(() => String(new Date().getFullYear()));
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);
  const [overdueFilter, setOverdueFilter] = useState<"all" | "overdue" | "not_overdue">("all");

  const [reportingSick, setReportingSick] = useState(false);
  const [showSickConfirm, setShowSickConfirm] = useState(false);
  const [sickRemark, setSickRemark] = useState("");

  const handleSickReport = async () => {
    if (!activeId) return;
    const currentActiveOrder = orders.find((o) => o.id === activeId);
    if (!currentActiveOrder) return;
    if (!sickRemark.trim()) {
      showToast({ message: "Alasan pembatalan wajib diisi", variant: "error" });
      return;
    }
    
    setReportingSick(true);
    try {
      const orderRef = doc(db, "orders", activeId);
      const updates: Record<string, string | boolean | Date> = {
        assignedCourierId: "",
        courierSickReported: true,
        courierSickRemark: sickRemark.trim(),
        updatedAt: new Date(),
      };

      if (currentActiveOrder.status === "OUT_FOR_DELIVERY") {
        updates.status = "READY_TO_DELIVER";
      }

      await updateDoc(orderRef, updates);
      showToast({ message: "Laporan sakit berhasil dikirim. Penugasan batal.", variant: "success" });

      const sid = activeId.length > 6 ? activeId.slice(-6).toUpperCase() : activeId.toUpperCase();
      // Notify Admin
      pushNotification({
        recipientId: "admin",
        type: "delivery",
        title: `⚠️ Kurir Sakit / Batal Tugas #${sid}`,
        titleEn: `⚠️ Courier Sick / Cancel Task #${sid}`,
        message: `Kurir membatalkan pengantaran pesanan #${sid} karena sakit/berhalangan. Alasan: ${sickRemark.trim()}. Segera tugaskan kurir baru.`,
        messageEn: `Courier canceled delivery for order #${sid} due to sickness. Reason: ${sickRemark.trim()}. Please assign a new courier immediately.`,
        orderId: activeId,
        orderShortId: sid,
        actorRole: "kurir",
      }).catch((e) => console.error("[handleSickReport Admin Push Notif Error]", e));

      // Notify Distribusi
      pushNotification({
        recipientId: "distribusi",
        type: "delivery",
        title: `⚠️ Kurir Sakit / Batal Tugas #${sid}`,
        titleEn: `⚠️ Courier Sick / Cancel Task #${sid}`,
        message: `Kurir membatalkan pengantaran pesanan #${sid} karena sakit/berhalangan. Alasan: ${sickRemark.trim()}. Segera tugaskan kurir baru.`,
        messageEn: `Courier canceled delivery for order #${sid} due to sickness. Reason: ${sickRemark.trim()}. Please assign a new courier immediately.`,
        orderId: activeId,
        orderShortId: sid,
        actorRole: "kurir",
      }).catch((e) => console.error("[handleSickReport Distribusi Push Notif Error]", e));

      setShowSickConfirm(false);
      reset();
    } catch (err) {
      console.error("Failed to report sick:", err);
      showToast({ message: "Gagal mengirim laporan sakit", variant: "error" });
    } finally {
      setReportingSick(false);
    }
  };

  const active = activeId ? orders.find((o) => o.id === activeId) ?? null : null;

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const myDeliveries = useMemo(
    () => {
      const courierIdentities = [user?.uid, profile?.uid, profile?.displayName, user?.email?.split("@")[0]];
      return orders.filter(
        (o) => isActiveCourierAssignment(o.status) && isAssignedToCourier(o, courierIdentities),
      ).sort((a, b) => {
        const deadlineA = getOrderDeadline(a);
        const deadlineB = getOrderDeadline(b);
        if (deadlineA !== deadlineB) {
          return deadlineA - deadlineB;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    },
    [orders, user, profile]
  );

  const myCompletedDeliveries = useMemo(
    () => {
      const courierIdentities = [user?.uid, profile?.uid, profile?.displayName, user?.email?.split("@")[0]];
      return orders.filter(
        (o) =>
          (o.status === "DELIVERED" || o.status === "COMPLETED") &&
          isAssignedToCourier(o, courierIdentities),
      ).sort((a, b) => {
        const timeA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const timeB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return timeB - timeA;
      });
    },
    [orders, user, profile]
  );

  const availableYears = useMemo(() => {
    const currentY = new Date().getFullYear();
    const yearSet = new Set<string>([
      String(currentY - 1),
      String(currentY),
      String(currentY + 1),
    ]);
    [...myDeliveries, ...myCompletedDeliveries].forEach((o) => {
      const { year } = extractOrderDates(o);
      year.forEach((y) => yearSet.add(y));
    });
    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [myDeliveries, myCompletedDeliveries]);

  const activeFilterDescription = useMemo(() => {
    if (dateFilterType === "all") return "";
    if (dateFilterType === "today") {
      const today = getTodayYmd();
      return `Hari Ini (${formatIndoDate(today)})`;
    }
    if (dateFilterType === "this_month") {
      const d = new Date();
      const mIdx = d.getMonth();
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      return `Bulan Ini (${months[mIdx]} ${d.getFullYear()})`;
    }
    if (dateFilterType === "custom_date") {
      return customDate ? `Tanggal: ${formatIndoDate(customDate)}` : "Tanggal Tertentu";
    }
    if (dateFilterType === "custom_month") {
      const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      const mLabel = customMonth ? months[parseInt(customMonth, 10) - 1] : "Semua Bulan";
      return `Bulan: ${mLabel} ${customYear}`;
    }
    if (dateFilterType === "custom_year") {
      return `Tahun: ${customYear}`;
    }
    return "";
  }, [dateFilterType, customDate, customMonth, customYear]);

  const matchesDateFilter = useCallback((order: Order): boolean => {
    if (dateFilterType === "all") return true;

    const { dateYmd, monthYm, year } = extractOrderDates(order);

    if (dateFilterType === "today") {
      const today = getTodayYmd();
      return dateYmd.includes(today);
    }

    if (dateFilterType === "this_month") {
      const thisMonth = getThisMonthYm();
      return monthYm.includes(thisMonth);
    }

    if (dateFilterType === "custom_date") {
      if (!customDate) return true;
      return dateYmd.includes(customDate);
    }

    if (dateFilterType === "custom_month") {
      if (!customMonth) {
        return year.includes(customYear);
      }
      const targetYm = `${customYear}-${customMonth.padStart(2, "0")}`;
      return monthYm.includes(targetYm);
    }

    if (dateFilterType === "custom_year") {
      if (!customYear) return true;
      return year.includes(customYear);
    }

    return true;
  }, [dateFilterType, customDate, customMonth, customYear]);

  const handleSetFilterAll = () => {
    setDateFilterType("all");
    setCustomDate("");
    setCustomMonth("");
    setShowCustomPicker(false);
    setSearchQuery("");
    setOverdueFilter("all");
  };

  const handleClearDateFilterOnly = () => {
    setDateFilterType("all");
    setCustomDate("");
    setCustomMonth("");
    setShowCustomPicker(false);
  };

  const handleSetFilterToday = () => {
    setDateFilterType("today");
    setCustomDate("");
    setCustomMonth("");
    setShowCustomPicker(false);
  };

  const handleSetFilterThisMonth = () => {
    setDateFilterType("this_month");
    setCustomDate("");
    setCustomMonth("");
    setShowCustomPicker(false);
  };

  const isOrderOverdue = useCallback((order: Order): boolean => {
    const deadline = getOrderDeadline(order);
    return deadline !== Infinity && Date.now() > deadline;
  }, []);

  const baseActiveDeliveries = useMemo(() => {
    return myDeliveries.filter((o) => {
      if (!matchesDateFilter(o)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        o.institutionName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(q))
      );
    });
  }, [myDeliveries, matchesDateFilter, searchQuery]);

  const overdueCount = useMemo(() => {
    return baseActiveDeliveries.filter((o) => isOrderOverdue(o)).length;
  }, [baseActiveDeliveries, isOrderOverdue]);

  const notOverdueCount = useMemo(() => {
    return baseActiveDeliveries.filter((o) => !isOrderOverdue(o)).length;
  }, [baseActiveDeliveries, isOrderOverdue]);

  const filteredDeliveries = useMemo(() => {
    if (overdueFilter === "overdue") {
      return baseActiveDeliveries.filter((o) => isOrderOverdue(o));
    }
    if (overdueFilter === "not_overdue") {
      return baseActiveDeliveries.filter((o) => !isOrderOverdue(o));
    }
    return baseActiveDeliveries;
  }, [baseActiveDeliveries, overdueFilter, isOrderOverdue]);

  const filteredCompletedDeliveries = useMemo(() => {
    return myCompletedDeliveries.filter((o) => {
      if (!matchesDateFilter(o)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        o.institutionName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((item) => item.itemName.toLowerCase().includes(q))
      );
    });
  }, [myCompletedDeliveries, matchesDateFilter, searchQuery]);

  const activeEnRouteOrderIds = useMemo(() => {
    return myDeliveries.filter((o) => o.status === "OUT_FOR_DELIVERY").map((o) => o.id);
  }, [myDeliveries]);

  // Auto-restore active order that is currently OUT_FOR_DELIVERY on refresh
  useEffect(() => {
    if (!activeId && myDeliveries.length > 0) {
      const enRouteOrder = myDeliveries.find((o) => o.status === "OUT_FOR_DELIVERY");
      if (enRouteOrder) {
        setActiveId(enRouteOrder.id);
        setStep("proof");
      }
    }
  }, [myDeliveries, activeId]);

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

  const handleExportProofPdf = async (order: Order) => {
    try {
      showToast({ message: "Menyiapkan PDF Bukti Pengantaran...", variant: "info" });
      await exportCateringDeliveryProofPdf(order, profile?.displayName);
      showToast({ message: "PDF Bukti Pengantaran berhasil diunduh!", variant: "success" });
    } catch (err) {
      console.error("Gagal mengekspor PDF bukti:", err);
      showToast({ message: "Gagal mengunduh PDF bukti pengantaran", variant: "error" });
    }
  };

  const reset = () => {
    setActiveId(null);
    setStep("list");
    setSickRemark("");
  };

  const open = (o: Order) => {
    if (canStartCourierDelivery(o.status)) {
      setActiveId(o.id);
      setStep("start");
    } else if (o.status === "OUT_FOR_DELIVERY") {
      setActiveId(o.id);
      setStep("proof");
    }
  };


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
          onSickReport={() => setShowSickConfirm(true)}
        />
      )}



      {/* ── DELIVERY LIST ─────────────────────────────────────────────── */}
      {step === "list" && (
        <div className="space-y-3">
          {/* 1. Mobile-Responsive Tactile Tab Switcher */}
          <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/90 shadow-inner grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("active")}
              className={`w-full min-h-[46px] py-2 px-3 rounded-xl text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer select-none ${
                activeTab === "active"
                  ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5 font-extrabold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold active:scale-[0.98]"
              }`}
            >
              <Package className={`h-4 w-4 shrink-0 ${activeTab === "active" ? "text-amber-500" : "text-slate-400"}`} />
              <span className="truncate">Tugas Aktif</span>
              <span
                className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                  activeTab === "active"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {myDeliveries.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`w-full min-h-[46px] py-2 px-3 rounded-xl text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer select-none ${
                activeTab === "history"
                  ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5 font-extrabold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold active:scale-[0.98]"
              }`}
            >
              <FolderOpen className={`h-4 w-4 shrink-0 ${activeTab === "history" ? "text-emerald-500" : "text-slate-400"}`} />
              <span className="truncate">
                Arsip <span className="hidden sm:inline">Dokumen </span>Selesai
              </span>
              <span
                className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                  activeTab === "history"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {myCompletedDeliveries.length}
              </span>
            </button>
          </div>

          {/* 2. Unified Compact Search & Filter Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 space-y-2">
            {/* Baris 1: Search Input + Tombol Kalender Kompak (Side-by-side) */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama instansi, pemesan, produk, ID..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8.5 pr-7 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition font-['Hanken_Grotesk']"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    title="Bersihkan pencarian"
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Tombol Kalender / Tanggal Kompak */}
              <button
                type="button"
                onClick={() => setShowCustomPicker(!showCustomPicker)}
                className={`shrink-0 h-[36px] px-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border select-none ${
                  dateFilterType !== "all"
                    ? "bg-amber-500 border-amber-600 text-white shadow-xs font-extrabold"
                    : showCustomPicker
                    ? "bg-slate-100 border-slate-300 text-slate-900"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                title={dateFilterType !== "all" ? activeFilterDescription : "Pilih Tanggal"}
              >
                <Calendar className={`h-3.5 w-3.5 shrink-0 ${dateFilterType !== "all" ? "text-white" : "text-slate-500"}`} />
                <span className="max-w-[85px] sm:max-w-none truncate">
                  {dateFilterType === "today"
                    ? "Hari Ini"
                    : dateFilterType === "this_month"
                    ? "Bulan Ini"
                    : dateFilterType === "custom_date"
                    ? formatIndoDate(customDate)
                    : dateFilterType === "custom_month"
                    ? `${customMonth ? MONTHS_INDO.find((m) => m.value === customMonth)?.label : ""} ${customYear}`
                    : dateFilterType === "custom_year"
                    ? customYear
                    : "Tanggal"}
                </span>
                {dateFilterType !== "all" ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearDateFilterOnly();
                    }}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-black/20"
                    title="Hapus filter tanggal"
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${showCustomPicker ? "rotate-180 text-blue-600" : "text-slate-400"}`} />
                )}
              </button>
            </div>

            {/* Expandable Custom Date / Month / Year Picker Drawer */}
            <AnimatePresence>
              {showCustomPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pt-1"
                >
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                      <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5 text-blue-600" />
                        Pilih Rentang Waktu
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCustomPicker(false)}
                        className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        title="Tutup pilihan"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Presets di dalam Drawer agar layar utama tetap lega */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={handleClearDateFilterOnly}
                        className={`min-h-[34px] py-1 px-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          dateFilterType === "all"
                            ? "bg-slate-900 text-white shadow-xs font-extrabold"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        Semua Waktu
                      </button>
                      <button
                        type="button"
                        onClick={handleSetFilterToday}
                        className={`min-h-[34px] py-1 px-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          dateFilterType === "today"
                            ? "bg-amber-500 text-white shadow-xs font-extrabold"
                            : "bg-white text-slate-700 hover:bg-amber-50 border border-slate-200"
                        }`}
                      >
                        <Calendar className="h-3 w-3 shrink-0" />
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={handleSetFilterThisMonth}
                        className={`min-h-[34px] py-1 px-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          dateFilterType === "this_month"
                            ? "bg-amber-500 text-white shadow-xs font-extrabold"
                            : "bg-white text-slate-700 hover:bg-amber-50 border border-slate-200"
                        }`}
                      >
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        Bulan Ini
                      </button>
                    </div>

                    {/* Opsi 1: 1 Tanggal Spesifik */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        📅 Opsi 1: Pilih 1 Tanggal Tertentu
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={customDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomDate(val);
                            if (val) {
                              setDateFilterType("custom_date");
                              setCustomMonth("");
                            }
                          }}
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        {customDate && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomDate("");
                              if (dateFilterType === "custom_date") setDateFilterType("all");
                            }}
                            className="px-2.5 py-1.5 text-slate-500 hover:text-red-600 rounded-lg bg-slate-100 hover:bg-red-50 border border-slate-200 text-xs font-bold cursor-pointer"
                            title="Hapus tanggal"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Opsi 2: Bulan & Tahun */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        🗓️ Opsi 2: Saring Berdasarkan Bulan & Tahun
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Bulan:
                          </span>
                          <select
                            value={customMonth}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomMonth(val);
                              setCustomDate("");
                              if (val) {
                                setDateFilterType("custom_month");
                              } else if (customYear) {
                                setDateFilterType("custom_year");
                              } else {
                                setDateFilterType("all");
                              }
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          >
                            <option value="">Semua Bulan</option>
                            {MONTHS_INDO.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Tahun:
                          </span>
                          <select
                            value={customYear}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomYear(val);
                              setCustomDate("");
                              if (customMonth) {
                                setDateFilterType("custom_month");
                              } else if (val) {
                                setDateFilterType("custom_year");
                              }
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          >
                            {availableYears.map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions inside Picker */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={handleClearDateFilterOnly}
                        className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer py-1 px-2 rounded hover:bg-red-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCustomPicker(false)}
                        className="bg-slate-900 hover:bg-black text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Baris 2: Filter Status Batas Waktu (Khusus Tugas Aktif: Semua, Terlewat, Belum Terlewat) */}
            {activeTab === "active" && (
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {/* 1. Semua */}
                <button
                  type="button"
                  onClick={() => setOverdueFilter("all")}
                  className={`min-h-[34px] py-1 px-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                    overdueFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs font-black"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/70"
                  }`}
                >
                  <span>Semua</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                      overdueFilter === "all"
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {baseActiveDeliveries.length}
                  </span>
                </button>

                {/* 2. Terlewat */}
                <button
                  type="button"
                  onClick={() => setOverdueFilter("overdue")}
                  className={`min-h-[34px] py-1 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
                    overdueFilter === "overdue"
                      ? "bg-red-600 text-white shadow-xs font-black ring-1 ring-red-700"
                      : overdueCount > 0
                      ? "bg-red-50 border border-red-200 text-red-700 hover:bg-red-100/80 font-extrabold"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/70"
                  }`}
                >
                  <AlertCircle className={`h-3 w-3 shrink-0 ${overdueFilter === "overdue" ? "text-white" : overdueCount > 0 ? "text-red-600" : "text-slate-400"}`} />
                  <span className="truncate">Terlewat</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-black shrink-0 ${
                      overdueFilter === "overdue"
                        ? "bg-white text-red-700"
                        : overdueCount > 0
                        ? "bg-red-200 text-red-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {overdueCount}
                  </span>
                </button>

                {/* 3. Belum Terlewat */}
                <button
                  type="button"
                  onClick={() => setOverdueFilter("not_overdue")}
                  className={`min-h-[34px] py-1 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
                    overdueFilter === "not_overdue"
                      ? "bg-emerald-600 text-white shadow-xs font-black ring-1 ring-emerald-700"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/70"
                  }`}
                >
                  <CheckCircle2 className={`h-3 w-3 shrink-0 ${overdueFilter === "not_overdue" ? "text-white" : "text-emerald-600"}`} />
                  <span className="truncate">Belum Terlewat</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-black shrink-0 ${
                      overdueFilter === "not_overdue"
                        ? "bg-white text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {notOverdueCount}
                  </span>
                </button>
              </div>
            )}

            {/* Active Date Filter Indicator / Reset Status (Hanya muncul jika ada filter aktif agar hemat tempat) */}
            {(dateFilterType !== "all" || overdueFilter !== "all" || searchQuery.trim()) && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 px-1 border-t border-slate-100">
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="truncate text-slate-700">
                    Menampilkan <strong>{activeTab === "active" ? filteredDeliveries.length : filteredCompletedDeliveries.length}</strong> pesanan
                    {dateFilterType !== "all" && <span className="text-amber-800 font-semibold"> • {activeFilterDescription}</span>}
                    {overdueFilter !== "all" && <span className="text-slate-800 font-semibold"> • {overdueFilter === "overdue" ? "Terlewat" : "Belum Terlewat"}</span>}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={handleSetFilterAll}
                  className="shrink-0 text-amber-800 font-bold hover:underline cursor-pointer flex items-center gap-1 pl-2 text-[11px]"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              </div>
            )}
          </div>

          {activeTab === "active" ? (
            <div className="space-y-3">
              {filteredDeliveries.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 sm:p-12 text-center space-y-3 shadow-xs">
                  <Package className="h-14 w-14 mx-auto text-[#D1D5DB] bg-[#F3F4F6] rounded-full p-3.5" />
                  <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827] text-base">
                    {overdueFilter === "overdue"
                      ? "Tidak Ada Pesanan Terlewat"
                      : overdueFilter === "not_overdue"
                      ? "Tidak Ada Pesanan yang Belum Terlewat"
                      : dateFilterType !== "all"
                      ? "Tidak Ada Tugas Pada Waktu Ini"
                      : searchQuery
                      ? "Hasil Pencarian Kosong"
                      : "Tidak Ada Pengantaran"}
                  </p>
                  <p className="text-xs sm:text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-sm mx-auto leading-relaxed">
                    {overdueFilter === "overdue"
                      ? "Hebat! Semua pesanan aktif saat ini masih sesuai jadwal dan belum melewati batas waktu pengantaran."
                      : overdueFilter === "not_overdue"
                      ? "Seluruh pesanan aktif saat ini sudah melewati batas waktu pengantaran (terlewat)."
                      : dateFilterType !== "all"
                      ? `Tidak ditemukan tugas aktif yang cocok dengan filter "${activeFilterDescription}". Pesanan Anda aman dan tidak hilang.`
                      : searchQuery
                      ? "Tidak ada tugas aktif yang cocok dengan kata kunci pencarian Anda."
                      : "Belum ada pesanan yang ditugaskan ke Anda untuk diantarkan."}
                  </p>
                  {(overdueFilter !== "all" || dateFilterType !== "all" || searchQuery) && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOverdueFilter("all");
                          handleSetFilterAll();
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black cursor-pointer shadow-sm active:scale-95 transition-all"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Tampilkan Semua Pesanan</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredDeliveries.map((o, idx) => {
                    const canOpen = canStartCourierDelivery(o.status) || o.status === "OUT_FOR_DELIVERY";
                    return (
                    <motion.div
                      key={o.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.2 }}
                    >
                      <div
                        onClick={canOpen ? () => open(o) : undefined}
                        aria-disabled={!canOpen}
                        title={canOpen ? undefined : "Pesanan belum siap diambil dari dapur"}
                        className={`w-full text-left bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden transition-all ${
                          canOpen
                            ? "hover:border-[#FBBF24] hover:shadow-sm active:scale-[0.99] cursor-pointer"
                            : "opacity-75 cursor-not-allowed"
                        }`}
                      >
                        <div className={`h-1.5 ${getCourierStatusMeta(o.status).barClass}`} />
                        <div className="p-4 sm:p-5">
                          <div className="flex items-center gap-4">
                            {/* Number badge */}
                            <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 border ${getCourierStatusMeta(o.status).iconClass}`}>
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
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${getCourierStatusMeta(o.status).badgeClass}`}>
                                    {getCourierStatusMeta(o.status).label}
                                  </span>
                                  {(() => {
                                    const deadline = getOrderDeadline(o);
                                    const isPast = deadline !== Infinity && Date.now() > deadline;
                                    return isPast ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-red-100 text-red-700 animate-pulse border border-red-300">
                                        <AlertCircle className="h-2.5 w-2.5 text-red-600" /> TERLEWAT
                                      </span>
                                    ) : null;
                                  })()}
                                </div>
                              </div>
                              {o.customerName ? (
                                <>
                                  <p className="text-xs text-[#4B5563] font-semibold mt-0.5">
                                    Pemesan: {o.customerName}
                                  </p>
                                  <p className="text-xs text-[#4B5563] font-semibold mt-0.5">
                                    Penerima: {o.recipientName}
                                  </p>
                                </>
                              ) : (
                                o.recipientName && (
                                  <p className="text-xs text-[#4B5563] font-semibold mt-0.5">
                                    Pemesan: {o.recipientName}
                                  </p>
                                )
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

                            {/* Action state */}
                            {canOpen ? (
                              <ChevronRight className="h-5 w-5 text-[#D1D5DB] shrink-0" />
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500 shrink-0 text-right">Belum bisa<br />diambil</span>
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
            </div>
          ) : (
            filteredCompletedDeliveries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 sm:p-12 text-center space-y-3 shadow-xs">
                <CheckCircle2 className="h-14 w-14 mx-auto text-[#D1D5DB] bg-[#F3F4F6] rounded-full p-3.5" />
                <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827] text-base">
                  {dateFilterType !== "all"
                    ? "Tidak Ada Arsip Pada Waktu Ini"
                    : searchQuery
                    ? "Hasil Pencarian Kosong"
                    : "Belum Ada Riwayat Selesai"}
                </p>
                <p className="text-xs sm:text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-sm mx-auto leading-relaxed">
                  {dateFilterType !== "all"
                    ? `Tidak ditemukan arsip dokumen selesai yang cocok dengan filter "${activeFilterDescription}".`
                    : searchQuery
                    ? "Tidak ada riwayat pengantaran selesai yang cocok dengan kata kunci pencarian Anda."
                    : "Anda belum menyelesaikan pengantaran pesanan apa pun."}
                </p>
                {(dateFilterType !== "all" || searchQuery) && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSetFilterAll}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black cursor-pointer shadow-sm active:scale-95 transition-all"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Tampilkan Semua Arsip</span>
                    </button>
                  </div>
                )}
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
                            <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 font-medium text-[#4B5563]">
                              {o.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex flex-col gap-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-1.5 font-medium text-[#4B5563]">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-neutral-100 rounded overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                                      <ProductImage
                                        imageUrl={item.imageUrl || ""}
                                        alt={item.itemName}
                                        className="h-full w-full object-cover"
                                        fallbackClassName="h-2.5 w-2.5 text-neutral-400"
                                      />
                                    </div>
                                    <span className="truncate flex-1 text-xs">{item.itemName}</span>
                                    {o.isPreOrder ? (
                                      <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[9px] font-bold text-amber-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
                                        Pra-pesanan
                                      </span>
                                    ) : (
                                      <span className="font-bold text-[#111827] shrink-0">x{item.quantity}</span>
                                    )}
                                  </div>
                                  {(item.deliveryAddress || item.deliveryTime || item.recipientName) && (
                                    <div className="text-[9px] text-[#4B5563] border-t border-[#E5E7EB] pt-1 mt-0.5 space-y-0.5 font-medium leading-tight">
                                      {item.recipientName && (
                                        <p className="truncate"><strong className="text-neutral-500">Penerima:</strong> {item.recipientName}</p>
                                      )}
                                      {item.deliveryTime && (
                                        <p className="truncate"><strong className="text-neutral-500">Jadwal:</strong> {item.deliveryTime.replace("T", " ")}</p>
                                      )}
                                      {item.deliveryAddress && (
                                        <p className="break-words line-clamp-2" title={item.deliveryAddress}>
                                          <strong className="text-neutral-500">Alamat:</strong> {item.deliveryAddress.split(" | ")[0]}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="pt-2 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-emerald-800 shrink-0 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span>Telah Diterima & Diarsipkan</span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {o.proofFileIds && o.proofFileIds.length > 0 && (
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
                                    Lihat Foto
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleExportProofPdf(o)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#111827] hover:bg-black text-white font-bold text-[10px] rounded-lg transition cursor-pointer shadow-xs active:scale-95"
                                  title="Unduh file PDF bukti pengantaran ini"
                                >
                                  <FileDown className="h-3 w-3 text-[#FBBF24]" />
                                  <span>Unduh Bukti PDF</span>
                                </button>
                              </div>
                            </div>

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
              await dispatchOrder(active.id, {
                deliveryStartedAt: now,
                kitchenSignatures,
              });
              setStep("proof");
            }}
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
            customerName={(active.customerName || active.recipientName || "") as string}
            recipientName={active.recipientName}
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

      {/* Confirmation Modal for Courier Sick */}
      {showSickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 border border-[#E5E7EB] shadow-xl font-['Hanken_Grotesk'] text-left">
            <h4 className="font-['Manrope'] font-extrabold text-base text-red-600">Konfirmasi Batal Tugas</h4>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Apakah Anda yakin ingin melaporkan sakit dan membatalkan pengantaran ini? Tugas ini akan dikembalikan ke status antrean dan dialihkan ke kurir lain.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="sick-remark-input" className="block text-[10px] font-bold text-neutral-500 uppercase">
                Alasan Pembatalan / Keterangan Sakit <span className="text-red-500">*</span>
              </label>
              <textarea
                id="sick-remark-input"
                rows={3}
                value={sickRemark}
                onChange={(e) => setSickRemark(e.target.value)}
                placeholder="Tuliskan alasan/keterangan pembatalan di sini secara detail..."
                className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-transparent focus:outline-none font-semibold text-xs text-neutral-800 transition resize-none"
              />
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSickReport}
                disabled={reportingSick || !sickRemark.trim()}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reportingSick && <Loader2 className="h-3 w-3 animate-spin text-white" />}
                Ya, Laporkan Sakit
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSickConfirm(false);
                  setSickRemark("");
                }}
                disabled={reportingSick}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerInfoCard({
  order,
  onSickReport,
}: {
  order: Order;
  onSickReport: () => void;
}) {
  const displayName = order.customerName || order.recipientName || "Pemesan";
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
          Detail Pemesan & Instansi
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
          {order.customerName ? (
            <>
              <p className="font-bold text-[#4B5563] text-xs">
                Pemesan: {order.customerName}
              </p>
              <p className="font-bold text-[#4B5563] text-xs">
                Penerima: {order.recipientName}
              </p>
            </>
          ) : (
            <p className="font-bold text-[#4B5563] text-xs">
              Pemesan: {order.recipientName || "Pemesan"}
            </p>
          )}
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
              <span className="font-bold text-amber-800 text-[10px] block mb-0.5">Catatan Pemesan:</span>
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Sick Report Option */}
      {order.status === "READY_TO_DELIVER" && (
        <div className="pt-2.5 border-t border-[#F3F4F6] flex justify-between items-center">
          <span className="text-[10px] text-neutral-400 font-medium">Kurir berhalangan / sakit?</span>
          <button
            type="button"
            onClick={onSickReport}
            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-[10px] rounded-lg transition border border-red-200 cursor-pointer"
          >
            Laporkan Sakit & Batal
          </button>
        </div>
      )}
    </div>
  );
}

export default DeliveryPage;
