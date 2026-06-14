import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ChefHat, Truck, TrendingUp, Award, Activity, X, MapPin, Package, Clock, AlertCircle, AlertTriangle, ExternalLink, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  subscribeCourierLocations,
  subscribeOrders,
} from "@/services/realtimeService";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusPipeline } from "@/components/dashboard/StatusPipeline";
import { CourierMap } from "@/components/dashboard/CourierMap";
import { AnomalyAlerts } from "@/components/dashboard/AnomalyAlerts";
import {
  FilterPanel,
  type FilterState,
} from "@/components/dashboard/FilterPanel";

import type { Order } from "@/types/order";
import type { CourierGPS } from "@/types/courier-gps";

const EMPTY_FILTER: FilterState = {
  status: "",
  courierId: "",
  startDate: "",
  endDate: "",
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

export function DashboardPage() {
  const { profile } = useAuth();
  const showStats = profile?.role === "monitoring" || profile?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<CourierGPS[]>([]);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [userMapping, setUserMapping] = useState<Record<string, string>>({});
  const [selectedMember, setSelectedMember] = useState<{ uid: string; name: string } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [modalType, setModalType] = useState<"chef" | "courier" | "order_detail" | "kpi_production" | "kpi_ontime" | "kpi_payment" | null>(null);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filter.status && o.status !== filter.status) return false;
      if (filter.courierId && o.assignedCourierId !== filter.courierId)
        return false;
      if (filter.startDate) {
        const t = new Date(filter.startDate).getTime();
        if (new Date(o.createdAt).getTime() < t) return false;
      }
      if (filter.endDate) {
        // Inclusive end-of-day
        const t = new Date(filter.endDate).getTime() + 24 * 3600 * 1000 - 1;
        if (new Date(o.createdAt).getTime() > t) return false;
      }
      return true;
    });
  }, [orders, filter]);

  const onTimeRate = useMemo(() => {
    const deliveredOrders = filtered.filter(o => o.status === "COMPLETED" && o.deliveredAt && o.deliveryTimerEnd);
    if (deliveredOrders.length === 0) return 100;
    const onTimeOrders = deliveredOrders.filter(o => new Date(o.deliveredAt!).getTime() <= new Date(o.deliveryTimerEnd!).getTime());
    return Math.round((onTimeOrders.length / deliveredOrders.length) * 100);
  }, [filtered]);

  const collectionRate = useMemo(() => {
    const validOrders = filtered.filter(o => o.status !== "DELIVERY_FAILED");
    if (validOrders.length === 0) return 100;
    const collectedOrders = validOrders.filter(o => o.paymentStatus === "SUDAH_DIBAYAR");
    return Math.round((collectedOrders.length / validOrders.length) * 100);
  }, [filtered]);

  const urgentDeliveries = useMemo(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    return orders.filter(o => {
      if (o.status !== "READY_TO_DELIVER" && o.status !== "OUT_FOR_DELIVERY") return false;
      const eventTime = new Date(`${(o.eventDate || "").slice(0, 10)}T${o.deliveryTime.includes(":") ? o.deliveryTime : "12:00"}`).getTime();
      if (isNaN(eventTime)) return false;
      const diff = eventTime - now;
      return diff > -oneHour && diff <= oneHour;
    });
  }, [orders]);

  const overduePayments = useMemo(() => {
    const now = Date.now();
    return orders.filter(o => {
      if (o.paymentStatus === "SUDAH_DIBAYAR") return false;
      if (o.status === "DELIVERY_FAILED") return false;
      const dueDate = new Date(o.paymentDueDate).getTime();
      return !isNaN(dueDate) && dueDate < now;
    });
  }, [orders]);

  useEffect(() => {
    const unsubOrders = subscribeOrders(setOrders, console.error);
    const unsubLocs = subscribeCourierLocations(setLocations, console.error);
    return () => {
      unsubOrders();
      unsubLocs();
    };
  }, []);

  useEffect(() => {
    if (!showStats) return;
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const mapping: Record<string, string> = {};
        snap.docs.forEach((doc) => {
          const data = doc.data();
          mapping[doc.id] = data.displayName || data.email || doc.id;
        });
        setUserMapping(mapping);
      } catch (err) {
        console.error("Gagal memuat daftar user untuk monitoring:", err);
      }
    };
    fetchUsers();
  }, [showStats]);

  const performanceStats = useMemo(() => {
    // 1. Tim Produksi (productionStartedAt -> qcReviewedAt)
    const productionData: Record<string, { uid: string; name: string; totalOrders: number; totalMinutes: number }> = {};
    let totalProdOrders = 0;
    let totalProdMinutes = 0;

    // 2. Tim Distribusi (qcReviewedAt -> deliveryStartedAt)
    let totalDistOrders = 0;
    let totalDistMinutes = 0;

    // 3. Kurir (deliveryStartedAt -> deliveredAt)
    const courierData: Record<string, { uid: string; name: string; totalDeliveries: number; totalMinutes: number }> = {};
    let totalCourierOrders = 0;
    let totalCourierMinutes = 0;

    filtered.forEach((o) => {
      // Production performance
      if (o.productionStartedAt && o.qcReviewedAt) {
        const start = new Date(o.productionStartedAt).getTime();
        const end = new Date(o.qcReviewedAt).getTime();
        const duration = Math.max(0, (end - start) / 60000); // duration in minutes
        
        const producerUid = o.productionStartedBy || "Unknown Chef";
        const producerName = userMapping[producerUid] || producerUid.slice(0, 10);
        
        if (!productionData[producerUid]) {
          productionData[producerUid] = { uid: producerUid, name: producerName, totalOrders: 0, totalMinutes: 0 };
        }
        productionData[producerUid].totalOrders += 1;
        productionData[producerUid].totalMinutes += duration;
        
        totalProdOrders += 1;
        totalProdMinutes += duration;
      }

      // Distribution performance
      if (o.qcReviewedAt && o.deliveryStartedAt) {
        const start = new Date(o.qcReviewedAt).getTime();
        const end = new Date(o.deliveryStartedAt).getTime();
        const duration = Math.max(0, (end - start) / 60000);
        
        totalDistOrders += 1;
        totalDistMinutes += duration;
      }

      // Courier performance
      if (o.deliveryStartedAt && o.deliveredAt) {
        const start = new Date(o.deliveryStartedAt).getTime();
        const end = new Date(o.deliveredAt).getTime();
        const duration = Math.max(0, (end - start) / 60000);
        
        const courierUid = o.assignedCourierId || "Unknown Courier";
        const courierName = userMapping[courierUid] || courierUid.slice(0, 10);
        
        if (!courierData[courierUid]) {
          courierData[courierUid] = { uid: courierUid, name: courierName, totalDeliveries: 0, totalMinutes: 0 };
        }
        courierData[courierUid].totalDeliveries += 1;
        courierData[courierUid].totalMinutes += duration;
        
        totalCourierOrders += 1;
        totalCourierMinutes += duration;
      }
    });

    const chefs = Object.values(productionData).map(c => ({
      ...c,
      avgMinutes: c.totalOrders > 0 ? Math.round(c.totalMinutes / c.totalOrders) : 0
    })).sort((a, b) => a.avgMinutes - b.avgMinutes);

    const couriers = Object.values(courierData).map(c => ({
      ...c,
      avgMinutes: c.totalDeliveries > 0 ? Math.round(c.totalMinutes / c.totalDeliveries) : 0
    })).sort((a, b) => a.avgMinutes - b.avgMinutes);

    return {
      chefs,
      couriers,
      avgProdMinutes: totalProdOrders > 0 ? Math.round(totalProdMinutes / totalProdOrders) : 0,
      avgDistMinutes: totalDistOrders > 0 ? Math.round(totalDistMinutes / totalDistOrders) : 0,
      avgCourierMinutes: totalCourierOrders > 0 ? Math.round(totalCourierMinutes / totalCourierOrders) : 0,
      totalProdOrders,
      totalDistOrders,
      totalCourierOrders,
    };
  }, [filtered, userMapping]);

  const exportDashboardToPDF = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
    doc.text("LAPORAN MONITORING OPERASIONAL", titleX, 20);
    
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
    if (filter.startDate || filter.endDate) {
      doc.text(`Periode: ${filter.startDate || "awal"} s/d ${filter.endDate || "akhir"}`, pageW - 14, metaY, { align: "right" });
      metaY += 4;
    }
    doc.text(`Total Pesanan: ${filtered.length} dari ${orders.length}`, pageW - 14, metaY, { align: "right" });

    // Elegant divider line
    doc.setDrawColor(...brandGold);
    doc.setLineWidth(0.5);
    doc.line(14, 28, pageW - 14, 28);
    
    y = 35;

    // Helper for Section Headers
    const drawSectionHeader = (title: string, secY: number) => {
      // Left vertical accent bar
      doc.setFillColor(...brandGold);
      doc.rect(14, secY - 4.5, 3, 5.5, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...slateDark);
      doc.text(title, 19, secY);
    };

    // ─── Section 1: Status Pipeline ───
    drawSectionHeader("1. STATUS PIPELINE PESANAN", y);
    y += 4;

    const statusLabels: Record<string, string> = {
      PENDING: "Menunggu", IN_PRODUCTION: "Produksi", QC: "QA",
      READY_TO_DELIVER: "Siap Kirim", OUT_FOR_DELIVERY: "Dikirim",
      COMPLETED: "Selesai", DELIVERY_FAILED: "Gagal",
    };
    const statusCounts: Record<string, number> = {};
    for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    const pipelineRows = Object.entries(statusLabels).map(([key, label]) => [
      label, String(statusCounts[key] ?? 0),
      orders.length > 0 ? `${Math.round(((statusCounts[key] ?? 0) / orders.length) * 100)}%` : "0%",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Status", "Jumlah Pesanan", "Persentase"]],
      body: pipelineRows,
      theme: "striped",
      styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
      headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 2.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59], halign: "center", cellPadding: 2.5 },
      alternateRowStyles: { fillColor: brandYellowCream },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // ─── Section 2: KPI ───
    if (y > 230) { doc.addPage(); y = 14; }
    drawSectionHeader("2. INDIKATOR KINERJA UTAMA (KPI)", y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Metrik Kinerja", "Nilai", "Keterangan"]],
      body: [
        ["Rata-rata Produksi", `${performanceStats.avgProdMinutes} menit`, `Berdasarkan ${performanceStats.totalProdOrders} pesanan selesai`],
        ["Rata-rata Distribusi", `${performanceStats.avgDistMinutes} menit`, `Berdasarkan ${performanceStats.totalDistOrders} pesanan terdistribusi`],
        ["Rata-rata Kurir", `${performanceStats.avgCourierMinutes} menit`, `Berdasarkan ${performanceStats.totalCourierOrders} pengiriman selesai`],
        ["Ketepatan Waktu (On-Time)", `${onTimeRate}%`, "Persentase pesanan terkirim tepat waktu"],
        ["Koleksi Pembayaran (Lunas)", `${collectionRate}%`, "Persentase pesanan lunas terhadap total valid"],
      ],
      theme: "striped",
      styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
      headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 2.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: "bold", halign: "left" }, 1: { halign: "center", fontStyle: "bold", textColor: brandAmberDark }, 2: { halign: "left" } },
      alternateRowStyles: { fillColor: brandYellowCream },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // ─── Section 3: Peringatan Aktif ───
    if (urgentDeliveries.length > 0 || overduePayments.length > 0) {
      if (y > 230) { doc.addPage(); y = 14; }
      drawSectionHeader("3. PERINGATAN AKTIF OPERASIONAL & KEUANGAN", y);
      y += 4;

      const warningRows: string[][] = [];
      urgentDeliveries.forEach(o => {
        warningRows.push(["⚠ Pengiriman H-1 Jam", `#${o.id.slice(-6).toUpperCase()}`, o.institutionName || o.customerName || "-", `Jadwal kirim: ${o.deliveryTime}`]);
      });
      overduePayments.forEach(o => {
        warningRows.push(["🔴 Pembayaran Jatuh Tempo", `#${o.id.slice(-6).toUpperCase()}`, o.institutionName || o.customerName || "-", `Nilai: Rp ${o.totalPrice.toLocaleString()}`]);
      });

      autoTable(doc, {
        startY: y,
        head: [["Tipe Peringatan", "ID Pesanan", "Instansi / Pelanggan", "Detail Peringatan"]],
        body: warningRows,
        theme: "striped",
        styles: { lineColor: [252, 165, 165], lineWidth: 0.15 },
        headStyles: { fillColor: [220, 38, 38], textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 2.5 },
        bodyStyles: { fontSize: 8, textColor: [127, 29, 29], cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "center", fontStyle: "bold" } },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    // ─── Section 4: Chef Leaderboard ───
    if (performanceStats.chefs.length > 0) {
      if (y > 230) { doc.addPage(); y = 14; }
      const sectionNum = urgentDeliveries.length > 0 || overduePayments.length > 0 ? "4" : "3";
      drawSectionHeader(`${sectionNum}. LEADERBOARD TIM PRODUKSI`, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Peringkat", "Nama Anggota", "Pesanan Selesai", "Rata-rata Waktu Produksi"]],
        body: performanceStats.chefs.map((c, i) => [
          String(i + 1), c.name, `${c.totalOrders} pesanan`, `${c.avgMinutes} menit`,
        ]),
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 2.5 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59], halign: "center", cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "left" }, 3: { fontStyle: "bold", textColor: brandAmberDark } },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    // ─── Section 5: Courier Leaderboard ───
    if (performanceStats.couriers.length > 0) {
      if (y > 230) { doc.addPage(); y = 14; }
      const sectionBase = (urgentDeliveries.length > 0 || overduePayments.length > 0 ? 4 : 3) + (performanceStats.chefs.length > 0 ? 1 : 0);
      drawSectionHeader(`${sectionBase}. LEADERBOARD TIM KURIR`, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Peringkat", "Nama Kurir", "Total Pengiriman", "Rata-rata Waktu Pengantaran"]],
        body: performanceStats.couriers.map((c, i) => [
          String(i + 1), c.name, `${c.totalDeliveries} pengiriman`, `${c.avgMinutes} menit`,
        ]),
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 8.5, halign: "center", cellPadding: 2.5 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59], halign: "center", cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "left" }, 3: { fontStyle: "bold", textColor: brandAmberDark } },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    // ─── Footer and Page Border ───
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      
      // Footer text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Koperasi Al-Umana • Laporan Monitoring Operasional • Halaman ${p} dari ${totalPages}`,
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

    doc.save(`AlUmana_Monitoring_${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          <span className="flex items-center gap-2">
            Real-time view of every order in the pipeline.
            {profile?.role && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 animate-in fade-in duration-300">
                {{ admin: "Admin", tim_produksi: "Tim Produksi", distribusi: "Distribusi", kurir: "Kurir", monitoring: "Monitoring" }[profile.role] || profile.role}
              </span>
            )}
          </span>
        }
        actions={
          <button
            onClick={exportDashboardToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Download laporan monitoring sebagai PDF"
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </button>
        }
      />

      <StatusPipeline orders={orders} />

      {/* Warning Panels (H-1 Jam & Jatuh Tempo) */}
      {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* H-1 Hour Delivery Warning Panel */}
          {urgentDeliveries.length > 0 && (
            <Card className="border-l-4 border-l-amber-500 bg-[#FFFDF5] border border-[#FEF08A]/65 p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-amber-800">
                <Clock className="h-5 w-5 animate-pulse text-amber-600" />
                <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold">
                  Peringatan Pengiriman H-1 Jam ({urgentDeliveries.length})
                </h3>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed font-semibold">
                Pesanan berikut memiliki jadwal pengiriman dalam waktu dekat (±1 jam). Pastikan kurir telah siap.
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {urgentDeliveries.map(o => (
                  <div key={o.id} className="flex justify-between items-center bg-white border border-[#E5E7EB] rounded-lg p-2.5 text-xs">
                    <div>
                      <span className="font-extrabold text-[#111827]">{o.institutionName || o.customerName}</span>
                      <span className="text-[10px] text-[#6B7280] block font-mono">ID: #{o.id.slice(-6).toUpperCase()} • Penerima: {o.recipientName}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-amber-700 block">{o.deliveryTime}</span>
                      <span className="text-[10px] text-neutral-400 font-medium">{o.status === "READY_TO_DELIVER" ? "Siap Kirim" : "Di Jalan"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Overdue Payment Warning Panel */}
          {overduePayments.length > 0 && (
            <Card className="border-l-4 border-l-red-500 bg-red-50/40 border border-red-200 p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold">
                  Peringatan Jatuh Tempo Pembayaran ({overduePayments.length})
                </h3>
              </div>
              <p className="text-xs text-red-700 leading-relaxed font-semibold">
                Pesanan berikut telah melewati tanggal jatuh tempo pembayaran dan belum dilunasi.
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {overduePayments.map(o => (
                  <div key={o.id} className="flex justify-between items-center bg-white border border-red-100 rounded-lg p-2.5 text-xs">
                    <div>
                      <span className="font-extrabold text-[#111827]">{o.institutionName || o.customerName}</span>
                      <span className="text-[10px] text-[#6B7280] block font-mono">ID: #{o.id.slice(-6).toUpperCase()} • Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-red-700 block">Rp {o.totalPrice.toLocaleString()}</span>
                      <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Jatuh Tempo</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {showStats && (
        <div className="space-y-6 bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs">
          <div className="border-b border-[#E5E7EB] pb-4">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827] flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600 animate-pulse" />
              Analisis Performa Operasional Tim
            </h2>
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-0.5">
              Analisis durasi pengerjaan real-time dari setiap tim produksi, distribusi, dan kurir.
            </p>
          </div>

          {/* KPI Gauges */}
          <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[#F3F4F6]">
            {/* KPI 1: Rata-Rata Produksi — linear gauge */}
            {(() => {
              const maxMin = 60;
              const pct = Math.min(100, (performanceStats.avgProdMinutes / maxMin) * 100);
              // Arc params: semi-circle, r=38
              const r = 38; const cx = 56; const cy = 52;
              const startAngle = -180; const endAngle = 0;
              const toRad = (deg: number) => (deg * Math.PI) / 180;
              const arcX = (a: number) => cx + r * Math.cos(toRad(a));
              const arcY = (a: number) => cy + r * Math.sin(toRad(a));
              const fillEnd = startAngle + (pct / 100) * 180;
              const trackD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 0 1 ${arcX(endAngle)} ${arcY(endAngle)}`;
              const fillD = pct > 0
                ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(fillEnd)} ${arcY(fillEnd)}`
                : "";
              return (
                <div 
                  onClick={() => setModalType("kpi_production")}
                  className="flex-1 flex flex-col items-center py-5 px-6 group cursor-pointer hover:bg-amber-500/5 transition-all duration-200 rounded-2xl border border-transparent hover:border-amber-200/50 shadow-2xs hover:shadow-xs"
                  title="Klik untuk melihat detail performa produksi"
                >
                  <svg width="112" height="62" viewBox="0 0 112 62" className="group-hover:scale-105 transition-transform duration-200">
                    <path d={trackD} fill="none" stroke="#FEF3C7" strokeWidth="8" strokeLinecap="round" />
                    {fillD && <path d={fillD} fill="none" stroke="#D97706" strokeWidth="8" strokeLinecap="round" className="transition-[d] duration-500 ease-out" />}
                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Manrope,system-ui,sans-serif" fill="#111827">{performanceStats.avgProdMinutes}</text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fontWeight="600" fontFamily="Manrope,system-ui,sans-serif" fill="#9CA3AF">mnt/pesanan</text>
                  </svg>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <ChefHat className="h-3.5 w-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
                    <span className="font-['Manrope'] text-[11px] font-extrabold text-amber-700 uppercase tracking-wider group-hover:text-amber-800 transition-colors">Rata-rata Produksi</span>
                  </div>
                  <p className="font-['Hanken_Grotesk'] text-[10px] text-[#9CA3AF] mt-1 text-center group-hover:text-amber-600 transition-colors">
                    dari <strong className="text-amber-600">{performanceStats.totalProdOrders}</strong> pesanan selesai • <span className="underline font-semibold">Detail</span>
                  </p>
                </div>
              );
            })()}

            {/* KPI 2: Ketepatan Waktu — arc gauge */}
            {(() => {
              const pct = onTimeRate;
              const r = 38; const cx = 56; const cy = 52;
              const toRad = (deg: number) => (deg * Math.PI) / 180;
              const arcX = (a: number) => cx + r * Math.cos(toRad(a));
              const arcY = (a: number) => cy + r * Math.sin(toRad(a));
              const fillEnd = -180 + (pct / 100) * 180;
              const trackD = `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 0 1 ${arcX(0)} ${arcY(0)}`;
              const fillD = pct > 0
                ? `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(fillEnd)} ${arcY(fillEnd)}`
                : "";
              const gaugeColor = pct >= 80 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626";
              const trackColor = pct >= 80 ? "#D1FAE5" : pct >= 50 ? "#FEF3C7" : "#FEE2E2";
              return (
                <div 
                  onClick={() => setModalType("kpi_ontime")}
                  className="flex-1 flex flex-col items-center py-5 px-6 group cursor-pointer hover:bg-emerald-500/5 transition-all duration-200 rounded-2xl border border-transparent hover:border-emerald-200/50 shadow-2xs hover:shadow-xs"
                  title="Klik untuk melihat detail ketepatan waktu pengiriman"
                >
                  <svg width="112" height="62" viewBox="0 0 112 62" className="group-hover:scale-105 transition-transform duration-200">
                    <path d={trackD} fill="none" stroke={trackColor} strokeWidth="8" strokeLinecap="round" />
                    {fillD && <path d={fillD} fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" className="transition-[d] duration-500 ease-out" />}
                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Manrope,system-ui,sans-serif" fill="#111827">{pct}%</text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fontWeight="600" fontFamily="Manrope,system-ui,sans-serif" fill="#9CA3AF">on-time</text>
                  </svg>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Truck className="h-3.5 w-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
                    <span className="font-['Manrope'] text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider group-hover:text-emerald-800 transition-colors">Ketepatan Waktu</span>
                  </div>
                  <p className="font-['Hanken_Grotesk'] text-[10px] text-[#9CA3AF] mt-1 text-center group-hover:text-emerald-600 transition-colors">
                    pengiriman tepat dari target kurir • <span className="underline font-semibold">Detail</span>
                  </p>
                </div>
              );
            })()}

            {/* KPI 3: Koleksi Pembayaran — arc gauge */}
            {(() => {
              const pct = collectionRate;
              const r = 38; const cx = 56; const cy = 52;
              const toRad = (deg: number) => (deg * Math.PI) / 180;
              const arcX = (a: number) => cx + r * Math.cos(toRad(a));
              const arcY = (a: number) => cy + r * Math.sin(toRad(a));
              const fillEnd = -180 + (pct / 100) * 180;
              const trackD = `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 0 1 ${arcX(0)} ${arcY(0)}`;
              const fillD = pct > 0
                ? `M ${arcX(-180)} ${arcY(-180)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(fillEnd)} ${arcY(fillEnd)}`
                : "";
              const gaugeColor = pct >= 80 ? "#2563EB" : pct >= 50 ? "#7C3AED" : "#DC2626";
              const trackColor = pct >= 80 ? "#DBEAFE" : pct >= 50 ? "#EDE9FE" : "#FEE2E2";
              return (
                <div 
                  onClick={() => setModalType("kpi_payment")}
                  className="flex-1 flex flex-col items-center py-5 px-6 group cursor-pointer hover:bg-indigo-500/5 transition-all duration-200 rounded-2xl border border-transparent hover:border-indigo-200/50 shadow-2xs hover:shadow-xs"
                  title="Klik untuk melihat detail koleksi pembayaran"
                >
                  <svg width="112" height="62" viewBox="0 0 112 62" className="group-hover:scale-105 transition-transform duration-200">
                    <path d={trackD} fill="none" stroke={trackColor} strokeWidth="8" strokeLinecap="round" />
                    {fillD && <path d={fillD} fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" className="transition-[d] duration-500 ease-out" />}
                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Manrope,system-ui,sans-serif" fill="#111827">{pct}%</text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fontWeight="600" fontFamily="Manrope,system-ui,sans-serif" fill="#9CA3AF">lunas</text>
                  </svg>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Activity className="h-3.5 w-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
                    <span className="font-['Manrope'] text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider group-hover:text-indigo-800 transition-colors">Koleksi Pembayaran</span>
                  </div>
                  <p className="font-['Hanken_Grotesk'] text-[10px] text-[#9CA3AF] mt-1 text-center group-hover:text-indigo-600 transition-colors">
                    rasio pesanan yang sudah lunas • <span className="underline font-semibold">Detail</span>
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Detailed Leaderboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chef Leaderboard */}
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827]">
                    Performa Anggota Tim Produksi
                  </h3>
                </div>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Urutan Tercepat</span>
              </div>

              {performanceStats.chefs.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B7280] font-['Hanken_Grotesk']">
                  Belum ada data performa koki yang tercatat.
                </div>
              ) : (
                <div className="space-y-2">
                  {performanceStats.chefs.map((chef, idx) => (
                    <div
                      key={chef.uid}
                      onClick={() => {
                        setSelectedMember({ uid: chef.uid, name: chef.name });
                        setModalType("chef");
                      }}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#E5E7EB] hover:border-amber-400 hover:bg-neutral-50 transition duration-200 cursor-pointer shadow-2xs hover:shadow-xs"
                      title="Klik untuk melihat detail performa"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-amber-50 flex items-center justify-center text-xs font-extrabold text-amber-700">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-[#111827]">{chef.name}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{chef.totalOrders} pesanan selesai</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold font-mono text-xs text-amber-700">{chef.avgMinutes}m</span>
                        <span className="block text-[8px] font-semibold text-neutral-400 mt-0.5">Rata-rata</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Courier Leaderboard */}
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-orange-500" />
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827]">
                    Performa Anggota Kurir
                  </h3>
                </div>
                <span className="text-[9px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Urutan Tercepat</span>
              </div>

              {performanceStats.couriers.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B7280] font-['Hanken_Grotesk']">
                  Belum ada data performa kurir yang tercatat.
                </div>
              ) : (
                <div className="space-y-2">
                  {performanceStats.couriers.map((courier, idx) => (
                    <div
                      key={courier.uid}
                      onClick={() => {
                        setSelectedMember({ uid: courier.uid, name: courier.name });
                        setModalType("courier");
                      }}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#E5E7EB] hover:border-orange-400 hover:bg-neutral-50 transition duration-200 cursor-pointer shadow-2xs hover:shadow-xs"
                      title="Klik untuk melihat detail performa"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center text-xs font-extrabold text-orange-700">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-[#111827]">{courier.name}</p>
                          <p className="text-[10px] text-[#6B7280] mt-0.5">{courier.totalDeliveries} pengiriman selesai</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold font-mono text-xs text-orange-700">{courier.avgMinutes}m</span>
                        <span className="block text-[8px] font-semibold text-neutral-400 mt-0.5">Rata-rata</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Performa Anggota */}
      {showStats && modalType && selectedMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-[#E5E7EB] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className={`px-6 py-4 border-b border-[#E5E7EB] flex justify-between items-center shrink-0 ${
              modalType === "chef" ? "bg-amber-50/50" : "bg-orange-50/50"
            }`}>
              <div>
                <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">
                  Detail Riwayat Performa Anggota
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5 flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    modalType === "chef" ? "bg-amber-500" : "bg-orange-500"
                  }`} />
                  {modalType === "chef" ? "Tim Produksi (Dapur)" : "Kurir (Pengantaran)"} • <strong className="text-[#111827]">{selectedMember.name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedMember(null);
                  setModalType(null);
                }}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                title="Tutup"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Member Summary Stats */}
              {(() => {
                const memberOrders = orders.filter((o) => {
                  if (modalType === "chef") {
                    return o.productionStartedBy === selectedMember.uid && o.productionStartedAt && o.qcReviewedAt;
                  } else {
                    return o.assignedCourierId === selectedMember.uid && o.deliveryStartedAt && o.deliveredAt;
                  }
                });

                const totalCompleted = memberOrders.length;
                let totalMinutes = 0;
                memberOrders.forEach((o) => {
                  if (modalType === "chef") {
                    const start = new Date(o.productionStartedAt!).getTime();
                    const end = new Date(o.qcReviewedAt!).getTime();
                    totalMinutes += Math.max(0, (end - start) / 60000);
                  } else {
                    const start = new Date(o.deliveryStartedAt!).getTime();
                    const end = new Date(o.deliveredAt!).getTime();
                    totalMinutes += Math.max(0, (end - start) / 60000);
                  }
                });
                const avgTime = totalCompleted > 0 ? Math.round(totalMinutes / totalCompleted) : 0;

                const isChef = modalType === "chef";

                return (
                  <>
                    <div className={`grid grid-cols-2 gap-4 rounded-xl p-4 shrink-0 border ${
                      isChef 
                        ? "bg-amber-500/5 border-amber-200/60" 
                        : "bg-orange-500/5 border-orange-200/60"
                    }`}>
                      <div className="text-center border-r border-[#E5E7EB]">
                        <span className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Total Tugas Selesai</span>
                        <span className="block text-2xl font-extrabold font-['Manrope'] text-[#111827] mt-1">{totalCompleted}</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Rata-rata Durasi</span>
                        <span className={`block text-2xl font-extrabold font-['Manrope'] mt-1 ${
                          isChef ? "text-amber-700" : "text-orange-700"
                        }`}>{avgTime} <span className="text-xs font-bold text-neutral-500 font-sans">menit</span></span>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <h4 className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-[#374151] uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className={`h-4 w-4 ${isChef ? "text-amber-600" : "text-orange-600"}`} />
                        Daftar Riwayat Tugas Selesai ({totalCompleted})
                      </h4>
                      
                      {memberOrders.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#6B7280] border border-dashed border-[#D1D5DB] rounded-xl bg-neutral-50 font-medium">
                          Belum ada tugas selesai yang tercatat untuk anggota ini.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {memberOrders.map((o) => {
                            let duration = 0;
                            let startTimeStr = "";
                            let endTimeStr = "";
                            
                            if (isChef) {
                              const start = new Date(o.productionStartedAt!).getTime();
                              const end = new Date(o.qcReviewedAt!).getTime();
                              duration = Math.round(Math.max(0, (end - start) / 60000));
                              startTimeStr = new Date(o.productionStartedAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
                              endTimeStr = new Date(o.qcReviewedAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
                            } else {
                              const start = new Date(o.deliveryStartedAt!).getTime();
                              const end = new Date(o.deliveredAt!).getTime();
                              duration = Math.round(Math.max(0, (end - start) / 60000));
                              startTimeStr = new Date(o.deliveryStartedAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
                              endTimeStr = new Date(o.deliveredAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
                            }

                            const itemsCount = o.items.reduce((acc, i) => acc + i.quantity, 0);

                            return (
                              <div key={o.id} className={`border border-[#E5E7EB] rounded-xl p-4 bg-white shadow-xs space-y-3.5 border-l-4 transition-all duration-200 hover:shadow-sm ${
                                isChef ? "border-l-amber-500" : "border-l-orange-500"
                              }`}>
                                {/* Order header */}
                                <div className="flex justify-between items-start gap-2 border-b border-neutral-100 pb-2.5">
                                  <div>
                                    <span className="text-[10px] font-bold text-[#9CA3AF] block uppercase tracking-wide">Order ID</span>
                                    <code className="text-xs font-mono font-bold text-[#111827] bg-[#F3F4F6] px-1.5 py-0.5 rounded">#{o.id.slice(0, 10)}</code>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] font-bold text-[#9CA3AF] block uppercase tracking-wide">Durasi Kerja</span>
                                    <span className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded-full ${
                                      isChef ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700"
                                    }`}>{duration} menit</span>
                                  </div>
                                </div>

                                {/* Order details */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
                                  <div className="space-y-1.5">
                                    <p className="text-neutral-500">
                                      Pelanggan: <strong className="text-neutral-800">{o.institutionName || o.customerName}</strong>
                                    </p>
                                    <p className="text-neutral-500 flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" /> 
                                      Target Kirim: <strong className="text-neutral-800">{o.deliveryTime || "—"}</strong>
                                    </p>
                                    <p className="text-neutral-400 text-[10px] flex items-center gap-1 mt-1">
                                      <span>Mulai: {startTimeStr}</span>
                                      <span className="text-neutral-300">•</span>
                                      <span>Selesai: {endTimeStr}</span>
                                    </p>
                                  </div>
                                  
                                  <div className="space-y-1.5">
                                    {isChef ? (
                                      <>
                                        <p className="text-neutral-500 flex items-center gap-1.5">
                                          <Package className="h-3.5 w-3.5 shrink-0 text-neutral-400" /> 
                                          Total Item: <strong className="text-neutral-800">{itemsCount} unit</strong>
                                        </p>
                                        <div className="text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-lg p-2 mt-1">
                                          <span className="block text-[9px] font-bold text-[#6B7280] uppercase tracking-wider mb-0.5">Detail Menu</span>
                                          <span className="font-semibold text-neutral-800 text-[11px] block truncate" title={o.items.map(it => `${it.itemName} (x${it.quantity})`).join(", ")}>
                                            {o.items.map(it => `${it.itemName} (x${it.quantity})`).join(", ")}
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-neutral-500 flex items-start gap-1.5">
                                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-neutral-400" />
                                          <span className="truncate" title={o.deliveryAddress.split(" | ")[0]}>
                                            Alamat: <strong className="text-neutral-850">{o.deliveryAddress.split(" | ")[0]}</strong>
                                          </span>
                                        </p>
                                        {o.deliveryDurationMinutes && (
                                          <p className="text-neutral-500">
                                            Estimasi Kurir: <strong className="text-neutral-800">{o.deliveryDurationMinutes} menit</strong>
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-[#E5E7EB] text-right shrink-0">
              <button
                onClick={() => {
                  setSelectedMember(null);
                  setModalType(null);
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-100 border border-[#D1D5DB] text-xs font-bold text-neutral-700 rounded-lg transition-colors cursor-pointer active:scale-95"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {showStats && modalType === "order_detail" && selectedOrderId && (() => {
        const order = orders.find((o) => o.id === selectedOrderId);
        if (!order) return null;
        
        const now = Date.now();
        const gps = locations.find((l) => l.orderId === order.id);
        const staleGPS = order.status === "OUT_FOR_DELIVERY" && gps && (now - new Date(gps.timestamp).getTime() > 5 * 60 * 1000);
        const missingGPS = order.status === "OUT_FOR_DELIVERY" && !gps;
        const rescheduled = order.status === "READY_TO_DELIVER" && order.assignedCourierId;

        const producerName = order.productionStartedBy ? (userMapping[order.productionStartedBy] || order.productionStartedBy.slice(0, 10)) : "—";
        const qcName = order.qcReviewedBy ? (userMapping[order.qcReviewedBy] || order.qcReviewedBy.slice(0, 10)) : "—";
        const courierName = order.assignedCourierId ? (userMapping[order.assignedCourierId] || order.assignedCourierId.slice(0, 10)) : "—";

        const shortId = order.id.slice(-6).toUpperCase();

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-[#E5E7EB] animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#E5E7EB] bg-slate-50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827] flex items-center gap-2">
                    Detail Informasi Pesanan #{shortId}
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    ID Lengkap: <code className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{order.id}</code>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedOrderId(null);
                    setModalType(null);
                  }}
                  className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Anomaly Banner */}
                {(staleGPS || missingGPS || rescheduled) && (
                  <div className="bg-red-50 border-l-4 border-l-red-500 border border-red-200/80 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-['Manrope'] text-xs font-bold text-red-800 uppercase tracking-wider">
                        Terdeteksi Anomali Pengiriman
                      </h4>
                      <p className="text-xs text-red-700 mt-1 font-semibold">
                        {staleGPS && `Posisi GPS kurir terlambat diperbarui (>5 menit). Koordinat terakhir tercatat pada ${new Date(gps.timestamp).toLocaleTimeString("id-ID")} WIB.`}
                        {missingGPS && "Pesanan berstatus sedang dikirim, namun belum ada koordinat GPS terdaftar dari perangkat kurir."}
                        {rescheduled && "Pesanan yang sebelumnya sedang diantar terpaksa dikembalikan ke antrean pengiriman dapur (Rescheduled)."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Information */}
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-2">
                    <h4 className="font-['Manrope'] text-xs font-bold text-[#4B5563] uppercase tracking-wide border-b pb-1">
                      Informasi Pelanggan
                    </h4>
                    <div className="text-xs space-y-1.5 text-slate-700">
                      <p><span className="text-[#9CA3AF] font-medium block">Instansi / Customer:</span> <strong className="text-[#111827]">{order.institutionName || order.customerName}</strong></p>
                      {order.customerName ? (
                        <>
                          <p><span className="text-[#9CA3AF] font-medium block">Nama Pemesan:</span> <strong className="text-[#111827]">{order.customerName}</strong></p>
                          <p><span className="text-[#9CA3AF] font-medium block">Nama Penerima:</span> <strong className="text-[#111827]">{order.recipientName}</strong></p>
                        </>
                      ) : (
                        <p><span className="text-[#9CA3AF] font-medium block">Nama Pemesan:</span> <strong className="text-[#111827]">{order.recipientName}</strong></p>
                      )}
                      <p><span className="text-[#9CA3AF] font-medium block">No. Telepon:</span> <a href={`tel:${order.recipientPhone}`} className="text-amber-700 hover:underline font-mono font-bold">{order.recipientPhone}</a></p>
                      <p><span className="text-[#9CA3AF] font-medium block">Alamat Pengiriman:</span> <span className="font-medium text-[#374151]">{order.deliveryAddress}</span></p>
                      {order.recipientNotes && <p><span className="text-[#9CA3AF] font-medium block">Catatan Penerima:</span> <span className="italic text-slate-500">"{order.recipientNotes}"</span></p>}
                    </div>
                  </div>

                  {/* Status & Payment Information */}
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-2">
                    <h4 className="font-['Manrope'] text-xs font-bold text-[#4B5563] uppercase tracking-wide border-b pb-1">
                      Status & Pembayaran
                    </h4>
                    <div className="text-xs space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] font-medium">Status Operasional:</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] font-medium">Status Pembayaran:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          order.paymentStatus === "SUDAH_DIBAYAR"
                            ? "bg-emerald-100 text-emerald-800"
                            : order.paymentStatus === "JATUH_TEMPO"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>{order.paymentStatus.replace("_", " ")}</span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-[#9CA3AF] font-medium">Total Harga:</span>
                        <strong className="text-base text-amber-700">Rp {order.totalPrice.toLocaleString("id-ID")}</strong>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] font-medium">Jatuh Tempo:</span>
                        <span className="font-bold text-slate-700">{new Date(order.paymentDueDate).toLocaleDateString("id-ID")}</span>
                      </div>
                      {order.invoiceToken && (
                        <div className="flex justify-end pt-1 flex-wrap gap-2 items-center">
                          {order.invoiceSignatureData && (
                            <div className="flex items-center gap-1 bg-[#D1FAE5] border border-[#A7F3D0] rounded-lg px-2 py-1 text-[10px] font-bold text-[#065F46] mr-auto">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              TTD Aktif
                            </div>
                          )}
                          <a
                            href={`/invoice/${order.invoiceToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                          >
                            Buka Invoice Asli <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                      {order.invoiceSignatureData && (
                        <div className="mt-2.5 pt-2.5 border-t border-[#E5E7EB] flex flex-col items-start gap-1">
                          <span className="text-[#9CA3AF] font-bold text-[9px] uppercase tracking-wide block">Tanda Tangan Digital Pelanggan</span>
                          <div className="bg-white border border-[#E5E7EB] rounded-xl p-1.5 max-w-[150px] mt-1 shadow-2xs">
                            <img src={order.invoiceSignatureData} alt="Tanda Tangan" className="max-h-16 object-contain mx-auto" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="border border-[#E5E7EB] rounded-xl p-4 space-y-3 bg-white">
                  <h4 className="font-['Manrope'] text-xs font-bold text-[#374151] uppercase tracking-wider flex items-center gap-1.5 border-b pb-1.5">
                    <Package className="h-4 w-4 text-slate-500" />
                    Menu Hidangan Yang Dipesan
                  </h4>
                  <div className="divide-y divide-[#F3F4F6] max-h-36 overflow-y-auto pr-1">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((it) => (
                        <div key={it.itemId} className="flex justify-between py-2 text-xs">
                          <span className="font-bold text-[#111827]">{it.itemName}</span>
                          <span className="font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded font-extrabold">x{it.quantity}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">Detail item menu tidak terperinci.</p>
                    )}
                  </div>
                </div>

                {/* Operational Timeline */}
                <div className="border border-[#E5E7EB] rounded-xl p-4 bg-white space-y-3">
                  <h4 className="font-['Manrope'] text-xs font-bold text-[#374151] uppercase tracking-wider flex items-center gap-1.5 border-b pb-1.5">
                    <Clock className="h-4 w-4 text-slate-500" />
                    Timeline Operasional Pesanan
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs leading-relaxed">
                    <div>
                      <span className="text-[#9CA3AF] block font-medium">1. Pesanan Dibuat</span>
                      <span className="font-bold text-slate-800">{new Date(order.createdAt).toLocaleString("id-ID")} WIB</span>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF] block font-medium">2. Masuk Dapur Produksi</span>
                      <span className="font-bold text-slate-800">
                        {order.productionStartedAt ? (
                          `${new Date(order.productionStartedAt).toLocaleString("id-ID")} WIB (Chef: ${producerName})`
                        ) : (
                          <span className="text-neutral-400 italic">Belum dimulai</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF] block font-medium">3. Selesai Masak & QA Review</span>
                      <span className="font-bold text-slate-800">
                        {order.qcReviewedAt ? (
                          `${new Date(order.qcReviewedAt).toLocaleString("id-ID")} WIB (QC: ${qcName})`
                        ) : (
                          <span className="text-neutral-400 italic">Belum di-review</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#9CA3AF] block font-medium">4. Kurir Mulai Pengiriman</span>
                      <span className="font-bold text-slate-800">
                        {order.deliveryStartedAt ? (
                          `${new Date(order.deliveryStartedAt).toLocaleString("id-ID")} WIB (Kurir: ${courierName})`
                        ) : (
                          <span className="text-neutral-400 italic">Belum dikirim</span>
                        )}
                      </span>
                    </div>
                    <div className="sm:col-span-2 border-t pt-2">
                      <span className="text-[#9CA3AF] block font-medium">5. Sampai Tujuan / Selesai</span>
                      <span className="font-bold text-emerald-700">
                        {order.deliveredAt ? (
                          `${new Date(order.deliveredAt).toLocaleString("id-ID")} WIB`
                        ) : order.status === "DELIVERY_FAILED" ? (
                          <span className="text-red-650 font-bold">Gagal Dikirim</span>
                        ) : (
                          <span className="text-neutral-400 italic">Sedang berjalan / belum selesai</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-[#E5E7EB] text-right shrink-0">
                <button
                  onClick={() => {
                    setSelectedOrderId(null);
                    setModalType(null);
                  }}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 border border-[#D1D5DB] text-xs font-bold text-neutral-700 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-xs"
                >
                  Tutup Detail
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* KPI Production Detail Modal */}
      {showStats && modalType === "kpi_production" && (() => {
        const completedProductionOrders = orders.filter(
          (o) => o.productionStartedAt && o.qcReviewedAt
        );

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-[#E5E7EB] animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#E5E7EB] bg-amber-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-900 flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-amber-600" />
                    Analisis Detail Performa Produksi (Dapur)
                  </h3>
                  <p className="text-xs text-amber-700 mt-0.5 font-medium">
                    Statistik durasi pengerjaan masak makanan dari total pesanan masuk.
                  </p>
                </div>
                <button
                  onClick={() => setModalType(null)}
                  className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Stats Summary Card Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-amber-50/40 border border-amber-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-amber-800 uppercase tracking-wider">Rata-rata Durasi</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-amber-700 mt-1">{performanceStats.avgProdMinutes} <span className="text-xs font-sans font-medium text-slate-500">menit</span></strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Total Selesai Masak</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-slate-800 mt-1">{performanceStats.totalProdOrders} <span className="text-xs font-sans font-medium text-slate-500">pesanan</span></strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Target Maksimal</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-emerald-700 mt-1">60 <span className="text-xs font-sans font-medium text-slate-500">menit</span></strong>
                  </div>
                </div>

                {/* Table list */}
                <div className="space-y-3">
                  <h4 className="font-['Manrope'] text-xs font-bold text-[#374151] uppercase tracking-wider border-b pb-1">
                    Riwayat Durasi Memasak Per Pesanan ({completedProductionOrders.length})
                  </h4>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-[#E5E7EB] z-10">
                          <tr>
                            <th className="py-3 px-4">Order ID</th>
                            <th className="py-3 px-4">Instansi</th>
                            <th className="py-3 px-4">Koki Utama (Chef)</th>
                            <th className="py-3 px-4 text-center">Durasi</th>
                            <th className="py-3 px-4 text-center">Status Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {completedProductionOrders.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500 italic">Belum ada pesanan terproduksi.</td>
                            </tr>
                          ) : (
                            completedProductionOrders.map((o) => {
                              const start = new Date(o.productionStartedAt!).getTime();
                              const end = new Date(o.qcReviewedAt!).getTime();
                              const dur = Math.round(Math.max(0, (end - start) / 60000));
                              const isWithinTarget = dur <= 60;
                              const chefName = o.productionStartedBy ? (userMapping[o.productionStartedBy] || o.productionStartedBy.slice(0, 10)) : "—";
                              
                              return (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-mono font-bold">#{o.id.slice(-6).toUpperCase()}</td>
                                  <td className="py-3 px-4 font-semibold truncate max-w-[150px]">{o.institutionName || o.customerName}</td>
                                  <td className="py-3 px-4 font-medium">{chefName}</td>
                                  <td className="py-3 px-4 text-center font-mono font-bold text-[#111827]">{dur} mnt</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded font-extrabold text-[9px] ${
                                      isWithinTarget ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-755"
                                    }`}>
                                      {isWithinTarget ? "SESUAI TARGET" : "MELEBIHI TARGET"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-[#E5E7EB] text-right shrink-0">
                <button
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 border border-[#D1D5DB] text-xs font-bold text-neutral-700 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* KPI Ontime Detail Modal */}
      {showStats && modalType === "kpi_ontime" && (() => {
        const completedDeliveryOrders = orders.filter(
          (o) => o.deliveryStartedAt && o.deliveredAt
        );
        const onTimeCount = completedDeliveryOrders.filter((o) => {
          const start = new Date(o.deliveredAt!).getTime();
          const target = new Date(o.deliveryTimerEnd || o.paymentDueDate).getTime();
          return start <= target;
        }).length;
        const lateCount = completedDeliveryOrders.length - onTimeCount;

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-[#E5E7EB] animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#E5E7EB] bg-emerald-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-emerald-900 flex items-center gap-2">
                    <Truck className="h-5 w-5 text-emerald-600" />
                    Analisis Detail Ketepatan Waktu Pengantaran (Kurir)
                  </h3>
                  <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                    Persentase dan riwayat pesanan yang sampai di tangan pembeli sesuai tenggat waktu.
                  </p>
                </div>
                <button
                  onClick={() => setModalType(null)}
                  className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Stats Summary Card Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-emerald-50/40 border border-emerald-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Ketepatan Waktu</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-emerald-700 mt-1">{onTimeRate}%</strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Tepat Waktu (On-Time)</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-slate-800 mt-1">{onTimeCount} <span className="text-xs font-sans font-medium text-slate-500">pesanan</span></strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">Terlambat (Late)</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-red-650 mt-1">{lateCount} <span className="text-xs font-sans font-medium text-slate-500">pesanan</span></strong>
                  </div>
                </div>

                {/* Table list */}
                <div className="space-y-3">
                  <h4 className="font-['Manrope'] text-xs font-bold text-[#374151] uppercase tracking-wider border-b pb-1">
                    Riwayat Waktu Tempuh & Tenggat Pengiriman ({completedDeliveryOrders.length})
                  </h4>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-[#E5E7EB] z-10">
                          <tr>
                            <th className="py-3 px-4">Order ID</th>
                            <th className="py-3 px-4">Pelanggan</th>
                            <th className="py-3 px-4">Kurir Pengantar</th>
                            <th className="py-3 px-4 text-center">Tenggat Waktu</th>
                            <th className="py-3 px-4 text-center">Sampai Pada</th>
                            <th className="py-3 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {completedDeliveryOrders.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500 italic">Belum ada pengiriman selesai.</td>
                            </tr>
                          ) : (
                            completedDeliveryOrders.map((o) => {
                              const deliveryTarget = o.deliveryTimerEnd ? new Date(o.deliveryTimerEnd).getTime() : new Date(o.paymentDueDate).getTime();
                              const actualDelivered = new Date(o.deliveredAt!).getTime();
                              const isOntime = actualDelivered <= deliveryTarget;
                              const courierName = o.assignedCourierId ? (userMapping[o.assignedCourierId] || o.assignedCourierId.slice(0, 10)) : "—";
                              
                              return (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-mono font-bold">#{o.id.slice(-6).toUpperCase()}</td>
                                  <td className="py-3 px-4 font-semibold truncate max-w-[140px]">{o.institutionName || o.customerName}</td>
                                  <td className="py-3 px-4 font-medium">{courierName}</td>
                                  <td className="py-3 px-4 text-center font-mono">{o.deliveryTimerEnd ? new Date(o.deliveryTimerEnd).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"} WIB</td>
                                  <td className="py-3 px-4 text-center font-mono font-bold">{new Date(o.deliveredAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded font-extrabold text-[9px] ${
                                      isOntime ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                    }`}>
                                      {isOntime ? "ON TIME" : "LATE"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-[#E5E7EB] text-right shrink-0">
                <button
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 border border-[#D1D5DB] text-xs font-bold text-neutral-700 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* KPI Payment Detail Modal */}
      {showStats && modalType === "kpi_payment" && (() => {
        const validOrders = orders.filter((o) => o.status !== "DELIVERY_FAILED");
        const paidOrders = validOrders.filter((o) => o.paymentStatus === "SUDAH_DIBAYAR");
        const unpaidOrders = validOrders.filter((o) => o.paymentStatus === "BELUM_DIBAYAR");
        const overdueOrders = validOrders.filter((o) => {
          if (o.paymentStatus === "SUDAH_DIBAYAR") return false;
          return new Date(o.paymentDueDate).getTime() < Date.now();
        });

        const totalRevenueCollected = paidOrders.reduce((acc, o) => acc + o.totalPrice, 0);
        const totalPendingRevenue = unpaidOrders.reduce((acc, o) => acc + o.totalPrice, 0);

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-[#E5E7EB] animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#E5E7EB] bg-indigo-50/50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-indigo-900 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-indigo-600" />
                    Detail Koleksi Pembayaran & Jatuh Tempo
                  </h3>
                  <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                    Rasio kolektabilitas pelunasan invoice dan perolehan dana kas koperasi.
                  </p>
                </div>
                <button
                  onClick={() => setModalType(null)}
                  className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Stats Summary Card Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-indigo-50/40 border border-indigo-200/50 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Koleksi Pembayaran</span>
                    <strong className="block text-2xl font-extrabold font-['Manrope'] text-indigo-700 mt-1">{collectionRate}%</strong>
                  </div>
                  <div className="bg-emerald-50/30 border border-emerald-200/40 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Dana Terkoleksi (Lunas)</span>
                    <strong className="block text-md font-extrabold font-['Manrope'] text-emerald-700 mt-2.5">Rp {totalRevenueCollected.toLocaleString("id-ID")}</strong>
                  </div>
                  <div className="bg-red-50/30 border border-red-200/40 rounded-xl p-4 text-center">
                    <span className="block text-[10px] font-bold text-red-800 uppercase tracking-wider">Dana Tertunda (Belum Lunas)</span>
                    <strong className="block text-md font-extrabold font-['Manrope'] text-red-700 mt-2.5">Rp {totalPendingRevenue.toLocaleString("id-ID")}</strong>
                    <span className="block text-[10px] text-red-650 mt-1 font-semibold">({overdueOrders.length} pesanan terlambat)</span>
                  </div>
                </div>

                {/* Table list */}
                <div className="space-y-3">
                  <h4 className="font-['Manrope'] text-xs font-bold text-[#374151] uppercase tracking-wider border-b pb-1">
                    Status Pembayaran Invoice Aktif ({validOrders.length})
                  </h4>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-[#E5E7EB] z-10">
                          <tr>
                            <th className="py-3 px-4">Order ID</th>
                            <th className="py-3 px-4">Nama Instansi</th>
                            <th className="py-3 px-4 text-right">Nilai Tagihan</th>
                            <th className="py-3 px-4 text-center">Jatuh Tempo</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-center">Verifikasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {validOrders.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500 italic">Belum ada pesanan aktif.</td>
                            </tr>
                          ) : (
                            validOrders.map((o) => {
                              const isSigned = !!o.invoiceSignedAt;
                              const isManuallyValidated = !!o.manualValidation;
                              const isOverdue = o.paymentStatus !== "SUDAH_DIBAYAR" && new Date(o.paymentDueDate).getTime() < Date.now();
                              
                              return (
                                <tr key={o.id} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-mono font-bold">#{o.id.slice(-6).toUpperCase()}</td>
                                  <td className="py-3 px-4 font-semibold truncate max-w-[140px]">{o.institutionName || o.customerName}</td>
                                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">Rp {o.totalPrice.toLocaleString("id-ID")}</td>
                                  <td className="py-3 px-4 text-center font-mono">{new Date(o.paymentDueDate).toLocaleDateString("id-ID")}</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded font-extrabold text-[9px] ${
                                      o.paymentStatus === "SUDAH_DIBAYAR"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : isOverdue
                                        ? "bg-red-50 text-red-700"
                                        : "bg-amber-50 text-amber-700"
                                    }`}>
                                      {o.paymentStatus === "SUDAH_DIBAYAR" ? "LUNAS" : isOverdue ? "TERLAMBAT" : "BELUM BAYAR"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {isSigned ? (
                                      <span className="text-[9px] font-extrabold text-[#10B981] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">TTD</span>
                                    ) : isManuallyValidated ? (
                                      <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">MANUAL</span>
                                    ) : (
                                      <span className="text-[9px] font-semibold text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-[#E5E7EB] text-right shrink-0">
                <button
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 border border-[#D1D5DB] text-xs font-bold text-neutral-700 rounded-lg transition-colors cursor-pointer active:scale-95 shadow-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CourierMap locations={locations} />
        </div>
        <div>
          <AnomalyAlerts 
            orders={orders} 
            locations={locations} 
            onSelectOrder={(id) => {
              setSelectedOrderId(id);
              setModalType("order_detail");
            }}
          />
        </div>
      </div>

      <FilterPanel
        value={filter}
        onChange={setFilter}
        onReset={() => setFilter(EMPTY_FILTER)}
      />

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Orders
          </h3>
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-0.5">
            {filtered.length} of {orders.length} match the current filters.
          </p>
        </div>

        {/* Mobile Card List View */}
        <div className="divide-y divide-[#E5E7EB] md:hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
              No orders found.
            </div>
          ) : (
            filtered.slice(0, 50).map((o) => (
              <div key={o.id} className="p-4 space-y-2 font-['Hanken_Grotesk',system-ui,sans-serif]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827]">
                    Order ID: <code className="text-xs font-mono font-normal text-[#4B5563]">{o.id.slice(0, 10)}…</code>
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex justify-between items-center text-xs text-[#4B5563]">
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Customer:</span>
                    <span className="font-semibold text-[#111827]">{o.institutionName || o.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Courier:</span>
                    <span className="font-semibold text-[#111827]">
                      {o.assignedCourierId ? `${o.assignedCourierId.slice(0, 8)}…` : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-[#4B5563]">
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Delivery Time:</span>
                    <span className="font-semibold text-[#111827]">{o.deliveryTime}</span>
                  </div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {new Date(o.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F9FAFB]">
              <tr>
                {["Order ID", "Customer", "Delivery Time", "Status", "Courier", "Created"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-semibold text-[#6B7280] uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]"
                  >
                    No orders found.
                  </td>
                </tr>
              )}
              {filtered.slice(0, 50).map((o) => (
                <tr key={o.id} className="hover:bg-[#F9FAFB]">
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    <code className="text-xs">{o.id.slice(0, 10)}…</code>
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    {o.institutionName || o.customerName}
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    {o.deliveryTime}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
                    {o.assignedCourierId
                      ? `${o.assignedCourierId.slice(0, 8)}…`
                      : "—"}
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default DashboardPage;
