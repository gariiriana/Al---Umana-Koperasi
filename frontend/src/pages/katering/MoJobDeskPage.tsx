// ============================================================================
// MO Job Desk Management Page (Premium Enterprise SaaS Design)
// ============================================================================
// Manager Operational (MO) uses this page to:
// 1. Monitor incoming catering orders from Admin with clean, modern card layouts
// 2. Click any order for full breakdown & quick handover
// 3. Draft & distribute structured Excel job desks for Ust. Joko, Dwi, Shifa, and Wandi
// 4. Track operational progress & CO_MO reviews in real time

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShoppingBag,
  Sparkles,
  Layers,
  UtensilsCrossed,
  Eye,
  X,
  Phone,
  MapPin,
  FileSpreadsheet,
  ChevronRight,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import {
  batchCreateJobDesks,
  deleteJobDesk,
  subscribeAllJobDesks,
  type CreateJobDeskInput,
} from "@/services/cateringJobDeskService";
import type { Order } from "@/types/order";
import type {
  CateringJobDesk,
  PicShortName,
} from "@/types/cateringJobDesk";
import {
  PIC_NAME_TO_ROLE,
  JOBDESK_ROLE_LABELS,
  HARI_OPTIONS,
  generateKeyId,
  getHariFromDate,
  extractDateOnly,
  extractTimeOnly,
  formatIndoDate,
  formatIndoTime,
} from "@/types/cateringJobDesk";

interface DraftRow {
  id: string;
  hari: string;
  tanggal: string;
  startTime: string;
  pic: PicShortName;
  kegiatan: string;
  keterangan: string;
  keyId: string;
  orderId?: string;
  orderLabel?: string;
}

const PIC_OPTIONS: PicShortName[] = ["Joko", "Dwi", "Shifa", "Wandi"];

export function MoJobDeskPage() {
  const { user } = useAuth();
  const [jobDesks, setJobDesks] = useState<CateringJobDesk[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "form" | "table">("orders");

  // Selected order for creating job desks
  const [selectedOrderContext, setSelectedOrderContext] = useState<Order | null>(null);

  // Modal detail states
  const [detailOrderModal, setDetailOrderModal] = useState<Order | null>(null);
  const [detailJobDeskModal, setDetailJobDeskModal] = useState<CateringJobDesk | null>(null);

  // Filter state for table view
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPic, setSelectedPic] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedOrderFilter, setSelectedOrderFilter] = useState<string>("all");

  // Filter for orders list
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderHandoverFilter, setOrderHandoverFilter] = useState<"all" | "unassigned" | "assigned">("unassigned");

  // Draft rows for batch entry
  const todayStr = new Date().toISOString().split("T")[0];
  const [rows, setRows] = useState<DraftRow[]>([
    {
      id: "row-1",
      hari: getHariFromDate(todayStr),
      tanggal: todayStr,
      startTime: "07:00",
      pic: "Joko",
      kegiatan: "",
      keterangan: "",
      keyId: generateKeyId(todayStr, 1),
      orderId: "",
      orderLabel: "",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Subscribe to all job desks & orders
  useEffect(() => {
    const unsubDesks = subscribeAllJobDesks(
      (data) => {
        setJobDesks(data);
        setLoading(false);
      },
      (err) => {
        console.error("MO: failed to load job desks:", err);
        setLoading(false);
      }
    );
    const unsubOrders = subscribeOrders(
      (allOrders) => setOrders(allOrders),
      (err) => console.error("MO: failed to load orders:", err)
    );
    return () => {
      unsubDesks();
      unsubOrders();
    };
  }, []);

  // Map of orderId -> array of existing job desks
  const jobDesksByOrderId = useMemo(() => {
    const map = new Map<string, CateringJobDesk[]>();
    for (const jd of jobDesks) {
      if (jd.orderId) {
        const list = map.get(jd.orderId) || [];
        list.push(jd);
        map.set(jd.orderId, list);
      }
    }
    return map;
  }, [jobDesks]);

  // Calculate next sequential Key ID for a given date
  const computeKeyId = useCallback(
    (targetDate: string, indexInBatch: number) => {
      const existingForDate = jobDesks.filter((jd) => jd.tanggal === targetDate);
      let maxSeq = 0;
      for (const jd of existingForDate) {
        const match = (jd.keyId || "").match(/CAT-\d{8}-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return generateKeyId(targetDate, maxSeq + indexInBatch + 1);
    },
    [jobDesks]
  );

  // Initialize draft rows with correct auto Key ID once jobDesks load
  useEffect(() => {
    setRows((prev) =>
      prev.map((r, idx) => ({
        ...r,
        keyId: computeKeyId(r.tanggal || todayStr, idx),
      }))
    );
  }, [jobDesks, todayStr, computeKeyId]);

  // Start creating job desk for a selected order
  const handleSelectOrderForJobDesk = useCallback(
    (order: Order) => {
      setSelectedOrderContext(order);
      setDetailOrderModal(null);
      const targetDate = extractDateOnly(order.eventDate) || todayStr;
      const targetHari = getHariFromDate(targetDate) || "Jumat";
      const targetTime = extractTimeOnly(order.deliveryTime || order.eventDate, "07:00");
      const orderLabel = order.institutionName || order.recipientName || `Pesanan #${order.id.slice(-6).toUpperCase()}`;

      // Start with 1 clean empty row for this order
      setRows([
        {
          id: `row-${Date.now()}-1`,
          hari: targetHari,
          tanggal: targetDate,
          startTime: targetTime,
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(targetDate, 0),
          orderId: order.id,
          orderLabel,
        },
      ]);

      setActiveTab("form");
    },
    [todayStr, computeKeyId]
  );

  // Add new empty row to draft form with automatic sequential Key ID
  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      const defaultDate = lastRow ? lastRow.tanggal : todayStr;
      const nextIndex = prev.length;
      return [
        ...prev,
        {
          id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          hari: lastRow ? lastRow.hari : getHariFromDate(defaultDate),
          tanggal: defaultDate,
          startTime: lastRow ? lastRow.startTime : "07:00",
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(defaultDate, nextIndex),
          orderId: selectedOrderContext?.id || lastRow?.orderId || "",
          orderLabel:
            selectedOrderContext?.institutionName ||
            selectedOrderContext?.recipientName ||
            lastRow?.orderLabel ||
            "",
        },
      ];
    });
  }, [todayStr, computeKeyId, selectedOrderContext]);

  // Remove a row from draft form and re-index Key IDs
  const handleRemoveRow = useCallback(
    (rowId: string) => {
      setRows((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((r) => r.id !== rowId);
        return filtered.map((r, idx) => ({
          ...r,
          keyId: computeKeyId(r.tanggal, idx),
        }));
      });
    },
    [computeKeyId]
  );

  // Update a field in a draft row
  const handleRowChange = useCallback(
    (rowId: string, field: keyof DraftRow, value: string) => {
      setRows((prev) =>
        prev.map((r, idx) => {
          if (r.id !== rowId) return r;
          const updated = { ...r, [field]: value };
          if (field === "tanggal") {
            updated.hari = getHariFromDate(value);
            updated.keyId = computeKeyId(value, idx);
          }
          if (field === "orderId") {
            const matched = orders.find((o) => o.id === value);
            updated.orderLabel = matched
              ? matched.institutionName || matched.recipientName || matched.id
              : "";
          }
          return updated;
        })
      );
    },
    [orders, computeKeyId]
  );

  // Save all draft rows to Firestore
  const handleSaveAll = useCallback(async () => {
    const validRows = rows.filter((r) => r.kegiatan.trim() !== "");
    if (validRows.length === 0) {
      alert("Harap isi setidaknya satu baris Kegiatan sebelum menyimpan.");
      return;
    }
    setSaving(true);
    try {
      const inputs: CreateJobDeskInput[] = validRows.map((r) => ({
        hari: r.hari,
        tanggal: r.tanggal,
        startTime: r.startTime,
        pic: r.pic,
        kegiatan: r.kegiatan.trim(),
        keterangan: r.keterangan.trim(),
        keyId: r.keyId.trim(),
        orderId: r.orderId,
        orderLabel: r.orderLabel,
        assignedRole: PIC_NAME_TO_ROLE[r.pic],
        assignedByUid: user?.uid || "",
      }));

      await batchCreateJobDesks(inputs);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Reset form
      setSelectedOrderContext(null);
      setRows([
        {
          id: "row-1",
          hari: getHariFromDate(todayStr),
          tanggal: todayStr,
          startTime: "07:00",
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: generateKeyId(todayStr, 1),
          orderId: "",
          orderLabel: "",
        },
      ]);
      setActiveTab("table");
    } catch (err) {
      console.error("Failed saving job desks:", err);
      alert("Terjadi kesalahan saat menyimpan job desk.");
    } finally {
      setSaving(false);
    }
  }, [rows, user?.uid, todayStr]);

  // Delete an existing job desk
  const handleDeleteDesk = useCallback(async (id: string) => {
    if (!confirm("Hapus baris job desk ini?")) return;
    try {
      await deleteJobDesk(id);
    } catch (err) {
      console.error("Failed to delete job desk:", err);
    }
  }, []);

  // Filtered orders list for Handover overview tab (sorted newest first)
  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const orderLabel = (o.institutionName || o.recipientName || o.id).toLowerCase();
        const matchSearch =
          !orderSearchQuery.trim() ||
          orderLabel.includes(orderSearchQuery.toLowerCase()) ||
          (o.eventDate || "").includes(orderSearchQuery) ||
          (o.foodDetails || "").toLowerCase().includes(orderSearchQuery.toLowerCase());

        const assignedDesks = jobDesksByOrderId.get(o.id) || [];
        const hasJobDesks = assignedDesks.length > 0;

        if (orderHandoverFilter === "unassigned" && hasJobDesks) return false;
        if (orderHandoverFilter === "assigned" && !hasJobDesks) return false;

        return matchSearch;
      })
      .sort((a, b) => {
        const timeB = new Date(b.createdAt || b.updatedAt || b.eventDate || 0).getTime() || 0;
        const timeA = new Date(a.createdAt || a.updatedAt || a.eventDate || 0).getTime() || 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || "").localeCompare(a.id || "");
      });
  }, [orders, orderSearchQuery, orderHandoverFilter, jobDesksByOrderId]);

  // Filtered job desks for table view
  const filteredJobDesks = useMemo(() => {
    let result = jobDesks;

    if (selectedPic !== "all") {
      result = result.filter(
        (jd) =>
          jd.pic === selectedPic ||
          jd.assignedRole === PIC_NAME_TO_ROLE[selectedPic as PicShortName]
      );
    }

    if (selectedOrderFilter !== "all") {
      result = result.filter((jd) => jd.orderId === selectedOrderFilter);
    }

    if (selectedDate) {
      result = result.filter((jd) => jd.tanggal === selectedDate);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (jd) =>
          (jd.kegiatan || "").toLowerCase().includes(q) ||
          (jd.keterangan || "").toLowerCase().includes(q) ||
          (jd.keyId || "").toLowerCase().includes(q) ||
          (jd.orderLabel || "").toLowerCase().includes(q) ||
          (jd.pic || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [jobDesks, selectedPic, selectedOrderFilter, selectedDate, searchQuery]);

  // Stats summary
  const stats = useMemo(() => {
    const totalDesks = jobDesks.length;
    const completed = jobDesks.filter((jd) => jd.status === "complete").length;
    const approved = jobDesks.filter((jd) => jd.reviewStatus === "approved").length;
    const pendingReview = jobDesks.filter((jd) => jd.reviewStatus === "pending_review").length;

    const totalOrders = orders.length;
    const unassignedOrders = orders.filter((o) => (jobDesksByOrderId.get(o.id) || []).length === 0).length;

    return { totalDesks, completed, approved, pendingReview, totalOrders, unassignedOrders };
  }, [jobDesks, orders, jobDesksByOrderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[65vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Memuat data operasional katering...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Operasional Katering (MO)
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" /> Handover & Distribusi Tugas
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pantau pesanan katering, buat job desk terstruktur, dan delegasikan ke Ust. Joko, Dwi, Shifa, & Wandi.
          </p>
        </div>

        {/* Clean Segmented Navigation */}
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-xs self-start md:self-auto">
          {/* Tab 1: Pesanan Masuk */}
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "orders"
                ? "bg-white text-slate-900 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5 text-slate-600" />
            <span>Pesanan Admin</span>
            {stats.unassignedOrders > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white leading-none">
                {stats.unassignedOrders}
              </span>
            )}
          </button>

          {/* Tab 2: Input Form Excel */}
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "form"
                ? "bg-slate-900 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Form Job Desk</span>
            {selectedOrderContext && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase leading-none transition-colors ${
                  activeTab === "form"
                    ? "bg-amber-400 text-slate-950 font-extrabold"
                    : "bg-amber-100 text-amber-900 border border-amber-300"
                }`}
              >
                1 Terpilih
              </span>
            )}
          </button>

          {/* Tab 3: Tabel Data Monitoring */}
          <button
            type="button"
            onClick={() => setActiveTab("table")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "table"
                ? "bg-white text-slate-900 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-slate-600" />
            <span>Semua Tugas</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/80 text-slate-700 leading-none">
              {jobDesks.length}
            </span>
          </button>
        </div>
      </div>

      {/* Unified Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Pesanan Admin</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{stats.totalOrders}</span>
            {stats.unassignedOrders > 0 && (
              <span className="text-xs font-semibold text-rose-600">
                ({stats.unassignedOrders} belum ditugaskan)
              </span>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Job Desk Terdistribusi</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{stats.totalDesks}</span>
            <span className="text-xs text-slate-400">baris tugas</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Menunggu Review CO_MO</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-amber-600">{stats.pendingReview}</span>
            <span className="text-xs text-slate-400">perlu verifikasi</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Disetujui (Approved)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-emerald-600">{stats.approved}</span>
            <span className="text-xs text-slate-400">selesai 100%</span>
          </div>
        </div>
      </div>

      {/* Save Notification */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            Data job desk berhasil disimpan dan langsung didistribusikan ke tim operasional!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* TAB 1: DAFTAR PESANAN ADMIN (HANDOVER CONTEXT) */}
      {/* ========================================================================= */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Sub-header Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">Filter Pesanan:</span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setOrderHandoverFilter("unassigned")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    orderHandoverFilter === "unassigned" ? "bg-white text-rose-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Belum Ditugaskan ({stats.unassignedOrders})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderHandoverFilter("assigned")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    orderHandoverFilter === "assigned" ? "bg-white text-emerald-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Sudah Ditugaskan ({stats.totalOrders - stats.unassignedOrders})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderHandoverFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    orderHandoverFilter === "all" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Semua ({orders.length})
                </button>
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                placeholder="Cari pesanan, lembaga..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Clean Order Grid */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-xs">
              <ShoppingBag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada pesanan yang sesuai filter</p>
              <p className="text-xs text-slate-400 mt-1">Coba ubah kata kunci pencarian atau status filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map((order) => {
                const assignedDesks = jobDesksByOrderId.get(order.id) || [];
                const isAssigned = assignedDesks.length > 0;
                const completedCount = assignedDesks.filter((d) => d.status === "complete").length;
                const orderTitle = order.institutionName || order.recipientName || `Pesanan #${order.id.slice(-6).toUpperCase()}`;

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between space-y-4 group"
                  >
                    <div>
                      {/* Card Header: Tag & Status Badge */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          #{order.id.slice(-6).toUpperCase()}
                        </span>

                        {isAssigned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            {assignedDesks.length} Tugas Dibuat
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                            <AlertCircle className="h-3 w-3 text-rose-500" />
                            Belum Ditugaskan
                          </span>
                        )}
                      </div>

                      {/* Institution / Recipient Title */}
                      <h3
                        onClick={() => setDetailOrderModal(order)}
                        className="text-base font-bold text-slate-900 leading-snug cursor-pointer group-hover:text-amber-600 transition-colors"
                      >
                        {orderTitle}
                      </h3>

                      {/* Event Date & Delivery Time Chips */}
                      <div className="flex items-center gap-2 text-xs text-slate-600 mt-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 font-medium text-[11px]">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {order.eventDate ? `${getHariFromDate(order.eventDate)}, ${formatIndoDate(order.eventDate)}` : "-"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 font-medium text-[11px]">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {formatIndoTime(order.deliveryTime || order.eventDate)}
                        </span>
                      </div>

                      {/* Menu Breakdown Box */}
                      <div
                        onClick={() => setDetailOrderModal(order)}
                        className="mt-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-100/70 transition-colors cursor-pointer text-xs"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <UtensilsCrossed className="h-3 w-3" /> Menu Pesanan:
                          </span>
                          <span className="text-[10px] font-semibold text-amber-700 hover:underline">
                            Lihat Rincian →
                          </span>
                        </div>

                        {order.items && order.items.length > 0 ? (
                          <div className="space-y-1">
                            {order.items.slice(0, 2).map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-slate-700 text-xs">
                                <span className="font-medium truncate pr-2">• {it.itemName}</span>
                                <span className="font-semibold text-slate-900 shrink-0">
                                  {it.quantity} {it.unit || "porsi"}
                                </span>
                              </div>
                            ))}
                            {order.items.length > 2 && (
                              <p className="text-[10px] text-slate-400 font-medium pt-0.5">
                                +{order.items.length - 2} menu lainnya...
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-600 text-xs italic">
                            {order.foodDetails || "Menu makanan katering reguler"}
                          </p>
                        )}
                      </div>

                      {/* Progress summary if already assigned */}
                      {isAssigned && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                          <span>PIC Selesai: <strong className="text-slate-800">{completedCount}/{assignedDesks.length}</strong></span>
                          <span>CO_MO Status: <strong className="text-slate-800">{assignedDesks.filter(d => d.reviewStatus === "approved").length} Approved</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Clean Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailOrderModal(order)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        Detail
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectOrderForJobDesk(order)}
                        className={`flex-[1.6] flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                          isAssigned
                            ? "bg-slate-900 hover:bg-slate-800 text-white"
                            : "bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isAssigned ? "Tambah Tugas" : "Buat Job Desk"}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FORM INPUT (EXCEL SPREADSHEET STYLE WITH ORDER CONTEXT) */}
      {/* ========================================================================= */}
      {activeTab === "form" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          {/* Top Back Navigation Bar */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer shadow-2xs border border-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Daftar Pesanan
            </button>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
              {selectedOrderContext
                ? `Konteks: ${selectedOrderContext.institutionName || selectedOrderContext.recipientName}`
                : "Form Input Bebas"}
            </span>
          </div>

          {/* Order Context Banner */}
          {selectedOrderContext ? (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Konteks Pesanan Terpilih
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedOrderContext.institutionName || selectedOrderContext.recipientName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tgl Acara: <strong className="text-slate-800">{formatIndoDate(selectedOrderContext.eventDate)}</strong> ({getHariFromDate(selectedOrderContext.eventDate)}) • Jam: <strong className="text-slate-800">{formatIndoTime(selectedOrderContext.deliveryTime || selectedOrderContext.eventDate)}</strong> • Alamat: {selectedOrderContext.deliveryAddress || "-"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailOrderModal(selectedOrderContext)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Lihat Menu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrderContext(null);
                    setActiveTab("orders");
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Ganti Pesanan
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Form Input Job Desk (Format Excel)
                </h2>
                <p className="text-xs text-slate-500">
                  Isi baris tugas di bawah ini. Anda dapat menambah beberapa baris sekaligus.
                </p>
              </div>
            </div>
          )}

          {/* Table Spreadsheet Editor */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse min-w-[1400px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                  <th className="py-3 px-3 w-12 text-center text-slate-400">#</th>
                  <th className="py-3 px-3 min-w-[140px] w-36">Hari</th>
                  <th className="py-3 px-3 min-w-[160px] w-44">Tanggal</th>
                  <th className="py-3 px-3 min-w-[130px] w-36 text-center">Start Time</th>
                  <th className="py-3 px-3 min-w-[220px] w-60">PIC</th>
                  <th className="py-3 px-3 min-w-[280px]">Kegiatan</th>
                  <th className="py-3 px-3 min-w-[320px]">Keterangan (Wrap Text)</th>
                  <th className="py-3 px-3 min-w-[160px] w-44">Key ID (Auto)</th>
                  <th className="py-3 px-3 min-w-[200px] w-52">Terkait Pesanan</th>
                  <th className="py-3 px-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-semibold align-top pt-3.5">
                      {idx + 1}
                    </td>
                    {/* Hari */}
                    <td className="py-2 px-2 align-top min-w-[140px]">
                      <select
                        value={row.hari}
                        onChange={(e) => handleRowChange(row.id, "hari", e.target.value)}
                        className="w-full min-w-[120px] px-3 py-2 rounded-lg border border-slate-200 bg-white focus:bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900 transition-colors cursor-pointer"
                      >
                        {HARI_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Tanggal */}
                    <td className="py-2 px-2 align-top min-w-[160px]">
                      <input
                        type="date"
                        value={row.tanggal}
                        onChange={(e) => handleRowChange(row.id, "tanggal", e.target.value)}
                        className="w-full min-w-[140px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900 transition-colors"
                      />
                    </td>
                    {/* Start Time */}
                    <td className="py-2 px-2 align-top min-w-[130px]">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => handleRowChange(row.id, "startTime", e.target.value)}
                        className="w-full min-w-[110px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:bg-white text-xs font-mono font-bold text-center focus:ring-2 focus:ring-slate-900 transition-colors"
                      />
                    </td>
                    {/* PIC */}
                    <td className="py-2 px-2 align-top min-w-[220px]">
                      <select
                        value={row.pic}
                        onChange={(e) => handleRowChange(row.id, "pic", e.target.value as PicShortName)}
                        className="w-full min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-900 focus:bg-white text-xs focus:ring-2 focus:ring-slate-900 transition-colors cursor-pointer"
                      >
                        {PIC_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p} ({JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]]})
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Kegiatan */}
                    <td className="py-2 px-2 align-top">
                      <textarea
                        rows={2}
                        placeholder="Misal: Produksi Menu Utama / Capcay"
                        value={row.kegiatan}
                        onChange={(e) => handleRowChange(row.id, "kegiatan", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 transition-colors resize-y leading-relaxed min-h-[58px]"
                      />
                    </td>
                    {/* Keterangan */}
                    <td className="py-2 px-2 align-top">
                      <textarea
                        rows={2}
                        placeholder="Misal: 120 porsi nasi box saji..."
                        value={row.keterangan}
                        onChange={(e) => handleRowChange(row.id, "keterangan", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:bg-white text-xs focus:ring-2 focus:ring-slate-900 transition-colors resize-y leading-relaxed min-h-[58px]"
                      />
                    </td>
                    {/* Key ID (100% Otomatis / Read-Only Badge) */}
                    <td className="py-2 px-2 whitespace-nowrap align-top">
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
                        <span className="text-xs font-mono font-bold text-slate-800 tracking-wide">
                          {row.keyId}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-200/90 px-1.5 py-0.5 rounded ml-auto">
                          Auto
                        </span>
                      </div>
                    </td>
                    {/* Link Order (Optional) */}
                    <td className="py-2 px-2 align-top">
                      <select
                        value={row.orderId || ""}
                        onChange={(e) => handleRowChange(row.id, "orderId", e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900 transition-colors"
                      >
                        <option value="">(Tugas Umum / Non-Order)</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.institutionName || o.recipientName || o.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Delete button */}
                    <td className="py-2 px-2 text-center align-top pt-2.5">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={rows.length === 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer transition-colors"
                        title="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Baris Lagi
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {saving ? "Menyimpan ke Database..." : `Simpan Semua Baris (${rows.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SPREADSHEET TABLE VIEW */}
      {/* ========================================================================= */}
      {activeTab === "table" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Search */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Cari Kata Kunci
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kegiatan, PIC, Key ID..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900 focus:bg-white"
                />
              </div>
            </div>

            {/* Filter by PIC */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Filter PIC
              </label>
              <select
                value={selectedPic}
                onChange={(e) => setSelectedPic(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">Semua PIC (Joko, Dwi, Shifa, Wandi)</option>
                {PIC_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p} ({JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]]})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Order */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Filter Pesanan Katering
              </label>
              <select
                value={selectedOrderFilter}
                onChange={(e) => setSelectedOrderFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">Semua Pesanan</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.institutionName || o.recipientName || o.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Filter Tanggal
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <p className="text-xs font-semibold text-slate-700">
                Menampilkan <span className="font-bold text-slate-900">{filteredJobDesks.length}</span> baris job desk
              </p>
              {(selectedPic !== "all" || selectedOrderFilter !== "all" || selectedDate || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPic("all");
                    setSelectedOrderFilter("all");
                    setSelectedDate("");
                    setSearchQuery("");
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer underline"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {filteredJobDesks.length === 0 ? (
              <div className="text-center py-16">
                <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">
                  Belum ada data job desk yang cocok
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Pilih pesanan dari tab "Pesanan Admin" untuk membuat penugasan baru
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                      <th className="py-3 px-3.5 w-24">Hari</th>
                      <th className="py-3 px-3.5 w-28">Tanggal</th>
                      <th className="py-3 px-3.5 w-20 text-center">Start Time</th>
                      <th className="py-3 px-3.5 w-28">PIC</th>
                      <th className="py-3 px-3.5 min-w-[200px]">Kegiatan</th>
                      <th className="py-3 px-3.5 min-w-[240px]">Keterangan</th>
                      <th className="py-3 px-3.5 w-36 font-mono">Key ID</th>
                      <th className="py-3 px-3.5 w-28 text-center">Status PIC</th>
                      <th className="py-3 px-3.5 w-32 text-center">Review CO_MO</th>
                      <th className="py-3 px-2 w-16 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredJobDesks.map((jd) => (
                      <tr key={jd.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3.5 font-bold text-slate-900">{jd.hari || "-"}</td>
                        <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">{jd.tanggal || "-"}</td>
                        <td className="py-3 px-3.5 font-mono text-center font-bold text-slate-700">
                          {jd.startTime || "-"}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {jd.pic}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-slate-900">
                          <span
                            onClick={() => setDetailJobDeskModal(jd)}
                            className="cursor-pointer hover:text-amber-600 transition-colors"
                          >
                            {jd.kegiatan || jd.title}
                          </span>
                          {jd.orderLabel && (
                            <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Pesanan: {jd.orderLabel}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600">
                          {jd.keterangan || jd.description || "-"}
                          {jd.incompleteReason && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1">
                              Alasan: {jd.incompleteReason}
                            </p>
                          )}
                          {jd.rejectionRemark && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1">
                              Remark CO_MO: {jd.rejectionRemark}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200">
                            {jd.keyId}
                          </span>
                        </td>
                        {/* Status PIC */}
                        <td className="py-3 px-3.5 text-center">
                          {jd.status === "complete" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Complete
                            </span>
                          ) : jd.status === "incomplete" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="h-3 w-3" /> Incomplete
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                              <Clock className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                        {/* Review CO_MO */}
                        <td className="py-3 px-3.5 text-center">
                          {jd.reviewStatus === "approved" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </span>
                          ) : jd.reviewStatus === "rejected" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="h-3 w-3" /> Rejected
                            </span>
                          ) : jd.reviewStatus === "pending_review" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                              <Clock className="h-3 w-3" /> Perlu Review
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailJobDeskModal(jd)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Lihat detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDesk(jd.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Hapus job desk"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: DETAIL LENGKAP PESANAN ADMIN */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailOrderModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200"
            >
              {/* Modal Header */}
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <ShoppingBag className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                      Pesanan #{detailOrderModal.id.slice(-6).toUpperCase()}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {detailOrderModal.institutionName || detailOrderModal.recipientName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailOrderModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 text-xs text-slate-700">
                {/* General Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Tanggal Acara:</p>
                      <p className="font-semibold text-slate-900">
                        {detailOrderModal.eventDate ? `${getHariFromDate(detailOrderModal.eventDate)}, ${formatIndoDate(detailOrderModal.eventDate)}` : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Jam Pengiriman:</p>
                      <p className="font-semibold text-slate-900">{formatIndoTime(detailOrderModal.deliveryTime || detailOrderModal.eventDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Nomor Telepon / Kontak:</p>
                      <p className="font-semibold text-slate-900">{detailOrderModal.recipientPhone || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Alamat Pengiriman:</p>
                      <p className="font-semibold text-slate-900">{detailOrderModal.deliveryAddress || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* Items & Portion List */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-slate-500" />
                    Daftar Menu & Jumlah Porsi
                  </h4>
                  {detailOrderModal.items && detailOrderModal.items.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                            <th className="py-2 px-3 w-10 text-center">#</th>
                            <th className="py-2 px-3">Nama Menu</th>
                            <th className="py-2 px-3 text-center">Jumlah</th>
                            <th className="py-2 px-3">Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {detailOrderModal.items.map((it, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="py-2 px-3 text-center font-medium text-slate-400">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{it.itemName}</td>
                              <td className="py-2 px-3 text-center font-bold text-slate-900">
                                {it.quantity} {it.unit || "porsi"}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{it.notes || it.ingredients || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                      {detailOrderModal.foodDetails || "Rincian menu katering standar"}
                    </div>
                  )}
                </div>

                {/* Existing Job Desks for this order */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                    Job Desk yang Sudah Dibuat
                  </h4>
                  {(() => {
                    const assignedDesks = jobDesksByOrderId.get(detailOrderModal.id) || [];
                    if (assignedDesks.length === 0) {
                      return (
                        <div className="p-3.5 bg-rose-50/70 rounded-xl border border-rose-200/80 text-rose-800 flex items-center justify-between text-xs font-medium">
                          <span>Belum ada tugas job desk yang didistribusikan untuk pesanan ini.</span>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                            Perlu Handover
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                              <th className="py-2 px-3">Key ID</th>
                              <th className="py-2 px-3">PIC</th>
                              <th className="py-2 px-3">Kegiatan</th>
                              <th className="py-2 px-3 text-center">Status PIC</th>
                              <th className="py-2 px-3 text-center">Review CO_MO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {assignedDesks.map((jd) => (
                              <tr key={jd.id}>
                                <td className="py-2 px-3 font-mono font-semibold text-slate-700">{jd.keyId}</td>
                                <td className="py-2 px-3 font-bold text-slate-900">{jd.pic}</td>
                                <td className="py-2 px-3">{jd.kegiatan}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    jd.status === "complete" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                                  }`}>
                                    {jd.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    jd.reviewStatus === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                                  }`}>
                                    {jd.reviewStatus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setDetailOrderModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectOrderForJobDesk(detailOrderModal)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 shadow-xs cursor-pointer transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Buat / Tambah Job Desk untuk Pesanan Ini
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: DETAIL JOB DESK SPESIFIK */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailJobDeskModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
            >
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-amber-400">
                    {detailJobDeskModal.keyId}
                  </span>
                  <h3 className="text-sm font-bold text-white">Detail Baris Job Desk</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailJobDeskModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Hari & Tanggal:</p>
                    <p className="font-semibold text-slate-900">{detailJobDeskModal.hari}, {detailJobDeskModal.tanggal}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Jam Mulai:</p>
                    <p className="font-mono font-bold text-slate-900">{detailJobDeskModal.startTime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Petugas (PIC):</p>
                    <p className="font-bold text-slate-900">{detailJobDeskModal.pic}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Terkait Pesanan:</p>
                    <p className="font-semibold text-slate-900">{detailJobDeskModal.orderLabel || "Tugas Umum"}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Kegiatan:</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{detailJobDeskModal.kegiatan}</p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Keterangan / Rincian:</p>
                  <p className="text-xs text-slate-700 mt-0.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {detailJobDeskModal.keterangan || "-"}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Status Pengerjaan:</p>
                    <span className="font-semibold text-slate-800">{detailJobDeskModal.status}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Review CO_MO:</p>
                    <span className="font-semibold text-emerald-700">{detailJobDeskModal.reviewStatus}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailJobDeskModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MoJobDeskPage;
