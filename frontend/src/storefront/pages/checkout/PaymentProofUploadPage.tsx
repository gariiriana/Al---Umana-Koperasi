import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { Loader2, ArrowLeft, CheckCircle2, Upload, AlertCircle, RefreshCw } from "lucide-react";

import { db } from "@/lib/firebase";
import { subscribeToOrder } from "@/services/orderService";
import { uploadPaymentProof } from "@/services/paymentProofService";
import { uploadFileInChunks, ChunkUploadError } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import type { Order } from "@/types/order";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    invalidOrderId: "ID Pesanan tidak valid.",
    orderNotFound: "Pesanan tidak ditemukan atau Anda tidak memiliki akses.",
    mimeError: "Format file tidak didukung. Harap pilih gambar JPEG, PNG, atau WEBP.",
    sizeError: "Ukuran file terlalu besar. Batas maksimal adalah 15 MB.",
    uploadInterrupted: "Unggahan terputus di chunk {chunk}. Silakan klik 'Lanjutkan' untuk mencoba kembali.",
    uploadFailed: "Gagal mengunggah bukti pembayaran. Silakan coba lagi.",
    loadingOrder: "Memuat data pesanan…",
    invalidOrder: "Pesanan tidak valid.",
    viewOrders: "Lihat Pesanan Saya",
    uploadTitle: "Unggah Bukti Bayar",
    orderIdHeader: "ID PESANAN",
    methodHeader: "METODE",
    paymentRejected: "Pembayaran Ditolak",
    bankTransferEwallet: "Transfer Bank / E-Wallet",
    rejectionReasonTitle: "Alasan Penolakan Admin:",
    selectImage: "Pilih Gambar Bukti Bayar",
    limitDesc: "Hanya JPEG, PNG, WEBP. Maks 15 MB.",
    altPreview: "Pratinjau bukti bayar",
    changeImage: "Ganti Gambar",
    uploadingStatus: "Mengunggah Bukti Bayar...",
    uploadSuccess: "Berhasil Diunggah! Mengalihkan...",
    resumeUpload: "Lanjutkan Unggahan",
    proofSubmitted: "Bukti Bayar Sudah Dikirim",
    verificationDesc: "Bukti bayar Anda sedang diverifikasi oleh pengurus koperasi. Status pesanan Anda saat ini adalah **Menunggu Persetujuan Pembayaran**.",
    backToOrders: "Kembali ke Daftar Pesanan",
  },
  en: {
    invalidOrderId: "Invalid Order ID.",
    orderNotFound: "Order not found or access denied.",
    mimeError: "Unsupported file format. Please select a JPEG, PNG, or WEBP image.",
    sizeError: "File size too large. Maximum limit is 15 MB.",
    uploadInterrupted: "Upload interrupted at chunk {chunk}. Please click 'Resume' to try again.",
    uploadFailed: "Failed to upload payment proof. Please try again.",
    loadingOrder: "Loading order data...",
    invalidOrder: "Invalid order.",
    viewOrders: "View My Orders",
    uploadTitle: "Upload Payment Proof",
    orderIdHeader: "ORDER ID",
    methodHeader: "METHOD",
    paymentRejected: "Payment Rejected",
    bankTransferEwallet: "Bank Transfer / E-Wallet",
    rejectionReasonTitle: "Admin Rejection Reason:",
    selectImage: "Select Payment Proof Image",
    limitDesc: "Only JPEG, PNG, WEBP. Max 15 MB.",
    altPreview: "Payment proof preview",
    changeImage: "Change Image",
    uploadingStatus: "Uploading Payment Proof...",
    uploadSuccess: "Successfully Uploaded! Redirecting...",
    resumeUpload: "Resume Upload",
    proofSubmitted: "Payment Proof Already Submitted",
    verificationDesc: "Your payment proof is being verified by the cooperative admin. Your order status is currently **Awaiting Payment Approval**.",
    backToOrders: "Back to Order List",
  }
} as const;

export function PaymentProofUploadPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [order, setOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);

  // File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Upload progress states
  const [uploading, setUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Resume state
  const [failedFileId, setFailedFileId] = useState<string | undefined>(undefined);
  const [failedChunkIndex, setFailedChunkIndex] = useState<number | undefined>(undefined);

  // Ref for imperatively setting progress bar width (avoids JSX inline style lint warning)
  const progressBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progressPercent}%`;
    }
  }, [progressPercent]);

  // Subscribe to Order
  useEffect(() => {
    if (!orderId) {
      setOrderError(t.invalidOrderId);
      setLoadingOrder(false);
      return;
    }

    setLoadingOrder(true);
    setOrderError(null);

    const unsubscribe = subscribeToOrder(
      orderId,
      (updatedOrder) => {
        setOrder(updatedOrder);
        setLoadingOrder(false);
      },
      (err) => {
        console.error("Gagal berlangganan pesanan:", err);
        setOrderError(t.orderNotFound);
        setLoadingOrder(false);
      }
    );

    return () => unsubscribe();
  }, [orderId, t.invalidOrderId, t.orderNotFound]);

  // Cleanup object URL preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    setUploadError(null);
    setSuccess(false);
    setFailedFileId(undefined);
    setFailedChunkIndex(undefined);

    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setImagePreview(null);
      return;
    }

    // Validate MIME and size up-front (Requirement 7.4 & 7.5)
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setValidationError(t.mimeError);
      } else {
        setValidationError(t.sizeError);
      }
      setSelectedFile(null);
      setImagePreview(null);
      return;
    }

    setSelectedFile(file);

    // Create 300x300 preview (Requirement 7.8)
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  // Safe Cascade Delete of previous proof (Requirement 7.12)
  const deletePreviousProof = async (proofFileIdRef: string) => {
    try {
      const fileId = proofFileIdRef.replace("payment_proofs/", "");
      const docRef = doc(db, "payment_proofs", fileId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const totalChunks = data.totalChunks || 0;

        // Delete all chunks first
        const deletePromises: Promise<void>[] = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkRef = doc(db, "payment_proofs", fileId, "chunks", String(i));
          deletePromises.push(deleteDoc(chunkRef));
        }
        await Promise.all(deletePromises);

        // Delete parent file doc
        await deleteDoc(docRef);
        console.log("Bukti pembayaran lama berhasil dihapus.");
      }
    } catch (err) {
      console.warn("Gagal menghapus bukti pembayaran lama. Melanjutkan unggahan baru...", err);
    }
  };

  const handleUpload = async (isRetry = false) => {
    if (!order || !selectedFile || !orderId) return;

    setUploading(true);
    setUploadError(null);

    try {
      // If payment was rejected and order has an existing proof, clean it up first (Requirement 7.12)
      if (!isRetry && order.status === "PAYMENT_REJECTED" && order.proofFileIds && order.proofFileIds.length > 0) {
        // Wait, the order might have proofFileIds or paymentProofFileId on Firestore.
        // Let's check both `paymentProofFileId` (our new field) or the first item of `proofFileIds`.
        const oldRef = order.paymentProofFileId || (order.proofFileIds && order.proofFileIds[0]);
        if (oldRef) {
          await deletePreviousProof(oldRef);
        }
      }

      if (isRetry && failedFileId && failedChunkIndex !== undefined) {
        // Resume chunk upload from failed chunk (Requirement 7.10)
        await uploadFileInChunks(selectedFile, {
          collection: "payment_proofs",
          orderId,
          resumeFileId: failedFileId,
          resumeFromChunk: failedChunkIndex,
          onProgress: (p) => setProgressPercent(p.percent),
        });

        // Attach completed proof to order
        await uploadPaymentProof(orderId, selectedFile); // Let paymentProofService handle attach
      } else {
        // Normal upload
        await uploadPaymentProof(orderId, selectedFile, (p) => {
          setProgressPercent(p.percent);
        });
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/orders");
      }, 2000);
    } catch (err: unknown) {
      console.error("Gagal mengunggah bukti pembayaran:", err);
      if (err instanceof ChunkUploadError && err.code === "WRITE_FAILED") {
        setFailedFileId(err.fileId);
        setFailedChunkIndex(err.failedChunkIndex);
        setUploadError(t.uploadInterrupted.replace("{chunk}", String(err.failedChunkIndex || 0)));
      } else {
        const errorObj = err as { message?: string };
        setUploadError(errorObj.message || t.uploadFailed);
      }
    } finally {
      setUploading(false);
    }
  };

  if (loadingOrder) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F4F6] text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingOrder}</p>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {orderError || t.invalidOrder}
        </p>
        <Link to="/orders" className="inline-flex min-h-11 px-6 bg-[#111827] rounded-2xl items-center font-bold text-white">
          {t.viewOrders}
        </Link>
      </div>
    );
  }

  const isUploadAllowed = order.status === "AWAITING_PAYMENT_PROOF" || order.status === "PAYMENT_REJECTED";

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20">
      {/* Sticky Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to={`/orders/${encodeURIComponent(orderId || "")}`}
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          aria-label={t.changeImage}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {t.uploadTitle}
        </h1>
      </div>

      <div className="p-4 space-y-4 max-w-[480px] mx-auto">
        {/* Order Details Header */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#6B7280]">{t.orderIdHeader}</span>
            <span className="font-mono font-bold text-[#111827]">{order.id}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#6B7280]">{t.methodHeader}</span>
            <span className="font-bold text-[#111827]">
              {order.status === "PAYMENT_REJECTED" ? t.paymentRejected : t.bankTransferEwallet}
            </span>
          </div>
          {order.status === "PAYMENT_REJECTED" && order.rejectionReason && (
            <div className="bg-red-50 border border-red-200 text-red-900 p-3 rounded-2xl text-xs font-['Hanken_Grotesk',system-ui,sans-serif]">
              <span className="font-bold block mb-1">{t.rejectionReasonTitle}</span>
              <p className="leading-relaxed">{order.rejectionReason}</p>
            </div>
          )}
        </div>

        {/* Upload Card */}
        {isUploadAllowed ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-5 text-center">
            {/* File Input */}
            <div className="space-y-3">
              {!imagePreview ? (
                <label className="flex flex-col items-center justify-center aspect-[4/3] w-full border-2 border-dashed border-[#D1D5DB] rounded-3xl bg-[#F9FAFB] cursor-pointer hover:bg-[#F3F4F6] transition-colors p-6">
                  <Upload className="h-10 w-10 text-[#9CA3AF] mb-2" />
                  <span className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                    {t.selectImage}
                  </span>
                  <span className="text-[11px] text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-1">
                    {t.limitDesc}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg, image/png, image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </label>
              ) : (
                <div className="space-y-4">
                  {/* Preview (Requirement 7.8 - Max size 300x300 px) */}
                  <div className="relative mx-auto border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] max-w-[300px] max-h-[300px] aspect-square flex items-center justify-center">
                    <img
                      src={imagePreview}
                      alt={t.altPreview}
                      className="max-h-[300px] max-w-[300px] object-contain"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setImagePreview(null);
                      setValidationError(null);
                    }}
                    className="text-xs font-bold text-[#6B7280] underline hover:text-[#111827] focus:outline-none"
                    disabled={uploading}
                  >
                    {t.changeImage}
                  </button>
                </div>
              )}

              {validationError && (
                <p className="text-xs font-semibold text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {validationError}
                </p>
              )}
            </div>

            {/* Upload Action */}
            {selectedFile && !validationError && (
              <div className="space-y-4">
                {uploading ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-[#111827]">
                      <span>{t.uploadingStatus}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-[#E5E7EB] rounded-full h-2 overflow-hidden">
                      <div ref={progressBarRef} className="bg-[#FBBF24] h-full transition-all duration-300 rounded-full" />
                    </div>
                  </div>
                ) : success ? (
                  <div className="flex flex-col items-center justify-center py-2 text-emerald-600 gap-1 font-semibold text-sm animate-bounce">
                    <CheckCircle2 className="h-6 w-6" />
                    {t.uploadSuccess}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {uploadError && (
                      <p className="text-xs font-semibold text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif] bg-red-50 border border-red-200 rounded-xl p-3 text-left flex gap-1.5 items-start">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{uploadError}</span>
                      </p>
                    )}

                    {failedChunkIndex !== undefined ? (
                      <button
                        type="button"
                        onClick={() => handleUpload(true)}
                        className="w-full flex items-center justify-center gap-2 min-h-12 bg-emerald-600 hover:bg-emerald-700 text-sm font-bold text-white rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        <RefreshCw className="h-4 w-4" />
                        {t.resumeUpload} (Chunk {failedChunkIndex})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpload(false)}
                        className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        {t.uploadTitle}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 shadow-sm text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
              {t.proofSubmitted}
            </h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {t.verificationDesc}
            </p>
            <Link
              to="/orders"
              className="inline-flex min-h-11 px-6 bg-[#111827] text-white hover:bg-neutral-800 rounded-2xl items-center font-bold"
            >
              {t.backToOrders}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentProofUploadPage;
