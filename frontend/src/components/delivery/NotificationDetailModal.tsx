import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Loader2,
  Truck,
  MapPin,
  User,
  Phone,
  Clock,
  CheckCircle2,
  Package,
  FileText,
  Maximize2,
  Image as ImageIcon,
  Building2,
  Utensils,
} from "lucide-react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { getOrder } from "@/services/orderService";
import type { Order } from "@/types/order";
import type { FirestoreNotification, NotificationItem } from "@/services/notificationService";

interface NotificationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: FirestoreNotification | NotificationItem | null;
}

interface LoadedPhoto {
  src: string;
  description?: string;
  title?: string;
}

export function NotificationDetailModal({
  isOpen,
  onClose,
  notification,
}: NotificationDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [startPhoto, setStartPhoto] = useState<LoadedPhoto | null>(null);
  const [proofPhotos, setProofPhotos] = useState<LoadedPhoto[]>([]);
  const [signaturePhoto, setSignaturePhoto] = useState<LoadedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeLightbox, setActiveLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !notification) {
      setOrder(null);
      setStartPhoto(null);
      setProofPhotos([]);
      setSignaturePhoto(null);
      setError(null);
      setActiveLightbox(null);
      return;
    }

    let isMounted = true;

    const loadDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        let foundOrder: Order | null = null;

        // 1. Try resolving orderId directly from notification object
        const notifObj = notification as unknown as Record<string, unknown>;
        const directOrderId = (notifObj.orderId as string) || undefined;
        const directShortId = (notifObj.orderShortId as string) || undefined;

        if (directOrderId) {
          try {
            foundOrder = await getOrder(directOrderId);
          } catch {
            // fallback search if getOrder failed
          }
        }

        // 2. Extract shortId from notification title or message if order not yet found
        const notifTitle =
          typeof notification.title === "string"
            ? notification.title
            : notification.title?.id || "";
        const notifMsg =
          typeof notification.message === "string"
            ? notification.message
            : notification.message?.id || "";
        
        const textToSearch = `${notifTitle} ${notifMsg}`;
        const match = textToSearch.match(/#([A-Za-z0-9]{5,10})/);
        const extractedShortId = directShortId || (match ? match[1] : null);

        if (!foundOrder && extractedShortId) {
          const ordersRef = collection(db, "orders");
          const snap = await getDocs(ordersRef);
          const searchUpper = extractedShortId.toUpperCase();

          const matchedDoc = snap.docs.find((d) => {
            const idUpper = d.id.toUpperCase();
            return idUpper === searchUpper || idUpper.endsWith(searchUpper);
          });

          if (matchedDoc) {
            foundOrder = await getOrder(matchedDoc.id);
          }
        }

        if (!isMounted) return;

        if (foundOrder) {
          setOrder(foundOrder);

          // Helper to fetch file chunks from delivery_files collection
          const fetchDeliveryFile = async (photoId: string) => {
            if (!photoId) return null;
            const cleanId = photoId.replace("delivery_files/", "");
            const parentRef = doc(db, "delivery_files", cleanId);
            const parentSnap = await getDoc(parentRef);
            if (!parentSnap.exists()) return null;

            const meta = parentSnap.data();
            const totalChunks = meta.totalChunks || 0;
            const description = meta.description || "";

            const chunkPromises = [];
            for (let i = 0; i < totalChunks; i++) {
              const chunkRef = doc(db, "delivery_files", cleanId, "chunks", String(i));
              chunkPromises.push(getDoc(chunkRef));
            }
            const chunkSnaps = await Promise.all(chunkPromises);

            let fullDataUri = "";
            for (const chunkSnap of chunkSnaps) {
              if (chunkSnap.exists()) {
                fullDataUri += chunkSnap.data().data || "";
              }
            }
            return fullDataUri ? { src: fullDataUri, description } : null;
          };

          // Load Keberangkatan (OTW) Photo
          if (foundOrder.deliveryStartPhotoId) {
            const startData = await fetchDeliveryFile(foundOrder.deliveryStartPhotoId);
            if (isMounted) setStartPhoto(startData);
          }

          // Load Proof Photos & Signature
          if (foundOrder.proofFileIds && foundOrder.proofFileIds.length > 0) {
            const fileIds = foundOrder.proofFileIds;
            // Last element is often the signature in ProofCapture flow
            const photoIds = fileIds.length > 1 ? fileIds.slice(0, -1) : fileIds;
            const sigId = fileIds.length > 1 ? fileIds[fileIds.length - 1] : null;

            const loadedList: LoadedPhoto[] = [];
            for (const pid of photoIds) {
              const pData = await fetchDeliveryFile(pid);
              if (pData) loadedList.push(pData);
            }
            if (isMounted) setProofPhotos(loadedList);

            if (sigId) {
              const sigData = await fetchDeliveryFile(sigId);
              if (isMounted) setSignaturePhoto(sigData);
            }
          }
        } else {
          setOrder(null);
        }
      } catch (err) {
        console.error("Gagal memuat detail laporan pengiriman:", err);
        if (isMounted) setError("Tidak dapat memuat detail lengkap pesanan ini.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, notification]);

  if (!isOpen || !notification) return null;

  const notifTitle =
    typeof notification.title === "string"
      ? notification.title
      : notification.title?.id || "Detail Notifikasi";
  const notifMessage =
    typeof notification.message === "string"
      ? notification.message
      : notification.message?.id || "";
  const notifTime =
    "createdAt" in notification
      ? String(notification.createdAt)
      : notification.time;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadgeColor = (status?: string) => {
    switch (status) {
      case "DELIVERED":
      case "CONFIRMED":
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "IN_DELIVERY":
      case "DISTRIBUSI":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "IN_PRODUCTION":
      case "PRODUKSI":
        return "bg-violet-100 text-violet-800 border-violet-200";
      case "FAILED":
      case "DELIVERY_FAILED":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-amber-100 text-amber-800 border-amber-200";
    }
  };

  const shortId = order
    ? order.id.length > 6
      ? order.id.slice(-6).toUpperCase()
      : order.id.toUpperCase()
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Main Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.3 }}
        className="relative bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-neutral-200 font-['Hanken_Grotesk',system-ui,sans-serif] flex flex-col gap-5 z-10 max-h-[92vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs shrink-0">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-neutral-900 leading-tight">
                  {notifTitle}
                </h2>
                {shortId && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-xs font-black uppercase tracking-wide">
                    #{shortId}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 font-medium mt-0.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatDateTime(notifTime)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Modal"
            className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 p-2 rounded-full transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-14 text-center space-y-3">
            <Loader2 className="h-9 w-9 animate-spin text-amber-500 mx-auto" />
            <p className="text-xs text-neutral-500 font-semibold">
              Memuat detail laporan pengiriman & foto bukti...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Notification Text Box */}
            <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                Pesan Notifikasi:
              </span>
              <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                {notifMessage}
              </p>
            </div>

            {order ? (
              <>
                {/* STATUS & TIMELINE CARD */}
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Status Pengiriman
                    </span>
                    <span
                      className={`text-xs font-extrabold px-3 py-1 rounded-full border ${getStatusBadgeColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-neutral-200/70 space-y-1">
                      <span className="text-[10px] text-neutral-400 font-semibold uppercase block">
                        Waktu Pesanan Dibuat
                      </span>
                      <span className="font-bold text-neutral-800 block">
                        {formatDateTime(order.createdAt)}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-neutral-200/70 space-y-1">
                      <span className="text-[10px] text-neutral-400 font-semibold uppercase block">
                        Waktu Berangkat (OTW)
                      </span>
                      <span className="font-bold text-neutral-800 block">
                        {formatDateTime(order.deliveryStartedAt || order.createdAt)}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-neutral-200/70 space-y-1">
                      <span className="text-[10px] text-neutral-400 font-semibold uppercase block">
                        Waktu Tiba / Selesai
                      </span>
                      <span className="font-bold text-emerald-700 block">
                        {formatDateTime(
                          order.deliveredAt ||
                            order.customerConfirmedAt ||
                            order.updatedAt
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PENERIMA & LOKASI DETAILS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Box: Customer / Recipient */}
                  <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 space-y-2.5">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-100 pb-2">
                      <User className="h-4 w-4 text-amber-600" />
                      Informasi Penerima
                    </span>

                    <div className="space-y-1.5 text-xs">
                      {order.institutionName && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] text-neutral-400 block font-semibold">
                              Instansi / Sekolah:
                            </span>
                            <span className="font-bold text-neutral-800">
                              {order.institutionName}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-neutral-400 block font-semibold">
                            Nama Penerima / Pemesan:
                          </span>
                          <span className="font-bold text-neutral-800">
                            {order.recipientName || order.customerName || "Pelanggan"}
                          </span>
                        </div>
                      </div>

                      {order.recipientPhone && (
                        <div className="flex items-start gap-2">
                          <Phone className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] text-neutral-400 block font-semibold">
                              No. HP / Telepon:
                            </span>
                            <span className="font-semibold text-neutral-700">
                              {order.recipientPhone}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Box: Delivery Address & Courier */}
                  <div className="bg-white rounded-2xl p-4 border border-neutral-200/80 space-y-2.5">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-neutral-100 pb-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      Alamat & Kurir
                    </span>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-neutral-400 block font-semibold">
                            Alamat Pengiriman:
                          </span>
                          <p className="font-medium text-neutral-700 leading-relaxed">
                            {order.deliveryAddress || "Alamat tidak dicantumkan"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-neutral-400 block font-semibold">
                            Kurir Ditugaskan:
                          </span>
                          <span className="font-bold text-neutral-800">
                            {order.assignedCourierId || "Tim Pengiriman Al-Umana"}
                          </span>
                        </div>
                      </div>

                      {(order.recipientNotes || order.additionalNotes) && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] text-neutral-400 block font-semibold">
                              Catatan Pengiriman:
                            </span>
                            <p className="font-medium text-neutral-600 italic">
                              "{order.recipientNotes || order.additionalNotes}"
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* DOKUMENTASI & FOTO BUKTI PENGIRIMAN */}
                <div className="space-y-3">
                  <h3 className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-blue-600" />
                    Dokumentasi Foto Pengiriman & Serah Terima
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {/* Foto Keberangkatan OTW */}
                    <div className="border border-neutral-200 rounded-2xl p-3 bg-neutral-50 flex flex-col justify-between space-y-2">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Foto Keberangkatan (OTW)
                      </span>
                      {startPhoto ? (
                        <div
                          onClick={() => setActiveLightbox(startPhoto.src)}
                          className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/5 group cursor-pointer border border-neutral-200"
                        >
                          <img
                            src={startPhoto.src}
                            alt="Foto Keberangkatan"
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="h-5 w-5" />
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-neutral-300 rounded-xl p-4 text-center text-xs text-neutral-400 aspect-video flex items-center justify-center">
                          Tidak ada foto keberangkatan
                        </div>
                      )}
                    </div>

                    {/* Foto Bukti Pengiriman (Tiba) */}
                    <div className="border border-neutral-200 rounded-2xl p-3 bg-neutral-50 flex flex-col justify-between space-y-2 col-span-1 sm:col-span-1 md:col-span-2">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Foto Bukti Pengiriman ({proofPhotos.length})
                      </span>
                      {proofPhotos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {proofPhotos.map((p, idx) => (
                            <div
                              key={idx}
                              onClick={() => setActiveLightbox(p.src)}
                              className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/5 group cursor-pointer border border-neutral-200"
                            >
                              <img
                                src={p.src}
                                alt={`Bukti Pengiriman #${idx + 1}`}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="h-5 w-5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border border-dashed border-neutral-300 rounded-xl p-4 text-center text-xs text-neutral-400 aspect-video flex items-center justify-center">
                          Belum ada foto bukti pengiriman
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tanda Tangan PIC / Serah Terima */}
                  {signaturePhoto && (
                    <div className="border border-neutral-200 rounded-2xl p-3 bg-neutral-50 space-y-2">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Tanda Tangan Serah Terima PIC
                      </span>
                      <div
                        onClick={() => setActiveLightbox(signaturePhoto.src)}
                        className="aspect-video max-h-36 w-full rounded-xl bg-white border border-neutral-200 flex items-center justify-center p-3 cursor-pointer group"
                      >
                        <img
                          src={signaturePhoto.src}
                          alt="Tanda Tangan PIC"
                          className="max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                    </div>
                  )}

                  {/* Tanda Tangan Dapur (if available) */}
                  {order.kitchenSignatures && order.kitchenSignatures.length > 0 && (
                    <div className="border border-neutral-200 rounded-2xl p-3.5 bg-neutral-50 space-y-2.5">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Tanda Tangan Serah Terima Dapur ({order.kitchenSignatures.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {order.kitchenSignatures.map((ks, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-3 rounded-xl border border-neutral-200 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-extrabold text-amber-800 block">
                                {ks.kitchenName}
                              </span>
                              <span className="text-[10px] text-neutral-400 block font-semibold">
                                Staf: {ks.staffName}
                              </span>
                            </div>
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                              {new Date(ks.signedAt).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* DETAIL ITEM PESANAN */}
                <div className="space-y-3 border-t border-neutral-100 pt-4">
                  <h3 className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Utensils className="h-4 w-4 text-emerald-600" />
                    Rincian Menu & Item Pesanan
                  </h3>

                  {order.items && order.items.length > 0 ? (
                    <div className="border border-neutral-200 rounded-2xl overflow-hidden divide-y divide-neutral-100 text-xs">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-white flex items-center justify-between gap-3 hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.itemName || (item as { name?: string }).name || "Item Menu"}
                                className="h-10 w-10 rounded-lg object-cover border border-neutral-200 shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                                <Package className="h-5 w-5" />
                              </div>
                            )}
                            <div>
                              <h4 className="font-bold text-neutral-800">
                                {item.itemName || (item as { name?: string }).name || "Item Menu"}
                              </h4>
                              <p className="text-[10px] text-neutral-400 font-semibold">
                                {item.quantity} porsi x Rp {(item.price ?? 0).toLocaleString("id-ID")}
                              </p>
                            </div>
                          </div>
                          <span className="font-extrabold text-neutral-900 shrink-0">
                            Rp {((item.price ?? 0) * (item.quantity ?? 1)).toLocaleString("id-ID")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 leading-relaxed font-medium space-y-1">
                      {order.foodDetails && (
                        <p>
                          <strong className="text-neutral-800">Menu Makanan:</strong>{" "}
                          {order.foodDetails}
                        </p>
                      )}
                      {order.drinkDetails && (
                        <p>
                          <strong className="text-neutral-800">Menu Minuman:</strong>{" "}
                          {order.drinkDetails}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* If no order details could be linked, show general notification info */
              <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-200 text-center space-y-2">
                <Package className="h-8 w-8 text-neutral-400 mx-auto" />
                <p className="text-xs text-neutral-600 font-semibold">
                  Detail pesanan khusus untuk notifikasi ini tidak ditemukan di database.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-3 border-t border-neutral-100 mt-2">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </motion.div>

      {/* Lightbox Overlay for Image Preview */}
      <AnimatePresence>
        {activeLightbox && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center"
            >
              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                className="absolute top-2 right-2 z-10 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-xs transition cursor-pointer"
              >
                <X className="h-6 w-6" />
              </button>
              <img
                src={activeLightbox}
                alt="Bukti Foto Ukuran Penuh"
                className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
