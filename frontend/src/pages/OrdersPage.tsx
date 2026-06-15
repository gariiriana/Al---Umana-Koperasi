import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Calendar, Copy, ExternalLink, AlertTriangle, ShieldCheck, CheckCircle2, User, Phone, FileDown, X, Loader2, Upload, Eye, Image as ImageIcon, Trash2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import { transitionOrder, updatePaymentStatus, manuallyValidateOrder, updateAdminNotes, deleteOrder, type TransitionAction } from "@/services/orderService";
import type { Order, OrderStatus, PaymentStatus } from "@/types/order";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { ManualValidationModal } from "@/admin/pages/ManualValidationModal";
import { formatIDR } from "@/lib/format";
import { ProductImage } from "@/components/ProductImage";
import html2canvas from "html2canvas";
import { aggregateIngredients } from "@/lib/ingredientsParser";
import { getProduct } from "@/services/catalogService";

const statusShortLabels: Record<OrderStatus, string> = {
  PENDING: "Pending",
  IN_PRODUCTION: "Produksi",
  QC: "QC",
  READY_TO_DELIVER: "Siap",
  OUT_FOR_DELIVERY: "Kirim",
  COMPLETED: "Selesai",
  DELIVERY_FAILED: "Gagal",
  PLACING: "Proses",
  AWAITING_PAYMENT_PROOF: "Menunggu",
  AWAITING_PAYMENT_APPROVAL: "Verifikasi",
  PAYMENT_REJECTED: "Ditolak",
  CONFIRMED: "Konfirm",
  READY: "QC",
  DELIVERED: "Selesai",
  FAILED: "Gagal",
};

const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        
        // Downscale to a maximum dimension of 256px to save space
        const maxDim = 256;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(null);
        }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve(null);
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.error("Error loading image for PDF:", err);
    return null;
  }
};

const fetchImageBase64 = async (
  fileId: string,
  collectionName: "payment_proofs" | "delivery_files" = "payment_proofs"
): Promise<string | null> => {
  try {
    const cleanId = fileId.replace(`${collectionName}/`, "");
    const parentRef = doc(db, collectionName, cleanId);
    const parentSnap = await getDoc(parentRef);
    if (!parentSnap.exists()) return null;
    
    const meta = parentSnap.data();
    const totalChunks = meta.totalChunks || 0;
    
    const chunkPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkRef = doc(db, collectionName, cleanId, "chunks", String(i));
      chunkPromises.push(getDoc(chunkRef));
    }
    const chunkSnaps = await Promise.all(chunkPromises);
    
    let fullDataUri = "";
    for (const chunkSnap of chunkSnaps) {
      if (chunkSnap.exists()) {
        fullDataUri += chunkSnap.data().data || "";
      }
    }
    return fullDataUri || null;
  } catch (err) {
    console.error(`Error fetching image base64 from ${collectionName}:`, err);
    return null;
  }
};

export function OrdersPage() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const isMonitoring = profile?.role === "monitoring";
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">(() => {
    const fromUrl = searchParams.get("status");
    if (fromUrl) return fromUrl as OrderStatus;
    return "ALL";
  });
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "ALL">("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // Modal states
  const [validationTargetId, setValidationTargetId] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [previewInvoiceOrder, setPreviewInvoiceOrder] = useState<Order | null>(null);

  // Manual validation screenshot states
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState<string | null>(null);
  const [exportingJpgOrder, setExportingJpgOrder] = useState<Order | null>(null);
  const [exportingJpgOrderId, setExportingJpgOrderId] = useState<string | null>(null);

  // Payment proof states
  const [proofImageSrc, setProofImageSrc] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Production start photo states
  const [productionStartPhotoSrc, setProductionStartPhotoSrc] = useState<string | null>(null);
  const [loadingProductionPhoto, setLoadingProductionPhoto] = useState(false);

  // Courier start OTW photo states
  const [courierStartPhotoSrc, setCourierStartPhotoSrc] = useState<string | null>(null);
  const [loadingCourierStartPhoto, setLoadingCourierStartPhoto] = useState(false);

  // Courier delivery proof photo states
  const [courierProofPhotoSrcs, setCourierProofPhotoSrcs] = useState<string[]>([]);
  const [loadingCourierProofPhotos, setLoadingCourierProofPhotos] = useState(false);

  // Admin internal/complaint notes and uploader states
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotesText, setEditNotesText] = useState("");
  const [editNotesPhotoId, setEditNotesPhotoId] = useState<string | null>(null);
  const [complaintPhotoFile, setComplaintPhotoFile] = useState<File | null>(null);
  const [complaintPhotoPreview, setComplaintPhotoPreview] = useState<string | null>(null);
  const [complaintPhotoSrc, setComplaintPhotoSrc] = useState<string | null>(null);
  const [loadingComplaintPhoto, setLoadingComplaintPhoto] = useState(false);
  const [uploadingComplaint, setUploadingComplaint] = useState(false);
  const [uploadComplaintProgress, setUploadComplaintProgress] = useState(0);
  const [savingNotes, setSavingNotes] = useState(false);

  // Active edit state for inline row complaint notes
  const [activeEditRowId, setActiveEditRowId] = useState<string | null>(null);
  const [rowComplaintPhotoSrcs, setRowComplaintPhotoSrcs] = useState<Record<string, string>>({});
  const [loadingRowPhotoIds, setLoadingRowPhotoIds] = useState<Record<string, boolean>>({});


  useEffect(() => {
    if (!previewInvoiceOrder) {
      setScreenshotSrc(null);
      setProofImageSrc(null);
      setProductionStartPhotoSrc(null);
      setComplaintPhotoSrc(null);
      setCourierStartPhotoSrc(null);
      setCourierProofPhotoSrcs([]);
      setIsEditingNotes(false);
      setEditNotesText("");
      setEditNotesPhotoId(null);
      setComplaintPhotoFile(null);
      setComplaintPhotoPreview(null);
      return;
    }

    // Reset edit states for this order
    setIsEditingNotes(false);
    setEditNotesText(previewInvoiceOrder.adminComplaintNotes || "");
    setEditNotesPhotoId(previewInvoiceOrder.adminComplaintPhotoId || null);
    setComplaintPhotoFile(null);
    setComplaintPhotoPreview(null);

    const screenshotIds = previewInvoiceOrder.manualValidation?.screenshotFileIds;
    if (screenshotIds && screenshotIds.length > 0) {
      const loadScreenshot = async () => {
        setLoadingScreenshot(true);
        try {
          const dataUri = await fetchImageBase64(screenshotIds[0], "delivery_files");
          setScreenshotSrc(dataUri);
        } catch (err) {
          console.error("Error loading validation screenshot:", err);
        } finally {
          setLoadingScreenshot(false);
        }
      };
      loadScreenshot();
    } else {
      setScreenshotSrc(null);
    }

    const proofFileId = previewInvoiceOrder.paymentProofFileId;
    if (proofFileId) {
      const loadProof = async () => {
        setLoadingProof(true);
        try {
          const dataUri = await fetchImageBase64(proofFileId);
          setProofImageSrc(dataUri);
        } catch (err) {
          console.error("Error loading payment proof:", err);
        } finally {
          setLoadingProof(false);
        }
      };
      loadProof();
    } else {
      setProofImageSrc(null);
    }

    const productionPhotoId = previewInvoiceOrder.productionStartPhotoId;
    if (productionPhotoId) {
      const loadProductionPhoto = async () => {
        setLoadingProductionPhoto(true);
        try {
          const dataUri = await fetchImageBase64(productionPhotoId, "delivery_files");
          setProductionStartPhotoSrc(dataUri);
        } catch (err) {
          console.error("Error loading production start photo:", err);
        } finally {
          setLoadingProductionPhoto(false);
        }
      };
      loadProductionPhoto();
    } else {
      setProductionStartPhotoSrc(null);
    }

    const complaintPhotoId = previewInvoiceOrder.adminComplaintPhotoId;
    if (complaintPhotoId) {
      const loadComplaintPhoto = async () => {
        setLoadingComplaintPhoto(true);
        try {
          const dataUri = await fetchImageBase64(complaintPhotoId, "delivery_files");
          setComplaintPhotoSrc(dataUri);
        } catch (err) {
          console.error("Error loading complaint photo:", err);
        } finally {
          setLoadingComplaintPhoto(false);
        }
      };
      loadComplaintPhoto();
    } else {
      setComplaintPhotoSrc(null);
    }

    const courierStartPhotoId = previewInvoiceOrder.deliveryStartPhotoId;
    if (courierStartPhotoId) {
      const loadCourierStartPhoto = async () => {
        setLoadingCourierStartPhoto(true);
        try {
          const dataUri = await fetchImageBase64(courierStartPhotoId, "delivery_files");
          setCourierStartPhotoSrc(dataUri);
        } catch (err) {
          console.error("Error loading courier start photo:", err);
        } finally {
          setLoadingCourierStartPhoto(false);
        }
      };
      loadCourierStartPhoto();
    } else {
      setCourierStartPhotoSrc(null);
    }

    const courierProofFileIds = previewInvoiceOrder.proofFileIds;
    if (courierProofFileIds && courierProofFileIds.length > 0) {
      const loadCourierProofPhotos = async () => {
        setLoadingCourierProofPhotos(true);
        try {
          const promises = courierProofFileIds.map((id) => fetchImageBase64(id, "delivery_files"));
          const results = await Promise.all(promises);
          setCourierProofPhotoSrcs(results.filter((res): res is string => !!res));
        } catch (err) {
          console.error("Error loading courier proof photos:", err);
        } finally {
          setLoadingCourierProofPhotos(false);
        }
      };
      loadCourierProofPhotos();
    } else {
      setCourierProofPhotoSrcs([]);
    }
  }, [previewInvoiceOrder]);

  useEffect(() => {
    return subscribeOrders(setOrders, (err) => {
      console.error(err);
      showToast({ message: "Gagal menyambung ke Firestore", variant: "error" });
    });
  }, [showToast]);

  const handleCopyLink = (order: Order) => {
    if (!order.invoiceToken) {
      showToast({ message: "Invoice token tidak ditemukan untuk pesanan ini.", variant: "error" });
      return;
    }
    const url = `${window.location.origin}/invoice/${order.invoiceToken}`;
    navigator.clipboard.writeText(url);
    setCopiedOrderId(order.id);
    showToast({ message: "Link invoice disalin ke clipboard", variant: "success" });
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  const handleUpdatePaymentStatus = async (orderId: string, status: PaymentStatus) => {
    try {
      await updatePaymentStatus(orderId, status);
      showToast({ message: `Status pembayaran diperbarui ke ${status}`, variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal memperbarui status pembayaran", variant: "error" });
    }
  };

  const handleTransition = async (orderId: string, action: TransitionAction, reason?: string) => {
    setTransitioningId(orderId);
    try {
      await transitionOrder(orderId, { action, reason });
      showToast({ message: `Aksi ${action} sukses diproses`, variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: err instanceof Error ? err.message : "Gagal memproses aksi status", variant: "error" });
    } finally {
      setTransitioningId(null);
    }
  };

  const handleManualValidationConfirm = async (data: { contactPhone: string; screenshotFileIds: string[]; notes: string }) => {
    if (!validationTargetId) return;
    try {
      await manuallyValidateOrder(validationTargetId, data);
      showToast({ message: "Verifikasi manual berhasil disimpan!", variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal menyimpan verifikasi manual", variant: "error" });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus pesanan ini secara permanen dari sistem?")) return;
    try {
      await deleteOrder(orderId);
      showToast({ message: "Pesanan berhasil dihapus", variant: "success" });
    } catch (err) {
      console.error("Error deleting order:", err);
      showToast({ message: "Gagal menghapus pesanan", variant: "error" });
    }
  };

  const handleComplaintFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file
    const isImage = file.type.startsWith("image/");
    const isSizeOk = file.size <= 15 * 1024 * 1024; // 15MB
    if (!isImage || !isSizeOk) {
      showToast({
        message: !isImage
          ? "Format file tidak didukung. Harap pilih gambar."
          : "Ukuran file terlalu besar (maksimal 15 MB).",
        variant: "error"
      });
      return;
    }
    
    setComplaintPhotoFile(file);
    setComplaintPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveNotes = async () => {
    if (!previewInvoiceOrder) return;
    setSavingNotes(true);
    setUploadingComplaint(true);
    
    try {
      let finalPhotoId = editNotesPhotoId;
      
      // If there is a new file, upload it in chunks first
      if (complaintPhotoFile) {
        const uploadResult = await uploadFileInChunks(complaintPhotoFile, {
          orderId: previewInvoiceOrder.id,
          onProgress: (p) => setUploadComplaintProgress(Math.round(p.fraction * 100)),
        });
        finalPhotoId = uploadResult.fileId;
      }
      
      // Save notes and photo uploader reference onto the order
      const updatedOrder = await updateAdminNotes(previewInvoiceOrder.id, {
        notes: editNotesText,
        photoFileId: finalPhotoId,
      });
      
      // Update preview state with updated order to reflect changes in UI
      setPreviewInvoiceOrder(updatedOrder);
      
      showToast({ message: "Catatan internal admin berhasil disimpan!", variant: "success" });
      setIsEditingNotes(false);
      setComplaintPhotoFile(null);
      setComplaintPhotoPreview(null);
    } catch (err) {
      console.error("Error saving admin notes:", err);
      showToast({
        message: err instanceof Error ? err.message : "Gagal menyimpan catatan admin",
        variant: "error",
      });
    } finally {
      setSavingNotes(false);
      setUploadingComplaint(false);
      setUploadComplaintProgress(0);
    }
  };

  const handleSaveNotesInline = async () => {
    if (!activeEditRowId) return;
    const targetOrder = filteredOrders.find((o) => o.id === activeEditRowId);
    if (!targetOrder) return;
    
    setSavingNotes(true);
    setUploadingComplaint(true);
    
    try {
      let finalPhotoId = editNotesPhotoId;
      
      // If there is a new file, upload it in chunks first
      if (complaintPhotoFile) {
        const uploadResult = await uploadFileInChunks(complaintPhotoFile, {
          orderId: targetOrder.id,
          onProgress: (p) => setUploadComplaintProgress(Math.round(p.fraction * 100)),
        });
        finalPhotoId = uploadResult.fileId;
      }
      
      // Save notes and photo uploader reference onto the order
      const updatedOrder = await updateAdminNotes(targetOrder.id, {
        notes: editNotesText,
        photoFileId: finalPhotoId,
      });
      
      // Update loaded row photos cache if needed
      if (finalPhotoId) {
        // If we have a preview data URL, cache it to avoid refetching
        if (complaintPhotoPreview) {
          setRowComplaintPhotoSrcs(prev => ({ ...prev, [targetOrder.id]: complaintPhotoPreview }));
        }
      } else if (finalPhotoId === null || finalPhotoId === "") {
        setRowComplaintPhotoSrcs(prev => {
          const updated = { ...prev };
          delete updated[targetOrder.id];
          return updated;
        });
      }
      
      // Also update previewInvoiceOrder if it's currently open
      if (previewInvoiceOrder?.id === targetOrder.id) {
        setPreviewInvoiceOrder(updatedOrder);
      }
      
      showToast({ message: "Catatan internal admin berhasil disimpan!", variant: "success" });
      setActiveEditRowId(null);
      setComplaintPhotoFile(null);
      setComplaintPhotoPreview(null);
    } catch (err) {
      console.error("Error saving admin notes inline:", err);
      showToast({
        message: err instanceof Error ? err.message : "Gagal menyimpan catatan admin",
        variant: "error",
      });
    } finally {
      setSavingNotes(false);
      setUploadingComplaint(false);
      setUploadComplaintProgress(0);
    }
  };

  const handleStartEditNotes = async (order: Order) => {
    setActiveEditRowId(order.id);
    setEditNotesText(order.adminComplaintNotes || "");
    setEditNotesPhotoId(order.adminComplaintPhotoId || null);
    setComplaintPhotoFile(null);
    setComplaintPhotoPreview(null);
    
    if (order.adminComplaintPhotoId) {
      if (rowComplaintPhotoSrcs[order.id]) {
        setComplaintPhotoSrc(rowComplaintPhotoSrcs[order.id]);
      } else {
        setLoadingComplaintPhoto(true);
        try {
          const dataUri = await fetchImageBase64(order.adminComplaintPhotoId, "delivery_files");
          if (dataUri) {
            setComplaintPhotoSrc(dataUri);
            setRowComplaintPhotoSrcs(prev => ({ ...prev, [order.id]: dataUri }));
          } else {
            setComplaintPhotoSrc(null);
          }
        } catch (err) {
          console.error("Error loading complaint photo for editing:", err);
          setComplaintPhotoSrc(null);
        } finally {
          setLoadingComplaintPhoto(false);
        }
      }
    } else {
      setComplaintPhotoSrc(null);
    }
  };

  const handleLoadRowPhoto = async (orderId: string, photoId: string) => {
    if (rowComplaintPhotoSrcs[orderId]) return; // already loaded
    setLoadingRowPhotoIds(prev => ({ ...prev, [orderId]: true }));
    try {
      const dataUri = await fetchImageBase64(photoId, "delivery_files");
      if (dataUri) {
        setRowComplaintPhotoSrcs(prev => ({ ...prev, [orderId]: dataUri }));
      }
    } catch (err) {
      console.error("Error loading row photo:", err);
    } finally {
      setLoadingRowPhotoIds(prev => ({ ...prev, [orderId]: false }));
    }
  };


  // Due date warnings logic
  const getDueDateInfo = (order: Order) => {
    if (order.paymentStatus === "SUDAH_DIBAYAR") return { isOverdue: false, isWarning: false, label: "Lunas" };
    const dueDate = new Date(order.paymentDueDate);
    const now = new Date();
    const isOverdue = dueDate < now;
    
    // Warning if less than 24 hours away
    const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isWarning = !isOverdue && diffHours <= 24;

    return {
      isOverdue,
      isWarning,
      label: isOverdue ? "Terlambat" : isWarning ? "Jatuh tempo segera" : "Belum Dibayar"
    };
  };

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    const query = search.toLowerCase();
    const matchSearch =
      o.institutionName.toLowerCase().includes(query) ||
      o.recipientName.toLowerCase().includes(query) ||
      o.recipientPhone.includes(query) ||
      o.id.toLowerCase().includes(query);

    const matchStatus = statusFilter === "ALL" ? true : o.status === statusFilter;
    const matchPayment = paymentFilter === "ALL" ? true : o.paymentStatus === paymentFilter;

    const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
    const matchStartDate = startDate ? oDate >= startDate : true;
    const matchEndDate = endDate ? oDate <= endDate : true;

    return matchSearch && matchStatus && matchPayment && matchStartDate && matchEndDate;
  });

  const exportSingleOrderToPDF = async (order: Order) => {
    setExportingOrderId(order.id);
    try {
      const itemsWithImages = await Promise.all(
        order.items.map(async (it) => {
          let base64: string | null = null;
          try {
            const product = await getProduct(it.itemId);
            if (product && product.imageUrl) {
              base64 = await getBase64ImageFromUrl(product.imageUrl);
            }
          } catch (e) {
            console.error(`Failed to get product image for item ${it.itemId}:`, e);
          }
          return {
            ...it,
            imageBase64: base64,
          };
        })
      );

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      
      const brandGold: [number, number, number] = [217, 119, 6];       // #D97706
      const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309
      const brandYellowCream: [number, number, number] = [255, 253, 245]; // #FFFDF5
      const brandYellowBorder: [number, number, number] = [253, 230, 138]; // #FDE68A
      const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280
      const white: [number, number, number] = [255, 255, 255];

      let y = 14;

      // Load Logo
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 14, 12, 20, 20);
      }

      const titleX = logoBase64 ? 38 : 14;

      // Company/Koperasi Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...brandAmberDark);
      doc.text("KOPERASI AL-UMANAA", titleX, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...slateLight);
      doc.text("Pesantren Al-Umanaa, Sukabumi, Jawa Barat", titleX, 23);
      doc.text("Sistem Informasi Manajemen Order & Logistik", titleX, 27);

      // Invoice status badge on the top right
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...brandAmberDark);
      doc.text("INVOICE RESMI", pageW - 14, 18, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      doc.text(`ID Pesanan: #${order.id.toUpperCase()}`, pageW - 14, 23, { align: "right" });

      // Elegant separator line
      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.6);
      doc.line(14, 34, pageW - 14, 34);

      // Client and Invoice Meta Grid (Left: Delivery details, Right: Invoice details)
      y = 42;

      // Left Column: Penerima & Pengiriman
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...brandAmberDark);
      doc.text("DETAIL PENGIRIMAN & ACARA", 14, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      y += 5;
      doc.text(`Instansi: ${order.institutionName}`, 14, y);
      y += 4;
      if (order.customerName) {
        doc.text(`Pemesan: ${order.customerName}`, 14, y);
        y += 4;
        doc.text(`Penerima: ${order.recipientName}`, 14, y);
        y += 4;
      } else {
        doc.text(`Pemesan: ${order.recipientName}`, 14, y);
        y += 4;
      }
      doc.text(`Telepon: ${order.recipientPhone}`, 14, y);
      y += 4;
      
      // Address can be long, so let's wrap it
      const addressLines = doc.splitTextToSize(`Alamat: ${order.deliveryAddress}`, (pageW / 2) - 14);
      doc.text(addressLines, 14, y);
      
      // Calculate space occupied by address
      const addressHeight = addressLines.length * 4;

      // Right Column: Invoice Info
      let rightY = 42;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...brandAmberDark);
      doc.text("INFORMASI TAGIHAN", pageW / 2 + 10, rightY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      rightY += 5;
      doc.text(`Tanggal Input: ${new Date(order.createdAt).toLocaleDateString("id-ID")}`, pageW / 2 + 10, rightY);
      rightY += 4;
      const pFormat = (dStr: string) => {
        if (!dStr) return "—";
        const dObj = new Date(dStr);
        if (isNaN(dObj.getTime())) return dStr;
        const fd = dObj.toLocaleDateString("id-ID");
        if (dStr.includes("T")) {
          const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
          return `${fd} ${ft}`;
        }
        return fd;
      };
      doc.text(`Jam Pemberangkatan: ${pFormat(order.eventDate)}`, pageW / 2 + 10, rightY);
      rightY += 4;
      doc.text(`Harus Sampai: ${order.deliveryTime}`, pageW / 2 + 10, rightY);
      rightY += 4;
      doc.setFont("helvetica", "bold");
      doc.text(`Jatuh Tempo: ${new Date(order.paymentDueDate).toLocaleDateString("id-ID")}`, pageW / 2 + 10, rightY);
      
      // Determine the max Y between the two columns
      y = Math.max(y + addressHeight, rightY + 6);

      // Separator before items
      doc.setDrawColor(...brandYellowBorder);
      doc.setLineWidth(0.3);
      doc.line(14, y, pageW - 14, y);
      y += 6;

      // Table of Items
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...brandAmberDark);
      doc.text("RINCIAN PESANAN", 14, y);
      y += 4;

      const tableItemsBody = itemsWithImages.map((it) => {
        let nameText = it.itemName;
        if (it.recipientName || it.deliveryAddress || it.deliveryTime) {
          nameText += `\n*Kirim ke: ${it.recipientName || "—"} - ${it.deliveryAddress ? it.deliveryAddress.split(" | ")[0] : "—"} - ${it.deliveryTime ? it.deliveryTime.replace("T", " ") : "—"}`;
        }
        return [
          "", // placeholder for image column
          nameText,
          order.isPreOrder ? "Pra-pesanan" : `× ${it.quantity}`
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Foto", "Menu / Barang", "Jumlah (Porsi / Unit)"]],
        body: tableItemsBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3 },
        bodyStyles: { fontSize: 8.5, textColor: slateDark, cellPadding: 3, minCellHeight: 14, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 16, halign: "center" },
          1: { cellWidth: pageW - 28 - 16 - 30 },
          2: { halign: "center", cellWidth: 30, fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 0) {
            const item = itemsWithImages[data.row.index];
            if (item && item.imageBase64) {
              const cell = data.cell;
              const imgSize = 10; // 10mm x 10mm
              const imgX = cell.x + (cell.width - imgSize) / 2;
              const imgY = cell.y + (cell.height - imgSize) / 2;
              try {
                doc.addImage(item.imageBase64, "PNG", imgX, imgY, imgSize, imgSize);
              } catch (e) {
                console.error("Failed to add cell image to PDF:", e);
              }
            } else {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(8);
              doc.setTextColor(150, 150, 150);
              doc.text("-", data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: "center" });
            }
          }
        }
      });

      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // Food/Drink Details Notes & Grand Total
      const notesLines: string[] = [];
      if (order.foodDetails) notesLines.push(`Request Menu: ${order.foodDetails}`);
      if (order.drinkDetails) notesLines.push(`Detail Minuman: ${order.drinkDetails}`);
      if (order.recipientNotes) notesLines.push(`Catatan Lokasi: ${order.recipientNotes}`);

      let notesHeight = 0;
      let wrappedNotes: string[] = [];
      if (notesLines.length > 0) {
        wrappedNotes = doc.splitTextToSize(notesLines.join("\n"), pageW - 36);
        notesHeight = wrappedNotes.length * 4 + 8;
      }

      const spaceNeeded = notesHeight + 15 + 40;
      if (y + spaceNeeded > pageH - 20) {
        doc.addPage();
        y = 20;
      }

      // Render Notes card if exists
      if (notesLines.length > 0) {
        doc.setFillColor(...brandYellowCream);
        doc.setDrawColor(...brandYellowBorder);
        doc.setLineWidth(0.4);
        doc.rect(14, y, pageW - 28, notesHeight, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...brandAmberDark);
        doc.text("CATATAN DETAIL HIDANGAN & LOKASI", 18, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...slateDark);
        doc.text(wrappedNotes, 18, y + 10);
        y += notesHeight + 6;
      }

      // Grand Total box with detailed breakdown
      const discountAmount = order.discountAmount || 0;
      const subtotal = order.totalPrice + discountAmount - (order.additionalFee || 0);

      const rows: { label: string; value: string; isBold?: boolean; color?: [number, number, number] }[] = [];
      rows.push({ label: "Subtotal Menu:", value: `Rp ${subtotal.toLocaleString("id-ID")}` });
      if (discountAmount > 0) {
        rows.push({
          label: `Diskon Promo (${order.promoCode || "PROMO"}):`,
          value: `-Rp ${discountAmount.toLocaleString("id-ID")}`,
          isBold: true,
          color: [5, 150, 105], // Green
        });
      }
      if (order.additionalFee && order.additionalFee > 0) {
        rows.push({
          label: "Biaya Tambahan:",
          value: `Rp ${order.additionalFee.toLocaleString("id-ID")}`,
        });
      }

      const rowHeight = 5.5;
      const numRows = rows.length;
      const separatorOffset = 1.5;
      const grandTotalSpace = 8;
      const boxPadding = 5;
      const boxHeight = boxPadding * 2 + (numRows * rowHeight) + separatorOffset + grandTotalSpace;

      doc.setFillColor(...brandYellowCream);
      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.rect(14, y, pageW - 28, boxHeight, "FD");

      let currentY = y + boxPadding + 3;
      doc.setFontSize(8.5);

      for (const row of rows) {
        doc.setFont("helvetica", row.isBold ? "bold" : "normal");
        if (row.color) {
          doc.setTextColor(...row.color);
        } else {
          doc.setTextColor(...slateDark);
        }
        doc.text(row.label, 18, currentY);
        doc.text(row.value, pageW - 18, currentY, { align: "right" });
        currentY += rowHeight;
      }

      // Draw line separator inside box
      currentY -= (rowHeight - separatorOffset);
      doc.setDrawColor(...brandYellowBorder);
      doc.setLineWidth(0.3);
      doc.line(18, currentY, pageW - 18, currentY);

      currentY += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...brandAmberDark);
      doc.text("GRAND TOTAL TAGIHAN:", 18, currentY);
      doc.text(`Rp ${order.totalPrice.toLocaleString("id-ID")}`, pageW - 18, currentY, { align: "right" });

      y += boxHeight + 8;

      // Aggregated Ingredients Composition
      const ingredients = !order.isPreOrder ? aggregateIngredients(order.items) : [];
      if (ingredients.length > 0) {
        const ingHeight = 8 + (ingredients.length * 5) + 6;
        if (y + ingHeight > pageH - 20) {
          doc.addPage();
          y = 20;
        }

        doc.setFillColor(...brandYellowCream);
        doc.setDrawColor(...brandYellowBorder);
        doc.setLineWidth(0.4);
        doc.rect(14, y, pageW - 28, ingHeight, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...brandAmberDark);
        doc.text("TOTAL KEBUTUHAN BAHAN (KOMPOSISI TOTAL)", 18, y + 5);

        let ingY = y + 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...slateDark);

        for (const ing of ingredients) {
          doc.text(`• ${ing.name}`, 18, ingY);
          doc.text(`${ing.amount} ${ing.unit}`, pageW - 18, ingY, { align: "right" });
          ingY += 5;
        }
        y += ingHeight + 8;
      }

      // Digital Signature / Manual Validation Render
      if (order.invoiceSignedAt && order.invoiceSignatureData) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...brandAmberDark);
        doc.text("TANDA TANGAN DIGITAL VALID (PELANGGAN)", 14, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...slateLight);
        doc.text(`Diverifikasi pada: ${new Date(order.invoiceSignedAt).toLocaleString("id-ID")}`, 14, y);
        y += 4;

        doc.addImage(order.invoiceSignatureData, "PNG", 14, y, 50, 20);
      } else if (order.manualValidation) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...brandAmberDark);
        doc.text("VERIFIKASI & VALIDASI MANUAL (ADMIN)", 14, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...slateDark);
        doc.text(`Validator: ${order.manualValidation.validatedBy}`, 14, y);
        y += 4;
        doc.text(`Waktu Validasi: ${new Date(order.manualValidation.validatedAt).toLocaleString("id-ID")}`, 14, y);
        y += 4;
        doc.text(`No. Hubung: ${order.manualValidation.contactPhone}`, 14, y);
        y += 4;

        const notesWrap = doc.splitTextToSize(`Catatan Admin: ${order.manualValidation.notes}`, pageW - 28);
        doc.text(notesWrap, 14, y);
        y += (notesWrap.length * 4) + 4;

        const screenshotIds = order.manualValidation.screenshotFileIds;
        if (screenshotIds && screenshotIds.length > 0) {
          const screenshotDataUri = await fetchImageBase64(screenshotIds[0], "delivery_files");
          if (screenshotDataUri) {
            if (y + 65 > pageH - 15) {
              doc.addPage();
              y = 20;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(...brandAmberDark);
            doc.text("BUKTI FOTO / CHAT VALIDASI:", 14, y);
            y += 4;

            try {
              const format = screenshotDataUri.includes("image/png") ? "PNG" : "JPEG";
              doc.addImage(screenshotDataUri, format, 14, y, 80, 60);
            } catch (imgErr) {
              console.error("Error inserting screenshot into PDF:", imgErr);
              doc.setFont("helvetica", "italic");
              doc.setFontSize(8);
              doc.setTextColor(...slateLight);
              doc.text("[Gagal memuat format gambar bukti]", 14, y);
            }
          }
        }
      }

      // Admin Complaint Notes and Photo Proof (visible to admin on exported PDF)
      if (order.adminComplaintNotes || order.adminComplaintPhotoId) {
        y += 10;
        
        const complaintLines: string[] = [];
        if (order.adminComplaintNotes) {
          complaintLines.push(`Catatan Pengaduan: ${order.adminComplaintNotes}`);
        }
        
        let complaintHeight = 0;
        let wrappedComplaint: string[] = [];
        if (complaintLines.length > 0) {
          wrappedComplaint = doc.splitTextToSize(complaintLines.join("\n"), pageW - 28);
          complaintHeight = wrappedComplaint.length * 4 + 10;
        }

        const photoNeeded = !!order.adminComplaintPhotoId;
        const totalSpaceNeeded = complaintHeight + (photoNeeded ? 70 : 0) + 15;

        if (y + totalSpaceNeeded > pageH - 20) {
          doc.addPage();
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...brandAmberDark);
        doc.text("PENGADUAN & BUKTI ADMIN (INTERNAL)", 14, y);
        y += 5;

        if (complaintLines.length > 0) {
          doc.setFillColor(...brandYellowCream);
          doc.setDrawColor(...brandYellowBorder);
          doc.setLineWidth(0.4);
          doc.rect(14, y, pageW - 28, complaintHeight, "FD");

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...slateDark);
          doc.text(wrappedComplaint, 18, y + 6);
          y += complaintHeight + 6;
        }

        if (order.adminComplaintPhotoId) {
          const complaintPhotoDataUri = await fetchImageBase64(order.adminComplaintPhotoId, "delivery_files");
          if (complaintPhotoDataUri) {
            if (y + 65 > pageH - 15) {
              doc.addPage();
              y = 20;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(...brandAmberDark);
            doc.text("BUKTI FOTO PENGADUAN:", 14, y);
            y += 4;

            try {
              const format = complaintPhotoDataUri.includes("image/png") ? "PNG" : "JPEG";
              doc.addImage(complaintPhotoDataUri, format, 14, y, 80, 60);
              y += 65;
            } catch (imgErr) {
              console.error("Error inserting complaint screenshot into PDF:", imgErr);
              doc.setFont("helvetica", "italic");
              doc.setFontSize(8);
              doc.setTextColor(...slateLight);
              doc.text("[Gagal memuat format gambar bukti]", 14, y);
              y += 6;
            }
          }
        }
      }

      // Page border and decor
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        
        doc.setFillColor(...brandGold);
        doc.rect(0, 0, pageW, 2, "F");

        doc.setDrawColor(...brandYellowBorder);
        doc.setLineWidth(0.25);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `Koperasi Al-Umana • Invoice Resmi Pesanan #${order.id.toUpperCase()} • Halaman ${p} dari ${totalPages}`,
          pageW / 2, pageH - 8,
          { align: "center" }
        );
      }

      doc.save(`AlUmana_Invoice_${order.id.slice(-6).toUpperCase()}_${new Date(order.eventDate).toISOString().slice(0, 10)}.pdf`);
      showToast({ message: "PDF Invoice berhasil diunduh!", variant: "success" });
    } catch (error) {
      console.error("Gagal export PDF single:", error);
      showToast({ message: "Gagal memproses ekspor PDF", variant: "error" });
    } finally {
      setExportingOrderId(null);
    }
  };

  const exportSingleOrderToJPG = async (order: Order) => {
    setExportingJpgOrderId(order.id);
    setExportingJpgOrder(order);
    setTimeout(async () => {
      const el = document.getElementById("jpg-export-container");
      if (!el) {
        showToast({ message: "Gagal menemukan elemen invoice untuk JPG.", variant: "error" });
        setExportingJpgOrder(null);
        setExportingJpgOrderId(null);
        return;
      }
      try {
        const canvas = await html2canvas(el, {
          useCORS: true,
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false
        });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const link = document.createElement("a");
        const safeEventDate = order.eventDate ? order.eventDate.replace(/:/g, "-") : "no_date";
        link.download = `AlUmana_Invoice_${order.id.slice(-6).toUpperCase()}_${safeEventDate}.jpg`;
        link.href = dataUrl;
        link.click();
        showToast({ message: "JPG Invoice berhasil diunduh!", variant: "success" });
      } catch (err) {
        console.error("Gagal export JPG:", err);
        showToast({ message: "Gagal memproses ekspor JPG", variant: "error" });
      } finally {
        setExportingJpgOrder(null);
        setExportingJpgOrderId(null);
      }
    }, 300);
  };

  const exportOrdersToPDF = async () => {
    // Pre-load product images for all items in all filtered orders in parallel
    const allItemIds = Array.from(new Set(filteredOrders.flatMap(o => o.items.map(it => it.itemId))));
    
    const productMap: Record<string, string | null> = {};
    await Promise.all(
      allItemIds.map(async (id) => {
        try {
          const product = await getProduct(id);
          if (product && product.imageUrl) {
            const base64 = await getBase64ImageFromUrl(product.imageUrl);
            productMap[id] = base64;
          } else {
            productMap[id] = null;
          }
        } catch (e) {
          console.error("Failed to fetch product for bulk export:", e);
          productMap[id] = null;
        }
      })
    );

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    
    // Theme Colors
    const brandGold: [number, number, number] = [217, 119, 6];       // #D97706 (Brand gold)
    const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309 (Secondary brand)
    const brandYellowCream: [number, number, number] = [255, 253, 245]; // #FFFDF5 (Warm cream/white)
    const brandYellowBorder: [number, number, number] = [253, 230, 138]; // #FDE68A (Amber-200)
    const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
    const slateLight: [number, number, number] = [71, 85, 105];       // #475569
    const white: [number, number, number] = [255, 255, 255];
    
    let y = 14;

    // Load Logo
    const logoBase64 = await getBase64ImageFromUrl("/logo.png");
    
    // ─── Header branding ───
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", 14, 10, 16, 16);
    }
    
    const titleX = logoBase64 ? 33 : 14;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...brandAmberDark);
    doc.text("AL-UMANA KOPERASI", titleX, 15);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...slateDark);
    doc.text("DAFTAR PESANAN & INVOICE", titleX, 20);
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...slateLight);
    doc.text("Sistem Informasi Manajemen Order & Logistik", titleX, 24);

    // Header Metadata (Right-Aligned)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...slateLight);
    const now = new Date();
    const timestampStr = `${now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} • ${now.toLocaleTimeString("id-ID")}`;
    doc.text(`Dicetak: ${timestampStr}`, pageW - 14, 14, { align: "right" });
    
    let metaY = 18;
    const filterDesc: string[] = [];
    if (statusFilter !== "ALL") filterDesc.push(`Status: ${statusFilter}`);
    if (paymentFilter !== "ALL") filterDesc.push(`Pembayaran: ${paymentFilter}`);
    if (search) filterDesc.push(`Cari: "${search}"`);
    if (startDate || endDate) {
      const startStr = startDate ? new Date(startDate).toLocaleDateString("id-ID") : "Awal";
      const endStr = endDate ? new Date(endDate).toLocaleDateString("id-ID") : "Akhir";
      filterDesc.push(`Periode: ${startStr} - ${endStr}`);
    }
    
    if (filterDesc.length > 0) {
      doc.text(`Filter: ${filterDesc.join(" | ")}`, pageW - 14, metaY, { align: "right" });
      metaY += 4;
    }
    doc.text(`Menampilkan ${filteredOrders.length} dari ${orders.length} pesanan`, pageW - 14, metaY, { align: "right" });

    // Elegant divider line
    doc.setDrawColor(...brandGold);
    doc.setLineWidth(0.5);
    doc.line(14, 28, pageW - 14, 28);
    
    y = 35;

    // ─── Status labels ───
    const statusLabels: Record<string, string> = {
      PENDING: "Menunggu", IN_PRODUCTION: "Produksi", QC: "QA",
      READY_TO_DELIVER: "Siap Kirim", OUT_FOR_DELIVERY: "Dikirim",
      COMPLETED: "Selesai", DELIVERY_FAILED: "Gagal",
      PLACING: "Memproses", AWAITING_PAYMENT_PROOF: "Bukti Bayar",
      AWAITING_PAYMENT_APPROVAL: "Verifikasi", PAYMENT_REJECTED: "Ditolak",
      CONFIRMED: "Terkonfirmasi", READY: "Siap", DELIVERED: "Terkirim", FAILED: "Gagal",
    };
    const paymentLabels: Record<string, string> = {
      BELUM_DIBAYAR: "Belum Dibayar", SUDAH_DIBAYAR: "Lunas", JATUH_TEMPO: "Jatuh Tempo",
    };

    // ─── Orders table ───
    const tableBody = filteredOrders.map(o => {
      const itemsList = o.items.map(it => {
        let itStr = o.isPreOrder ? `${it.itemName} (Pra-pesanan)` : `${it.itemName} (×${it.quantity})`;
        if (it.recipientName || it.deliveryAddress || it.deliveryTime) {
          itStr += `\n*Kirim ke: ${it.recipientName || "—"} - ${it.deliveryAddress ? it.deliveryAddress.split(" | ")[0] : "—"} - ${it.deliveryTime ? it.deliveryTime.replace("T", " ") : "—"}`;
        }
        return itStr;
      }).join("\n");
      const details = itemsList || [o.foodDetails, o.drinkDetails].filter(Boolean).join(" + ") || "-";
      
      const address = o.deliveryAddress || "";
      const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
      const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
      const cleanAddress = mapsUrl ? address.replace(mapsUrl, "").replace(/\s+/g, " ").trim() : address;
      
      const recipientInfo = [
        o.institutionName ? `Instansi: ${o.institutionName}` : "",
        o.recipientName ? `Pemesan: ${o.recipientName}` : "",
        cleanAddress ? `Lokasi: ${cleanAddress}` : "",
      ].filter(Boolean).join("\n");

      return [
        `#${o.id.slice(-6).toUpperCase()}`,
        recipientInfo || "-",
        "", // placeholder for Foto column
        details,
        `Rp ${o.totalPrice.toLocaleString()}`,
        `${o.eventDate}\n${o.deliveryTime}`,
        statusLabels[o.status] || o.status,
        paymentLabels[o.paymentStatus] || o.paymentStatus,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["ID", "Instansi, Pemesan & Lokasi", "Foto", "Detail Pesanan", "Harga", "Jadwal / Tempo", "Status Ops.", "Pembayaran"]],
      body: tableBody,
      theme: "striped",
      styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
      headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 2.5, overflow: "linebreak", minCellHeight: 12, valign: "middle" },
      columnStyles: {
        0: { halign: "center", cellWidth: 20, fontStyle: "bold" },
        1: { cellWidth: 45 },
        2: { cellWidth: 16 }, // Foto column
        3: { cellWidth: 72 }, // Detail Pesanan
        4: { halign: "right", cellWidth: 26, fontStyle: "bold" },
        5: { halign: "center", cellWidth: 30 },
        6: { halign: "center", cellWidth: 30 },
        7: { halign: "center", cellWidth: 30 },
      },
      alternateRowStyles: { fillColor: brandYellowCream },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        // Color code payment status (index 7)
        if (data.section === "body" && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === "Lunas") data.cell.styles.textColor = [5, 150, 105];
          else if (val === "Jatuh Tempo") data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        }
        // Color code operational status (index 6)
        if (data.section === "body" && data.column.index === 6) {
          const val = String(data.cell.raw);
          if (val === "Selesai" || val === "Terkirim") data.cell.styles.textColor = [5, 150, 105];
          else if (val === "Gagal" || val === "Ditolak") data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [55, 65, 81];
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (data) => {
        // Draw product photos in index 2
        if (data.section === "body" && data.column.index === 2) {
          const orderObj = filteredOrders[data.row.index];
          if (orderObj && orderObj.items && orderObj.items.length > 0) {
            const cell = data.cell;
            const imgSize = 6; // 6mm x 6mm
            const spacing = 1;
            
            orderObj.items.slice(0, 2).forEach((it, idx) => {
              const imgBase64 = productMap[it.itemId];
              if (imgBase64) {
                const imgX = cell.x + 1 + idx * (imgSize + spacing);
                const imgY = cell.y + (cell.height - imgSize) / 2;
                try {
                  doc.addImage(imgBase64, "PNG", imgX, imgY, imgSize, imgSize);
                } catch (e) {
                  console.error("Failed to add list image to PDF:", e);
                }
              }
            });
            
            // Draw a "+" indicator if more than 2 items
            if (orderObj.items.length > 2) {
              const textX = cell.x + 1 + 2 * (imgSize + spacing) + 1;
              const textY = cell.y + cell.height / 2 + 1;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              doc.text("+", textX, textY);
            }
          }
        }
      }
    });

    // ─── Summary Card ───
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    if (y + 16 > pageH - 15) {
      doc.addPage();
      y = 14;
    }
    
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const lunas = filteredOrders.filter(o => o.paymentStatus === "SUDAH_DIBAYAR").length;

    // Draw card background
    doc.setFillColor(...brandYellowCream);
    doc.setDrawColor(...brandYellowBorder);
    doc.setLineWidth(0.4);
    doc.rect(14, y, pageW - 28, 14, "FD");

    // Draw card text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...slateDark);
    doc.text(
      `RINGKASAN LAPORAN   |   Total Nilai Pesanan: Rp ${totalRevenue.toLocaleString()}   |   Lunas: ${lunas} dari ${filteredOrders.length}   |   Belum Lunas: ${filteredOrders.length - lunas}`,
      20,
      y + 8.5
    );

    // ─── Footer and Page Border ───
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      
      // Footer text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Koperasi Al-Umana • Daftar Pesanan & Invoice • Halaman ${p} dari ${totalPages}`,
        pageW / 2, pageH - 8,
        { align: "center" }
      );
      
      // Top accent thin gold bar on all pages
      doc.setFillColor(...brandGold);
      doc.rect(0, 0, pageW, 2, "F");

      // Footer divider line
      doc.setDrawColor(...brandYellowBorder);
      doc.setLineWidth(0.25);
      doc.line(14, pageH - 12, pageW - 14, pageH - 12);
    }

    doc.save(`AlUmana_Pesanan_${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Daftar Pesanan & Invoice
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            Pantau status operasional pesanan, jatuh tempo invoice, dan verifikasi tanda tangan digital.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={exportOrdersToPDF}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#0F172A] text-white text-sm font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            title="Download daftar pesanan sebagai PDF"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>Export PDF</span>
          </button>
          {!isMonitoring && (
            <Link to="/admin/orders/new" className="w-full sm:w-auto">
              <button className="bg-[#D97706] hover:bg-[#B45309] text-white font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-colors cursor-pointer w-full sm:w-auto whitespace-nowrap">
                <Plus className="w-5 h-5 shrink-0" />
                <span>Input Pesanan Baru</span>
              </button>
            </Link>
          )}
        </div>
      </div>

      <Card className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Cari berdasarkan instansi, pemesan, nomor telepon, atau ID..."
                className="pl-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3 w-full md:w-auto">
              <div className="w-full sm:w-48">
                <select
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-2 py-2 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-semibold text-[#374151] focus:border-[#FBBF24] focus:outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
                  aria-label="Filter Status Operasional"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PRODUCTION">Dalam Produksi</option>
                  <option value="QC">QC</option>
                  <option value="READY_TO_DELIVER">Siap Dikirim</option>
                  <option value="OUT_FOR_DELIVERY">Dalam Pengiriman</option>
                  <option value="COMPLETED">Selesai</option>
                  <option value="DELIVERY_FAILED">Gagal Kirim</option>
                </select>
              </div>

              <div className="w-full sm:w-48">
                <select
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-2 py-2 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-semibold text-[#374151] focus:border-[#FBBF24] focus:outline-none"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | "ALL")}
                  aria-label="Filter Status Pembayaran"
                >
                  <option value="ALL">Semua Bayar</option>
                  <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                  <option value="SUDAH_DIBAYAR">Sudah Dibayar</option>
                  <option value="JATUH_TEMPO">Jatuh Tempo</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center border-t border-[#F3F4F6] pt-3">
            <span className="text-xs font-bold text-[#4B5563] self-start sm:self-center shrink-0">Filter Tanggal Acara:</span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#374151] focus:border-[#FBBF24] focus:outline-none w-full sm:w-40 font-semibold"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Tanggal Mulai"
              />
              <span className="text-xs text-neutral-400">s/d</span>
              <input
                type="date"
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#374151] focus:border-[#FBBF24] focus:outline-none w-full sm:w-40 font-semibold"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Tanggal Akhir"
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer ml-auto sm:ml-0"
              >
                Reset Tanggal
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Desktop Table View (hidden on mobile/tablet, visible on xl+) */}
      <div className="hidden xl:block">
        <Card className="!p-0 overflow-hidden border border-[#E5E7EB] rounded-2xl shadow-sm bg-white">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                  <th className="py-4 px-4 whitespace-nowrap">ID / Tipe</th>
                  <th className="py-4 px-4">Instansi & Pemesan</th>
                  <th className="py-4 px-4">Detail Pesanan & Harga</th>
                  <th className="py-4 px-4 whitespace-nowrap">Waktu Input & Acara / Tempo</th>
                  <th className="py-4 px-4 whitespace-nowrap">Status Operasional</th>
                  <th className="py-4 px-4 whitespace-nowrap">Status Pembayaran</th>
                  <th className="py-4 px-4 text-center whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#374151]">
                {filteredOrders.map((o) => {
                  const dueInfo = getDueDateInfo(o);
                  const isSigned = !!o.invoiceSignedAt;
                  const isManuallyValidated = !!o.manualValidation;
                  const shortId = o.id.slice(-6).toUpperCase();

                  return (
                    <React.Fragment key={o.id}>
                      <tr className="hover:bg-neutral-50/50 transition-colors">
                      {/* ID / Tipe */}
                      <td className="py-4 px-4 font-['Hanken_Grotesk'] whitespace-nowrap">
                        <div className="flex flex-col items-start">
                          <button
                            type="button"
                            onClick={() => setPreviewInvoiceOrder(o)}
                            className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer focus:outline-none"
                            title="Lihat Detail Pesanan"
                          >
                            #{shortId}
                          </button>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            o.orderType === "event" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"
                          }`}>
                            {o.orderType}
                          </span>
                        </div>
                      </td>

                      {/* Instansi & Penerima */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-[#111827]">{o.institutionName}</div>
                        {o.customerName ? (
                          <>
                            <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-1 font-medium">
                              <User className="w-3.5 h-3.5 text-[#9CA3AF]" />
                              <span>Pemesan: {o.customerName}</span>
                            </div>
                            <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-0.5 font-medium ml-5">
                              <span>Penerima: {o.recipientName}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-1 font-medium">
                            <User className="w-3.5 h-3.5 text-[#9CA3AF]" />
                            {o.recipientName}
                          </div>
                        )}
                        <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-0.5 font-mono">
                          <Phone className="w-3.5 h-3.5 text-[#9CA3AF]" />
                          {o.recipientPhone}
                        </div>
                      </td>

                      {/* Detail Pesanan & Harga */}
                      <td className="py-4 px-4">
                        <div className="text-xs max-w-[180px] truncate text-[#4B5563]" title={o.foodDetails}>
                          {o.foodDetails}
                        </div>
                        {o.drinkDetails && (
                          <div className="text-[11px] text-[#6B7280] italic truncate mt-0.5 max-w-[180px]" title={o.drinkDetails}>
                            Minuman: {o.drinkDetails}
                          </div>
                        )}
                        <div className="font-extrabold text-[#B45309] mt-1.5">
                          {formatIDR(o.totalPrice)}
                        </div>
                      </td>

                      {/* Tanggal Acara / Jatuh Tempo */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="text-[11px] text-[#6B7280] font-semibold mb-1">
                          Input: {new Date(o.createdAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          }).replace(/\./g, ":")}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[#374151]">
                          <Calendar className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                          <span>Berangkat: {(() => {
                            if (!o.eventDate) return "—";
                            const dObj = new Date(o.eventDate);
                            if (isNaN(dObj.getTime())) return o.eventDate;
                            const fd = dObj.toLocaleDateString("id-ID");
                            if (o.eventDate.includes("T")) {
                              const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
                              return `${fd} ${ft}`;
                            }
                            return fd;
                          })()}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${
                          dueInfo.isOverdue ? "text-[#EF4444]" : dueInfo.isWarning ? "text-[#F59E0B]" : "text-[#6B7280]"
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}</span>
                          {dueInfo.isOverdue && <span className="text-[9px] font-extrabold bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-1 uppercase">Overdue</span>}
                        </div>
                      </td>

                      {/* Status Operasional */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusBadge status={o.status} />
                      </td>

                      {/* Status Pembayaran */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {isMonitoring ? (
                          <span
                            className={`inline-block text-xs font-bold rounded-lg px-2.5 py-1.5 border ${
                              o.paymentStatus === "SUDAH_DIBAYAR"
                                ? "bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]"
                                : o.paymentStatus === "JATUH_TEMPO"
                                ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                                : "bg-[#FEF3C7] text-[#92400E] border-[#FDE047]"
                            }`}
                          >
                            {o.paymentStatus === "SUDAH_DIBAYAR"
                              ? "Sudah Dibayar"
                              : o.paymentStatus === "JATUH_TEMPO"
                              ? "Jatuh Tempo"
                              : "Belum Dibayar"}
                          </span>
                        ) : (
                          <select
                            className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border focus:outline-none cursor-pointer ${
                              o.paymentStatus === "SUDAH_DIBAYAR"
                                ? "bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]"
                                : o.paymentStatus === "JATUH_TEMPO"
                                ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                                : "bg-[#FEF3C7] text-[#92400E] border-[#FDE047]"
                            }`}
                            value={o.paymentStatus}
                            onChange={(e) => handleUpdatePaymentStatus(o.id, e.target.value as PaymentStatus)}
                            aria-label="Ubah Status Pembayaran"
                          >
                            <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                            <option value="SUDAH_DIBAYAR">Sudah Dibayar</option>
                            <option value="JATUH_TEMPO">Jatuh Tempo</option>
                          </select>
                        )}

                        {/* Digital signature / manual validation badge */}
                        <div className="mt-2">
                          {isSigned ? (
                            <button
                              type="button"
                              onClick={() => setPreviewInvoiceOrder(o)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#10B981] bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5 hover:bg-emerald-100 transition-colors cursor-pointer"
                              title="Lihat Tanda Tangan"
                            >
                              <ShieldCheck className="w-3 h-3" /> TTD Digital
                            </button>
                          ) : isManuallyValidated ? (
                            <button
                              type="button"
                              onClick={() => setPreviewInvoiceOrder(o)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 hover:bg-amber-100 transition-colors cursor-pointer"
                              title="Lihat Validasi Manual"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Validasi Manual
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6B7280] bg-neutral-100 rounded-md px-1.5 py-0.5">
                              Belum Valid
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-center justify-center">
                          {/* Status Transition buttons */}
                          {!isMonitoring && o.status === "PENDING" && (
                            <button
                              className="bg-[#D97706] hover:bg-[#B45309] text-white w-28 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              onClick={() => handleTransition(o.id, "start-production")}
                              disabled={transitioningId === o.id}
                            >
                              Mulai Masak
                            </button>
                          )}
                          {!isMonitoring && o.status === "IN_PRODUCTION" && (
                            <button
                              className="bg-purple-600 hover:bg-purple-700 text-white w-28 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              onClick={() => handleTransition(o.id, "complete-production")}
                              disabled={transitioningId === o.id}
                            >
                              Selesai Masak
                            </button>
                          )}
                          {!isMonitoring && o.status === "QC" && (
                            <div className="flex gap-1">
                              <button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                onClick={() => handleTransition(o.id, "qc-pass")}
                                disabled={transitioningId === o.id}
                              >
                                Lolos
                              </button>
                              <button
                                className="bg-red-600 hover:bg-red-700 text-white h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                onClick={() => {
                                  const reason = prompt("Masukkan alasan kegagalan QC:");
                                  if (reason) handleTransition(o.id, "qc-fail", reason);
                                }}
                                disabled={transitioningId === o.id}
                              >
                                Gagal
                              </button>
                            </div>
                          )}

                          {/* Invoice & Validation actions */}
                          <div className="flex gap-1.5 items-center">
                            <button
                              onClick={() => handleCopyLink(o)}
                              className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-[#D1D5DB] rounded-lg p-1.5 transition-all text-xs font-semibold flex items-center gap-1"
                              title="Salin Link Invoice"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copiedOrderId === o.id ? "Tersalin!" : "Link"}
                            </button>

                            {!isMonitoring && !isSigned && !isManuallyValidated && (
                              <button
                                onClick={() => setValidationTargetId(o.id)}
                                className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg p-1.5 transition-all text-xs font-bold"
                                title="Validasi Bukti Manual"
                              >
                                Validasi
                              </button>
                            )}

                            {o.invoiceToken && (
                              <Link
                                to={`/invoice/${o.invoiceToken}`}
                                target="_blank"
                                className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg p-1.5 transition-all flex items-center justify-center"
                                title="Buka Invoice"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            )}
                            
                            <button
                              onClick={() => exportSingleOrderToPDF(o)}
                              className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg p-1.5 transition-all flex items-center justify-center cursor-pointer"
                              title="Unduh PDF Invoice"
                              disabled={exportingOrderId === o.id}
                            >
                              {exportingOrderId === o.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => exportSingleOrderToJPG(o)}
                              className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg p-1.5 transition-all flex items-center justify-center cursor-pointer"
                              title="Unduh JPG Invoice"
                              disabled={exportingJpgOrderId === o.id}
                            >
                              {exportingJpgOrderId === o.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {!isMonitoring && (
                              <button
                                onClick={() => handleDeleteOrder(o.id)}
                                className="text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg p-1.5 transition-all flex items-center justify-center cursor-pointer"
                                title="Hapus Pesanan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Inline sub-row for Admin Complaint Notes & Proof (visible to Admins only) */}
                    {!isMonitoring && (
                      <tr key={`${o.id}-admin-panel`} className="bg-neutral-50/45 border-b border-[#E5E7EB] transition-colors hover:bg-neutral-100/30">
                        <td colSpan={7} className="py-3 px-5">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            {/* Title and Badge */}
                            <div className="flex items-center gap-2 text-neutral-800 font-bold text-[10px] uppercase tracking-wider shrink-0 mt-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span>Pengaduan & Bukti Admin</span>
                            </div>

                            {/* Content area */}
                            <div className="flex-1 min-w-0">
                              {activeEditRowId === o.id ? (
                                // Edit Mode
                                <div className="space-y-3 bg-white p-3.5 rounded-xl border border-amber-200/60 shadow-xs max-w-2xl">
                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                      Catatan Keluhan / Komplain
                                    </label>
                                    <textarea
                                      value={editNotesText}
                                      onChange={(e) => setEditNotesText(e.target.value)}
                                      placeholder="Tulis keluhan pelanggan atau catatan internal..."
                                      rows={2}
                                      className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40 bg-white"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                      Bukti Foto Pendukung
                                    </label>
                                    <div className="flex items-center gap-4">
                                      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-3 bg-neutral-50 hover:bg-neutral-100 transition relative cursor-pointer min-h-[50px] text-center">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={handleComplaintFileChange}
                                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                          title="Pilih Foto Bukti"
                                        />
                                        <Upload className="h-4.5 w-4.5 text-[#9CA3AF] mb-0.5" />
                                        <span className="text-[9px] font-bold text-[#4B5563]">
                                          {complaintPhotoFile ? "Ganti Foto" : "Upload Foto Bukti"}
                                        </span>
                                        <span className="text-[8px] text-[#9CA3AF]">Maks 15MB</span>
                                      </div>
                                      {(complaintPhotoPreview || complaintPhotoSrc) && (
                                        <div className="relative shrink-0">
                                          <img
                                            src={complaintPhotoPreview || complaintPhotoSrc || ""}
                                            alt="Bukti komplain"
                                            className="h-12 w-12 object-contain rounded-lg border border-[#E5E7EB] bg-neutral-100"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setComplaintPhotoFile(null);
                                              setComplaintPhotoPreview(null);
                                              setEditNotesPhotoId(null);
                                              setComplaintPhotoSrc(null);
                                            }}
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm border border-white cursor-pointer"
                                            title="Hapus foto"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {uploadingComplaint && uploadComplaintProgress > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[8px] text-[#6B7280]">
                                        <span>Mengunggah bukti...</span>
                                        <span>{uploadComplaintProgress}%</span>
                                      </div>
                                      <div className="h-1 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                                        <svg className="h-full w-full">
                                          <rect
                                            className="fill-amber-500 transition-all duration-150"
                                            height="100%"
                                            width={`${uploadComplaintProgress}%`}
                                          />
                                        </svg>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex gap-2 pt-2 border-t border-neutral-100">
                                    <Button
                                      onClick={handleSaveNotesInline}
                                      disabled={savingNotes}
                                      size="sm"
                                      className="bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-lg text-[10px] font-bold py-1 px-3"
                                    >
                                      {savingNotes ? "Menyimpan..." : "Simpan"}
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      onClick={() => {
                                        setActiveEditRowId(null);
                                        setComplaintPhotoFile(null);
                                        setComplaintPhotoPreview(null);
                                      }}
                                      disabled={savingNotes}
                                      size="sm"
                                      className="px-3 border border-[#D1D5DB] rounded-lg hover:bg-neutral-50 text-[10px] font-bold py-1"
                                    >
                                      Batal
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // Read-only / Display Mode
                                <div className="flex items-start gap-4">
                                  <div className="flex-1 min-w-0">
                                    {o.adminComplaintNotes ? (
                                      <p className="whitespace-pre-wrap leading-relaxed text-xs text-neutral-800 bg-white border border-[#E5E7EB] rounded-lg p-2 max-w-2xl shadow-3xs">
                                        {o.adminComplaintNotes}
                                      </p>
                                    ) : (
                                      <span className="text-xs text-neutral-400 italic">Tidak ada catatan komplain.</span>
                                    )}
                                  </div>

                                  {/* Photo Area */}
                                  {o.adminComplaintPhotoId && (
                                    <div className="shrink-0">
                                      {loadingRowPhotoIds[o.id] ? (
                                        <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 py-1 px-2 bg-white rounded border border-neutral-100">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Memuat bukti...</span>
                                        </div>
                                      ) : rowComplaintPhotoSrcs[o.id] ? (
                                        <div className="bg-white border border-neutral-200 rounded p-1 shadow-3xs max-w-[80px]">
                                          <a href={rowComplaintPhotoSrcs[o.id]} target="_blank" rel="noreferrer" title="Lihat ukuran penuh" className="block cursor-zoom-in">
                                            <img src={rowComplaintPhotoSrcs[o.id]} alt="Bukti" className="max-h-12 object-contain mx-auto rounded" />
                                          </a>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleLoadRowPhoto(o.id, o.adminComplaintPhotoId!)}
                                          className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-1 flex items-center gap-1 cursor-pointer transition-all"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Lihat Foto</span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Edit button */}
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditNotes(o)}
                                    className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-1 cursor-pointer shrink-0 transition-all ml-auto self-center"
                                  >
                                    Edit Catatan
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk']">
                      Tidak ada pesanan ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile Card List View (visible on mobile/tablet, hidden on xl+) */}
      <div className="xl:hidden grid grid-cols-2 md:grid-cols-3 gap-3">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk'] bg-white rounded-2xl border border-[#E5E7EB]">
            Tidak ada pesanan ditemukan.
          </div>
        ) : (
          filteredOrders.map((o) => {
            const dueInfo = getDueDateInfo(o);
            const isSigned = !!o.invoiceSignedAt;
            const isManuallyValidated = !!o.manualValidation;
            const shortId = o.id.slice(-6).toUpperCase();

            return (
              <div
                key={o.id}
                className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs flex flex-col justify-between text-[#374151] p-2.5 gap-2 text-[11px]"
              >
                {/* Header: ID, Type & Operational Status */}
                <div className="flex flex-wrap items-center justify-between gap-1 pb-1.5 border-b border-[#F3F4F6]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewInvoiceOrder(o)}
                      className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer focus:outline-none text-[10px]"
                      title="Lihat Detail Pesanan"
                    >
                      #{shortId}
                    </button>
                    <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                      o.orderType === "event" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"
                    }`}>
                      {o.orderType}
                    </span>
                  </div>
                  <StatusBadge
                    status={o.status}
                    className="px-1 py-0.5 text-[8px] font-extrabold"
                  >
                    {statusShortLabels[o.status]}
                  </StatusBadge>
                </div>

                {/* Body: Recipient & Instansi */}
                <div className="space-y-0.5">
                  <div className="font-extrabold text-[#111827] text-xs truncate" title={o.institutionName}>
                    {o.institutionName}
                  </div>
                  <div className="space-y-0.5 text-[#6B7280] text-[9px]">
                    {o.customerName ? (
                      <>
                        <div className="flex items-center gap-1 font-medium truncate">
                          <User className="w-3 h-3 text-[#9CA3AF] shrink-0" />
                          <span>Pemesan: {o.customerName}</span>
                        </div>
                        <div className="flex items-center gap-1 font-medium truncate ml-4">
                          <span>Penerima: {o.recipientName}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 font-medium truncate">
                        <User className="w-3 h-3 text-[#9CA3AF] shrink-0" />
                        <span>{o.recipientName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 font-mono truncate">
                      <Phone className="w-3 h-3 text-[#9CA3AF] shrink-0" />
                      <span>{o.recipientPhone}</span>
                    </div>
                  </div>
                </div>

                {/* Order Details & Price */}
                <div className="bg-[#F9FAFB] p-2 rounded-lg border border-[#F3F4F6] space-y-0.5">
                  <div className="text-[9px] text-[#4B5563] break-words line-clamp-2" title={o.foodDetails}>
                    {o.foodDetails}
                  </div>
                  {o.drinkDetails && !isMonitoring && (
                    <div className="text-[9px] text-[#6B7280] italic break-words line-clamp-1">
                      Minuman: {o.drinkDetails}
                    </div>
                  )}
                  <div className="font-extrabold text-[#B45309] text-xs">
                    {formatIDR(o.totalPrice)}
                  </div>
                </div>

                {/* Dates: Event & Due Date */}
                <div className="space-y-0.5 text-[9px] text-[#374151]">
                  <div className="flex items-center gap-1 truncate">
                    <Calendar className="w-3 h-3 text-[#9CA3AF] shrink-0" />
                    <span>Berangkat: {(() => {
                      if (!o.eventDate) return "—";
                      const dObj = new Date(o.eventDate);
                      if (isNaN(dObj.getTime())) return o.eventDate;
                      const fd = dObj.toLocaleDateString("id-ID");
                      if (o.eventDate.includes("T")) {
                        const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
                        return `${fd} ${ft}`;
                      }
                      return fd;
                    })()}</span>
                  </div>
                  <div className={`flex items-center gap-1 font-semibold ${
                    dueInfo.isOverdue ? "text-[#EF4444]" : dueInfo.isWarning ? "text-[#F59E0B]" : "text-[#6B7280]"
                  }`}>
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}</span>
                  </div>
                </div>

                {/* Payment Status & Validation Badge */}
                <div className="flex flex-col gap-1 pt-1 border-t border-[#F3F4F6]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {isMonitoring ? (
                        <span
                          className={`inline-block text-[8px] font-extrabold rounded-md px-1 py-0.5 border ${
                            o.paymentStatus === "SUDAH_DIBAYAR"
                              ? "bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]"
                              : o.paymentStatus === "JATUH_TEMPO"
                              ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                              : "bg-[#FEF3C7] text-[#92400E] border-[#FDE047]"
                          }`}
                        >
                          {o.paymentStatus === "SUDAH_DIBAYAR"
                            ? "Lunas"
                            : o.paymentStatus === "JATUH_TEMPO"
                            ? "Tempo"
                            : "Belum Bayar"}
                        </span>
                      ) : (
                        <select
                          className={`text-[9px] font-bold rounded-md px-1 py-0.5 border focus:outline-none cursor-pointer ${
                            o.paymentStatus === "SUDAH_DIBAYAR"
                              ? "bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]"
                              : o.paymentStatus === "JATUH_TEMPO"
                              ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                              : "bg-[#FEF3C7] text-[#92400E] border-[#FDE047]"
                          }`}
                          value={o.paymentStatus}
                          onChange={(e) => handleUpdatePaymentStatus(o.id, e.target.value as PaymentStatus)}
                          aria-label="Ubah Status Pembayaran"
                        >
                          <option value="BELUM_DIBAYAR">Belum Bayar</option>
                          <option value="SUDAH_DIBAYAR">Lunas</option>
                          <option value="JATUH_TEMPO">Tempo</option>
                        </select>
                      )}
                    </div>
                    <div>
                      {isSigned ? (
                        <button
                          type="button"
                          onClick={() => setPreviewInvoiceOrder(o)}
                          className="inline-flex items-center gap-0.5 text-[8px] font-bold text-[#10B981] bg-emerald-50 border border-emerald-200 rounded-md px-1 py-0.5 hover:bg-emerald-100 transition-colors cursor-pointer"
                          title="Lihat Tanda Tangan"
                        >
                          <ShieldCheck className="w-2.5 h-2.5" /> TTD
                        </button>
                      ) : isManuallyValidated ? (
                        <button
                          type="button"
                          onClick={() => setPreviewInvoiceOrder(o)}
                          className="inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1 py-0.5 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Lihat Validasi Manual"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" /> Valid
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-medium text-[#6B7280] bg-neutral-100 rounded-md px-1 py-0.5">
                          Belum Valid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-1 pt-1 border-t border-[#F3F4F6]">
                  {/* Status Transition buttons */}
                  {!isMonitoring && o.status === "PENDING" && (
                    <button
                      className="bg-[#D97706] hover:bg-[#B45309] text-white w-full h-8 rounded-lg text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                      onClick={() => handleTransition(o.id, "start-production")}
                      disabled={transitioningId === o.id}
                    >
                      Mulai Masak
                    </button>
                  )}
                  {!isMonitoring && o.status === "IN_PRODUCTION" && (
                    <button
                      className="bg-purple-600 hover:bg-purple-700 text-white w-full h-8 rounded-lg text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                      onClick={() => handleTransition(o.id, "complete-production")}
                      disabled={transitioningId === o.id}
                    >
                      Selesai Masak
                    </button>
                  )}
                  {!isMonitoring && o.status === "QC" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 rounded-lg text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                        onClick={() => handleTransition(o.id, "qc-pass")}
                        disabled={transitioningId === o.id}
                      >
                        Lolos
                      </button>
                      <button
                        className="bg-red-600 hover:bg-red-700 text-white h-8 rounded-lg text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                        onClick={() => {
                          const reason = prompt("Masukkan alasan kegagalan QC:");
                          if (reason) handleTransition(o.id, "qc-fail", reason);
                        }}
                        disabled={transitioningId === o.id}
                      >
                        Gagal
                      </button>
                    </div>
                  )}

                  {/* Secondary/Utility Actions */}
                  {isMonitoring ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleCopyLink(o)}
                        className="flex-1 flex items-center justify-center border border-[#D1D5DB] rounded-lg hover:bg-neutral-100 transition-all h-8 cursor-pointer"
                        title="Salin Link Invoice"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      </button>

                      {o.invoiceToken && (
                        <Link
                          to={`/invoice/${o.invoiceToken}`}
                          target="_blank"
                          className="flex-1 text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8"
                          title="Buka Invoice"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}

                      <button
                        onClick={() => exportSingleOrderToPDF(o)}
                        className="flex-1 text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8 cursor-pointer"
                        title="Unduh PDF Invoice"
                        disabled={exportingOrderId === o.id}
                      >
                        {exportingOrderId === o.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => exportSingleOrderToJPG(o)}
                        className="flex-1 text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8 cursor-pointer"
                        title="Unduh JPG Invoice"
                        disabled={exportingJpgOrderId === o.id}
                      >
                        {exportingJpgOrderId === o.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 w-full">
                      <button
                        onClick={() => handleCopyLink(o)}
                        className="flex-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-[#D1D5DB] rounded-lg h-8 transition-all text-[10px] font-semibold flex items-center justify-center gap-1"
                        title="Salin Link Invoice"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                        <span className="hidden md:inline">
                          {copiedOrderId === o.id ? "Tersalin!" : "Salin Link"}
                        </span>
                      </button>

                      {!isSigned && !isManuallyValidated && (
                        <button
                          onClick={() => setValidationTargetId(o.id)}
                          className="flex-1 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg h-8 transition-all text-[10px] font-bold flex items-center justify-center gap-1"
                          title="Validasi Bukti"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                          <span className="hidden md:inline">Validasi</span>
                        </button>
                      )}

                      {o.invoiceToken && (
                        <Link
                          to={`/invoice/${o.invoiceToken}`}
                          target="_blank"
                          className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8 w-8 shrink-0"
                          title="Buka Invoice"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}

                      <button
                        onClick={() => exportSingleOrderToPDF(o)}
                        className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8 w-8 shrink-0 cursor-pointer"
                        title="Unduh PDF Invoice"
                        disabled={exportingOrderId === o.id}
                      >
                        {exportingOrderId === o.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => exportSingleOrderToJPG(o)}
                        className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg transition-all flex items-center justify-center h-8 w-8 shrink-0 cursor-pointer"
                        title="Unduh JPG Invoice"
                        disabled={exportingJpgOrderId === o.id}
                      >
                        {exportingJpgOrderId === o.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {!isMonitoring && (
                        <button
                          onClick={() => handleDeleteOrder(o.id)}
                          className="text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all flex items-center justify-center h-8 w-8 shrink-0 cursor-pointer"
                          title="Hapus Pesanan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline mobile admin notes & photo section (visible to Admins only) */}
                {!isMonitoring && (
                  <div className="mt-2 pt-2 border-t border-[#F3F4F6] bg-neutral-50/60 rounded-xl p-2.5 space-y-2 text-[9px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-neutral-800 font-bold uppercase tracking-wider text-[8px]">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>Komplain & Bukti</span>
                      </div>
                      {activeEditRowId !== o.id && (
                        <button
                          type="button"
                          onClick={() => handleStartEditNotes(o)}
                          className="text-[8px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 cursor-pointer transition-all"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {activeEditRowId === o.id ? (
                      // Mobile Edit Mode
                      <div className="space-y-3 bg-white p-3 rounded-lg border border-amber-200/60 shadow-2xs">
                        <div className="space-y-1">
                          <label className="block text-[8px] font-bold text-neutral-400 uppercase tracking-wider">
                            Catatan Keluhan / Komplain
                          </label>
                          <textarea
                            value={editNotesText}
                            onChange={(e) => setEditNotesText(e.target.value)}
                            placeholder="Tulis keluhan pelanggan..."
                            rows={2}
                            className="w-full rounded-lg border border-[#D1D5DB] px-2.5 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none bg-white"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[8px] font-bold text-neutral-400 uppercase tracking-wider">
                            Bukti Foto Pendukung
                          </label>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-2.5 bg-neutral-50 hover:bg-neutral-100 relative min-h-[45px] text-center">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleComplaintFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                title="Pilih Foto Bukti"
                              />
                              <Upload className="h-4 w-4 text-[#9CA3AF] mb-0.5" />
                              <span className="text-[8px] font-bold text-[#4B5563]">Upload Foto Bukti</span>
                            </div>
                            {(complaintPhotoPreview || complaintPhotoSrc) && (
                              <div className="relative shrink-0">
                                <img
                                  src={complaintPhotoPreview || complaintPhotoSrc || ""}
                                  alt="Bukti komplain"
                                  className="h-10 w-10 object-contain rounded-lg border border-[#E5E7EB] bg-neutral-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setComplaintPhotoFile(null);
                                    setComplaintPhotoPreview(null);
                                    setEditNotesPhotoId(null);
                                    setComplaintPhotoSrc(null);
                                  }}
                                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm border border-white cursor-pointer"
                                  title="Hapus foto"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {uploadingComplaint && uploadComplaintProgress > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[8px] text-[#6B7280]">
                              <span>Mengunggah...</span>
                              <span>{uploadComplaintProgress}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                              <svg className="h-full w-full">
                                <rect
                                  className="fill-amber-500 transition-all duration-150"
                                  height="100%"
                                  width={`${uploadComplaintProgress}%`}
                                />
                              </svg>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2 border-t border-neutral-100">
                          <Button
                            onClick={handleSaveNotesInline}
                            disabled={savingNotes}
                            size="sm"
                            className="bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-lg text-[9px] font-bold py-0.5 px-2.5"
                          >
                            {savingNotes ? "Menyimpan..." : "Simpan"}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => {
                              setActiveEditRowId(null);
                              setComplaintPhotoFile(null);
                              setComplaintPhotoPreview(null);
                            }}
                            disabled={savingNotes}
                            size="sm"
                            className="px-2.5 border border-[#D1D5DB] rounded-lg hover:bg-neutral-50 text-[9px] font-bold py-0.5"
                          >
                            Batal
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Mobile Read-only / Display Mode
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          {o.adminComplaintNotes ? (
                            <p className="whitespace-pre-wrap leading-relaxed text-[11px] text-neutral-800 bg-white border border-[#E5E7EB] rounded-lg p-2 shadow-3xs">
                              {o.adminComplaintNotes}
                            </p>
                          ) : (
                            <span className="text-[10px] text-neutral-400 italic">Tidak ada catatan komplain.</span>
                          )}
                        </div>

                        {o.adminComplaintPhotoId && (
                          <div className="shrink-0 self-center">
                            {loadingRowPhotoIds[o.id] ? (
                              <div className="flex items-center gap-1 text-[8px] text-neutral-400 py-0.5 px-1 bg-white rounded border border-neutral-100">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                <span>Memuat...</span>
                              </div>
                            ) : rowComplaintPhotoSrcs[o.id] ? (
                              <div className="bg-white border border-neutral-200 rounded p-0.5 shadow-3xs max-w-[60px]">
                                <a href={rowComplaintPhotoSrcs[o.id]} target="_blank" rel="noreferrer" title="Lihat ukuran penuh" className="block cursor-zoom-in">
                                  <img src={rowComplaintPhotoSrcs[o.id]} alt="Bukti" className="max-h-10 object-contain mx-auto rounded" />
                                </a>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleLoadRowPhoto(o.id, o.adminComplaintPhotoId!)}
                                className="text-[9px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 cursor-pointer transition-all"
                              >
                                Foto
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Manual Validation Modal */}
      <ManualValidationModal
        isOpen={validationTargetId !== null}
        onClose={() => setValidationTargetId(null)}
        orderId={validationTargetId || ""}
        onConfirm={handleManualValidationConfirm}
      />

      {/* Invoice Preview Modal */}
      {previewInvoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-['Hanken_Grotesk'] overflow-y-auto animate-in fade-in duration-200">
          <Card className="max-w-2xl w-full bg-white border border-[#E5E7EB] rounded-3xl shadow-2xl relative overflow-hidden flex flex-col my-8 max-h-[90vh]">
            {/* Top gold bar decoration */}
            <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-600 shrink-0" />
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#F3F4F6] px-6 py-4 shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-['Manrope'] font-black text-sm text-[#B45309] uppercase tracking-wide">
                  Detail Invoice Resmi
                </h3>
                <p className="text-[10px] text-neutral-500">ID: #{previewInvoiceOrder.id.toUpperCase()}</p>
              </div>
              <button
                onClick={() => setPreviewInvoiceOrder(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable invoice content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Decorative Brand Header */}
              <div className="flex justify-between items-start gap-4 border-b border-[#F3F4F6] pb-4">
                <div className="space-y-0.5">
                  <h4 className="font-['Manrope'] text-sm font-black text-[#D97706] tracking-wide">
                    KOPERASI AL-UMANAA
                  </h4>
                  <p className="text-[10px] text-neutral-500">
                    Pesantren Al-Umanaa, Sukabumi, Jawa Barat
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-[#B45309] border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Invoice Resmi
                  </span>
                </div>
              </div>

              {/* Digital Signature section */}
              {previewInvoiceOrder.invoiceSignedAt && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-10 h-10 bg-white text-emerald-500 rounded-full flex items-center justify-center shadow-xs shrink-0 border border-emerald-100">
                    <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div className="space-y-0.5 flex-1 text-center sm:text-left">
                    <p className="font-bold text-emerald-800 text-[11px]">Tanda Tangan Digital Valid</p>
                    <p className="text-[10px] text-emerald-600">
                      Diverifikasi pada {new Date(previewInvoiceOrder.invoiceSignedAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
                    </p>
                  </div>
                  {previewInvoiceOrder.invoiceSignatureData && (
                    <div className="bg-white border border-emerald-100 rounded-lg p-1.5 max-w-[150px] shrink-0 shadow-2xs">
                      <img src={previewInvoiceOrder.invoiceSignatureData} alt="Tanda Tangan Pelanggan" className="max-h-16 mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* Manual Validation section */}
              {previewInvoiceOrder.manualValidation && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-10 h-10 bg-white text-amber-600 rounded-full flex items-center justify-center shadow-xs shrink-0 border border-amber-100">
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="space-y-0.5 flex-1 text-center sm:text-left">
                      <p className="font-bold text-amber-800 text-[11px]">Validasi Manual Admin</p>
                      <p className="text-[10px] text-amber-600">
                        Diverifikasi oleh <span className="font-semibold">{previewInvoiceOrder.manualValidation.validatedBy}</span> pada {new Date(previewInvoiceOrder.manualValidation.validatedAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-amber-900 border-t border-amber-200/50 pt-3">
                    <div>
                      <span className="font-bold">No. Kontak Konfirmasi:</span>
                      <p className="mt-0.5 font-mono">{previewInvoiceOrder.manualValidation.contactPhone}</p>
                    </div>
                    <div>
                      <span className="font-bold">Catatan Verifikasi:</span>
                      <p className="mt-0.5">{previewInvoiceOrder.manualValidation.notes || "-"}</p>
                    </div>
                  </div>

                  {previewInvoiceOrder.manualValidation.screenshotFileIds && previewInvoiceOrder.manualValidation.screenshotFileIds.length > 0 && (
                    <div className="border-t border-amber-200/50 pt-3">
                      <span className="font-bold text-[11px] text-amber-900 block mb-2 font-['Manrope']">Foto Bukti Validasi Chat / Persetujuan:</span>
                      {loadingScreenshot ? (
                        <div className="flex items-center gap-2 text-xs text-amber-700 py-4 justify-center bg-white rounded-lg border border-amber-100">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Memuat gambar bukti...</span>
                        </div>
                      ) : screenshotSrc ? (
                        <div className="bg-white border border-amber-100 rounded-lg p-2 max-w-sm mx-auto shadow-2xs">
                          <img src={screenshotSrc} alt="Bukti Validasi Manual" className="max-h-60 mx-auto rounded object-contain" />
                        </div>
                      ) : (
                        <p className="text-[10px] text-amber-600 italic">Bukti foto tidak dapat dimuat or kosong.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Internal Admin & Complaint Notes Section (Visible to Admin only) */}
              {!isMonitoring && (
                <div className="bg-neutral-50/70 border border-[#E5E7EB] rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center justify-between border-b border-neutral-200/50 pb-2">
                    <div className="flex items-center gap-2 text-neutral-800 font-bold text-[11px] uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Catatan Pengaduan & Bukti Admin</span>
                    </div>
                    {!isEditingNotes && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditNotesText(previewInvoiceOrder.adminComplaintNotes || "");
                          setEditNotesPhotoId(previewInvoiceOrder.adminComplaintPhotoId || null);
                          setIsEditingNotes(true);
                        }}
                        className="text-[10px] font-extrabold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md px-2 py-1 transition-all cursor-pointer"
                      >
                        Edit Catatan & Bukti
                      </button>
                    )}
                  </div>

                  {isEditingNotes ? (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                          Catatan Internal / Komplain
                        </label>
                        <textarea
                          value={editNotesText}
                          onChange={(e) => setEditNotesText(e.target.value)}
                          placeholder="Masukkan catatan komplain atau keluhan pelanggan jika ada..."
                          rows={3}
                          className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40 bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                          Bukti Foto Pendukung
                        </label>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-4 bg-white hover:bg-neutral-50 transition relative cursor-pointer min-h-[70px] text-center">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleComplaintFileChange}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              title="Pilih Foto Bukti"
                            />
                            <Upload className="h-5 w-5 text-[#9CA3AF] mb-1" />
                            <span className="text-[10px] font-bold text-[#4B5563]">
                              {complaintPhotoFile ? "Ganti Foto Bukti" : "Upload Foto Bukti Komplain"}
                            </span>
                            <span className="text-[8px] text-[#9CA3AF] mt-0.5">JPEG, PNG, WebP (Maks 15MB)</span>
                          </div>
                          {(complaintPhotoPreview || complaintPhotoSrc) && (
                            <div className="relative shrink-0">
                              <img
                                src={complaintPhotoPreview || complaintPhotoSrc || ""}
                                alt="Bukti komplain"
                                className="h-16 w-16 object-contain rounded-lg border border-[#E5E7EB] bg-neutral-100"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setComplaintPhotoFile(null);
                                  setComplaintPhotoPreview(null);
                                  setEditNotesPhotoId(null);
                                  setComplaintPhotoSrc(null);
                                }}
                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm border border-white cursor-pointer"
                                title="Hapus foto"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {uploadingComplaint && uploadComplaintProgress > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[9px] text-[#6B7280]">
                            <span>Mengunggah bukti...</span>
                            <span>{uploadComplaintProgress}%</span>
                          </div>
                          <div className="h-1 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                            <svg className="h-full w-full">
                              <rect
                                className="fill-amber-500 transition-all duration-150"
                                height="100%"
                                width={`${uploadComplaintProgress}%`}
                              />
                            </svg>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 border-t border-neutral-100">
                        <Button
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                          size="sm"
                          className="bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-lg text-[10px] font-bold py-1 px-3"
                        >
                          {savingNotes ? "Menyimpan..." : "Simpan Catatan"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setIsEditingNotes(false);
                            setComplaintPhotoFile(null);
                            setComplaintPhotoPreview(null);
                          }}
                          disabled={savingNotes}
                          size="sm"
                          className="px-3 border border-[#D1D5DB] rounded-lg hover:bg-neutral-50 text-[10px] font-bold py-1"
                        >
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 text-[11px] text-neutral-700">
                      <div>
                        <span className="font-bold text-neutral-500 block uppercase text-[9px] tracking-wider mb-0.5">Catatan Keluhan / Komplain Admin:</span>
                        <p className="whitespace-pre-wrap leading-relaxed text-neutral-800 bg-white border border-[#E5E7EB] rounded-lg p-2.5">
                          {previewInvoiceOrder.adminComplaintNotes || "Tidak ada catatan komplain."}
                        </p>
                      </div>

                      {previewInvoiceOrder.adminComplaintPhotoId && (
                        <div>
                          <span className="font-bold text-neutral-500 block uppercase text-[9px] tracking-wider mb-1">Bukti Foto / Screenshot Komplain:</span>
                          {loadingComplaintPhoto ? (
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 py-4 justify-center bg-white rounded-lg border border-neutral-100">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Memuat gambar bukti komplain...</span>
                            </div>
                          ) : complaintPhotoSrc ? (
                            <div className="bg-white border border-neutral-200 rounded-lg p-2 max-w-xs shadow-2xs">
                              <a href={complaintPhotoSrc} target="_blank" rel="noreferrer" title="Lihat ukuran penuh" className="block cursor-zoom-in">
                                <img src={complaintPhotoSrc} alt="Bukti Komplain" className="max-h-48 rounded object-contain mx-auto" />
                              </a>
                            </div>
                          ) : (
                            <p className="text-[10px] text-red-500 italic">Bukti foto tidak dapat dimuat atau kosong.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Invoice Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50 rounded-xl p-4 border border-[#E5E7EB]">
                <div className="space-y-2">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Detail Pengiriman & Acara
                  </h5>
                  <div className="space-y-1 text-neutral-700">
                    {previewInvoiceOrder.customerName ? (
                      <>
                        <p className="font-semibold text-neutral-900 text-xs sm:text-sm">Pemesan: {previewInvoiceOrder.customerName}</p>
                        <p className="font-semibold text-neutral-900 text-xs sm:text-sm">Penerima: {previewInvoiceOrder.recipientName}</p>
                      </>
                    ) : (
                      <p className="font-semibold text-neutral-900">{previewInvoiceOrder.recipientName}</p>
                    )}
                    <p className="text-[10px] text-neutral-500">{previewInvoiceOrder.institutionName}</p>
                    <p className="font-mono text-[10px]">{previewInvoiceOrder.recipientPhone}</p>
                    <p className="text-[10px] leading-relaxed">{previewInvoiceOrder.deliveryAddress}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Informasi Tagihan
                  </h5>
                  <div className="space-y-1 text-neutral-700">
                    <p>Jam Pemberangkatan: <span className="font-bold">{(() => {
                      if (!previewInvoiceOrder.eventDate) return "—";
                      const dObj = new Date(previewInvoiceOrder.eventDate);
                      if (isNaN(dObj.getTime())) return previewInvoiceOrder.eventDate;
                      const fd = dObj.toLocaleDateString("id-ID", { dateStyle: "long" });
                      if (previewInvoiceOrder.eventDate.includes("T")) {
                        const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
                        return `${fd} ${ft}`;
                      }
                      return fd;
                    })()}</span></p>
                    <p>Jatuh Tempo: <span className="font-bold text-red-600">{new Date(previewInvoiceOrder.paymentDueDate).toLocaleDateString("id-ID", { dateStyle: "long" })}</span></p>
                    <div className="pt-1.5 border-t border-[#E5E7EB] mt-1.5 flex justify-between items-center text-[10px] font-semibold uppercase">
                      <span className="text-neutral-500">Tipe Pesanan:</span>
                      <span className="text-neutral-950 font-bold">{previewInvoiceOrder.orderType}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Items Table */}
              <div className="space-y-2">
                <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                  Rincian Pesanan
                </h5>
                <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-[#E5E7EB] text-[9px] font-bold text-neutral-500 uppercase tracking-wider">
                        <th className="py-2.5 px-4 w-16 text-center">Foto</th>
                        <th className="py-2.5 px-4">Menu Item</th>
                        <th className="py-2.5 px-4 text-center w-24">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB] text-neutral-700">
                      {previewInvoiceOrder.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50/50">
                          <td className="py-2 px-4 text-center">
                            <div className="w-10 h-10 bg-[#F3F4F6] rounded-lg overflow-hidden border border-[#E5E7EB] shrink-0 relative flex items-center justify-center mx-auto">
                              <ProductImage
                                imageUrl={it.imageUrl}
                                alt={it.itemName}
                                className="absolute inset-0 h-full w-full object-cover"
                                fallbackClassName="h-4 w-4 text-[#9CA3AF]"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-4 font-bold text-neutral-900">
                            <div>{it.itemName}</div>
                            {(it.recipientName || it.deliveryAddress || it.deliveryTime) && (
                              <div className="text-[10px] text-amber-700 font-semibold mt-1 leading-normal font-sans">
                                *Kirim ke: {it.recipientName || "—"} - {it.deliveryAddress ? it.deliveryAddress.split(" | ")[0] : "—"} - {it.deliveryTime ? it.deliveryTime.replace("T", " ") : "—"}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center font-bold font-mono">
                            {previewInvoiceOrder.isPreOrder ? "Pra-pesanan" : `×${it.quantity}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Ingredients Composition */}
              {(() => {
                if (previewInvoiceOrder.isPreOrder) return null;
                const ingredients = aggregateIngredients(previewInvoiceOrder.items);
                if (ingredients.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                      Total Kebutuhan Bahan
                    </h5>
                    <div className="border border-[#E5E7EB] rounded-xl p-4 bg-neutral-50 text-[11px] font-semibold text-[#4B5563]">
                      <div className="divide-y divide-[#E5E7EB]">
                        {ingredients.map((ing, idx) => (
                          <div key={idx} className="py-2 flex justify-between items-center">
                            <span className="capitalize">{ing.name}</span>
                            <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                              {ing.amount} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Food/Drink Details Notes */}
              {(previewInvoiceOrder.foodDetails || previewInvoiceOrder.drinkDetails || previewInvoiceOrder.recipientNotes) && (
                <div className="space-y-2 p-4 bg-amber-50/50 rounded-xl border border-amber-200/50 text-[#78350F]">
                  <h6 className="font-bold uppercase tracking-wider text-[9px] text-amber-800">Catatan Detail Hidangan</h6>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    {previewInvoiceOrder.foodDetails && (
                      <div>
                        <span className="font-bold">Request Menu:</span>
                        <p className="mt-0.5">{previewInvoiceOrder.foodDetails}</p>
                      </div>
                    )}
                    {previewInvoiceOrder.drinkDetails && (
                      <div>
                        <span className="font-bold">Detail Minuman:</span>
                        <p className="mt-0.5">{previewInvoiceOrder.drinkDetails}</p>
                      </div>
                    )}
                    {previewInvoiceOrder.recipientNotes && (
                      <div className="col-span-full pt-1.5 border-t border-amber-200/30">
                        <span className="font-bold">Catatan Lokasi:</span>
                        <p className="mt-0.5">{previewInvoiceOrder.recipientNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Foto Mulai Memasak (Dapur Produksi) */}
              {previewInvoiceOrder.productionStartPhotoId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200 font-['Hanken_Grotesk']">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Foto Mulai Memasak (Dapur Produksi)
                  </h5>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-neutral-50 p-4 flex flex-col items-center justify-center">
                    {loadingProductionPhoto ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-500 py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                        <span>Memuat foto mulai memasak...</span>
                      </div>
                    ) : productionStartPhotoSrc ? (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-2 max-w-sm w-full shadow-2xs">
                        <img
                          src={productionStartPhotoSrc}
                          alt="Foto Mulai Memasak"
                          className="max-h-64 mx-auto rounded object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-neutral-500 italic">Foto mulai memasak tidak dapat dimuat atau kosong.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Foto Kurir Mulai OTW (Start Delivery) */}
              {previewInvoiceOrder.deliveryStartPhotoId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200 font-['Hanken_Grotesk']">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Foto Kurir Mulai OTW (Start Delivery)
                  </h5>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-neutral-50 p-4 flex flex-col items-center justify-center">
                    {loadingCourierStartPhoto ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-500 py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                        <span>Memuat foto mulai OTW...</span>
                      </div>
                    ) : courierStartPhotoSrc ? (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-2 max-w-sm w-full shadow-2xs">
                        <img
                          src={courierStartPhotoSrc}
                          alt="Foto Kurir Mulai OTW"
                          className="max-h-64 mx-auto rounded object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-neutral-500 italic">Foto mulai OTW tidak dapat dimuat atau kosong.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Bukti Pengiriman Kurir & Tanda Tangan */}
              {previewInvoiceOrder.proofFileIds && previewInvoiceOrder.proofFileIds.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200 font-['Hanken_Grotesk']">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Bukti Pengiriman Kurir & TTD Penerima
                  </h5>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-neutral-50 p-4 space-y-4">
                    {loadingCourierProofPhotos ? (
                      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                        <span>Memuat bukti pengiriman...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Photos */}
                        <div className="space-y-2">
                          <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                            Foto Dokumentasi Penerimaan
                          </span>
                          {courierProofPhotoSrcs.length > 1 ? (
                            <div className="space-y-2">
                              {courierProofPhotoSrcs.slice(0, -1).map((src, idx) => (
                                <div key={idx} className="bg-white border border-[#E5E7EB] rounded-lg p-2 shadow-2xs">
                                  <img
                                    src={src}
                                    alt={`Bukti Pengiriman #${idx + 1}`}
                                    className="max-h-48 mx-auto rounded object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-neutral-500 italic">Tidak ada foto dokumentasi.</p>
                          )}
                        </div>

                        {/* Signature */}
                        <div className="space-y-2">
                          <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                            Tanda Tangan Penerima (PIC)
                          </span>
                          {courierProofPhotoSrcs.length > 0 ? (
                            <div className="bg-white border border-[#E5E7EB] rounded-lg p-2 shadow-2xs flex items-center justify-center aspect-video">
                              <img
                                src={courierProofPhotoSrcs[courierProofPhotoSrcs.length - 1]}
                                alt="Tanda Tangan Penerima"
                                className="max-h-32 object-contain"
                              />
                            </div>
                          ) : (
                            <p className="text-[10px] text-neutral-500 italic">Tidak ada tanda tangan.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tanda Tangan Serah Terima Dapur */}
              {previewInvoiceOrder.kitchenSignatures && previewInvoiceOrder.kitchenSignatures.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200 font-['Hanken_Grotesk']">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Tanda Tangan Serah Terima Dapur Produksi
                  </h5>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-neutral-50 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {previewInvoiceOrder.kitchenSignatures.map((ks, idx) => (
                        <div key={idx} className="bg-white border border-[#E5E7EB] rounded-xl p-3 shadow-2xs flex flex-col justify-between space-y-2">
                          <div className="flex justify-between items-center bg-neutral-50 rounded-lg px-2 py-0.5 border border-[#E5E7EB]">
                            <span className="text-[11px] font-black text-[#111827]">{ks.kitchenName}</span>
                            <span className="text-[9px] text-[#6B7280]">
                              {new Date(ks.signedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                            </span>
                          </div>
                          <div className="aspect-video w-full flex items-center justify-center bg-neutral-50/30 rounded-lg border border-[#E5E7EB] p-2">
                            <img src={ks.signatureDataUrl} alt={`TTD ${ks.kitchenName}`} className="max-h-24 object-contain" />
                          </div>
                          <div className="text-center text-[11px]">
                            <span className="text-neutral-400 font-medium">Staf: </span>
                            <span className="font-extrabold text-[#374151]">{ks.staffName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bukti Pembayaran Pelanggan */}
              {previewInvoiceOrder.paymentProofFileId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <h5 className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Bukti Pembayaran Pelanggan
                  </h5>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-neutral-50 p-4 flex flex-col items-center justify-center">
                    {loadingProof ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-500 py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                        <span>Memuat bukti pembayaran...</span>
                      </div>
                    ) : proofImageSrc ? (
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-2 max-w-sm w-full shadow-2xs">
                        <img
                          src={proofImageSrc}
                          alt="Bukti Pembayaran"
                          className="max-h-64 mx-auto rounded object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-neutral-500 italic">Bukti pembayaran tidak dapat dimuat atau kosong.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Pricing Totals */}
              <div className="pt-4 border-t border-[#F3F4F6] space-y-2">
                <div className="flex justify-between items-center text-xs text-neutral-500">
                  <span>Subtotal Pesanan:</span>
                  <span>{formatIDR(previewInvoiceOrder.totalPrice + (previewInvoiceOrder.discountAmount || 0) - (previewInvoiceOrder.additionalFee || 0))}</span>
                </div>
                {previewInvoiceOrder.discountAmount !== undefined && previewInvoiceOrder.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs text-emerald-600 font-semibold">
                    <span>Diskon Promo ({previewInvoiceOrder.promoCode}):</span>
                    <span>-{formatIDR(previewInvoiceOrder.discountAmount)}</span>
                  </div>
                )}
                {previewInvoiceOrder.additionalFee !== undefined && previewInvoiceOrder.additionalFee > 0 && (
                  <div className="flex justify-between items-center text-xs text-neutral-500 pb-1">
                    <span>Biaya Tambahan:</span>
                    <span>{formatIDR(previewInvoiceOrder.additionalFee)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
                  <span className="font-['Manrope'] font-extrabold text-sm text-neutral-900">Grand Total Tagihan:</span>
                  <span className="font-['Manrope'] font-black text-lg text-[#D97706]">{formatIDR(previewInvoiceOrder.totalPrice)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-[#E5E7EB] flex justify-end gap-2 shrink-0">
              <Button
                onClick={() => exportSingleOrderToPDF(previewInvoiceOrder)}
                className="bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl text-xs py-2 px-4 h-9 flex items-center gap-1.5 font-bold cursor-pointer"
                disabled={exportingOrderId === previewInvoiceOrder.id}
              >
                {exportingOrderId === previewInvoiceOrder.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengekspor...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Unduh PDF</span>
                  </>
                )}
              </Button>
              <Button
                onClick={() => exportSingleOrderToJPG(previewInvoiceOrder)}
                className="bg-amber-500 hover:bg-amber-600 text-[#111827] rounded-xl text-xs py-2 px-4 h-9 flex items-center gap-1.5 font-bold cursor-pointer"
                disabled={exportingJpgOrderId === previewInvoiceOrder.id}
              >
                {exportingJpgOrderId === previewInvoiceOrder.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengekspor JPG...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Unduh JPG</span>
                  </>
                )}
              </Button>
              {!isMonitoring && (
                <Button
                  onClick={async () => {
                    if (previewInvoiceOrder) {
                      await handleDeleteOrder(previewInvoiceOrder.id);
                      setPreviewInvoiceOrder(null);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs py-2 px-4 h-9 cursor-pointer font-bold flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Pesanan</span>
                </Button>
              )}
              <Button
                onClick={() => setPreviewInvoiceOrder(null)}
                className="bg-[#1E293B] hover:bg-[#0F172A] text-white rounded-xl text-xs py-2 px-4 h-9 cursor-pointer font-bold"
              >
                Tutup
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* Hidden print-ready container for html2canvas JPG export */}
      {exportingJpgOrder && (
        <div id="jpg-export-container" className="jpg-exp-container">
          <style dangerouslySetInnerHTML={{ __html: `
            .jpg-exp-container {
              position: fixed;
              left: -9999px;
              top: 0;
              width: 600px;
              background-color: #ffffff;
              padding: 32px;
              font-family: 'Hanken Grotesk', system-ui, sans-serif;
              color: #1f2937;
            }
            .jpg-exp-gold-bar {
              height: 4px;
              background-color: #D97706;
              margin-bottom: 20px;
            }
            .jpg-exp-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #f3f4f6;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .jpg-exp-header-left h2 {
              font-size: 18px;
              font-weight: 800;
              color: #D97706;
              margin: 0;
            }
            .jpg-exp-header-left p {
              font-size: 11px;
              color: #6b7280;
              margin: 4px 0 0 0;
            }
            .jpg-exp-header-right {
              text-align: right;
            }
            .jpg-exp-badge {
              display: inline-block;
              padding: 4px 10px;
              background-color: #fffbeb;
              border: 1px solid #fde68a;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: 700;
              color: #b45309;
              text-transform: uppercase;
            }
            .jpg-exp-header-right p {
              font-size: 10px;
              color: #9ca3af;
              margin: 4px 0 0 0;
            }
            .jpg-exp-meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 20px;
              font-size: 11px;
            }
            .jpg-exp-meta-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              color: #6b7280;
              margin: 0 0 8px 0;
            }
            .jpg-exp-meta-name {
              font-weight: 700;
              color: #111827;
              margin: 0 0 4px 0;
            }
            .jpg-exp-meta-text {
              color: #6b7280;
              margin: 0 0 4px 0;
            }
            .jpg-exp-meta-phone {
              font-family: monospace;
              margin: 0 0 4px 0;
            }
            .jpg-exp-meta-address {
              margin: 0;
            }
            .jpg-exp-meta-info-line {
              margin: 0 0 4px 0;
            }
            .jpg-exp-meta-info-line span {
              font-weight: 700;
            }
            .jpg-exp-meta-info-line span.due-date {
              font-weight: 700;
              color: #dc2626;
            }
            .jpg-exp-section {
              margin-bottom: 20px;
            }
            .jpg-exp-section h4 {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              color: #6b7280;
              margin: 0 0 8px 0;
            }
            .jpg-exp-table-wrapper {
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              overflow: hidden;
            }
            .jpg-exp-table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
              font-size: 11px;
            }
            .jpg-exp-table tr.header-row {
              background-color: #f9fafb;
              border-bottom: 1px solid #e5e7eb;
            }
            .jpg-exp-table th {
              padding: 8px 12px;
            }
            .jpg-exp-table th.w-40 {
              width: 40px;
            }
            .jpg-exp-table th.w-80-center {
              width: 80px;
              text-align: center;
            }
            .jpg-exp-table td {
              padding: 8px 12px;
            }
            .jpg-exp-table td.qty-cell {
              text-align: center;
              font-weight: 700;
              font-family: monospace;
            }
            .jpg-exp-table td.name-cell {
              font-weight: 700;
            }
            .jpg-exp-table tbody tr:not(:last-child) {
              border-bottom: 1px solid #e5e7eb;
            }
            .jpg-exp-image-box {
              width: 36px;
              height: 36px;
              background-color: #f3f4f6;
              border-radius: 6px;
              overflow: hidden;
              border: 1px solid #e5e7eb;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .jpg-exp-ingredients-box {
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 12px;
              background-color: #f9fafb;
              font-size: 11px;
            }
            .jpg-exp-ingredients-list {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .jpg-exp-ingredient-badge {
              display: flex;
              align-items: center;
              gap: 6px;
              background-color: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 6px 10px;
              font-weight: 600;
            }
            .jpg-exp-ingredient-badge span.name {
              text-transform: capitalize;
            }
            .jpg-exp-ingredient-badge span.amount {
              color: #b45309;
              font-family: monospace;
              font-weight: 700;
            }
            .jpg-exp-pricing-breakdown {
              border-top: 1px solid #f3f4f6;
              padding-top: 12px;
              font-size: 11px;
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .jpg-exp-pricing-row {
              display: flex;
              justify-content: space-between;
              color: #6b7280;
            }
            .jpg-exp-pricing-row.discount {
              color: #10b981;
              font-weight: 600;
            }
            .jpg-exp-pricing-row.total {
              border-top: 1px solid #e5e7eb;
              padding-top: 8px;
              margin-top: 4px;
              font-size: 13px;
              font-weight: 800;
              color: #D97706;
            }
            .jpg-exp-validation-box {
              border-top: 1px solid #f3f4f6;
              padding-top: 12px;
              margin-top: 16px;
              font-size: 10px;
              color: #4b5563;
            }
            .jpg-exp-ttd-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
            }
            .jpg-exp-ttd-row p.title {
              font-weight: 700;
              color: #065f46;
              margin: 0;
            }
            .jpg-exp-ttd-row p.subtitle {
              color: #047857;
              font-size: 9px;
              margin: 4px 0 0 0;
            }
            .jpg-exp-ttd-image {
              max-height: 32px;
              border: 1px solid #e5e7eb;
              border-radius: 4px;
              padding: 2px;
            }
            .jpg-exp-manual-title {
              font-weight: 700;
              color: #92400e;
              margin: 0;
            }
            .jpg-exp-manual-subtitle {
              color: #b45309;
              font-size: 9px;
              margin: 4px 0 0 0;
            }
          ` }} />

          {/* Top Gold Border */}
          <div className="jpg-exp-gold-bar" />

          {/* Koperasi Header */}
          <div className="jpg-exp-header">
            <div className="jpg-exp-header-left">
              <h2>KOPERASI AL-UMANAA</h2>
              <p>Pesantren Al-Umanaa, Sukabumi, Jawa Barat</p>
            </div>
            <div className="jpg-exp-header-right">
              <span className="jpg-exp-badge">Invoice Resmi</span>
              <p>ID: #{exportingJpgOrder.id.toUpperCase()}</p>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="jpg-exp-meta-grid">
            <div>
              <h4 className="jpg-exp-meta-title">Pengiriman & Acara</h4>
              {exportingJpgOrder.customerName ? (
                <>
                  <p className="jpg-exp-meta-name">Pemesan: {exportingJpgOrder.customerName}</p>
                  <p className="jpg-exp-meta-name">Penerima: {exportingJpgOrder.recipientName}</p>
                </>
              ) : (
                <p className="jpg-exp-meta-name">{exportingJpgOrder.recipientName}</p>
              )}
              <p className="jpg-exp-meta-text">{exportingJpgOrder.institutionName}</p>
              <p className="jpg-exp-meta-phone">{exportingJpgOrder.recipientPhone}</p>
              <p className="jpg-exp-meta-address">{exportingJpgOrder.deliveryAddress}</p>
            </div>
            <div>
              <h4 className="jpg-exp-meta-title">Informasi Tagihan</h4>
              <p className="jpg-exp-meta-info-line">Tanggal Input: <span>{new Date(exportingJpgOrder.createdAt).toLocaleDateString("id-ID")}</span></p>
              <p className="jpg-exp-meta-info-line">Jam Pemberangkatan: <span>{(() => {
                if (!exportingJpgOrder.eventDate) return "—";
                const dObj = new Date(exportingJpgOrder.eventDate);
                if (isNaN(dObj.getTime())) return exportingJpgOrder.eventDate;
                const fd = dObj.toLocaleDateString("id-ID");
                if (exportingJpgOrder.eventDate.includes("T")) {
                  const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
                  return `${fd} ${ft}`;
                }
                return fd;
              })()}</span></p>
              <p className="jpg-exp-meta-info-line">Harus Sampai: <span>{exportingJpgOrder.deliveryTime}</span></p>
              <p className="jpg-exp-meta-info-line">Jatuh Tempo: <span className="due-date">{new Date(exportingJpgOrder.paymentDueDate).toLocaleDateString("id-ID")}</span></p>
              {exportingJpgOrder.kitchen && (
                <p className="jpg-exp-meta-info-line">Dapur: <span>{exportingJpgOrder.kitchen}</span></p>
              )}
            </div>
          </div>

          {/* Menu Items Table */}
          <div className="jpg-exp-section">
            <h4>Rincian Pesanan</h4>
            <div className="jpg-exp-table-wrapper">
              <table className="jpg-exp-table">
                <thead>
                  <tr className="header-row">
                    <th className="w-40">Foto</th>
                    <th>Menu Item</th>
                    <th className="w-80-center">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {exportingJpgOrder.items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="jpg-exp-image-box">
                          <ProductImage
                            imageUrl={it.imageUrl}
                            alt={it.itemName}
                            className="h-full w-full object-cover"
                            fallbackClassName="h-3.5 w-3.5 text-neutral-400 mx-auto"
                          />
                        </div>
                      </td>
                      <td className="name-cell">
                        <div>{it.itemName}</div>
                        {(it.recipientName || it.deliveryAddress || it.deliveryTime) && (
                          <div className="text-[10px] text-amber-700 font-semibold mt-1 leading-normal">
                            *Kirim ke: {it.recipientName || "—"} - {it.deliveryAddress ? it.deliveryAddress.split(" | ")[0] : "—"} - {it.deliveryTime ? it.deliveryTime.replace("T", " ") : "—"}
                          </div>
                        )}
                      </td>
                      <td className="qty-cell">
                        {exportingJpgOrder.isPreOrder ? "Pra-pesanan" : `×${it.quantity}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Aggregated Ingredients Composition */}
          {(() => {
            if (exportingJpgOrder.isPreOrder) return null;
            const ingredients = aggregateIngredients(exportingJpgOrder.items);
            if (ingredients.length === 0) return null;
            return (
              <div className="jpg-exp-section">
                <h4>Total Kebutuhan Bahan (Komposisi Total)</h4>
                <div className="jpg-exp-ingredients-box">
                  <div className="jpg-exp-ingredients-list">
                    {ingredients.map((ing, idx) => (
                      <div key={idx} className="jpg-exp-ingredient-badge">
                        <span className="name">{ing.name}</span>
                        <span className="amount">{ing.amount} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Pricing breakdown */}
          <div className="jpg-exp-pricing-breakdown">
            <div className="jpg-exp-pricing-row">
              <span>Subtotal Pesanan:</span>
              <span>{formatIDR(exportingJpgOrder.totalPrice + (exportingJpgOrder.discountAmount || 0) - (exportingJpgOrder.additionalFee || 0))}</span>
            </div>
            {exportingJpgOrder.discountAmount !== undefined && exportingJpgOrder.discountAmount > 0 && (
              <div className="jpg-exp-pricing-row discount">
                <span>Diskon Promo ({exportingJpgOrder.promoCode}):</span>
                <span>-{formatIDR(exportingJpgOrder.discountAmount)}</span>
              </div>
            )}
            {exportingJpgOrder.additionalFee !== undefined && exportingJpgOrder.additionalFee > 0 && (
              <div className="jpg-exp-pricing-row">
                <span>Biaya Tambahan:</span>
                <span>{formatIDR(exportingJpgOrder.additionalFee)}</span>
              </div>
            )}
            <div className="jpg-exp-pricing-row total">
              <span>Grand Total Tagihan:</span>
              <span>{formatIDR(exportingJpgOrder.totalPrice)}</span>
            </div>
          </div>

          {/* Signatures / Validations */}
          {(exportingJpgOrder.invoiceSignedAt || exportingJpgOrder.manualValidation) && (
            <div className="jpg-exp-validation-box">
              {exportingJpgOrder.invoiceSignedAt ? (
                <div className="jpg-exp-ttd-row">
                  <div>
                    <p className="title">✓ Tanda Tangan Digital Pelanggan Valid</p>
                    <p className="subtitle">Diverifikasi: {new Date(exportingJpgOrder.invoiceSignedAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  {exportingJpgOrder.invoiceSignatureData && (
                    <img src={exportingJpgOrder.invoiceSignatureData} alt="TTD" className="jpg-exp-ttd-image" />
                  )}
                </div>
              ) : (
                <div>
                  <p className="jpg-exp-manual-title">✓ Validasi Manual Admin ({exportingJpgOrder.manualValidation?.validatedBy})</p>
                  <p className="jpg-exp-manual-subtitle">No. Kontak: {exportingJpgOrder.manualValidation?.contactPhone}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OrdersPage;
