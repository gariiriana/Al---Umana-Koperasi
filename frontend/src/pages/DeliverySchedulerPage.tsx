import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Calendar, Clock, CheckSquare, Square, Truck, Check, MapPin, AlertCircle, FileDown, Image, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { subscribeOrders } from "@/services/realtimeService";
import { assignMultipleOrders } from "@/services/orderService";
import type { Order } from "@/types/order";
import { useToast } from "@/contexts/ToastContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatIDR } from "@/lib/format";
import { ProductImage } from "@/components/ProductImage";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";

const formatSimpleAddress = (address: string) => {
  if (!address) return "";
  const parts = address.split(" | ");
  if (parts.length === 7) {
    const [kabupaten, kecamatan, desa, rtRw] = parts;
    return `Desa ${desa}, RT/RW ${rtRw}, Kec. ${kecamatan}, ${kabupaten}`;
  }
  if (parts.length === 3) {
    return parts[0];
  }
  return address.replace(/https?:\/\/[^\s]+/, "").trim();
};

interface Courier {
  uid: string;
  displayName: string;
  email: string;
}

const getOrderDeadline = (order: Order): number => {
  if (!order.eventDate) return Infinity;
  const datePart = order.eventDate.slice(0, 10);
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

const getBase64ImageFromUrl = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    if (!url) {
      resolve("");
      return;
    }
    const img = new window.Image();
    img.setAttribute("crossOrigin", "anonymous");
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL("image/png");
          resolve(dataURL);
          return;
        }
      } catch (err) {
        console.warn("Failed to convert image to base64 via canvas:", err);
      }
      resolve("");
    };
    img.onerror = () => {
      resolve("");
    };
    img.src = url;
  });
};

export function DeliverySchedulerPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Scheduler States
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportingJpg, setExportingJpg] = useState(false);

  useEffect(() => {
    // 1. Subscribe to orders
    const unsubscribe = subscribeOrders((data) => {
      setOrders(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      showToast({ message: "Gagal memuat pesanan", variant: "error" });
    });

    // 2. Fetch couriers
    async function fetchCouriers() {
      try {
        const q = query(collection(db, "users"), where("role", "==", "kurir"));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            displayName: data.displayName || data.email?.split("@")[0] || "Kurir",
            email: data.email || "",
          };
        });
        setCouriers(list);
      } catch (err) {
        console.error(err);
      }
    }
    fetchCouriers();

    return unsubscribe;
  }, [showToast]);

  const readyOrders = orders.filter(o => {
    const isUnassignedActive = 
      (o.status === "PENDING" || o.status === "IN_PRODUCTION" || o.status === "READY_TO_DELIVER") &&
      !o.assignedCourierId;
    if (!isUnassignedActive) return false;
    
    if (filterDate) {
      const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
      if (oDate !== filterDate) return false;
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match = 
        o.institutionName?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.some(it => it.itemName.toLowerCase().includes(q));
      if (!match) return false;
    }
    
    return true;
  }).sort((a, b) => {
    const deadlineA = getOrderDeadline(a);
    const deadlineB = getOrderDeadline(b);
    if (deadlineA !== deadlineB) {
      return deadlineA - deadlineB;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });


  const handleSelectOrder = (id: string) => {
    if (selectedOrderIds.includes(id)) {
      setSelectedOrderIds(selectedOrderIds.filter(x => x !== id));
    } else {
      setSelectedOrderIds([...selectedOrderIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.length === readyOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(readyOrders.map(o => o.id));
    }
  };

  const handleBatchAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrderIds.length === 0) {
      showToast({ message: "Silakan pilih minimal satu pesanan", variant: "error" });
      return;
    }
    if (!selectedCourierId) {
      showToast({ message: "Silakan pilih kurir", variant: "error" });
      return;
    }

    setAssigning(true);
    try {
      await assignMultipleOrders(selectedCourierId, selectedOrderIds);

      showToast({ message: `Berhasil menugaskan ${selectedOrderIds.length} pesanan ke kurir`, variant: "success" });
      setSelectedOrderIds([]);
      setSelectedCourierId("");
      navigate("/distribusi/handover");
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal menugaskan pengiriman", variant: "error" });
    } finally {
      setAssigning(false);
    }
  };

  const getCourierActiveCount = (courierId: string) => {
    return orders.filter(o => 
      o.assignedCourierId === courierId && 
      (o.status === "PENDING" || o.status === "IN_PRODUCTION" || o.status === "READY_TO_DELIVER" || o.status === "OUT_FOR_DELIVERY")
    ).length;
  };

  const exportPDF = async () => {
    if (!filterDate) {
      showToast({ message: "Silakan pilih tanggal terlebih dahulu", variant: "error" });
      return;
    }
    
    const targetOrders = orders.filter(o => {
      const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
      return oDate === filterDate && o.status !== "FAILED" && o.status !== "PAYMENT_REJECTED";
    }).sort((a, b) => {
      const deadlineA = getOrderDeadline(a);
      const deadlineB = getOrderDeadline(b);
      return deadlineA - deadlineB;
    });

    if (targetOrders.length === 0) {
      showToast({ message: `Tidak ada pesanan pengiriman pada tanggal ${filterDate}`, variant: "info" });
      return;
    }

    try {
      showToast({ message: "Sedang menyiapkan PDF dan memproses foto produk...", variant: "info" });

      // Gather unique image URLs and load them in base64 format
      const imageUrls = Array.from(
        new Set(
          targetOrders.flatMap((o) => o.items.map((it) => it.imageUrl).filter(Boolean))
        )
      );

      const base64Map: Record<string, string> = {};
      await Promise.all(
        imageUrls.map(async (url) => {
          if (url) {
            const b64 = await getBase64ImageFromUrl(url);
            base64Map[url] = b64;
          }
        })
      );

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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...brandAmberDark);
      doc.text("KOPERASI AL-UMANAA", 14, 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...slateDark);
      doc.text("REKAP JADWAL PENGIRIMAN", 14, 21.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...slateLight);
      doc.text("Sistem Informasi Manajemen Order & Logistik (SIMOL)", 14, 26.5);

      const formattedDateDesc = new Date(filterDate).toLocaleDateString("id-ID", { dateStyle: "full" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...brandGold);
      doc.text(formattedDateDesc, pageW - 14, 16, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...slateLight);
      doc.text(`Total Pengiriman: ${targetOrders.length} Pesanan`, pageW - 14, 21.5, { align: "right" });
      doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID")}`, pageW - 14, 26.5, { align: "right" });

      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.line(14, 31, pageW - 14, 31);

      // Table Body preparation
      const tableBody = targetOrders.map((o, idx) => {
        const shortId = o.id.slice(-6).toUpperCase();
        const customerText = o.institutionName 
          ? `#${shortId}\n${o.institutionName}\n(Pemesan: ${o.customerName || "-"})` 
          : `#${shortId}\n${o.customerName || "-"}`;
        
        const addressLabel = formatSimpleAddress(o.deliveryAddress);
        const recipientText = `${o.recipientName || "-"}\nTlp: ${o.recipientPhone || "-"}\nAlamat: ${addressLabel}`;
        
        const departureTime = o.eventDate && o.eventDate.includes("T") ? o.eventDate.split("T")[1] : "—";
        const arrivalTime = o.deliveryTime && o.deliveryTime.includes("T") ? o.deliveryTime.split("T")[1] : o.deliveryTime || "—";
        const timeText = `Berangkat: ${departureTime}\nSampai: ${arrivalTime}`;
        
        const itemsText = o.items.map(it => `${it.itemName} x${it.quantity}`).join("\n");
        
        const courier = couriers.find(c => c.uid === o.assignedCourierId);
        const courierText = courier ? courier.displayName : "Belum Ditugaskan";
        
        // Status Translation
        let statusLabel: string = o.status;
        if (o.status === "PENDING") statusLabel = "Antre Masak";
        else if (o.status === "IN_PRODUCTION") statusLabel = "Sedang Dimasak";
        else if (o.status === "READY_TO_DELIVER") statusLabel = "Siap Kirim";
        else if (o.status === "OUT_FOR_DELIVERY") statusLabel = "Sedang Jalan";
        else if (o.status === "READY" || o.status === "COMPLETED") statusLabel = "Selesai";

        return [
          String(idx + 1),
          "", // Placeholder for image drawn in didDrawCell
          customerText,
          recipientText,
          timeText,
          itemsText,
          courierText,
          statusLabel
        ];
      });

      autoTable(doc, {
        startY: 36,
        head: [["No", "Foto", "Pesanan & Instansi", "Penerima & Alamat", "Jadwal Waktu", "Detail Item", "Kurir Pengantar", "Status"]],
        body: tableBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: 3.5 },
        bodyStyles: { fontSize: 8, textColor: slateDark, cellPadding: 3.5, valign: "middle", minCellHeight: 16 },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 16, halign: "center" }, // Foto
          2: { cellWidth: 40 },
          3: { cellWidth: 55 },
          4: { cellWidth: 30 },
          5: { cellWidth: 50 },
          6: { cellWidth: 35 },
          7: { cellWidth: 25, halign: "center", fontStyle: "bold" }
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 1) {
            const orderIndex = data.row.index;
            const order = targetOrders[orderIndex];
            const firstItemImgUrl = order.items.find(it => it.imageUrl)?.imageUrl;
            const base64 = firstItemImgUrl ? base64Map[firstItemImgUrl] : null;
            if (base64) {
              const imgW = 12; // 12mm width
              const imgH = 12; // 12mm height
              const posX = data.cell.x + (data.cell.width - imgW) / 2;
              const posY = data.cell.y + (data.cell.height - imgH) / 2;
              try {
                doc.addImage(base64, "PNG", posX, posY, imgW, imgH);
              } catch (e) {
                console.warn("Failed to add image to cell", e);
              }
            }
          }
        }
      });

      doc.save(`rekap-pengiriman-${filterDate}.pdf`);
      showToast({ message: "Berhasil mengunduh rekap PDF.", variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal membuat PDF", variant: "error" });
    }
  };

  const exportJPG = async () => {
    if (!filterDate) {
      showToast({ message: "Silakan pilih tanggal terlebih dahulu", variant: "error" });
      return;
    }

    const targetOrders = orders.filter(o => {
      const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
      return oDate === filterDate && o.status !== "FAILED" && o.status !== "PAYMENT_REJECTED";
    }).sort((a, b) => {
      const deadlineA = getOrderDeadline(a);
      const deadlineB = getOrderDeadline(b);
      return deadlineA - deadlineB;
    });

    if (targetOrders.length === 0) {
      showToast({ message: `Tidak ada pesanan pengiriman pada tanggal ${filterDate}`, variant: "info" });
      return;
    }

    showToast({ message: "Sedang menyiapkan gambar JPG...", variant: "info" });
    setExportingJpg(true);

    setTimeout(async () => {
      const el = document.getElementById("scheduler-jpg-container");
      if (!el) {
        showToast({ message: "Gagal memproses ekspor JPG.", variant: "error" });
        setExportingJpg(false);
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
        link.download = `rekap-pengiriman-${filterDate}.jpg`;
        link.href = dataUrl;
        link.click();
        showToast({ message: "Gambar JPG rekap berhasil diunduh!", variant: "success" });
      } catch (err) {
        console.error("Gagal export JPG:", err);
        showToast({ message: "Gagal memproses ekspor JPG", variant: "error" });
      } finally {
        setExportingJpg(false);
      }
    }, 400);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Delivery Scheduler
          </h1>
          <p className="text-[11px] sm:text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            Jadwalkan pengiriman masal, tugaskan kurir sekaligus, dan hindari bentrok waktu pengantaran.
          </p>
        </div>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706] mx-auto mb-2" />
          <p className="text-sm text-[#6B7280]">Memuat penjadwalan...</p>
        </Card>
      ) : (
        <>
          {/* Filter and Export Toolbar */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 font-['Hanken_Grotesk']">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <label htmlFor="scheduler-date" className="text-xs font-bold text-[#4B5563] shrink-0">
                  Tanggal:
                </label>
                <input
                  id="scheduler-date"
                  type="date"
                  className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent font-semibold"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>

              <div className="relative flex-1 sm:w-64">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-[#9CA3AF]" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama pesanan / instansi / produk..."
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] pl-9 pr-8 py-2 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    title="Bersihkan pencarian"
                    aria-label="Bersihkan pencarian"
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto self-end md:self-center">
              <button
                type="button"
                onClick={exportPDF}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 h-10 px-4 border border-[#D1D5DB] bg-white hover:bg-neutral-50 text-xs font-bold text-[#374151] rounded-xl transition cursor-pointer"
              >
                <FileDown className="h-4 w-4 shrink-0 text-red-500" />
                <span>Ekspor PDF Rekap</span>
              </button>
              <button
                type="button"
                onClick={exportJPG}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 h-10 px-4 border border-[#D1D5DB] bg-white hover:bg-neutral-50 text-xs font-bold text-[#374151] rounded-xl transition cursor-pointer"
              >
                <Image className="h-4 w-4 shrink-0 text-blue-500" />
                <span>Ekspor JPG Rekap</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of ready orders to assign (Left Columns) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                Pesanan Siap Dikirim ({readyOrders.length})
              </h3>
              {readyOrders.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-[#B45309] hover:underline flex items-center gap-1.5"
                >
                  {selectedOrderIds.length === readyOrders.length ? "Batal Pilih Semua" : "Pilih Semua"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-[70vh] overflow-y-auto pr-2">
              {readyOrders.map((o) => {
                const isSelected = selectedOrderIds.includes(o.id);
                const shortId = o.id.slice(-6).toUpperCase();
                
                return (
                  <div
                    key={o.id}
                    onClick={() => handleSelectOrder(o.id)}
                    className={`p-2.5 xs:p-4 bg-white border rounded-2xl cursor-pointer transition-all duration-200 flex items-start gap-2 xs:gap-4 ${
                      isSelected 
                        ? "border-[#FDE047] bg-[#FFFDF5] ring-2 ring-[#FEF08A]/40" 
                        : "border-[#E5E7EB] hover:border-[#FBBF24]"
                    }`}
                  >
                    <div className="pt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 xs:w-5 xs:h-5 text-[#D97706]" />
                      ) : (
                        <Square className="w-4 h-4 xs:w-5 xs:h-5 text-[#9CA3AF]" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 xs:gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-[9px] xs:text-xs text-[#9CA3AF]">#{shortId}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] xs:text-[10px] font-bold ${
                            o.status === "READY_TO_DELIVER" 
                              ? "bg-emerald-100 text-emerald-800" 
                              : o.status === "IN_PRODUCTION" 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-blue-100 text-blue-800"
                          }`}>
                            {o.status === "READY_TO_DELIVER" 
                              ? "Siap Kirim" 
                              : o.status === "IN_PRODUCTION" 
                                ? "Masak" 
                                : "Antri"}
                          </span>
                          {o.courierSickReported && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] xs:text-[10px] font-extrabold bg-red-100 text-red-700 border border-red-300">
                              Batal/Sakit
                            </span>
                          )}
                          {(() => {
                            const deadline = getOrderDeadline(o);
                            const isPast = deadline !== Infinity && Date.now() > deadline;
                            return isPast ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] xs:text-[10px] font-black bg-red-100 text-red-700 animate-pulse border border-red-300 flex items-center gap-0.5">
                                <AlertCircle className="h-2.5 w-2.5 text-red-600" /> TERLEWAT
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="font-extrabold text-xs xs:text-base text-[#111827] mt-0.5 truncate">{o.institutionName}</div>
                        {o.customerName ? (
                          <>
                            <div className="text-[10px] xs:text-xs text-[#6B7280] font-medium mt-1 truncate">Pemesan: {o.customerName}</div>
                            <div className="text-[10px] xs:text-xs text-[#6B7280] font-medium mt-0.5 truncate">Penerima: {o.recipientName}</div>
                          </>
                        ) : (
                          <div className="text-[10px] xs:text-xs text-[#6B7280] font-medium mt-1 truncate">Pemesan: {o.recipientName}</div>
                        )}
                        <div className="text-[10px] xs:text-xs text-[#6B7280] font-mono mt-0.5 truncate">{o.recipientPhone}</div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] xs:text-xs text-[#374151] flex items-center gap-1">
                          <Calendar className="w-3 h-3 xs:w-3.5 xs:h-3.5 text-[#9CA3AF] shrink-0" />
                          <span className="truncate">Tgl: {new Date(o.eventDate).toLocaleDateString("id-ID")}</span>
                        </div>
                        <div className="text-[10px] xs:text-xs text-[#374151] flex items-center gap-1">
                          <Clock className="w-3 h-3 xs:w-3.5 xs:h-3.5 text-[#9CA3AF] shrink-0" />
                          <span className="truncate">Jam: {o.deliveryTime}</span>
                        </div>
                        <div className="text-[10px] xs:text-xs text-[#374151] flex items-start gap-1 truncate" title={o.deliveryAddress}>
                          <MapPin className="w-3 h-3 xs:w-3.5 xs:h-3.5 text-[#9CA3AF] shrink-0 mt-0.5" />
                          <span>{o.deliveryAddress.split(" | ")[0]}</span>
                        </div>
                        <div className="text-xs xs:text-sm font-black text-amber-700 pt-1">
                          {formatIDR(o.totalPrice)}
                        </div>
                      </div>

                      {/* Detail Pesanan Makanan/Minuman */}
                      {o.items && o.items.length > 0 && (
                        <div className="sm:col-span-2 pt-2.5 border-t border-[#F3F4F6] space-y-1.5">
                          <span className="font-extrabold text-[#111827] block text-[10px] uppercase tracking-wider">
                            Detail Pesanan
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {o.items.map((it) => (
                              <div key={it.itemId} className="flex flex-col gap-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-1.5 w-full sm:w-auto sm:max-w-[200px]">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-6 h-6 bg-neutral-100 rounded-md overflow-hidden border border-neutral-200 shrink-0 flex items-center justify-center">
                                    <ProductImage
                                      imageUrl={it.imageUrl || ""}
                                      alt={it.itemName}
                                      className="h-full w-full object-cover"
                                      fallbackClassName="h-2.5 w-2.5 text-neutral-400"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-neutral-700 truncate max-w-[100px]">{it.itemName}</span>
                                  <span className="text-[10px] font-black text-neutral-800 shrink-0 px-0.5">x{it.quantity}</span>
                                </div>
                                {(it.deliveryAddress || it.deliveryTime || it.recipientName) && (
                                  <div className="text-[9px] text-[#4B5563] border-t border-[#E5E7EB] pt-1 mt-0.5 space-y-0.5 font-medium leading-tight">
                                    {it.recipientName && (
                                      <p className="truncate"><strong className="text-neutral-500">Penerima:</strong> {it.recipientName}</p>
                                    )}
                                    {it.deliveryTime && (
                                      <p className="truncate"><strong className="text-neutral-500">Jadwal:</strong> {it.deliveryTime.replace("T", " ")}</p>
                                    )}
                                    {it.deliveryAddress && (
                                      <p className="break-words line-clamp-2" title={it.deliveryAddress}>
                                        <strong className="text-neutral-500">Alamat:</strong> {it.deliveryAddress.split(" | ")[0]}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Courier Sick Remark */}
                      {o.courierSickReported && o.courierSickRemark && (
                        <div className="sm:col-span-2 pt-2 border-t border-[#F3F4F6]">
                          <div className="bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 text-[10px] xs:text-xs text-red-800 leading-relaxed font-semibold">
                            <span className="font-black block uppercase text-[9px] tracking-wide text-red-700 mb-0.5">Alasan Kurir Batal Tugas:</span>
                            {o.courierSickRemark}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {readyOrders.length === 0 && (
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-3">
                  <Truck className="h-12 w-12 mx-auto text-emerald-400 bg-emerald-50 rounded-full p-3" />
                  <p className="font-['Manrope'] font-bold text-[#111827]">Tidak Ada Pesanan Aktif</p>
                  <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                    Belum ada pesanan aktif yang terkonfirmasi untuk dikirim.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Scheduler panel (Right Column) */}
          <div className="space-y-6">
            <Card className="p-6 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm space-y-4">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] border-b border-[#F3F4F6] pb-3">
                Form Penugasan Masal
              </h3>

              <form onSubmit={handleBatchAssign} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#6B7280]">
                    Jumlah Terpilih
                  </label>
                  <div className="text-lg font-black text-[#111827]">
                    {selectedOrderIds.length} Pesanan
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="scheduler-courier" className="block text-xs font-semibold text-[#6B7280]">
                    Pilih Kurir
                  </label>
                  <select
                    id="scheduler-courier"
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                  >
                    <option value="">-- Pilih Kurir --</option>
                    {couriers.map((c) => {
                      const count = getCourierActiveCount(c.uid);
                      return (
                        <option key={c.uid} value={c.uid}>
                          {c.displayName} ({count} Tugas Aktif)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={assigning}
                  leftIcon={<Check className="w-4 h-4" />}
                  className="w-full py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl font-bold shadow-md shadow-amber-700/10 flex items-center justify-center gap-2"
                >
                  Tugaskan Sekarang
                </Button>
              </form>
            </Card>

            {/* Courier active tasks list */}
            <Card className="p-6 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm space-y-4">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] border-b border-[#F3F4F6] pb-3">
                Status Tugas Kurir
              </h3>
              <div className="space-y-3">
                {couriers.map((c) => {
                  const activeTasks = orders.filter(o => 
                    o.assignedCourierId === c.uid && 
                    (o.status === "PENDING" || o.status === "IN_PRODUCTION" || o.status === "READY_TO_DELIVER" || o.status === "OUT_FOR_DELIVERY")
                  );
                  
                  return (
                    <div key={c.uid} className="flex justify-between items-center text-xs pb-2 border-b border-[#F3F4F6] last:border-0 last:pb-0">
                      <div>
                        <span className="font-bold text-[#374151]">{c.displayName}</span>
                        <p className="text-[10px] text-[#6B7280]">{c.email}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-bold font-mono ${
                        activeTasks.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {activeTasks.length} Tugas
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </>
    )}

      {/* Hidden print-ready container for html2canvas JPG export */}
      {exportingJpg && (
        <div id="scheduler-jpg-container" className="scheduler-jpg-container">
          <style dangerouslySetInnerHTML={{ __html: `
            .scheduler-jpg-container {
              position: fixed;
              left: -9999px;
              top: 0;
              width: 1000px;
              background-color: #ffffff;
              padding: 40px;
              font-family: 'Hanken Grotesk', system-ui, sans-serif;
              color: #1f2937;
            }
            .scheduler-jpg-gold-bar {
              height: 4px;
              background-color: #D97706;
              margin-bottom: 20px;
            }
            .scheduler-jpg-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #f3f4f6;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .scheduler-jpg-header-left h2 {
              font-size: 20px;
              font-weight: 800;
              color: #B45309;
              margin: 0;
            }
            .scheduler-jpg-header-left p {
              font-size: 11px;
              color: #6b7280;
              margin: 4px 0 0 0;
            }
            .scheduler-jpg-header-right {
              text-align: right;
            }
            .scheduler-jpg-badge {
              display: inline-block;
              padding: 4px 12px;
              background-color: #fffbeb;
              border: 1px solid #fde68a;
              border-radius: 9999px;
              font-size: 11px;
              font-weight: 700;
              color: #b45309;
            }
            .scheduler-jpg-header-right p {
              font-size: 10px;
              color: #9ca3af;
              margin: 6px 0 0 0;
            }
            .scheduler-jpg-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #fde68a;
              font-size: 11px;
            }
            .scheduler-jpg-table th {
              background-color: #D97706;
              color: #ffffff;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 9px;
              letter-spacing: 0.05em;
              padding: 10px 12px;
              border: 1px solid #fde68a;
              text-align: left;
            }
            .scheduler-jpg-table td {
              padding: 10px 12px;
              border: 1px solid #fde68a;
              vertical-align: middle;
            }
            .scheduler-jpg-row-even {
              background-color: #FFFDF5;
            }
            .scheduler-jpg-row-odd {
              background-color: #ffffff;
            }
            .scheduler-jpg-footer {
              margin-top: 30px;
              text-align: right;
              font-size: 9px;
              color: #9ca3af;
              border-top: 1px solid #f3f4f6;
              padding-top: 12px;
            }
            .scheduler-jpg-title {
              font-weight: bold;
              margin: 4px 0 0 0;
            }
            .th-no {
              text-align: center;
              width: 35px;
            }
            .th-foto {
              width: 60px;
              text-align: center;
            }
            .th-pesanan {
              width: 200px;
            }
            .th-alamat {
              width: 260px;
            }
            .th-jadwal {
              width: 130px;
            }
            .th-kurir {
              width: 130px;
            }
            .th-status {
              width: 90px;
              text-align: center;
            }
            .td-no {
              text-align: center;
              font-weight: bold;
            }
            .td-center {
              text-align: center;
            }
            .td-prod-img {
              width: 40px;
              height: 40px;
              object-fit: cover;
              border-radius: 6px;
              border: 1px solid #e5e7eb;
              display: inline-block;
            }
            .td-prod-img-placeholder {
              width: 40px;
              height: 40px;
              background-color: #f3f4f6;
              border-radius: 6px;
              border: 1px solid #e5e7eb;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: #9ca3af;
              font-size: 8px;
            }
            .td-order-id {
              font-weight: bold;
              color: #111827;
            }
            .td-inst-name {
              font-weight: 800;
              color: #4B5563;
            }
            .td-cust-name {
              color: #6B7280;
            }
            .td-recipient-name {
              font-weight: bold;
              color: #111827;
            }
            .td-recipient-phone {
              color: #6B7280;
            }
            .td-address {
              color: #4B5563;
              margin-top: 4px;
              line-height: 1.3;
            }
            .td-departure {
              color: #B45309;
              font-weight: bold;
            }
            .td-arrival {
              color: #1E293B;
              font-weight: bold;
            }
            .td-items-detail {
              white-space: pre-line;
              line-height: 1.5;
            }
            .td-courier {
              font-weight: bold;
            }
            .td-status {
              text-align: center;
              font-weight: bold;
              color: #B45309;
            }
          ` }} />
          <div className="scheduler-jpg-gold-bar" />
          <div className="scheduler-jpg-header">
            <div className="scheduler-jpg-header-left">
              <h2>KOPERASI AL-UMANAA</h2>
              <p className="scheduler-jpg-title">REKAP JADWAL PENGIRIMAN</p>
              <p>Sistem Informasi Manajemen Order & Logistik (SIMOL)</p>
            </div>
            <div className="scheduler-jpg-header-right">
              <div className="scheduler-jpg-badge">
                {new Date(filterDate).toLocaleDateString("id-ID", { dateStyle: "full" })}
              </div>
              <p>Dicetak: {new Date().toLocaleDateString("id-ID")}</p>
            </div>
          </div>

          <table className="scheduler-jpg-table">
            <thead>
              <tr>
                <th className="th-no">No</th>
                <th className="th-foto">Foto</th>
                <th className="th-pesanan">Pesanan & Instansi</th>
                <th className="th-alamat">Penerima & Alamat</th>
                <th className="th-jadwal">Jadwal Waktu</th>
                <th>Detail Item</th>
                <th className="th-kurir">Kurir Pengantar</th>
                <th className="th-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.filter(o => {
                const oDate = o.eventDate ? o.eventDate.slice(0, 10) : "";
                return oDate === filterDate && o.status !== "FAILED" && o.status !== "PAYMENT_REJECTED";
              }).sort((a, b) => {
                const deadlineA = getOrderDeadline(a);
                const deadlineB = getOrderDeadline(b);
                return deadlineA - deadlineB;
              }).map((o, idx) => {
                const shortId = o.id.slice(-6).toUpperCase();
                const addressLabel = formatSimpleAddress(o.deliveryAddress);
                const departureTime = o.eventDate && o.eventDate.includes("T") ? o.eventDate.split("T")[1] : "—";
                const arrivalTime = o.deliveryTime && o.deliveryTime.includes("T") ? o.deliveryTime.split("T")[1] : o.deliveryTime || "—";
                
                const courier = couriers.find(c => c.uid === o.assignedCourierId);
                const courierText = courier ? courier.displayName : "Belum Ditugaskan";
                
                let statusLabel: string = o.status;
                if (o.status === "PENDING") statusLabel = "Antre Masak";
                else if (o.status === "IN_PRODUCTION") statusLabel = "Sedang Dimasak";
                else if (o.status === "READY_TO_DELIVER") statusLabel = "Siap Kirim";
                else if (o.status === "OUT_FOR_DELIVERY") statusLabel = "Sedang Jalan";
                else if (o.status === "READY" || o.status === "COMPLETED") statusLabel = "Selesai";

                const firstItemImgUrl = o.items.find(it => it.imageUrl)?.imageUrl;

                return (
                  <tr key={o.id} className={idx % 2 === 0 ? "scheduler-jpg-row-even" : "scheduler-jpg-row-odd"}>
                    <td className="td-no">{idx + 1}</td>
                    <td className="td-center">
                      {firstItemImgUrl ? (
                        <img
                          src={firstItemImgUrl}
                          alt="Produk"
                          crossOrigin="anonymous"
                          className="td-prod-img"
                        />
                      ) : (
                        <div className="td-prod-img-placeholder">—</div>
                      )}
                    </td>
                    <td>
                      <div className="td-order-id">#{shortId}</div>
                      {o.institutionName && <div className="td-inst-name">{o.institutionName}</div>}
                      <div className="td-cust-name">Pemesan: {o.customerName || "-"}</div>
                    </td>
                    <td>
                      <div className="td-recipient-name">{o.recipientName || "-"}</div>
                      <div className="td-recipient-phone">Tlp: {o.recipientPhone || "-"}</div>
                      <div className="td-address">{addressLabel}</div>
                    </td>
                    <td>
                      <div className="td-departure">B: {departureTime}</div>
                      <div className="td-arrival">S: {arrivalTime}</div>
                    </td>
                    <td className="td-items-detail">
                      {o.items.map(it => `• ${it.itemName} x${it.quantity}`).join("\n")}
                    </td>
                    <td className="td-courier">{courierText}</td>
                    <td className="td-status">{statusLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="scheduler-jpg-footer">
            Koperasi Al-Umanaa © {new Date().getFullYear()} — Dokumen Rekap Digital Hasil Unduhan
          </div>
        </div>
      )}
    </div>
  );
}

export default DeliverySchedulerPage;
