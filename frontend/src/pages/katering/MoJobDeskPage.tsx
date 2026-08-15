// ============================================================================
// MO Job Desk Management Page (Premium Enterprise SaaS Design - Katering & MBG)
// ============================================================================
// Manager Operational (MO) uses this page to:
// 1. Monitor incoming orders from Katering & MBG with clean, distinct tabs
// 2. Click any catering order or MBG school for quick job desk handover
// 3. Draft & distribute structured Excel job desks for Joko, Dwi, Shifa, Wandi, and MBG2
// 4. Track operational progress & CO_MO reviews across both divisions in real time

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
  Milk,
  School,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import {
  subscribeBatches,
  subscribeAllEntries,
} from "@/services/mbgAdminService";
import {
  batchCreateJobDesks,
  deleteJobDesk,
  subscribeAllJobDesks,
  type CreateJobDeskInput,
} from "@/services/cateringJobDeskService";
import type { Order } from "@/types/order";
import type { MbgPmBatch, MbgPmEntry } from "@/types/mbg";
import type {
  CateringJobDesk,
  JobDeskDivision,
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
  division?: JobDeskDivision;
  hari: string;
  tanggal: string;
  startTime: string;
  pic: PicShortName;
  kegiatan: string;
  keterangan: string;
  keyId: string;
  orderId?: string;
  orderLabel?: string;
  mbgBatchId?: string;
  mbgInstitutionName?: string;
  mbgPortionCount?: number;
  mbgMenuType?: string;
}

const PIC_OPTIONS: PicShortName[] = [
  "Joko",
  "Dwi",
  "Shifa",
  "Wandi",
  "MBG2",
  "Distribusi2",
];

export function MoJobDeskPage() {
  const { user } = useAuth();
  const [jobDesks, setJobDesks] = useState<CateringJobDesk[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [mbgBatches, setMbgBatches] = useState<MbgPmBatch[]>([]);
  const [mbgEntries, setMbgEntries] = useState<MbgPmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "form" | "table">("orders");

  // Division switcher in Tab 1 (Orders / Handover)
  const [handoverDivision, setHandoverDivision] = useState<"katering" | "mbg">("katering");

  // Selected context for creating job desks
  const [selectedOrderContext, setSelectedOrderContext] = useState<Order | null>(null);
  const [selectedMbgContext, setSelectedMbgContext] = useState<{
    batch?: MbgPmBatch;
    entry: MbgPmEntry;
  } | null>(null);

  // Modal detail states
  const [detailOrderModal, setDetailOrderModal] = useState<Order | null>(null);
  const [detailMbgModal, setDetailMbgModal] = useState<{
    batch?: MbgPmBatch;
    entry: MbgPmEntry;
  } | null>(null);
  const [detailJobDeskModal, setDetailJobDeskModal] = useState<CateringJobDesk | null>(null);

  // Filter state for table view
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPic, setSelectedPic] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [tableDivisionFilter, setTableDivisionFilter] = useState<"all" | "katering" | "mbg">("all");

  // Filter for orders list
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderHandoverFilter, setOrderHandoverFilter] = useState<"all" | "unassigned" | "assigned">("unassigned");

  // Filter for MBG entries list
  const [mbgSearchQuery, setMbgSearchQuery] = useState("");
  const [mbgHandoverFilter, setMbgHandoverFilter] = useState<"all" | "unassigned" | "assigned">("unassigned");

  // Draft rows for batch entry
  const todayStr = new Date().toISOString().split("T")[0];
  const [rows, setRows] = useState<DraftRow[]>([
    {
      id: "row-1",
      division: "katering",
      hari: getHariFromDate(todayStr),
      tanggal: todayStr,
      startTime: "07:00",
      pic: "Joko",
      kegiatan: "",
      keterangan: "",
      keyId: generateKeyId(todayStr, 1, "CAT"),
      orderId: "",
      orderLabel: "",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Subscribe to all job desks, orders, and MBG data
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

    const unsubBatches = subscribeBatches(
      (batches) => setMbgBatches(batches),
      (err) => console.error("MO: failed to load MBG batches:", err)
    );

    const unsubEntries = subscribeAllEntries(
      (entries) => setMbgEntries(entries),
      (err) => console.error("MO: failed to load MBG entries:", err)
    );

    return () => {
      unsubDesks();
      unsubOrders();
      unsubBatches();
      unsubEntries();
    };
  }, []);

  // Map of orderId / entryId -> array of existing job desks
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

  // Batch lookup map for MBG entries
  const batchMap = useMemo(() => {
    const map = new Map<string, MbgPmBatch>();
    for (const b of mbgBatches) {
      map.set(b.id, b);
    }
    return map;
  }, [mbgBatches]);

  // Calculate next sequential Key ID for a given date and division
  const computeKeyId = useCallback(
    (targetDate: string, indexInBatch: number, div: JobDeskDivision = "katering") => {
      const prefix = div === "mbg" ? "MBG" : "CAT";
      const existingForDate = jobDesks.filter(
        (jd) => jd.tanggal === targetDate && (jd.keyId || "").startsWith(prefix)
      );
      let maxSeq = 0;
      const regex = new RegExp(`${prefix}-\\d{8}-(\\d+)`);
      for (const jd of existingForDate) {
        const match = (jd.keyId || "").match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return generateKeyId(targetDate, maxSeq + indexInBatch + 1, prefix);
    },
    [jobDesks]
  );

  // Initialize draft rows with correct auto Key ID once jobDesks load
  useEffect(() => {
    setRows((prev) =>
      prev.map((r, idx) => ({
        ...r,
        keyId: computeKeyId(r.tanggal || todayStr, idx, r.division || "katering"),
      }))
    );
  }, [jobDesks, todayStr, computeKeyId]);

  // Start creating job desk for a selected Catering Order
  const handleSelectOrderForJobDesk = useCallback(
    (order: Order) => {
      setSelectedMbgContext(null);
      setSelectedOrderContext(order);
      setDetailOrderModal(null);
      const targetDate = extractDateOnly(order.eventDate) || todayStr;
      const targetHari = getHariFromDate(targetDate) || "Jumat";
      const targetTime = extractTimeOnly(order.deliveryTime || order.eventDate, "07:00");
      const orderLabel =
        order.institutionName || order.recipientName || `Pesanan #${order.id.slice(-6).toUpperCase()}`;

      setRows([
        {
          id: `row-${Date.now()}-1`,
          division: "katering",
          hari: targetHari,
          tanggal: targetDate,
          startTime: targetTime,
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(targetDate, 0, "katering"),
          orderId: order.id,
          orderLabel,
        },
      ]);

      setActiveTab("form");
    },
    [todayStr, computeKeyId]
  );

  // Start creating job desk for a selected MBG School/Institution
  const handleSelectMbgForJobDesk = useCallback(
    (entry: MbgPmEntry) => {
      const batch = batchMap.get(entry.batchId);
      setSelectedOrderContext(null);
      setSelectedMbgContext({ batch, entry });
      setDetailMbgModal(null);

      const targetDate = batch?.tanggal ? extractDateOnly(batch.tanggal) : todayStr;
      const targetHari = getHariFromDate(targetDate) || "Senin";
      const totalPortions =
        (entry.qtSiswaBalita || 0) +
        (entry.qtGuruKader || 0) +
        (entry.qtBumilBusui || 0) +
        (entry.qtPobiaNasi || 0);

      setRows([
        {
          id: `row-${Date.now()}-1`,
          division: "mbg",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "06:00",
          pic: "MBG2",
          kegiatan: `Produksi MBG - ${entry.institutionName}`,
          keterangan: `Persiapan & porsi ${totalPortions} porsi (${entry.schoolLevel || entry.institutionType || "Sekolah"}) - Menu MBG`,
          keyId: computeKeyId(targetDate, 0, "mbg"),
          orderId: entry.id,
          orderLabel: `MBG: ${entry.institutionName}`,
          mbgBatchId: entry.batchId,
          mbgInstitutionName: entry.institutionName,
          mbgPortionCount: totalPortions,
        },
        {
          id: `row-${Date.now()}-2`,
          division: "mbg",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "08:30",
          pic: "Wandi",
          kegiatan: `Pengantaran MBG - ${entry.institutionName}`,
          keterangan: `Distribusi & serah terima ${totalPortions} porsi ke ${entry.institutionName} ${entry.address ? `(${entry.address})` : ""}`,
          keyId: computeKeyId(targetDate, 1, "mbg"),
          orderId: entry.id,
          orderLabel: `MBG: ${entry.institutionName}`,
          mbgBatchId: entry.batchId,
          mbgInstitutionName: entry.institutionName,
          mbgPortionCount: totalPortions,
        },
      ]);

      setActiveTab("form");
    },
    [batchMap, todayStr, computeKeyId]
  );

  // Add new empty row to draft form with automatic sequential Key ID
  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      const defaultDate = lastRow ? lastRow.tanggal : todayStr;
      const defaultDivision: JobDeskDivision = lastRow?.division || (selectedMbgContext ? "mbg" : "katering");
      const nextIndex = prev.length;
      return [
        ...prev,
        {
          id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          division: defaultDivision,
          hari: lastRow ? lastRow.hari : getHariFromDate(defaultDate),
          tanggal: defaultDate,
          startTime: lastRow ? lastRow.startTime : "07:00",
          pic: defaultDivision === "mbg" ? "MBG2" : "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(defaultDate, nextIndex, defaultDivision),
          orderId: selectedOrderContext?.id || selectedMbgContext?.entry.id || lastRow?.orderId || "",
          orderLabel:
            selectedOrderContext?.institutionName ||
            selectedOrderContext?.recipientName ||
            (selectedMbgContext ? `MBG: ${selectedMbgContext.entry.institutionName}` : "") ||
            lastRow?.orderLabel ||
            "",
          mbgBatchId: selectedMbgContext?.batch?.id || lastRow?.mbgBatchId,
          mbgInstitutionName: selectedMbgContext?.entry.institutionName || lastRow?.mbgInstitutionName,
          mbgPortionCount: selectedMbgContext
            ? (selectedMbgContext.entry.qtSiswaBalita || 0) +
              (selectedMbgContext.entry.qtGuruKader || 0) +
              (selectedMbgContext.entry.qtBumilBusui || 0)
            : lastRow?.mbgPortionCount,
        },
      ];
    });
  }, [todayStr, computeKeyId, selectedOrderContext, selectedMbgContext]);

  // Remove a row from draft form and re-index Key IDs
  const handleRemoveRow = useCallback(
    (rowId: string) => {
      setRows((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((r) => r.id !== rowId);
        return filtered.map((r, idx) => ({
          ...r,
          keyId: computeKeyId(r.tanggal, idx, r.division || "katering"),
        }));
      });
    },
    [computeKeyId]
  );

  // Update a field in a draft row
  const handleRowChange = useCallback(
    (rowId: string, field: keyof DraftRow, value: unknown) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const updated = { ...r, [field]: value };
          if (field === "tanggal" && typeof value === "string") {
            updated.hari = getHariFromDate(value);
            updated.keyId = computeKeyId(value, 0, updated.division || "katering");
          }
          if (field === "division" && typeof value === "string") {
            updated.keyId = computeKeyId(updated.tanggal, 0, value as JobDeskDivision);
          }
          return updated;
        })
      );
    },
    [computeKeyId]
  );

  // Save all draft rows to Firestore
  const handleSaveAll = useCallback(async () => {
    if (!user?.uid) {
      alert("Harap login terlebih dahulu.");
      return;
    }

    const invalid = rows.find((r) => !r.kegiatan.trim());
    if (invalid) {
      alert("Pastikan semua baris memiliki nama Kegiatan!");
      return;
    }

    setSaving(true);
    try {
      const inputs: CreateJobDeskInput[] = rows.map((r) => ({
        division: r.division || "katering",
        hari: r.hari,
        tanggal: r.tanggal,
        startTime: r.startTime,
        pic: r.pic,
        kegiatan: r.kegiatan.trim(),
        keterangan: r.keterangan.trim(),
        keyId: r.keyId,
        orderId: r.orderId || undefined,
        orderLabel: r.orderLabel || undefined,
        mbgBatchId: r.mbgBatchId || undefined,
        mbgInstitutionName: r.mbgInstitutionName || undefined,
        mbgPortionCount: r.mbgPortionCount || undefined,
        mbgMenuType: r.mbgMenuType || undefined,
        assignedRole: PIC_NAME_TO_ROLE[r.pic as PicShortName] || "produksi_1",
        assignedByUid: user.uid,
      }));

      await batchCreateJobDesks(inputs);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Reset form
      setSelectedOrderContext(null);
      setSelectedMbgContext(null);
      setRows([
        {
          id: "row-1",
          division: "katering",
          hari: getHariFromDate(todayStr),
          tanggal: todayStr,
          startTime: "07:00",
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: generateKeyId(todayStr, 1, "CAT"),
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

  // Filtered orders list for Katering Handover
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

  // Filtered MBG entries list for MBG Handover
  const filteredMbgEntries = useMemo(() => {
    return mbgEntries.filter((entry) => {
      const batch = batchMap.get(entry.batchId);
      const searchTarget = `${entry.institutionName} ${entry.address || ""} ${batch?.tanggal || ""}`.toLowerCase();
      const matchSearch = !mbgSearchQuery.trim() || searchTarget.includes(mbgSearchQuery.toLowerCase());

      const assignedDesks = jobDesksByOrderId.get(entry.id) || [];
      const hasJobDesks = assignedDesks.length > 0;

      if (mbgHandoverFilter === "unassigned" && hasJobDesks) return false;
      if (mbgHandoverFilter === "assigned" && !hasJobDesks) return false;

      return matchSearch;
    });
  }, [mbgEntries, batchMap, mbgSearchQuery, mbgHandoverFilter, jobDesksByOrderId]);

  // Filtered job desks for table view
  const filteredJobDesks = useMemo(() => {
    let result = jobDesks;

    if (tableDivisionFilter !== "all") {
      result = result.filter((jd) => jd.division === tableDivisionFilter);
    }

    if (selectedPic !== "all") {
      result = result.filter(
        (jd) =>
          jd.pic === selectedPic ||
          jd.assignedRole === PIC_NAME_TO_ROLE[selectedPic as PicShortName]
      );
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
          (jd.mbgInstitutionName || "").toLowerCase().includes(q) ||
          (jd.pic || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [jobDesks, tableDivisionFilter, selectedPic, selectedDate, searchQuery]);

  // Stats computation
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const unassignedOrders = orders.filter((o) => (jobDesksByOrderId.get(o.id) || []).length === 0).length;

    const totalMbgEntries = mbgEntries.length;
    const unassignedMbg = mbgEntries.filter((e) => (jobDesksByOrderId.get(e.id) || []).length === 0).length;

    const totalDesks = jobDesks.length;
    const kateringDesks = jobDesks.filter((d) => d.division !== "mbg").length;
    const mbgDesks = jobDesks.filter((d) => d.division === "mbg").length;

    const pendingReview = jobDesks.filter((d) => d.reviewStatus === "pending_review").length;
    const approved = jobDesks.filter((d) => d.reviewStatus === "approved").length;

    return {
      totalOrders,
      unassignedOrders,
      totalMbgEntries,
      unassignedMbg,
      totalDesks,
      kateringDesks,
      mbgDesks,
      pendingReview,
      approved,
    };
  }, [orders, mbgEntries, jobDesks, jobDesksByOrderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 px-3 sm:px-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-md mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Penyusunan & Monitoring Job Desk MO (Katering & MBG)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Ruang Kerja Manager Operasional
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            Susun pembagian tugas Teklap, pantau pesanan Katering & Program MBG, dan validasi review CO_MO.
          </p>
        </div>

        {/* Primary Tab Switcher */}
        <div className="flex items-center p-1.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 shrink-0 self-start sm:self-center">
          {/* Tab 1: Daftar Pesanan / Handover */}
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "orders"
                ? "bg-white text-slate-900 shadow-xs font-semibold"
                : "text-slate-200 hover:text-white"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Data Masuk / Handover</span>
            {(stats.unassignedOrders > 0 || stats.unassignedMbg > 0) && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-500 text-white leading-none">
                {stats.unassignedOrders + stats.unassignedMbg}
              </span>
            )}
          </button>

          {/* Tab 2: Input Form Excel */}
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "form"
                ? "bg-slate-900 text-white shadow-xs font-semibold border border-white/20"
                : "text-slate-200 hover:text-white"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Form Job Desk</span>
            {(selectedOrderContext || selectedMbgContext) && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase leading-none bg-amber-400 text-slate-950">
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
                : "text-slate-200 hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-slate-600" />
            <span>Semua Tugas</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-200 text-slate-700 leading-none">
              {jobDesks.length}
            </span>
          </button>
        </div>
      </div>

      {/* Unified Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Data Masuk (Katering / MBG)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{stats.totalOrders} / {stats.totalMbgEntries}</span>
            {(stats.unassignedOrders > 0 || stats.unassignedMbg > 0) && (
              <span className="text-xs font-semibold text-rose-600">
                ({stats.unassignedOrders + stats.unassignedMbg} perlu jobdesk)
              </span>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Job Desk Terdistribusi</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{stats.totalDesks}</span>
            <span className="text-xs text-slate-500 font-medium">
              ({stats.kateringDesks} Katering • {stats.mbgDesks} MBG)
            </span>
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
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2 shadow-xs"
          >
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            Data job desk berhasil disimpan dan langsung didistribusikan ke tim operasional (Teklap)!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* TAB 1: DAFTAR PESANAN ADMIN & PROGRAM MBG (HANDOVER CONTEXT) */}
      {/* ========================================================================= */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Top Division Tab Switcher: Katering vs MBG */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Divisi Operasional:</span>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setHandoverDivision("katering")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    handoverDivision === "katering"
                      ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <UtensilsCrossed className="h-3.5 w-3.5" />
                  <span>🍱 Katering Reguler ({orders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHandoverDivision("mbg")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    handoverDivision === "mbg"
                      ? "bg-emerald-600 text-white font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Milk className="h-3.5 w-3.5" />
                  <span>🥛 Program MBG ({mbgEntries.length} Sekolah)</span>
                </button>
              </div>
            </div>

            {/* Quick search input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={handoverDivision === "katering" ? orderSearchQuery : mbgSearchQuery}
                onChange={(e) =>
                  handoverDivision === "katering"
                    ? setOrderSearchQuery(e.target.value)
                    : setMbgSearchQuery(e.target.value)
                }
                placeholder={
                  handoverDivision === "katering"
                    ? "Cari pesanan katering, pemesan..."
                    : "Cari nama sekolah MBG, alamat..."
                }
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SUB-SECTION 1: KATERING REGULER HANDOVER */}
          {/* ------------------------------------------------------------- */}
          {handoverDivision === "katering" && (
            <div className="space-y-4">
              {/* Filter Buttons */}
              <div className="flex items-center justify-between gap-2 px-1">
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
                <span className="text-xs text-slate-400 font-medium">
                  Menampilkan {filteredOrders.length} pesanan
                </span>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-xs">
                  <ShoppingBag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Tidak ada pesanan katering yang sesuai filter</p>
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

                          <h3
                            onClick={() => setDetailOrderModal(order)}
                            className="text-base font-bold text-slate-900 leading-snug cursor-pointer group-hover:text-amber-600 transition-colors"
                          >
                            {orderTitle}
                          </h3>

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

                          <div
                            onClick={() => setDetailOrderModal(order)}
                            className="mt-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-100/70 transition-colors cursor-pointer text-xs"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                <UtensilsCrossed className="h-3 w-3" /> Menu Katering:
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

                          {isAssigned && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                              <span>PIC Selesai: <strong className="text-slate-800">{completedCount}/{assignedDesks.length}</strong></span>
                              <span>CO_MO Status: <strong className="text-slate-800">{assignedDesks.filter(d => d.reviewStatus === "approved").length} Approved</strong></span>
                            </div>
                          )}
                        </div>

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

          {/* ------------------------------------------------------------- */}
          {/* SUB-SECTION 2: PROGRAM MBG HANDOVER */}
          {/* ------------------------------------------------------------- */}
          {handoverDivision === "mbg" && (
            <div className="space-y-4">
              {/* Filter Buttons */}
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setMbgHandoverFilter("unassigned")}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      mbgHandoverFilter === "unassigned" ? "bg-white text-rose-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Belum Ditugaskan ({stats.unassignedMbg})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMbgHandoverFilter("assigned")}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      mbgHandoverFilter === "assigned" ? "bg-white text-emerald-700 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Sudah Ditugaskan ({stats.totalMbgEntries - stats.unassignedMbg})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMbgHandoverFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      mbgHandoverFilter === "all" ? "bg-white text-slate-900 shadow-xs font-semibold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Semua ({mbgEntries.length})
                  </button>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  Menampilkan {filteredMbgEntries.length} sekolah/institusi
                </span>
              </div>

              {filteredMbgEntries.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-xs">
                  <School className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Tidak ada data MBG yang sesuai filter</p>
                  <p className="text-xs text-slate-400 mt-1">Data MBG diinput oleh Admin MBG pada menu Manajemen MBG</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMbgEntries.map((entry) => {
                    const batch = batchMap.get(entry.batchId);
                    const assignedDesks = jobDesksByOrderId.get(entry.id) || [];
                    const isAssigned = assignedDesks.length > 0;
                    const totalPortions =
                      (entry.qtSiswaBalita || 0) +
                      (entry.qtGuruKader || 0) +
                      (entry.qtBumilBusui || 0) +
                      (entry.qtPobiaNasi || 0);

                    return (
                      <div
                        key={entry.id}
                        className="bg-white rounded-2xl border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between space-y-4 group"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <Milk className="h-3 w-3 text-emerald-600" />
                              MBG • {entry.institutionType === "posyandu" ? "Posyandu" : "Sekolah"}
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

                          <h3
                            onClick={() => setDetailMbgModal({ batch, entry })}
                            className="text-base font-bold text-slate-900 leading-snug cursor-pointer group-hover:text-emerald-700 transition-colors"
                          >
                            {entry.institutionName}
                          </h3>

                          <div className="flex items-center gap-2 text-xs text-slate-600 mt-2.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 font-medium text-[11px]">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {batch?.tanggal ? `${getHariFromDate(batch.tanggal)}, ${formatIndoDate(batch.tanggal)}` : "Jadwal Harian"}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/70 border border-emerald-200/50 font-bold text-emerald-800 text-[11px]">
                              <Users className="h-3 w-3 text-emerald-600" />
                              {totalPortions} Porsi
                            </span>
                          </div>

                          <div
                            onClick={() => setDetailMbgModal({ batch, entry })}
                            className="mt-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-100/70 transition-colors cursor-pointer text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 font-medium">Siswa / Balita:</span>
                              <strong className="text-slate-800">{entry.qtSiswaBalita || 0}</strong>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 font-medium">Guru / Kader:</span>
                              <strong className="text-slate-800">{entry.qtGuruKader || 0}</strong>
                            </div>
                            {entry.qtBumilBusui ? (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500 font-medium">Bumil & Busui:</span>
                                <strong className="text-slate-800">{entry.qtBumilBusui}</strong>
                              </div>
                            ) : null}
                            {entry.address && (
                              <p className="text-[10px] text-slate-400 truncate pt-1 border-t border-slate-200">
                                📍 {entry.address}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailMbgModal({ batch, entry })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            Detail
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectMbgForJobDesk(entry)}
                            className="flex-[1.6] flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Buat Job Desk MBG
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FORM INPUT (EXCEL SPREADSHEET STYLE WITH CONTEXT) */}
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
              Kembali ke Daftar Handover
            </button>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
              {selectedMbgContext
                ? `Konteks MBG: ${selectedMbgContext.entry.institutionName}`
                : selectedOrderContext
                ? `Konteks Katering: ${selectedOrderContext.institutionName || selectedOrderContext.recipientName}`
                : "Form Input Bebas"}
            </span>
          </div>

          {/* Context Banner: MBG or Catering */}
          {selectedMbgContext ? (
            <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                  🥛 Konteks Program MBG Terpilih
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                  {selectedMbgContext.entry.institutionName}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Batch Tgl: <strong className="text-slate-900">{formatIndoDate(selectedMbgContext.batch?.tanggal)}</strong> • Total Porsi: <strong className="text-emerald-700">{(selectedMbgContext.entry.qtSiswaBalita || 0) + (selectedMbgContext.entry.qtGuruKader || 0) + (selectedMbgContext.entry.qtBumilBusui || 0)} Porsi</strong> • Alamat: {selectedMbgContext.entry.address || "-"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMbgContext(null);
                    setActiveTab("orders");
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Ganti Lembaga
                </button>
              </div>
            </div>
          ) : selectedOrderContext ? (
            <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                  🍱 Konteks Pesanan Katering Terpilih
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedOrderContext.institutionName || selectedOrderContext.recipientName}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Tgl Acara: <strong className="text-slate-900">{formatIndoDate(selectedOrderContext.eventDate)}</strong> ({getHariFromDate(selectedOrderContext.eventDate)}) • Jam: <strong className="text-slate-900">{formatIndoTime(selectedOrderContext.deliveryTime || selectedOrderContext.eventDate)}</strong> • Alamat: {selectedOrderContext.deliveryAddress || "-"}
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
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
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
                  Pilih divisi tugas (Katering atau MBG), tentukan PIC Teklap, jam mulai, dan rincian tugas.
                </p>
              </div>
            </div>
          )}

          {/* Table Spreadsheet Editor */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse min-w-[1450px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                  <th className="py-3 px-3 w-10 text-center text-slate-400">#</th>
                  <th className="py-3 px-3 min-w-[110px] w-28">Divisi</th>
                  <th className="py-3 px-3 min-w-[130px] w-32">Hari</th>
                  <th className="py-3 px-3 min-w-[150px] w-40">Tanggal</th>
                  <th className="py-3 px-3 min-w-[120px] w-32 text-center">Start Time</th>
                  <th className="py-3 px-3 min-w-[240px] w-64">PIC Teklap</th>
                  <th className="py-3 px-3 min-w-[280px]">Kegiatan</th>
                  <th className="py-3 px-3 min-w-[320px]">Keterangan (Wrap Text)</th>
                  <th className="py-3 px-3 min-w-[160px] w-44">Key ID (Auto)</th>
                  <th className="py-3 px-3 min-w-[200px] w-52">Terkait Pesanan/Lembaga</th>
                  <th className="py-3 px-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-semibold align-top pt-3.5">
                      {idx + 1}
                    </td>

                    {/* Divisi */}
                    <td className="py-2 px-2 align-top">
                      <select
                        value={row.division || "katering"}
                        onChange={(e) => handleRowChange(row.id, "division", e.target.value as JobDeskDivision)}
                        className={`w-full px-2 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                          row.division === "mbg"
                            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                            : "bg-amber-50 text-amber-900 border-amber-300"
                        }`}
                      >
                        <option value="katering">🍱 Katering</option>
                        <option value="mbg">🥛 MBG</option>
                      </select>
                    </td>

                    {/* Hari */}
                    <td className="py-2 px-2 align-top">
                      <select
                        value={row.hari}
                        onChange={(e) => handleRowChange(row.id, "hari", e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900 transition-colors cursor-pointer"
                      >
                        {HARI_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Tanggal */}
                    <td className="py-2 px-2 align-top">
                      <input
                        type="date"
                        value={row.tanggal}
                        onChange={(e) => handleRowChange(row.id, "tanggal", e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900 transition-colors"
                      />
                    </td>

                    {/* Start Time */}
                    <td className="py-2 px-2 align-top">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => handleRowChange(row.id, "startTime", e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-center focus:ring-2 focus:ring-slate-900 transition-colors"
                      />
                    </td>

                    {/* PIC Teklap */}
                    <td className="py-2 px-2 align-top">
                      <select
                        value={row.pic}
                        onChange={(e) => handleRowChange(row.id, "pic", e.target.value as PicShortName)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-slate-900 transition-colors cursor-pointer"
                      >
                        {PIC_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]] || p}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Kegiatan */}
                    <td className="py-2 px-2 align-top">
                      <textarea
                        rows={2}
                        placeholder={
                          row.division === "mbg"
                            ? "Misal: Pengantaran MBG SDN 01"
                            : "Misal: Produksi Capcay & Nasi Box"
                        }
                        value={row.kegiatan}
                        onChange={(e) => handleRowChange(row.id, "kegiatan", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 transition-colors resize-y leading-relaxed min-h-[58px]"
                      />
                    </td>

                    {/* Keterangan */}
                    <td className="py-2 px-2 align-top">
                      <textarea
                        rows={2}
                        placeholder={
                          row.division === "mbg"
                            ? "Misal: 120 porsi porsi kecil saji..."
                            : "Misal: 50 box saji pukul 10.00..."
                        }
                        value={row.keterangan}
                        onChange={(e) => handleRowChange(row.id, "keterangan", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:bg-white text-xs focus:ring-2 focus:ring-slate-900 transition-colors resize-y leading-relaxed min-h-[58px]"
                      />
                    </td>

                    {/* Key ID */}
                    <td className="py-2 px-2 whitespace-nowrap align-top">
                      <div className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-100 border border-slate-200">
                        <span className="text-xs font-mono font-bold text-slate-800 tracking-wide">
                          {row.keyId}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-200/90 px-1 py-0.5 rounded ml-auto">
                          Auto
                        </span>
                      </div>
                    </td>

                    {/* Link Order / MBG */}
                    <td className="py-2 px-2 align-top">
                      <input
                        type="text"
                        placeholder="(Tugas Umum / Non-Order)"
                        value={row.orderLabel || ""}
                        onChange={(e) => handleRowChange(row.id, "orderLabel", e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900 transition-colors"
                      />
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
      {/* TAB 3: SPREADSHEET TABLE VIEW (ALL TEKLAP TASKS) */}
      {/* ========================================================================= */}
      {activeTab === "table" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Filter Divisi */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Filter Divisi
              </label>
              <select
                value={tableDivisionFilter}
                onChange={(e) => setTableDivisionFilter(e.target.value as "all" | "katering" | "mbg")}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">⚡ Semua Divisi ({jobDesks.length})</option>
                <option value="katering">🍱 Katering Reguler ({stats.kateringDesks})</option>
                <option value="mbg">🥛 Program MBG ({stats.mbgDesks})</option>
              </select>
            </div>

            {/* Filter by PIC */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Filter PIC Teklap
              </label>
              <select
                value={selectedPic}
                onChange={(e) => setSelectedPic(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">Semua PIC</option>
                {PIC_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]] || p}
                  </option>
                ))}
              </select>
            </div>

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
                  placeholder="Cari kegiatan, Key ID, PIC..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900 focus:bg-white"
                />
              </div>
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
              {(tableDivisionFilter !== "all" || selectedPic !== "all" || selectedDate || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setTableDivisionFilter("all");
                    setSelectedPic("all");
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
                  Pilih pesanan dari tab "Data Masuk / Handover" untuk membuat penugasan baru
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold text-[11px]">
                      <th className="py-3 px-3 w-20">Divisi</th>
                      <th className="py-3 px-3 w-20">Hari</th>
                      <th className="py-3 px-3 w-24">Tanggal</th>
                      <th className="py-3 px-3 w-20 text-center">Start Time</th>
                      <th className="py-3 px-3 w-32">PIC Teklap</th>
                      <th className="py-3 px-3 min-w-[200px]">Kegiatan</th>
                      <th className="py-3 px-3 min-w-[220px]">Keterangan</th>
                      <th className="py-3 px-3 w-36 font-mono">Key ID</th>
                      <th className="py-3 px-3 w-28 text-center">Status PIC</th>
                      <th className="py-3 px-3 w-32 text-center">Review CO_MO</th>
                      <th className="py-3 px-2 w-16 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredJobDesks.map((jd) => (
                      <tr key={jd.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Divisi Badge */}
                        <td className="py-3 px-3">
                          {jd.division === "mbg" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Milk className="h-3 w-3 text-emerald-600" />
                              MBG
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              <UtensilsCrossed className="h-3 w-3 text-amber-600" />
                              Katering
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-bold text-slate-900">{jd.hari || "-"}</td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{jd.tanggal || "-"}</td>
                        <td className="py-3 px-3 font-mono text-center font-bold text-slate-700">
                          {jd.startTime || "-"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {jd.pic}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          <span
                            onClick={() => setDetailJobDeskModal(jd)}
                            className="cursor-pointer hover:text-amber-600 transition-colors"
                          >
                            {jd.kegiatan || jd.title}
                          </span>
                          {(jd.orderLabel || jd.mbgInstitutionName) && (
                            <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {jd.division === "mbg" ? `Lembaga: ${jd.mbgInstitutionName || jd.orderLabel}` : `Pesanan: ${jd.orderLabel}`}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
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
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200">
                            {jd.keyId}
                          </span>
                        </td>
                        {/* Status PIC */}
                        <td className="py-3 px-3 text-center">
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
                        <td className="py-3 px-3 text-center">
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
      {/* MODAL 1: DETAIL LENGKAP PESANAN KATERING */}
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
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <ShoppingBag className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                      Pesanan Katering #{detailOrderModal.id.slice(-6).toUpperCase()}
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

              <div className="p-6 space-y-5 text-xs text-slate-700">
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
                      <p className="text-[10px] font-semibold text-slate-400">Nomor Telepon:</p>
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
              </div>

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
                  Buat Job Desk untuk Pesanan Ini
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: DETAIL MBG INSTITUSI */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailMbgModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200"
            >
              <div className="p-5 bg-emerald-950 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-800/60 rounded-lg">
                    <Milk className="h-4 w-4 text-emerald-300" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-300">
                      Lembaga Program MBG • {detailMbgModal.entry.institutionType === "posyandu" ? "Posyandu" : "Sekolah"}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {detailMbgModal.entry.institutionName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailMbgModal(null)}
                  className="p-1.5 text-emerald-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs text-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Jadwal Batch Tanggal:</p>
                    <p className="font-semibold text-slate-900">
                      {detailMbgModal.batch?.tanggal ? formatIndoDate(detailMbgModal.batch.tanggal) : "Jadwal Reguler"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Tingkatan / Tipe:</p>
                    <p className="font-semibold text-slate-900 uppercase">
                      {detailMbgModal.entry.schoolLevel || detailMbgModal.entry.institutionType}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Total Porsi:</p>
                    <p className="font-bold text-emerald-700 text-sm">
                      {(detailMbgModal.entry.qtSiswaBalita || 0) +
                        (detailMbgModal.entry.qtGuruKader || 0) +
                        (detailMbgModal.entry.qtBumilBusui || 0)}{" "}
                      Porsi
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Alamat Pengantaran:</p>
                    <p className="font-semibold text-slate-900">{detailMbgModal.entry.address || "-"}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                    Rincian Penerima Makanan Bergizi:
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Siswa/Balita</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtSiswaBalita || 0}</strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Guru/Kader</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtGuruKader || 0}</strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Bumil & Busui</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtBumilBusui || 0}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setDetailMbgModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMbgForJobDesk(detailMbgModal.entry)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs cursor-pointer transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Buat Job Desk MBG untuk Lembaga Ini
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: DETAIL JOB DESK SPESIFIK */}
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
                    <p className="text-[10px] font-semibold text-slate-400">Divisi:</p>
                    <p className="font-bold text-slate-900 uppercase">{detailJobDeskModal.division || "katering"}</p>
                  </div>
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
