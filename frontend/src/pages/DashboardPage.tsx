import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ChefHat, Truck, TrendingUp, Award, Activity, X, MapPin, Package, Clock, AlertCircle } from "lucide-react";

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

export function DashboardPage() {
  const { profile } = useAuth();
  const showStats = profile?.role === "monitoring" || profile?.role === "admin";

  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<CourierGPS[]>([]);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [userMapping, setUserMapping] = useState<Record<string, string>>({});
  const [selectedMember, setSelectedMember] = useState<{ uid: string; name: string } | null>(null);
  const [modalType, setModalType] = useState<"chef" | "courier" | null>(null);

  const onTimeRate = useMemo(() => {
    const deliveredOrders = orders.filter(o => o.status === "COMPLETED" && o.deliveredAt && o.deliveryTimerEnd);
    if (deliveredOrders.length === 0) return 100;
    const onTimeOrders = deliveredOrders.filter(o => new Date(o.deliveredAt!).getTime() <= new Date(o.deliveryTimerEnd!).getTime());
    return Math.round((onTimeOrders.length / deliveredOrders.length) * 100);
  }, [orders]);

  const collectionRate = useMemo(() => {
    const validOrders = orders.filter(o => o.status !== "DELIVERY_FAILED");
    if (validOrders.length === 0) return 100;
    const collectedOrders = validOrders.filter(o => o.paymentStatus === "SUDAH_DIBAYAR");
    return Math.round((collectedOrders.length / validOrders.length) * 100);
  }, [orders]);

  const urgentDeliveries = useMemo(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    return orders.filter(o => {
      if (o.status !== "READY_TO_DELIVER" && o.status !== "OUT_FOR_DELIVERY") return false;
      const eventTime = new Date(`${o.eventDate}T${o.deliveryTime.includes(":") ? o.deliveryTime : "12:00"}`).getTime();
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

    orders.forEach((o) => {
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
  }, [orders, userMapping]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time view of every order in the pipeline."
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

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1: Rata-Rata Waktu Produksi */}
            <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border border-amber-200/50 rounded-xl p-4 relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-amber-800 uppercase tracking-wider">Rata-rata Produksi</span>
                <ChefHat className="h-5 w-5 text-amber-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold font-['Manrope'] text-[#111827]">
                  {performanceStats.avgProdMinutes}
                </span>
                <span className="text-xs font-bold text-[#4B5563]">menit/pesanan</span>
              </div>
              <p className="font-['Hanken_Grotesk'] text-[11px] text-[#6B7280] mt-2">
                Masak & QC dari <strong className="text-amber-700">{performanceStats.totalProdOrders}</strong> pesanan selesai.
              </p>
            </div>

            {/* KPI 2: Tingkat Pengiriman Tepat Waktu */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-200/50 rounded-xl p-4 relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-emerald-800 uppercase tracking-wider">Ketepatan Waktu</span>
                <Truck className="h-5 w-5 text-emerald-600 animate-bounce" />
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold font-['Manrope'] text-[#111827]">
                  {onTimeRate}%
                </span>
              </div>
              <p className="font-['Hanken_Grotesk'] text-[11px] text-[#6B7280] mt-2">
                Persentase pengiriman tepat waktu dari target kurir.
              </p>
            </div>

            {/* KPI 3: Tingkat Penagihan Pembayaran */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border border-indigo-200/50 rounded-xl p-4 relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-indigo-800 uppercase tracking-wider">Koleksi Pembayaran</span>
                <Activity className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold font-['Manrope'] text-[#111827]">
                  {collectionRate}%
                </span>
              </div>
              <p className="font-['Hanken_Grotesk'] text-[11px] text-[#6B7280] mt-2">
                Rasio pesanan yang lunas dibanding seluruh pesanan aktif.
              </p>
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CourierMap locations={locations} />
        </div>
        <div>
          <AnomalyAlerts orders={orders} locations={locations} />
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
