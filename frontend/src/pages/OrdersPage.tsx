import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Calendar, Copy, ExternalLink, AlertTriangle, ShieldCheck, CheckCircle2, User, Phone, FileDown, X, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import { transitionOrder, updatePaymentStatus, manuallyValidateOrder, type TransitionAction } from "@/services/orderService";
import type { Order, OrderStatus, PaymentStatus } from "@/types/order";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ManualValidationModal } from "@/admin/pages/ManualValidationModal";
import { formatIDR } from "@/lib/format";
import { ProductImage } from "@/components/ProductImage";

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
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Error loading logo for PDF:", err);
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
  
  // Modal states
  const [validationTargetId, setValidationTargetId] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [previewInvoiceOrder, setPreviewInvoiceOrder] = useState<Order | null>(null);

  // Manual validation screenshot states
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [exportingOrderId, setExportingOrderId] = useState<string | null>(null);

  // Payment proof states
  const [proofImageSrc, setProofImageSrc] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Production start photo states
  const [productionStartPhotoSrc, setProductionStartPhotoSrc] = useState<string | null>(null);
  const [loadingProductionPhoto, setLoadingProductionPhoto] = useState(false);

  useEffect(() => {
    if (!previewInvoiceOrder) {
      setScreenshotSrc(null);
      setProofImageSrc(null);
      setProductionStartPhotoSrc(null);
      return;
    }

    const screenshotIds = previewInvoiceOrder.manualValidation?.screenshotFileIds;
    if (screenshotIds && screenshotIds.length > 0) {
      const loadScreenshot = async () => {
        setLoadingScreenshot(true);
        try {
          const dataUri = await fetchImageBase64(screenshotIds[0]);
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

    return matchSearch && matchStatus && matchPayment;
  });

  const exportSingleOrderToPDF = async (order: Order) => {
    setExportingOrderId(order.id);
    try {
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
      doc.text(`Penerima: ${order.recipientName}`, 14, y);
      y += 4;
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
      doc.text(`Tanggal Acara: ${new Date(order.eventDate).toLocaleDateString("id-ID")}`, pageW / 2 + 10, rightY);
      rightY += 4;
      doc.text(`Waktu Acara: ${order.deliveryTime}`, pageW / 2 + 10, rightY);
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

      const tableItemsBody = order.items.map((it) => [
        it.itemName,
        `× ${it.quantity}`
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Menu / Barang", "Jumlah (Porsi / Unit)"]],
        body: tableItemsBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3 },
        bodyStyles: { fontSize: 8.5, textColor: slateDark, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: pageW - 28 - 40 },
          1: { halign: "center", cellWidth: 40, fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
      });

      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // Food/Drink Details Notes & Grand Total
      const notesLines: string[] = [];
      if (order.foodDetails) notesLines.push(`Detail Makanan: ${order.foodDetails}`);
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

      // Grand Total box
      doc.setFillColor(...brandYellowCream);
      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.rect(14, y, pageW - 28, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...slateDark);
      doc.text("GRAND TOTAL TAGIHAN:", 18, y + 7.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...brandAmberDark);
      doc.text(`Rp ${order.totalPrice.toLocaleString("id-ID")}`, pageW - 18, y + 7.5, { align: "right" });
      y += 20;

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
          const screenshotDataUri = await fetchImageBase64(screenshotIds[0]);
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

  const exportOrdersToPDF = async () => {
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
      PENDING: "Menunggu", IN_PRODUCTION: "Produksi", QC: "Uji QC",
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
    const tableBody = filteredOrders.map(o => [
      `#${o.id.slice(-6).toUpperCase()}`,
      `${o.institutionName}\n${o.recipientName}`,
      [o.foodDetails, o.drinkDetails].filter(Boolean).join(" + ") || "-",
      `Rp ${o.totalPrice.toLocaleString()}`,
      `${o.eventDate}\n${o.deliveryTime}`,
      statusLabels[o.status] || o.status,
      paymentLabels[o.paymentStatus] || o.paymentStatus,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["ID", "Instansi & Penerima", "Detail Pesanan", "Harga", "Jadwal / Tempo", "Status Ops.", "Pembayaran"]],
      body: tableBody,
      theme: "striped",
      styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
      headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8, halign: "center", cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 2.5, overflow: "linebreak" },
      columnStyles: {
        0: { halign: "center", cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 50 },
        2: { cellWidth: 65 },
        3: { halign: "right", cellWidth: 30, fontStyle: "bold" },
        4: { halign: "center", cellWidth: 35 },
        5: { halign: "center", cellWidth: 34 },
        6: { halign: "center", cellWidth: 33 },
      },
      alternateRowStyles: { fillColor: brandYellowCream },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        // Color code payment status
        if (data.section === "body" && data.column.index === 6) {
          const val = String(data.cell.raw);
          if (val === "Lunas") data.cell.styles.textColor = [5, 150, 105];
          else if (val === "Jatuh Tempo") data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        }
        // Color code operational status
        if (data.section === "body" && data.column.index === 5) {
          const val = String(data.cell.raw);
          if (val === "Selesai" || val === "Terkirim") data.cell.styles.textColor = [5, 150, 105];
          else if (val === "Gagal" || val === "Ditolak") data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [55, 65, 81];
          data.cell.styles.fontStyle = "bold";
        }
      },
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

      {/* Filters & Search */}
      <Card className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="Cari berdasarkan instansi, penerima, nomor telepon, atau ID..."
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
      </Card>

      {/* Desktop Table View (hidden on mobile, visible on md+) */}
      <div className="hidden md:block">
        <Card className="!p-0 overflow-hidden border border-[#E5E7EB] rounded-2xl shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                  <th className="py-4 px-6">ID / Tipe</th>
                  <th className="py-4 px-6">Instansi & Penerima</th>
                  <th className="py-4 px-6">Detail Pesanan & Harga</th>
                  <th className="py-4 px-6">Waktu Input & Acara / Tempo</th>
                  <th className="py-4 px-6">Status Operasional</th>
                  <th className="py-4 px-6">Status Pembayaran</th>
                  <th className="py-4 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#374151]">
                {filteredOrders.map((o) => {
                  const dueInfo = getDueDateInfo(o);
                  const isSigned = !!o.invoiceSignedAt;
                  const isManuallyValidated = !!o.manualValidation;
                  const shortId = o.id.slice(-6).toUpperCase();

                  return (
                    <tr key={o.id} className="hover:bg-neutral-50/50 transition-colors">
                      {/* ID / Tipe */}
                      <td className="py-4 px-6 font-['Hanken_Grotesk']">
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
                      </td>

                      {/* Instansi & Penerima */}
                      <td className="py-4 px-6">
                        <div className="font-bold text-[#111827]">{o.institutionName}</div>
                        <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-1 font-medium">
                          <User className="w-3.5 h-3.5 text-[#9CA3AF]" />
                          {o.recipientName}
                        </div>
                        <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-0.5 font-mono">
                          <Phone className="w-3.5 h-3.5 text-[#9CA3AF]" />
                          {o.recipientPhone}
                        </div>
                      </td>

                      {/* Detail Pesanan & Harga */}
                      <td className="py-4 px-6">
                        <div className="text-xs max-w-xs truncate text-[#4B5563]" title={o.foodDetails}>
                          {o.foodDetails}
                        </div>
                        {o.drinkDetails && (
                          <div className="text-[11px] text-[#6B7280] italic truncate mt-0.5" title={o.drinkDetails}>
                            Minuman: {o.drinkDetails}
                          </div>
                        )}
                        <div className="font-extrabold text-[#B45309] mt-1.5">
                          {formatIDR(o.totalPrice)}
                        </div>
                      </td>

                      {/* Tanggal Acara / Jatuh Tempo */}
                      <td className="py-4 px-6">
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
                          Acara: {new Date(o.eventDate).toLocaleDateString("id-ID")}
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${
                          dueInfo.isOverdue ? "text-[#EF4444]" : dueInfo.isWarning ? "text-[#F59E0B]" : "text-[#6B7280]"
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}
                          {dueInfo.isOverdue && <span className="text-[9px] font-extrabold bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-1 uppercase">Overdue</span>}
                        </div>
                      </td>

                      {/* Status Operasional */}
                      <td className="py-4 px-6">
                        <StatusBadge status={o.status} />
                      </td>

                      {/* Status Pembayaran */}
                      <td className="py-4 px-6">
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
                      <td className="py-4 px-6 text-center">
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
                              Kirim ke QC
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
                          </div>
                        </div>
                      </td>
                    </tr>
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

      {/* Mobile Card List View (visible on mobile, hidden on md+) */}
      <div className={`md:hidden ${isMonitoring ? "grid grid-cols-2 gap-3" : "space-y-4"}`}>
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
                className={`bg-white rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col justify-between text-[#374151] ${
                  isMonitoring ? "p-3 gap-2 text-xs" : "p-4 gap-3 text-sm"
                }`}
              >
                {/* Header: ID, Type & Operational Status */}
                <div className="flex flex-wrap items-center justify-between gap-1 pb-2 border-b border-[#F3F4F6]">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewInvoiceOrder(o)}
                      className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer focus:outline-none"
                      title="Lihat Detail Pesanan"
                    >
                      #{shortId}
                    </button>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                      o.orderType === "event" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"
                    }`}>
                      {o.orderType}
                    </span>
                  </div>
                  <StatusBadge
                    status={o.status}
                    className={isMonitoring ? "px-1.5 py-0.5 text-[9px] font-extrabold" : ""}
                  >
                    {isMonitoring ? statusShortLabels[o.status] : undefined}
                  </StatusBadge>
                </div>

                {/* Body: Recipient & Instansi */}
                <div className="space-y-1">
                  <div className={`font-extrabold text-[#111827] truncate ${isMonitoring ? "text-xs" : "text-base"}`} title={o.institutionName}>
                    {o.institutionName}
                  </div>
                  <div className="space-y-1 text-[#6B7280] text-[10px]">
                    <div className="flex items-center gap-1.5 font-medium truncate">
                      <User className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                      <span>{o.recipientName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono truncate">
                      <Phone className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                      <span>{o.recipientPhone}</span>
                    </div>
                  </div>
                </div>

                {/* Order Details & Price */}
                <div className="bg-[#F9FAFB] p-2.5 rounded-xl border border-[#F3F4F6] space-y-1">
                  <div className="text-[10px] text-[#4B5563] break-words line-clamp-2" title={o.foodDetails}>
                    {o.foodDetails}
                  </div>
                  {o.drinkDetails && !isMonitoring && (
                    <div className="text-[11px] text-[#6B7280] italic mt-1 break-words">
                      Minuman: {o.drinkDetails}
                    </div>
                  )}
                  <div className={`font-extrabold text-[#B45309] ${isMonitoring ? "text-xs" : "text-base"}`}>
                    {formatIDR(o.totalPrice)}
                  </div>
                </div>

                {/* Dates: Event & Due Date */}
                <div className="space-y-1 text-[10px] text-[#374151]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Calendar className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                    <span>Acara: {new Date(o.eventDate).toLocaleDateString("id-ID")}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 font-semibold ${
                    dueInfo.isOverdue ? "text-[#EF4444]" : dueInfo.isWarning ? "text-[#F59E0B]" : "text-[#6B7280]"
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}</span>
                  </div>
                </div>

                {/* Payment Status & Validation Badge */}
                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#F3F4F6]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {isMonitoring ? (
                        <span
                          className={`inline-block text-[9px] font-extrabold rounded-md px-1.5 py-0.5 border ${
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
                        <>
                          <span className="text-xs text-[#6B7280] font-medium">Pembayaran:</span>
                          <select
                            className={`text-xs font-bold rounded-lg px-2 py-1.5 border focus:outline-none cursor-pointer ${
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
                        </>
                      )}
                    </div>
                    <div>
                      {isSigned ? (
                        <button
                          type="button"
                          onClick={() => setPreviewInvoiceOrder(o)}
                          className="inline-flex items-center gap-1 text-[9px] font-bold text-[#10B981] bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5 hover:bg-emerald-100 transition-colors cursor-pointer"
                          title="Lihat Tanda Tangan"
                        >
                          <ShieldCheck className="w-3 h-3" /> TTD
                        </button>
                      ) : isManuallyValidated ? (
                        <button
                          type="button"
                          onClick={() => setPreviewInvoiceOrder(o)}
                          className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Lihat Validasi Manual"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Valid
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#6B7280] bg-neutral-100 rounded-md px-1.5 py-0.5">
                          Belum Valid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#F3F4F6]">
                  {/* Status Transition buttons */}
                  {!isMonitoring && o.status === "PENDING" && (
                    <button
                      className="bg-[#D97706] hover:bg-[#B45309] text-white w-full h-10 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      onClick={() => handleTransition(o.id, "start-production")}
                      disabled={transitioningId === o.id}
                    >
                      Mulai Masak
                    </button>
                  )}
                  {!isMonitoring && o.status === "IN_PRODUCTION" && (
                    <button
                      className="bg-purple-600 hover:bg-purple-700 text-white w-full h-10 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      onClick={() => handleTransition(o.id, "complete-production")}
                      disabled={transitioningId === o.id}
                    >
                      Kirim ke QC
                    </button>
                  )}
                  {!isMonitoring && o.status === "QC" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        onClick={() => handleTransition(o.id, "qc-pass")}
                        disabled={transitioningId === o.id}
                      >
                        Lolos
                      </button>
                      <button
                        className="bg-red-600 hover:bg-red-700 text-white h-10 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
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
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleCopyLink(o)}
                        className="flex-1 flex items-center justify-center border border-[#D1D5DB] rounded-xl hover:bg-neutral-100 transition-all h-9 cursor-pointer"
                        title="Salin Link Invoice"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#4B5563]" />
                      </button>

                      {o.invoiceToken && (
                        <Link
                          to={`/invoice/${o.invoiceToken}`}
                          target="_blank"
                          className="flex-1 text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-xl transition-all flex items-center justify-center h-9"
                          title="Buka Invoice"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}

                      <button
                        onClick={() => exportSingleOrderToPDF(o)}
                        className="flex-1 text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-xl transition-all flex items-center justify-center h-9 cursor-pointer"
                        title="Unduh PDF Invoice"
                        disabled={exportingOrderId === o.id}
                      >
                        {exportingOrderId === o.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyLink(o)}
                        className="flex-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-[#D1D5DB] rounded-xl py-2 px-3 transition-all text-xs font-semibold flex items-center justify-center gap-1.5 h-10"
                      >
                        <Copy className="w-4 h-4" />
                        {copiedOrderId === o.id ? "Tersalin!" : "Salin Link Invoice"}
                      </button>

                      {!isSigned && !isManuallyValidated && (
                        <button
                          onClick={() => setValidationTargetId(o.id)}
                          className="flex-1 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl py-2 px-3 transition-all text-xs font-bold flex items-center justify-center h-10"
                        >
                          Validasi Bukti
                        </button>
                      )}

                      {o.invoiceToken && (
                        <Link
                          to={`/invoice/${o.invoiceToken}`}
                          target="_blank"
                          className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-xl p-2.5 transition-all flex items-center justify-center h-10 w-10 shrink-0"
                          title="Buka Invoice"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}

                      <button
                        onClick={() => exportSingleOrderToPDF(o)}
                        className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-xl p-2.5 transition-all flex items-center justify-center h-10 w-10 shrink-0 cursor-pointer"
                        title="Unduh PDF Invoice"
                        disabled={exportingOrderId === o.id}
                      >
                        {exportingOrderId === o.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
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
                        <p className="text-[10px] text-amber-600 italic">Bukti foto tidak dapat dimuat atau kosong.</p>
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
                    <p className="font-semibold text-neutral-900">{previewInvoiceOrder.recipientName}</p>
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
                    <p>Tanggal Acara: <span className="font-bold">{new Date(previewInvoiceOrder.eventDate).toLocaleDateString("id-ID", { dateStyle: "long" })}</span></p>
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
                          <td className="py-2 px-4 font-bold text-neutral-900">{it.itemName}</td>
                          <td className="py-2 px-4 text-center font-bold font-mono">×{it.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Food/Drink Details Notes */}
              {(previewInvoiceOrder.foodDetails || previewInvoiceOrder.drinkDetails || previewInvoiceOrder.recipientNotes) && (
                <div className="space-y-2 p-4 bg-amber-50/50 rounded-xl border border-amber-200/50 text-[#78350F]">
                  <h6 className="font-bold uppercase tracking-wider text-[9px] text-amber-800">Catatan Detail Hidangan</h6>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    {previewInvoiceOrder.foodDetails && (
                      <div>
                        <span className="font-bold">Detail Makanan:</span>
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
              <div className="flex justify-between items-center pt-4 border-t border-[#F3F4F6]">
                <span className="font-['Manrope'] font-extrabold text-sm text-neutral-900">Grand Total Tagihan:</span>
                <span className="font-['Manrope'] font-black text-lg text-[#D97706]">{formatIDR(previewInvoiceOrder.totalPrice)}</span>
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
                onClick={() => setPreviewInvoiceOrder(null)}
                className="bg-[#1E293B] hover:bg-[#0F172A] text-white rounded-xl text-xs py-2 px-4 h-9 cursor-pointer"
              >
                Tutup
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default OrdersPage;
