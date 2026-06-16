import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import type { KitchenSignature } from "@/types/order";

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  proofFileIds: string[];
  deliveryStartPhotoId?: string;
  kitchenSignatures?: KitchenSignature[];
}

export function ProofModal({ isOpen, onClose, proofFileIds, deliveryStartPhotoId, kitchenSignatures }: ProofModalProps) {
  const [photos, setPhotos] = useState<{ src: string; description?: string }[]>([]);
  const [sigSrc, setSigSrc] = useState<string | null>(null);
  const [startPhotoSrc, setStartPhotoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPhotos([]);
      setSigSrc(null);
      setStartPhotoSrc(null);
      return;
    }

    const loadProofs = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchFile = async (photoId: string) => {
          const fileId = photoId.replace("delivery_files/", "");
          const parentRef = doc(db, "delivery_files", fileId);
          const parentSnap = await getDoc(parentRef);
          
          if (parentSnap.exists()) {
            const meta = parentSnap.data();
            const totalChunks = meta.totalChunks || 0;
            const description = meta.description || "";
            
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
            return { src: fullDataUri, description };
          }
          return null;
        };

        // Fetch start photo if available
        if (deliveryStartPhotoId) {
          const startData = await fetchFile(deliveryStartPhotoId);
          if (startData) {
            setStartPhotoSrc(startData.src);
          } else {
            setStartPhotoSrc(null);
          }
        } else {
          setStartPhotoSrc(null);
        }

        if (proofFileIds && proofFileIds.length > 0) {
          const photoFileIds = proofFileIds.slice(0, -1);
          const sigFileId = proofFileIds[proofFileIds.length - 1];

          // Fetch all photos in parallel
          const fetchedPhotos = [];
          for (const fileId of photoFileIds) {
            const fileData = await fetchFile(fileId);
            if (fileData) {
              fetchedPhotos.push(fileData);
            }
          }
          setPhotos(fetchedPhotos);

          // Fetch signature
          if (sigFileId) {
            const sigData = await fetchFile(sigFileId);
            if (sigData) {
              setSigSrc(sigData.src);
            }
          }
        } else {
          setPhotos([]);
          setSigSrc(null);
        }
      } catch (err) {
        console.error("Gagal memuat bukti pengiriman:", err);
        setError("Gagal memuat bukti pengiriman.");
      } finally {
        setLoading(false);
      }
    };

    loadProofs();
  }, [isOpen, proofFileIds, deliveryStartPhotoId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs"
      />

      {/* Modal Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.3 }}
        className="relative bg-white rounded-3xl max-w-4xl w-full p-6 shadow-xl border border-[#E5E7EB] font-['Hanken_Grotesk',system-ui,sans-serif] flex flex-col gap-4 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Bukti Dokumentasi & TTD
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="text-gray-400 hover:text-gray-600 transition cursor-pointer p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
            <p className="text-xs text-[#6B7280]">Memuat bukti pengiriman...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600 text-sm font-semibold">
            {error}
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 ${deliveryStartPhotoId ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6`}>
            {/* Left Column: Start OTW Photo */}
            {deliveryStartPhotoId && (
              <div className="space-y-4">
                <span className="block text-xs font-bold text-[#374151] uppercase tracking-wide">
                  Foto Keberangkatan (OTW)
                </span>
                {startPhotoSrc ? (
                  <div className="border border-[#E5E7EB] rounded-2xl overflow-hidden bg-neutral-50 p-2.5">
                    <div className="aspect-video w-full flex items-center justify-center rounded-xl overflow-hidden bg-black/5">
                      <img src={startPhotoSrc} alt="Foto Keberangkatan" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-[#D1D5DB] rounded-2xl p-6 text-center text-xs text-[#9CA3AF] min-h-[120px] flex items-center justify-center">
                    Belum berangkat / tidak ada foto
                  </div>
                )}
              </div>
            )}

            {/* Middle Column: Photos list */}
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              <span className="block text-xs font-bold text-[#374151] uppercase tracking-wide">
                Foto Dokumentasi Pengiriman ({photos.length})
              </span>
              {photos.length > 0 ? (
                <div className="space-y-4">
                  {photos.map((p, idx) => (
                    <div key={idx} className="border border-[#E5E7EB] rounded-2xl overflow-hidden bg-neutral-50 p-2.5 space-y-2">
                      <div className="aspect-video w-full flex items-center justify-center rounded-xl overflow-hidden bg-black/5">
                        <img src={p.src} alt={`Bukti #${idx + 1}`} className="max-h-full max-w-full object-contain" />
                      </div>
                      {p.description && (
                        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-2.5 text-xs text-amber-900 leading-relaxed font-medium">
                          <span className="font-extrabold text-[9px] uppercase tracking-wider block text-amber-800 mb-0.5">
                            Keterangan:
                          </span>
                          {p.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[#D1D5DB] rounded-2xl p-6 text-center text-xs text-[#9CA3AF] min-h-[120px] flex items-center justify-center">
                  Tidak ada foto dokumentasi
                </div>
              )}
            </div>

            {/* Right Column: Signature */}
            <div className="space-y-4">
              <span className="block text-xs font-bold text-[#374151] uppercase tracking-wide">Tanda Tangan PIC</span>
              {sigSrc ? (
                <div className="border border-[#E5E7EB] rounded-2xl p-4 bg-neutral-50 aspect-video w-full flex items-center justify-center">
                  <img src={sigSrc} alt="Tanda Tangan Bukti" className="max-h-32 object-contain" />
                </div>
              ) : (
                <div className="border border-dashed border-[#D1D5DB] rounded-2xl p-6 text-center text-xs text-[#9CA3AF] min-h-[120px] flex items-center justify-center">
                  Tidak ada tanda tangan
                </div>
              )}
            </div>
          </div>
          
          {/* Tanda Tangan Serah Terima Dapur */}
          {kitchenSignatures && kitchenSignatures.length > 0 && (
            <div className="border-t border-[#F3F4F6] pt-4 mt-2 space-y-4">
              <span className="block text-xs font-bold text-[#374151] uppercase tracking-wide font-['Manrope',system-ui,sans-serif]">
                Tanda Tangan Serah Terima Dapur Produksi ({kitchenSignatures.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {kitchenSignatures.map((ks, idx) => {
                  let photos: string[] = [];
                  try {
                    if (ks.signatureDataUrl.startsWith("[") && ks.signatureDataUrl.endsWith("]")) {
                      photos = JSON.parse(ks.signatureDataUrl);
                    } else {
                      photos = ks.signatureDataUrl ? [ks.signatureDataUrl] : [];
                    }
                  } catch {
                    photos = ks.signatureDataUrl ? [ks.signatureDataUrl] : [];
                  }

                  return (
                    <div key={idx} className="border border-[#E5E7EB] rounded-2xl p-4 bg-neutral-50 flex flex-col justify-between space-y-3 shadow-2xs font-['Hanken_Grotesk']">
                      <div className="flex justify-between items-center bg-[#FDF2E9] border border-orange-100 rounded-lg px-2.5 py-1">
                        <span className="text-xs font-black text-[#B45309]">{ks.kitchenName}</span>
                        <span className="text-[10px] text-[#6B7280]">
                          {new Date(ks.signedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center w-full">
                        {photos.map((url, pIdx) => (
                          <div key={pIdx} className="aspect-video w-full flex items-center justify-center bg-white rounded-lg border border-[#E5E7EB] p-2 max-h-32 overflow-hidden">
                            <img src={url} alt={`TTD ${ks.kitchenName} #${pIdx + 1}`} className="max-h-full object-contain" />
                          </div>
                        ))}
                      </div>
                      <div className="text-center text-xs">
                        <span className="text-neutral-400 font-medium">Staf Dapur: </span>
                        <span className="font-extrabold text-[#374151]">{ks.staffName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
        )}

        <div className="flex justify-end pt-3 border-t border-[#F3F4F6] mt-2">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
