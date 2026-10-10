// ============================================================================
// CO_MO Review & Monitoring Page (Excel Layout & Review Workflow - Katering & MBG)
// ============================================================================
// Wakil Kepala Manager Operational (CO_MO) uses this page to:
// 1. Monitor job desks with exact Excel columns (Divisi, Hari, Tanggal, Start Time, PIC, Kegiatan, Keterangan, Key ID)
// 2. Filter by division (🍱 Katering Reguler vs 🥛 Program MBG)
// 3. Filter by specific operational role (Joko, Dwi, Shifa, Wandi, MBG2)
// 4. Filter by specific order or MBG school
// 5. Review submitted job desks (Approve / Reject with remark)
// 6. Monitor overall completion & review stats in real-time

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ShieldCheck,
  Search,
  ChevronDown,
  Users,
  BarChart3,
  Calendar,
  Filter,
  Layers,
  Sparkles,
  Table as TableIcon,
  Milk,
  UtensilsCrossed,
  FileDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { exportJobDesksPdf, formatJobDeskDate } from "@/utils/jobDeskPdfExporter";
import {
  subscribeAllJobDesks,
  approveJobDesk,
  rejectJobDesk,
} from "@/services/cateringJobDeskService";
import type { CateringJobDesk, PicShortName } from "@/types/cateringJobDesk";
import { JobDeskSyncStatus } from "@/components/katering/JobDeskSyncStatus";
import { JobDeskKeterangan } from "@/components/katering/JobDeskKeterangan";
import { formatTanggalPanjang, groupJobDesksByTanggal } from "@/utils/jobDeskGrouping";
import { useJobDeskSync } from "@/hooks/useJobDeskSync";
import {
  JOBDESK_ROLE_LABELS,
  PIC_NAME_TO_ROLE,
  compareJobDeskTime,
} from "@/types/cateringJobDesk";

type ReviewFilter = "all" | "pending_review" | "approved" | "rejected" | "not_submitted";

const PIC_OPTIONS: PicShortName[] = [
  "Joko",
  "Shifa",
  "Dwi",
  "Wandi",
];

/** Detail job desk untuk isi notifikasi ke PIC & MO setelah review. */
function reviewContext(jobDesks: CateringJobDesk[], id: string) {
  const jd = jobDesks.find((item) => item.id === id);
  return jd ? { kegiatan: jd.kegiatan, pic: jd.pic, tanggal: jd.tanggal, assignedRole: jd.assignedRole } : undefined;
}

export function CoMoReviewPage() {
  const { user } = useAuth();
  const [allJobDesks, setAllJobDesks] = useState<CateringJobDesk[]>([]);
  const [loading, setLoading] = useState(true);
  const jobDeskSync = useJobDeskSync(allJobDesks, !loading);

  // Multi-Filter state
  const [divisionFilter, setDivisionFilter] = useState<"all" | "katering" | "mbg">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [selectedPic, setSelectedPic] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Reject modal / inline state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const unsub = subscribeAllJobDesks(
      (data) => {
        setAllJobDesks(data);
        setLoading(false);
      },
      (err) => {
        console.error("CO_MO: failed to load job desks:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Distinct order / MBG institution list for dropdown filter
  const orderOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const jd of allJobDesks) {
      if (jd.orderId) {
        const label =
          jd.division === "mbg"
            ? `🥛 MBG: ${jd.mbgInstitutionName || jd.orderLabel || jd.orderId}`
            : `🍱 Katering: ${jd.orderLabel || jd.orderId}`;
        map.set(jd.orderId, label);
      }
    }
    return Array.from(map.entries());
  }, [allJobDesks]);

  // Global stats by division
  const stats = useMemo(() => {
    const targetSet = divisionFilter === "all"
      ? allJobDesks
      : allJobDesks.filter((d) => (d.division || "katering") === divisionFilter);

    const total = targetSet.length;
    const kateringCount = allJobDesks.filter((d) => d.division !== "mbg").length;
    const mbgCount = allJobDesks.filter((d) => d.division === "mbg").length;

    const pendingReview = targetSet.filter((jd) => jd.reviewStatus === "pending_review").length;
    const approved = targetSet.filter((jd) => jd.reviewStatus === "approved").length;
    const rejected = targetSet.filter((jd) => jd.reviewStatus === "rejected").length;
    const notSubmitted = targetSet.filter(
      (jd) => jd.reviewStatus === "not_submitted"
    ).length;

    return { total, kateringCount, mbgCount, pendingReview, approved, rejected, notSubmitted };
  }, [allJobDesks, divisionFilter]);

  // Main multi-filter engine
  const filteredJobDesks = useMemo(() => {
    let result = allJobDesks;

    // 0. Filter by division
    if (divisionFilter !== "all") {
      result = result.filter((jd) => (jd.division || "katering") === divisionFilter);
    }

    // 1. Filter by specific PIC
    if (selectedPic !== "all") {
      result = result.filter(
        (jd) =>
          jd.pic === selectedPic ||
          jd.assignedRole === PIC_NAME_TO_ROLE[selectedPic as PicShortName]
      );
    }

    // 2. Filter by specific order / institution
    if (selectedOrder !== "all") {
      result = result.filter((jd) => jd.orderId === selectedOrder);
    }

    // 3. Filter by date
    if (selectedDate) {
      result = result.filter((jd) => jd.tanggal === selectedDate);
    }

    // 4. Filter by review status
    if (reviewFilter !== "all") {
      result = result.filter((jd) => jd.reviewStatus === reviewFilter);
    }

    // 5. Search query matching
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((jd) => {
        return (
          (jd.kegiatan || jd.title || "").toLowerCase().includes(q) ||
          (jd.keterangan || jd.description || "").toLowerCase().includes(q) ||
          (jd.orderLabel || "").toLowerCase().includes(q) ||
          (jd.mbgInstitutionName || "").toLowerCase().includes(q) ||
          (jd.keyId || "").toLowerCase().includes(q) ||
          (jd.pic || "").toLowerCase().includes(q) ||
          (jd.hari || "").toLowerCase().includes(q) ||
          (jd.incompleteReason || "").toLowerCase().includes(q) ||
          (jd.rejectionRemark || "").toLowerCase().includes(q)
        );
      });
    }

    return [...result].sort((a, b) => {
      const dateA = a.tanggal || "";
      const dateB = b.tanggal || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return compareJobDeskTime(a.startTime, b.startTime);
    });
  }, [allJobDesks, divisionFilter, selectedPic, selectedOrder, selectedDate, reviewFilter, searchQuery]);

  // Handle approve
  const handleApprove = useCallback(
    async (id: string) => {
      setProcessingId(id);
      try {
        await approveJobDesk(id, user?.uid || "", reviewContext(allJobDesks, id));
      } catch (err) {
        console.error("Failed to approve job desk:", err);
      } finally {
        setProcessingId(null);
      }
    },
    [user?.uid, allJobDesks]
  );

  // Handle reject with remark
  const handleReject = useCallback(
    async (id: string) => {
      if (!rejectRemark.trim()) {
        alert("Harap tuliskan alasan / remark penolakan untuk petugas!");
        return;
      }
      setProcessingId(id);
      try {
        await rejectJobDesk(id, user?.uid || "", rejectRemark.trim(), reviewContext(allJobDesks, id));
        setRejectingId(null);
        setRejectRemark("");
      } catch (err) {
        console.error("Failed to reject job desk:", err);
      } finally {
        setProcessingId(null);
      }
    },
    [rejectRemark, user?.uid, allJobDesks]
  );

  const activeFilterCount =
    (divisionFilter !== "all" ? 1 : 0) +
    (selectedPic !== "all" ? 1 : 0) +
    (selectedOrder !== "all" ? 1 : 0) +
    (selectedDate ? 1 : 0) +
    (reviewFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const handleExportPdf = async () => {
    const reviewLabels: Record<ReviewFilter, string> = {
      all: "",
      pending_review: "Perlu Review",
      approved: "Approved",
      rejected: "Rejected",
      not_submitted: "Belum Submit",
    };
    const orderLabel = orderOptions.find(([id]) => id === selectedOrder)?.[1].replace(/^\S+\s/, "");
    setExportingPdf(true);
    try {
      await exportJobDesksPdf(filteredJobDesks, {
        filterSummary: [
          divisionFilter !== "all" ? `Divisi: ${divisionFilter === "mbg" ? "MBG" : "Katering"}` : "",
          selectedPic !== "all" ? `PIC: ${selectedPic}` : "",
          orderLabel ? orderLabel : "",
          selectedDate ? `Tanggal: ${formatJobDeskDate(selectedDate)}` : "",
          reviewFilter !== "all" ? `Status Review: ${reviewLabels[reviewFilter]}` : "",
          searchQuery.trim() ? `Kata kunci: "${searchQuery.trim()}"` : "",
        ],
      });
    } catch (err) {
      console.error("Failed to export job desk PDF:", err);
      alert("Gagal membuat PDF job desk.");
    } finally {
      setExportingPdf(false);
    }
  };

  const resetAllFilters = () => {
    setDivisionFilter("all");
    setSelectedPic("all");
    setSelectedOrder("all");
    setSelectedDate("");
    setReviewFilter("all");
    setSearchQuery("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-gray-500">Memuat data review CO_MO...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-4 py-1 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-16">
      <JobDeskSyncStatus state={jobDeskSync.state} checkedAt={jobDeskSync.checkedAt} onSync={jobDeskSync.syncNow} />
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-white shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-md mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Monitoring & Validasi Review CO_MO
          </div>
          <h1 className="text-lg sm:text-3xl font-extrabold tracking-tight leading-snug">
            Ruang Review Co-Manager Operasional
          </h1>
          <p className="hidden sm:block text-slate-300 text-xs sm:text-sm mt-1">
            Pantau dan verifikasi checklist tugas dari Joko, Dwi, Shifa, Wandi, dan MBG2 (Katering & Program MBG).
          </p>
        </div>

        {/* Division Tab Switcher */}
        <div className="inline-flex p-1 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setDivisionFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              divisionFilter === "all"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-200 hover:text-white"
            }`}
          >
            ⚡ Semua Divisi ({allJobDesks.length})
          </button>
          <button
            type="button"
            onClick={() => setDivisionFilter("katering")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              divisionFilter === "katering"
                ? "bg-amber-400 text-slate-950 shadow-xs"
                : "text-slate-200 hover:text-white"
            }`}
          >
            <UtensilsCrossed className="h-3.5 w-3.5" />
            <span>Katering ({stats.kateringCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setDivisionFilter("mbg")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              divisionFilter === "mbg"
                ? "bg-emerald-500 text-white shadow-xs"
                : "text-slate-200 hover:text-white"
            }`}
          >
            <Milk className="h-3.5 w-3.5" />
            <span>MBG ({stats.mbgCount})</span>
          </button>
        </div>
      </div>

      {/* Stats Dashboard / Review Status Filter Pills */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-gray-700", bg: "bg-gray-100", icon: BarChart3 },
          { label: "Perlu Review", value: stats.pendingReview, color: "text-amber-700", bg: "bg-amber-100", icon: Clock },
          { label: "Approved", value: stats.approved, color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
          { label: "Rejected", value: stats.rejected, color: "text-red-700", bg: "bg-red-100", icon: XCircle },
          { label: "Belum Submit", value: stats.notSubmitted, color: "text-gray-500", bg: "bg-gray-50", icon: AlertCircle },
        ].map((s) => {
          const isSelected =
            (reviewFilter === "all" && s.label === "Total") ||
            (reviewFilter === "pending_review" && s.label === "Perlu Review") ||
            (reviewFilter === "approved" && s.label === "Approved") ||
            (reviewFilter === "rejected" && s.label === "Rejected") ||
            (reviewFilter === "not_submitted" && s.label === "Belum Submit");

          return (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (s.label === "Total") setReviewFilter("all");
                else if (s.label === "Perlu Review") setReviewFilter("pending_review");
                else if (s.label === "Approved") setReviewFilter("approved");
                else if (s.label === "Rejected") setReviewFilter("rejected");
                else if (s.label === "Belum Submit") setReviewFilter("not_submitted");
              }}
              className={`${s.bg} rounded-xl sm:rounded-2xl px-1 py-2 sm:p-3.5 text-center transition-all hover:scale-105 cursor-pointer ${
                isSelected ? "ring-2 ring-indigo-500 ring-offset-2 shadow-xs" : ""
              }`}
            >
              <s.icon className={`hidden sm:block h-4 w-4 ${s.color} mx-auto mb-1`} />
              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-500 mt-0.5 leading-tight">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* Multi-Filter Bar: Role, Order, Date, Search */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
            <Filter className="h-4 w-4 text-indigo-600" />
            <span>Filter<span className="hidden sm:inline"> Lanjutan (Role, Pesanan / Lembaga, Tanggal)</span></span>
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer"
            >
              Reset Semua Filter ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. Filter by Petugas / PIC */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Petugas (PIC Teklap)
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedPic}
                onChange={(e) => setSelectedPic(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
              >
                <option value="all">Semua Petugas</option>
                {PIC_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]] || p}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 2. Filter by Pesanan / Lembaga */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Pesanan / Lembaga MBG
            </label>
            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
              >
                <option value="all">Semua Pesanan & Lembaga</option>
                {orderOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 3. Filter by Tanggal */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Tanggal
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* 4. Search Query */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Kata Kunci
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kegiatan, Key ID, institusi..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>

        {/* Quick Filter PIC Pills */}
        <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 mr-1">Quick Filter Petugas:</span>
          <button
            type="button"
            onClick={() => setSelectedPic("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
              selectedPic === "all"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Semua
          </button>
          {PIC_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPic(p)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                selectedPic === p
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table: Excel-Style Spreadsheet View for CO_MO */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-clip">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-indigo-600" />
            <p className="text-xs font-bold text-gray-800">
              <span className="sm:hidden">{filteredJobDesks.length} tugas</span><span className="hidden sm:inline">Tabel Monitoring & Review ({filteredJobDesks.length} Baris)</span>
              {selectedPic !== "all" && (
                <span> — PIC: <strong className="text-indigo-700">{selectedPic}</strong></span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || filteredJobDesks.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            <FileDown className="h-3.5 w-3.5" />
            {exportingPdf ? "Membuat PDF..." : "Download PDF"}
          </button>
        </div>

        {filteredJobDesks.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-600">
              Tidak ada data job desk yang cocok dengan filter
            </p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-4 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                Reset Semua Filter
              </button>
            )}
          </div>
        ) : (
          <>
          {/* HP: kartu per tugas per tanggal — Approve / Tolak selalu terlihat tanpa geser tabel. */}
          <div className="md:hidden divide-y divide-gray-100">
            {groupJobDesksByTanggal(filteredJobDesks).map(([tanggal, items]) => (
              <section key={tanggal}>
                <h3 className="sticky top-12 z-10 bg-gray-50/95 backdrop-blur px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  {items[0].hari ? `${items[0].hari}, ` : ""}{formatTanggalPanjang(tanggal)} · {items.length} tugas
                </h3>
                <ul className="divide-y divide-gray-100">
                  {items.map((jd) => {
                    const isApproved = jd.reviewStatus === "approved";
                    const isRejected = jd.reviewStatus === "rejected";
                    const isPendingReview = jd.reviewStatus === "pending_review";
                    return (
                      <li key={jd.id} className={`px-4 py-3.5 ${isPendingReview ? "bg-amber-50/50" : isApproved ? "bg-emerald-50/30" : isRejected ? "bg-red-50/30" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-extrabold text-gray-900">{jd.startTime || "--:--"}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200">{jd.pic}</span>
                          {jd.division === "mbg" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"><Milk className="h-3 w-3" />MBG</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"><UtensilsCrossed className="h-3 w-3" />Katering</span>
                          )}
                          <span className="ml-auto text-[11px] font-bold">
                            {jd.status === "complete" ? <span className="text-blue-700">✓ Complete</span>
                              : jd.status === "incomplete" ? <span className="text-orange-700">✕ Incomplete</span>
                              : <span className="text-gray-400">Belum ditandai</span>}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[15px] font-bold leading-snug text-gray-900">{jd.kegiatan || jd.title}</p>
                        {(jd.orderLabel || jd.mbgInstitutionName) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {jd.division === "mbg" ? `Lembaga: ${jd.mbgInstitutionName || jd.orderLabel}` : `Pesanan: ${jd.orderLabel}`}
                          </p>
                        )}
                        <div className="mt-2"><JobDeskKeterangan jd={jd} /></div>
                        {jd.incompleteReason && (
                          <p className="mt-1.5 p-2 bg-orange-100/70 border border-orange-200 rounded-lg text-orange-800 text-xs"><strong>Alasan incomplete:</strong> {jd.incompleteReason}</p>
                        )}
                        {isRejected && jd.rejectionRemark && (
                          <p className="mt-1.5 p-2 bg-red-100/70 border border-red-200 rounded-lg text-red-800 text-xs"><strong>Remark CO_MO:</strong> {jd.rejectionRemark}</p>
                        )}
                        <div className="mt-3">
                          <ReviewActions
                            size="lg" isApproved={isApproved} isRejected={isRejected} isRejecting={rejectingId === jd.id}
                            isProcessing={processingId === jd.id} remark={rejectRemark} onRemarkChange={setRejectRemark}
                            onApprove={() => handleApprove(jd.id)} onReject={() => handleReject(jd.id)}
                            onStartReject={() => { setRejectingId(jd.id); setRejectRemark(""); }}
                            onCancelReject={() => { setRejectingId(null); setRejectRemark(""); }}
                          />
                        </div>
                        <p className="mt-2 text-[10px] font-mono text-gray-400">{jd.keyId}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5 w-20">Divisi</th>
                  <th className="py-3 px-3.5 w-20">Hari</th>
                  <th className="py-3 px-3.5 w-24">Tanggal</th>
                  <th className="py-3 px-3.5 w-20 text-center">Start Time</th>
                  <th className="py-3 px-3.5 w-28">PIC Teklap</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Kegiatan</th>
                  <th className="py-3 px-3.5 min-w-[240px]">Keterangan</th>
                  <th className="py-3 px-3.5 w-36 font-mono">Key ID</th>
                  <th className="py-3 px-3.5 w-32 text-center">Status PIC</th>
                  <th className="py-3 px-3.5 min-w-[200px] text-center">Aksi Review CO_MO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredJobDesks.map((jd) => {
                  const isApproved = jd.reviewStatus === "approved";
                  const isRejected = jd.reviewStatus === "rejected";
                  const isPendingReview = jd.reviewStatus === "pending_review";
                  const isProcessing = processingId === jd.id;
                  const isRejecting = rejectingId === jd.id;

                  return (
                    <tr
                      key={jd.id}
                      className={`transition-colors ${
                        isApproved
                          ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                          : isRejected
                          ? "bg-red-50/20 hover:bg-red-50/40"
                          : isPendingReview
                          ? "bg-amber-50/30 hover:bg-amber-50/50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Divisi Badge */}
                      <td className="py-3 px-3.5">
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

                      {/* Hari */}
                      <td className="py-3 px-3.5 font-bold text-gray-900">{jd.hari || "-"}</td>
                      {/* Tanggal */}
                      <td className="py-3 px-3.5 text-gray-600 whitespace-nowrap">{jd.tanggal || "-"}</td>
                      {/* Start Time */}
                      <td className="py-3 px-3.5 font-mono text-center font-bold text-gray-700">
                        {jd.startTime || "-"}
                      </td>
                      {/* PIC */}
                      <td className="py-3 px-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                          {jd.pic}
                        </span>
                      </td>
                      {/* Kegiatan */}
                      <td className="py-3 px-3.5 font-bold text-gray-900">
                        {jd.kegiatan || jd.title}
                        {(jd.orderLabel || jd.mbgInstitutionName) && (
                          <p className="text-[10px] text-gray-400 font-normal mt-0.5">
                            {jd.division === "mbg" ? `Lembaga: ${jd.mbgInstitutionName || jd.orderLabel}` : `Pesanan: ${jd.orderLabel}`}
                          </p>
                        )}
                      </td>
                      {/* Keterangan */}
                      <td className="py-3 px-3.5 text-gray-600">
                        <JobDeskKeterangan jd={jd} />
                        {jd.incompleteReason && (
                          <div className="mt-1 p-1.5 bg-orange-100/70 border border-orange-200 rounded-lg text-orange-800 text-[10px]">
                            <strong>Alasan incomplete:</strong> {jd.incompleteReason}
                          </div>
                        )}
                        {isRejected && jd.rejectionRemark && (
                          <div className="mt-1 p-1.5 bg-red-100/70 border border-red-200 rounded-lg text-red-800 text-[10px]">
                            <strong>Remark CO_MO:</strong> {jd.rejectionRemark}
                          </div>
                        )}
                      </td>
                      {/* Key ID */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold text-gray-800 bg-gray-100 border border-gray-200">
                          {jd.keyId}
                        </span>
                      </td>

                      {/* Status PIC */}
                      <td className="py-3 px-3.5 text-center">
                        {jd.status === "complete" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                          </span>
                        ) : jd.status === "incomplete" ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                              <AlertCircle className="h-3.5 w-3.5" /> Incomplete
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Belum Ditandai</span>
                        )}
                      </td>

                      {/* Aksi Review CO_MO */}
                      <td className="py-3 px-3.5 text-center">
                        <ReviewActions
                          size="sm" isApproved={isApproved} isRejected={isRejected} isRejecting={isRejecting}
                          isProcessing={isProcessing} remark={rejectRemark} onRemarkChange={setRejectRemark}
                          onApprove={() => handleApprove(jd.id)} onReject={() => handleReject(jd.id)}
                          onStartReject={() => { setRejectingId(jd.id); setRejectRemark(""); }}
                          onCancelReject={() => { setRejectingId(null); setRejectRemark(""); }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ReviewActionsProps {
  /** "sm" untuk sel tabel desktop, "lg" untuk kartu HP (tombol tinggi 44px). */
  size: "sm" | "lg";
  isApproved: boolean;
  isRejected: boolean;
  isRejecting: boolean;
  isProcessing: boolean;
  remark: string;
  onRemarkChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
}

/** Approve / Tolak (dengan catatan) — sama di tabel desktop dan kartu HP. */
function ReviewActions({ size, isApproved, isRejected, isRejecting, isProcessing, remark, onRemarkChange, onApprove, onReject, onStartReject, onCancelReject }: ReviewActionsProps) {
  const lg = size === "lg";
  const btn = lg ? "h-11 px-4 text-sm rounded-xl" : "px-3 py-1.5 text-xs rounded-xl";
  const icon = lg ? "h-4 w-4" : "h-3.5 w-3.5";

  if (isApproved) {
    return (
      <span className={`inline-flex items-center gap-1 font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 ${lg ? "px-3 py-2 text-sm rounded-xl" : "px-3 py-1.5 text-xs rounded-xl"}`}>
        <CheckCircle2 className={icon} /> Disetujui (Approved)
      </span>
    );
  }
  if (isRejected) {
    return (
      <div className={`flex gap-2 ${lg ? "items-center justify-between" : "flex-col items-center gap-1"}`}>
        <span className={`inline-flex items-center gap-1 font-bold bg-red-100 text-red-800 border border-red-200 rounded-xl ${lg ? "px-3 py-2 text-sm" : "px-3 py-1 text-xs"}`}>
          <XCircle className={icon} /> Ditolak (Rejected)
        </span>
        <button type="button" onClick={onApprove} disabled={isProcessing}
          className={`font-bold text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50 ${lg ? "text-sm py-2" : "text-[10px]"}`}>
          {isProcessing ? "Menyimpan..." : "Ubah ke Approve"}
        </button>
      </div>
    );
  }
  if (isRejecting) {
    return (
      <div className="space-y-2 p-2 bg-red-50 rounded-xl border border-red-200 text-left">
        <label className={`block font-bold text-red-800 ${lg ? "text-xs" : "text-[10px]"}`}>Catatan Penolakan untuk Petugas:</label>
        <textarea value={remark} onChange={(e) => onRemarkChange(e.target.value)} placeholder="Tulis alasan kenapa ditolak..." rows={2}
          className={`w-full rounded-lg border border-red-300 focus:ring-1 focus:ring-red-400 bg-white ${lg ? "px-3 py-2 text-sm" : "px-2 py-1 text-xs"}`} />
        <div className={lg ? "grid grid-cols-2 gap-2" : "flex gap-1.5 justify-end"}>
          <button type="button" onClick={onCancelReject}
            className={`font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 ${lg ? "h-11 rounded-xl text-sm" : "px-2 py-1 text-[10px] rounded-lg"}`}>
            Batal
          </button>
          <button type="button" onClick={onReject} disabled={isProcessing || !remark.trim()}
            className={`font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 ${lg ? "h-11 rounded-xl text-sm" : "px-2.5 py-1 text-[10px] rounded-lg"}`}>
            {isProcessing ? "Menyimpan..." : "Kirim Penolakan"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={lg ? "grid grid-cols-2 gap-2" : "flex items-center justify-center gap-1.5"}>
      <button type="button" onClick={onApprove} disabled={isProcessing}
        className={`inline-flex items-center justify-center gap-1 font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all disabled:opacity-50 ${btn}`}>
        <CheckCircle2 className={icon} />
        {isProcessing ? "Menyimpan..." : "Approve"}
      </button>
      <button type="button" onClick={onStartReject} disabled={isProcessing}
        className={`inline-flex items-center justify-center gap-1 font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all ${btn}`}>
        <XCircle className={icon} />
        Tolak
      </button>
    </div>
  );
}

export default CoMoReviewPage;
