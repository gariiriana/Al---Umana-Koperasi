import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { History, ClipboardCheck, Clock, ChefHat, CheckCircle2, XCircle, ImageOff, FileDown, Loader2, Search, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeOrders } from "@/services/realtimeService";
import { getProduct } from "@/services/catalogService";
import type { Order } from "@/types/order";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/contexts/ToastContext";

// Helper to convert URL to Base64 image with downscaling (Requirement 7.6, 11.4)
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
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.error("Error converting URL to Base64:", err);
    return null;
  }
};

const fetchDeliveryFileBase64 = async (photoId: string): Promise<string | null> => {
  try {
    const docRef = doc(db, "delivery_files", photoId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const meta = docSnap.data();
    const totalChunks = meta.totalChunks || 0;
    
    const chunkPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkRef = doc(db, "delivery_files", photoId, "chunks", String(i));
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
    console.error("Failed to load delivery file base64:", err);
    return null;
  }
};

// Helper component to load and render photo previews asynchronously
function PhotoPreview({ photoId }: { photoId?: string }) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!photoId) return;
    let isMounted = true;
    setLoading(true);

    const loadPhoto = async () => {
      try {
        const docRef = doc(db, "delivery_files", photoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && isMounted) {
          const meta = docSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "delivery_files", photoId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          
          if (isMounted) {
            setPhotoSrc(fullDataUri || null);
          }
        }
      } catch (err) {
        console.error("Failed to load photo preview:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPhoto();
    return () => {
      isMounted = false;
    };
  }, [photoId]);

  if (!photoId) return null;

  if (loading) {
    return (
      <div className="h-20 w-20 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200">
        <span className="text-[10px] text-neutral-400 font-bold">Loading...</span>
      </div>
    );
  }

  if (!photoSrc) {
    return (
      <div className="h-20 w-20 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200">
        <ImageOff className="h-5 w-5 text-neutral-300" />
      </div>
    );
  }

  return (
    <img
      src={photoSrc}
      alt="Bukti Memasak"
      className="h-20 w-20 object-cover rounded-lg border border-neutral-200 shadow-xs"
    />
  );
}

export function ProductionHistoryPage() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<"production" | "qc">("production");
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const exportHistoryToPDF = async () => {
    if (productionHistory.length === 0) {
      showToast({
        message: lang === "id" ? "Tidak ada riwayat produksi untuk diekspor." : "No production history to export.",
        variant: "info",
      });
      return;
    }

    setExporting(true);
    try {
      showToast({
        message: lang === "id" ? "Sedang memproses data dan foto produk..." : "Processing data and product photos...",
        variant: "info",
      });

      // 1. Fetch product data and convert images to Base64 in parallel
      const itemsWithImagesMap: Record<string, { itemId: string; itemName: string; quantity: number; imageBase64: string | null }[]> = {};
      const allItemPromises = productionHistory.flatMap((o) =>
        o.items.map(async (it) => {
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
            orderId: o.id,
            itemId: it.itemId,
            itemName: it.itemName,
            quantity: it.quantity,
            imageBase64: base64,
          };
        })
      );
      const resolvedItems = await Promise.all(allItemPromises);
      resolvedItems.forEach((res) => {
        if (!itemsWithImagesMap[res.orderId]) {
          itemsWithImagesMap[res.orderId] = [];
        }
        itemsWithImagesMap[res.orderId].push({
          itemId: res.itemId,
          itemName: res.itemName,
          quantity: res.quantity,
          imageBase64: res.imageBase64,
        });
      });

      // 2. Fetch cooking proof images in parallel
      const proofImagesMap: Record<string, string | null> = {};
      const proofPromises = productionHistory.map(async (o) => {
        if (o.productionStartPhotoId) {
          const base64 = await fetchDeliveryFileBase64(o.productionStartPhotoId);
          proofImagesMap[o.id] = base64;
        } else {
          proofImagesMap[o.id] = null;
        }
      });
      await Promise.all(proofPromises);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      
      const brandGold: [number, number, number] = [217, 119, 6];       // #D97706
      const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309
      const brandYellowCream: [number, number, number] = [255, 253, 245]; // #FFFDF5
      const brandYellowBorder: [number, number, number] = [253, 230, 138]; // #FDE68A
      const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280
      const white: [number, number, number] = [255, 255, 255];

      // Draw PDF Header
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 14, 12, 18, 18);
      }
      const titleX = logoBase64 ? 36 : 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...brandAmberDark);
      doc.text("KOPERASI AL-UMANAA - LAPORAN RIWAYAT PRODUKSI", titleX, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...slateLight);
      doc.text("Pesantren Al-Umanaa, Sukabumi, Jawa Barat", titleX, 21);
      doc.text("Sistem Informasi Manajemen Order & Logistik (SIMOL)", titleX, 25);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, pageW - 14, 17, { align: "right" });
      doc.text(`Total Catatan: ${productionHistory.length}`, pageW - 14, 22, { align: "right" });

      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.line(14, 31, pageW - 14, 31);

      const tableBody = productionHistory.map((o, index) => {
        const items = itemsWithImagesMap[o.id] || [];
        const itemsText = items.map((it) => `${it.itemName}${o.isPreOrder ? " (Pra-pesanan)" : ` (x${it.quantity})`}`).join("\n") + "\n\n\n";
        
        return [
          String(index + 1),
          `#${o.id.slice(-6).toUpperCase()}\n${o.customerName}`,
          o.deliveryTime || "-",
          itemsText,
          ""
        ];
      });

      autoTable(doc, {
        startY: 36,
        head: [["No", "ID & Pelanggan", "Waktu Pengiriman", "Menu & Foto Produk", "Durasi & Bukti Memasak"]],
        body: tableBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 3 },
        bodyStyles: { fontSize: 8.5, textColor: slateDark, cellPadding: 3, minCellHeight: 26, valign: "top" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 45, fontStyle: "bold" },
          2: { cellWidth: 35, halign: "center" },
          3: { cellWidth: pageW - 28 - 10 - 45 - 35 - 50 },
          4: { halign: "center", cellWidth: 50 },
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 3) {
            const order = productionHistory[data.row.index];
            const items = itemsWithImagesMap[order.id] || [];
            const cell = data.cell;
            
            const imgSize = 8;
            const imgY = cell.y + cell.height - imgSize - 2.5;
            let imgX = cell.x + 3;
            
            items.forEach((it) => {
              if (it.imageBase64) {
                try {
                  doc.addImage(it.imageBase64, "PNG", imgX, imgY, imgSize, imgSize);
                  imgX += imgSize + 2;
                } catch (e) {
                  console.error("Failed to add product image to PDF:", e);
                }
              }
            });
          }

          if (data.section === "body" && data.column.index === 4) {
            const order = productionHistory[data.row.index];
            const cell = data.cell;
            
            // 1. Draw Duration Text manually at the top of the cell
            const durationText = `${order.productionDurationMinutes ?? "-"} ${lang === "id" ? "Menit" : "Minutes"}`;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(30, 41, 59); // slateDark
            const textX = cell.x + cell.width / 2;
            const textY = cell.y + 7; // Drawn at 7mm from the top of the cell
            doc.text(durationText, textX, textY, { align: "center" });

            // 2. Draw Cooking Proof Image manually at the bottom of the cell
            const proofBase64 = proofImagesMap[order.id];
            if (proofBase64) {
              const imgSize = 12;
              const imgX = cell.x + (cell.width - imgSize) / 2;
              const imgY = cell.y + cell.height - imgSize - 2.5;
              try {
                doc.addImage(proofBase64, "PNG", imgX, imgY, imgSize, imgSize);
              } catch (e) {
                console.error("Failed to add proof image to PDF:", e);
              }
            }
          }
        }
      });

      doc.save(`riwayat_produksi_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast({
        message: lang === "id" ? "Laporan PDF riwayat produksi berhasil diunduh!" : "Production history PDF report downloaded successfully!",
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to export PDF:", error);
      showToast({
        message: lang === "id" ? "Gagal mengekspor laporan PDF." : "Failed to export PDF report.",
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  // Filter orders that have completed production
  // Production finishes when status transitions out of PENDING & IN_PRODUCTION,
  // meaning it has been in production (productionStartPhotoId is present).
  const productionHistory = useMemo(() => {
    return orders
      .filter((o) => o.productionStartedAt && o.status !== "PENDING" && o.status !== "IN_PRODUCTION")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [orders]);

  // Filter orders that have been reviewed by QC
  // Checked by checking qcReviewedAt or the presence of qcFailReason (when rejected)
  // or ready/completed statuses (when passed).
  const qcHistory = useMemo(() => {
    return orders
      .filter((o) => o.qcReviewedAt || o.qcFailReason || ["READY_TO_DELIVER", "OUT_FOR_DELIVERY", "COMPLETED", "READY", "DELIVERED"].includes(o.status))
      .sort((a, b) => {
        const dateA = a.qcReviewedAt ? new Date(a.qcReviewedAt).getTime() : 0;
        const dateB = b.qcReviewedAt ? new Date(b.qcReviewedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [orders]);

  const filteredProductionHistory = useMemo(() => {
    if (!searchQuery.trim()) return productionHistory;
    const q = searchQuery.toLowerCase().trim();
    return productionHistory.filter(
      (o) =>
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some((it) => it.itemName.toLowerCase().includes(q))
    );
  }, [productionHistory, searchQuery]);

  const filteredQcHistory = useMemo(() => {
    if (!searchQuery.trim()) return qcHistory;
    const q = searchQuery.toLowerCase().trim();
    return qcHistory.filter(
      (o) =>
        o.customerName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.qcReviewedBy?.toLowerCase().includes(q) ||
        o.qcFailReason?.toLowerCase().includes(q) ||
        o.items.some((it) => it.itemName.toLowerCase().includes(q))
    );
  }, [qcHistory, searchQuery]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "QC":
        return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">Menunggu QC</span>;
      case "READY":
      case "READY_TO_DELIVER":
        return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">Siap Kirim</span>;
      case "OUT_FOR_DELIVERY":
        return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">Sedang Dikirim</span>;
      case "COMPLETED":
      case "DELIVERED":
        return <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-[10px] font-bold">Selesai</span>;
      case "FAILED":
      case "DELIVERY_FAILED":
        return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Gagal</span>;
      default:
        return <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded text-[10px] font-bold">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827] flex items-center gap-2">
            <History className="h-6 w-6 text-amber-500 shrink-0" />
            {lang === "id" ? "Riwayat Produksi & QC" : "Production & QC History"}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            {lang === "id" 
              ? "Lihat riwayat pesanan yang selesai diproduksi dan hasil pemeriksaan kualitas" 
              : "View history of orders cooked and quality review results"}
          </p>
        </div>

        {activeTab === "production" && (
          <button
            onClick={exportHistoryToPDF}
            disabled={exporting}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm border-none cursor-pointer transition-all disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{lang === "id" ? "Mengekspor..." : "Exporting..."}</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                <span>{lang === "id" ? "Ekspor PDF Riwayat" : "Export PDF Riwayat"}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] font-['Manrope',system-ui,sans-serif]">
        <button
          onClick={() => setActiveTab("production")}
          className={`flex-1 sm:flex-initial px-6 py-3 text-sm font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === "production"
              ? "border-amber-500 text-[#111827]"
              : "border-transparent text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {lang === "id" ? "Riwayat Produksi" : "Production History"} ({productionHistory.length})
        </button>
        <button
          onClick={() => setActiveTab("qc")}
          className={`flex-1 sm:flex-initial px-6 py-3 text-sm font-extrabold border-b-2 transition-all cursor-pointer ${
            activeTab === "qc"
              ? "border-purple-500 text-[#111827]"
              : "border-transparent text-[#6B7280] hover:text-[#111827]"
          }`}
        >
          {lang === "id" ? "Riwayat QC" : "QC History"} ({qcHistory.length})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-[#9CA3AF]" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === "production"
              ? "Cari riwayat produksi berdasarkan nama pelanggan, produk, atau ID pesanan..."
              : "Cari riwayat QC berdasarkan nama pelanggan, produk, pemeriksa, atau alasan..."
          }
          className="w-full rounded-full border border-[#E5E7EB] bg-white pl-9 pr-10 py-2 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition font-['Hanken_Grotesk']"
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

      {/* History Lists */}
      <div className="space-y-4">
        {activeTab === "production" ? (
          filteredProductionHistory.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
              <ChefHat className="h-14 w-14 mx-auto text-amber-300 bg-amber-50 rounded-full p-3" />
              <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                {searchQuery ? "Hasil Pencarian Kosong" : (lang === "id" ? "Belum Ada Riwayat" : "No Production History")}
              </p>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {searchQuery
                  ? "Tidak ada riwayat produksi yang cocok dengan kata kunci."
                  : (lang === "id" ? "Pesanan yang selesai diproduksi akan tercatat di sini." : "Completed cooking orders will be logged here.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredProductionHistory.map((o) => {
                  const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <motion.div
                      key={o.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden flex flex-col justify-between"
                    >
                      <div className="p-4 sm:p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                              {o.customerName}
                            </h3>
                            <p className="font-mono text-[9px] text-[#9CA3AF] mt-0.5">
                              #{o.id.slice(0, 12)}...
                            </p>
                          </div>
                          {renderStatusBadge(o.status)}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#6B7280] font-['Hanken_Grotesk']">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Selesai masak:</span>
                          <span className="font-bold text-[#111827]">{o.deliveryTime}</span>
                        </div>

                        <div className="border border-[#F3F4F6] rounded-lg overflow-hidden text-xs">
                          <div className="bg-[#F9FAFB] px-3 py-1.5 border-b border-[#F3F4F6] flex justify-between font-bold text-[#6B7280]">
                            <span>Item</span>
                            <span>{o.isPreOrder ? "Pra-pesanan" : `${totalQty} unit`}</span>
                          </div>
                          <ul className="divide-y divide-[#F3F4F6] max-h-32 overflow-y-auto">
                            {o.items.map((it) => (
                              <li key={it.itemId} className="flex justify-between px-3 py-1.5 items-center">
                                <span className="truncate text-[#4B5563]">{it.itemName}</span>
                                {o.isPreOrder ? (
                                  <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[9px] font-bold text-amber-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
                                    Pra-pesanan
                                  </span>
                                ) : (
                                  <span className="font-bold text-[#111827]">×{it.quantity}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Photo proof and cooking info */}
                        <div className="flex items-center gap-3 bg-[#F9FAFB] p-3 rounded-lg border border-[#E5E7EB]">
                          <PhotoPreview photoId={o.productionStartPhotoId} />
                          <div className="space-y-1 font-['Hanken_Grotesk'] text-xs">
                            <p className="text-gray-500">Estimasi Memasak:</p>
                            <p className="font-bold text-[#111827]">
                              {o.productionDurationMinutes ?? "-"} {lang === "id" ? "Menit" : "Minutes"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        ) : (
          filteredQcHistory.length === 0 ? (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
              <ClipboardCheck className="h-14 w-14 mx-auto text-purple-300 bg-purple-50 rounded-full p-3" />
              <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                {searchQuery ? "Hasil Pencarian Kosong" : (lang === "id" ? "Belum Ada Riwayat QC" : "No QC History")}
              </p>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {searchQuery
                  ? "Tidak ada riwayat pemeriksaan QC yang cocok dengan kata kunci."
                  : (lang === "id" ? "Hasil pemeriksaan kualitas produk akan tercatat di sini." : "Quality Control review outcomes will be shown here.")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredQcHistory.map((o) => {
                  const isPassed = !o.qcFailReason;
                  const formattedQCDate = o.qcReviewedAt 
                    ? new Date(o.qcReviewedAt).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })
                    : "-";

                  return (
                    <motion.div
                      key={o.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden"
                    >
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base">
                              {o.customerName}
                            </h3>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              isPassed 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-red-100 text-red-800"
                            }`}>
                              {isPassed 
                                ? <><CheckCircle2 className="h-3 w-3" /> Lulus QC</> 
                                : <><XCircle className="h-3 w-3" /> Gagal QC</>}
                            </span>
                          </div>
                          
                          <p className="font-mono text-[9px] text-[#9CA3AF]">
                            #{o.id.slice(0, 12)}...
                          </p>

                          <div className="text-xs font-['Hanken_Grotesk'] text-[#6B7280] flex flex-wrap gap-x-4 gap-y-1">
                            <span>{lang === "id" ? "Diperiksa pada:" : "Reviewed at:"} <strong className="text-[#374151]">{formattedQCDate}</strong></span>
                            {o.qcReviewedBy && <span>{lang === "id" ? "Oleh:" : "By:"} <strong className="text-[#374151]">{o.qcReviewedBy}</strong></span>}
                          </div>

                          {/* Items inline */}
                          <div className="text-xs font-['Hanken_Grotesk'] text-gray-500 pt-1">
                            <strong>Item:</strong> {o.items.map((it) => `${it.itemName}${o.isPreOrder ? " (Pra-pesanan)" : ` (x${it.quantity})`}`).join(", ")}
                          </div>

                          {!isPassed && o.qcFailReason && (
                            <div className="mt-2.5 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 font-['Hanken_Grotesk'] flex items-start gap-1.5">
                              <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                              <div>
                                <span className="font-bold">{lang === "id" ? "Alasan Gagal:" : "Reason:"}</span> {o.qcFailReason}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center justify-center shrink-0">
                          <PhotoPreview photoId={o.productionStartPhotoId} />
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
    </div>
  );
}

export default ProductionHistoryPage;
