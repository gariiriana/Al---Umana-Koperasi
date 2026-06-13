import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Calendar, Clock, CheckSquare, Square, Truck, Check, MapPin } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { subscribeOrders } from "@/services/realtimeService";
import { assignMultipleOrders } from "@/services/orderService";
import type { Order } from "@/types/order";
import { useToast } from "@/contexts/ToastContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatIDR } from "@/lib/format";

interface Courier {
  uid: string;
  displayName: string;
  email: string;
}

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

  const readyOrders = orders.filter(o => 
    (o.status === "PENDING" || o.status === "IN_PRODUCTION" || o.status === "READY_TO_DELIVER") &&
    !o.assignedCourierId
  );


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

            <div className="grid grid-cols-2 gap-2 sm:gap-3 max-h-[70vh] overflow-y-auto pr-2">
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
                        </div>
                        <div className="font-extrabold text-xs xs:text-base text-[#111827] mt-0.5 truncate">{o.institutionName}</div>
                        <div className="text-[10px] xs:text-xs text-[#6B7280] font-medium mt-1 truncate">Penerima: {o.recipientName}</div>
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
      )}
    </div>
  );
}

export default DeliverySchedulerPage;
