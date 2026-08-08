// ============================================================================
// CO_MO Review & Monitoring Page (Excel Layout & Review Workflow)
// ============================================================================
// Wakil Kepala Manager Operational (CO_MO) uses this page to:
// 1. Monitor job desks with exact Excel columns (Hari, Tanggal, Start Time, PIC, Kegiatan, Keterangan, Key ID)
// 2. Filter by specific operational role (Ust. Joko / Dwi / Shifa / Wandi)
// 3. Filter by specific catering order (e.g. Pesanan A, B, etc.)
// 4. Review submitted job desks (Approve / Reject with remark)
// 5. Monitor overall completion & review stats

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeAllJobDesks,
  approveJobDesk,
  rejectJobDesk,
} from "@/services/cateringJobDeskService";
import type { CateringJobDesk, PicShortName } from "@/types/cateringJobDesk";
import {
  JOBDESK_ROLE_LABELS,
  PIC_NAME_TO_ROLE,
} from "@/types/cateringJobDesk";

type ReviewFilter = "all" | "pending_review" | "approved" | "rejected" | "not_submitted";

const PIC_OPTIONS: PicShortName[] = ["Joko", "Dwi", "Shifa", "Wandi"];

export function CoMoReviewPage() {
  const { user } = useAuth();
  const [allJobDesks, setAllJobDesks] = useState<CateringJobDesk[]>([]);
  const [loading, setLoading] = useState(true);

  // Multi-Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [selectedPic, setSelectedPic] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Reject modal / inline state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  // Distinct order list for dropdown filter
  const orderOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const jd of allJobDesks) {
      if (jd.orderId) {
        map.set(jd.orderId, jd.orderLabel || jd.orderId);
      }
    }
    return Array.from(map.entries());
  }, [allJobDesks]);

  // Global stats
  const stats = useMemo(() => {
    const total = allJobDesks.length;
    const pendingReview = allJobDesks.filter((jd) => jd.reviewStatus === "pending_review").length;
    const approved = allJobDesks.filter((jd) => jd.reviewStatus === "approved").length;
    const rejected = allJobDesks.filter((jd) => jd.reviewStatus === "rejected").length;
    const notSubmitted = allJobDesks.filter(
      (jd) => jd.reviewStatus === "not_submitted"
    ).length;
    return { total, pendingReview, approved, rejected, notSubmitted };
  }, [allJobDesks]);

  // Main multi-filter engine
  const filteredJobDesks = useMemo(() => {
    let result = allJobDesks;

    // 1. Filter by specific PIC (e.g. Joko, Dwi, Shifa, Wandi)
    if (selectedPic !== "all") {
      result = result.filter(
        (jd) =>
          jd.pic === selectedPic ||
          jd.assignedRole === PIC_NAME_TO_ROLE[selectedPic as PicShortName]
      );
    }

    // 2. Filter by specific order (e.g. Pesanan A, Pesanan B)
    if (selectedOrder !== "all") {
      result = result.filter((jd) => jd.orderId === selectedOrder);
    }

    // 3. Filter by date
    if (selectedDate) {
      result = result.filter((jd) => jd.tanggal === selectedDate);
    }

    // 4. Filter by review status (Pending Review, Approved, Rejected, Not Submitted)
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
          (jd.keyId || "").toLowerCase().includes(q) ||
          (jd.pic || "").toLowerCase().includes(q) ||
          (jd.hari || "").toLowerCase().includes(q) ||
          (jd.incompleteReason || "").toLowerCase().includes(q) ||
          (jd.rejectionRemark || "").toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [allJobDesks, selectedPic, selectedOrder, selectedDate, reviewFilter, searchQuery]);

  // Handle approve
  const handleApprove = useCallback(
    async (id: string) => {
      setProcessingId(id);
      try {
        await approveJobDesk(id, user?.uid || "");
      } catch (err) {
        console.error("Failed to approve job desk:", err);
      } finally {
        setProcessingId(null);
      }
    },
    [user?.uid]
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
        await rejectJobDesk(id, user?.uid || "", rejectRemark.trim());
        setRejectingId(null);
        setRejectRemark("");
      } catch (err) {
        console.error("Failed to reject job desk:", err);
      } finally {
        setProcessingId(null);
      }
    },
    [rejectRemark, user?.uid]
  );

  const activeFilterCount =
    (selectedPic !== "all" ? 1 : 0) +
    (selectedOrder !== "all" ? 1 : 0) +
    (selectedDate ? 1 : 0) +
    (reviewFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const resetAllFilters = () => {
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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Review Job Desk (CO_MO)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              <Sparkles className="h-3 w-3" /> Monitoring & Persetujuan
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Pantau dan review job desk dari Ust. Joko, Dwi, Shifa, dan Wandi dalam format tabel Excel
          </p>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="self-start sm:self-auto text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 transition-colors cursor-pointer"
          >
            Reset Semua Filter ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Stats Dashboard / Review Status Filter Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
              className={`${s.bg} rounded-2xl p-3.5 text-center transition-all hover:scale-105 cursor-pointer ${
                isSelected ? "ring-2 ring-indigo-500 ring-offset-2 shadow-sm" : ""
              }`}
            >
              <s.icon className={`h-4 w-4 ${s.color} mx-auto mb-1`} />
              <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-gray-500 mt-0.5">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* Multi-Filter Bar: Role, Order, Date, Search */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 mb-1">
          <Filter className="h-4 w-4 text-indigo-600" />
          <span>Filter Lanjutan (Role, Pesanan, Tanggal)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* 1. Filter by Petugas / PIC */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Petugas (PIC)
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedPic}
                onChange={(e) => setSelectedPic(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
              >
                <option value="all">Semua Petugas (Joko, Dwi, Shifa, Wandi)</option>
                {PIC_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p} ({JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]]})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 2. Filter by Pesanan */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1">
              Pesanan Katering
            </label>
            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
              >
                <option value="all">Semua Pesanan</option>
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
                placeholder="Cari kegiatan, Key ID..."
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
                ? "bg-indigo-600 text-white shadow-sm"
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
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table: Excel-Style Spreadsheet View for CO_MO */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-indigo-600" />
            <p className="text-xs font-bold text-gray-800">
              Tabel Monitoring & Review ({filteredJobDesks.length} Baris)
              {selectedPic !== "all" && (
                <span> — PIC: <strong className="text-indigo-700">{selectedPic}</strong></span>
              )}
            </p>
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1050px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5 w-24">Hari</th>
                  <th className="py-3 px-3.5 w-28">Tanggal</th>
                  <th className="py-3 px-3.5 w-20 text-center">Start Time</th>
                  <th className="py-3 px-3.5 w-28">PIC</th>
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                          {jd.pic}
                        </span>
                      </td>
                      {/* Kegiatan */}
                      <td className="py-3 px-3.5 font-bold text-gray-900">
                        {jd.kegiatan || jd.title}
                        {jd.orderLabel && (
                          <p className="text-[10px] text-gray-400 font-normal mt-0.5">
                            Pesanan: {jd.orderLabel}
                          </p>
                        )}
                      </td>
                      {/* Keterangan */}
                      <td className="py-3 px-3.5 text-gray-600">
                        {jd.keterangan || jd.description || "-"}
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
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                          </span>
                        ) : jd.status === "incomplete" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700">
                            <AlertCircle className="h-3.5 w-3.5" /> Incomplete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>

                      {/* Aksi Review CO_MO */}
                      <td className="py-3 px-3.5 text-center">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Approved
                          </span>
                        ) : isRejected ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                              <XCircle className="h-3.5 w-3.5 text-red-600" /> Rejected
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1">Menunggu perbaikan PIC</p>
                          </div>
                        ) : isPendingReview ? (
                          <div className="space-y-2">
                            <div className="flex gap-1.5 justify-center">
                              <button
                                type="button"
                                onClick={() => handleApprove(jd.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {isProcessing ? "..." : "Approve"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(isRejecting ? null : jd.id);
                                  setRejectRemark("");
                                }}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>

                            {/* Rejection Remark Input Form */}
                            <AnimatePresence>
                              {isRejecting && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="pt-1 text-left space-y-1.5"
                                >
                                  <textarea
                                    value={rejectRemark}
                                    onChange={(e) => setRejectRemark(e.target.value)}
                                    placeholder="Tulis alasan / remark penolakan..."
                                    rows={2}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-red-300 focus:ring-1 focus:ring-red-400 resize-none bg-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleReject(jd.id)}
                                    disabled={isProcessing || !rejectRemark.trim()}
                                    className="w-full py-1 text-[11px] font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                                  >
                                    Kirim Penolakan + Remark
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">Belum disubmit oleh PIC</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CoMoReviewPage;
