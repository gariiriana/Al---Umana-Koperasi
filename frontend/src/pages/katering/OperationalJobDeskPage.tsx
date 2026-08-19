// ============================================================================
// Operational Job Desk Page (Excel Layout & Review Submission - Katering & MBG)
// ============================================================================
// Used by:
// - Joko (produksi_1 - Katering)
// - Dwi (distribusi_1 - Katering)
// - Shifa (produksi_2 - Katering)
// - Wandi / Dstribusi2@alumana.id (distribusi_2 - Katering & MBG)
// - Tim Produksi MBG 2 (MBG2)
//
// Shows assigned job desks with exact Excel columns:
// Divisi | Hari | Tanggal | Start Time | PIC | Kegiatan | Keterangan | Key ID
// Plus interactive Complete (✅) / Incomplete (❌ + Alasan) and Submit to CO_MO

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Search,
  Calendar,
  User,
  Table as TableIcon,
  AlertCircle,
  Milk,
  UtensilsCrossed,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeJobDesksByRole,
  submitJobDeskStatus,
} from "@/services/cateringJobDeskService";
import type {
  CateringJobDesk,
  JobDeskAssignableRole,
  JobDeskStatus,
  PicShortName,
} from "@/types/cateringJobDesk";
import { JOBDESK_ROLE_LABELS, ROLE_TO_PIC_NAME, compareJobDeskTime } from "@/types/cateringJobDesk";

/** Map user profile role to job desk assignable role. */
function mapToAssignableRole(profileRole?: string, email?: string): JobDeskAssignableRole | null {
  if (email) {
    const em = email.toLowerCase();
    // 1. Joko: ProduksiMBG2@alumana.id
    if (em.includes("produksimbg2") || em.includes("produksi_mbg2") || em.includes("joko")) {
      return "produksi_1";
    }
    // 2. Hashifah Dzihniyah Zhafirah (Shifa): ProduksiMBG@alumana.id
    if (em.includes("produksimbg") || em.includes("produksi_mbg") || em.includes("shifa") || em.includes("hashifah")) {
      return "produksi_2";
    }
    // 3. Dwi: distribusimbg@alumana.id
    if (em.includes("distribusimbg") || em.includes("distribusi_mbg") || em.includes("dwi")) {
      return "distribusi_1";
    }
    // 4. Wandi: Dstribusi2@alumana.id
    if (em === "dstribusi2@alumana.id" || em.includes("distribusi_2") || em.includes("distribusi2") || em.startsWith("wandi")) {
      return "distribusi_2";
    }
  }
  const mapping: Record<string, JobDeskAssignableRole> = {
    produksi_1: "produksi_1",
    distribusi_1: "distribusi_1",
    produksi_2: "produksi_2",
    distribusi_2: "distribusi_2",
    tim_produksi: "produksi_1", // Legacy alias for Ust. Joko
    distribusi: "distribusi_1", // Legacy alias for Dwi
    MBG2: "produksi_1", // Joko
    mbg2: "produksi_1", // Joko
    produksi_mbg: "produksi_2", // Shifa (Hashifah)
    produksi_mbg_2: "produksi_1", // Joko
    distribusi_mbg: "distribusi_1", // Dwi
    distribusi_mbg_2: "distribusi_2", // Wandi
  };
  return profileRole ? mapping[profileRole] || null : null;
}

export function OperationalJobDeskPage() {
  const { user, profile } = useAuth();
  const [jobDesks, setJobDesks] = useState<CateringJobDesk[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<"all" | "katering" | "mbg">("all");

  // In-line draft state for each job desk row
  const [rowStatus, setRowStatus] = useState<Record<string, JobDeskStatus>>({});
  const [rowReason, setRowReason] = useState<Record<string, string>>({});
  const [submittingRowId, setSubmittingRowId] = useState<string | null>(null);

  const emailLower = (profile?.email || user?.email || "").toLowerCase();
  const isJokoAccount = emailLower.includes("produksimbg2") || emailLower.includes("produksi_mbg2") || emailLower.includes("joko");
  const isShifaAccount = !isJokoAccount && (emailLower.includes("produksimbg") || emailLower.includes("produksi_mbg") || emailLower.includes("shifa") || emailLower.includes("hashifah"));
  const isDwiAccount = emailLower.includes("distribusimbg") || emailLower.includes("distribusi_mbg") || emailLower.includes("dwi");
  const isWandiAccount = emailLower === "dstribusi2@alumana.id" || emailLower.includes("distribusi2") || emailLower.startsWith("wandi");

  const assignableRole = isJokoAccount
    ? "produksi_1"
    : isShifaAccount
    ? "produksi_2"
    : isDwiAccount
    ? "distribusi_1"
    : isWandiAccount
    ? "distribusi_2"
    : mapToAssignableRole(profile?.role, profile?.email || user?.email || undefined);

  const picShortName: PicShortName = isJokoAccount
    ? "Joko"
    : isShifaAccount
    ? "Shifa"
    : isDwiAccount
    ? "Dwi"
    : isWandiAccount
    ? "Wandi"
    : (assignableRole ? ROLE_TO_PIC_NAME[assignableRole] : "Joko");

  const isDualScopeUser = isWandiAccount || assignableRole === "distribusi_2";

  useEffect(() => {
    if (!assignableRole) {
      setLoading(false);
      return;
    }

    const unsub = subscribeJobDesksByRole(
      assignableRole,
      (data) => {
        setJobDesks(data);
        // Initialize draft states
        const initialStatus: Record<string, JobDeskStatus> = {};
        const initialReason: Record<string, string> = {};
        data.forEach((jd) => {
          initialStatus[jd.id] = jd.status;
          if (jd.incompleteReason) initialReason[jd.id] = jd.incompleteReason;
        });
        setRowStatus((prev) => ({ ...initialStatus, ...prev }));
        setRowReason((prev) => ({ ...initialReason, ...prev }));
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load operational job desks:", err);
        setLoading(false);
      },
      profile?.email || user?.email || undefined
    );
    return () => unsub();
  }, [assignableRole, profile?.email, user?.email]);

  // Handle submit single row to CO_MO
  const handleSubmitRow = useCallback(
    async (jdId: string) => {
      const currentStatus = rowStatus[jdId] || "pending";
      const currentReason = rowReason[jdId] || "";

      if (currentStatus === "pending") {
        alert("Pilih status Complete atau Incomplete terlebih dahulu!");
        return;
      }
      if (currentStatus === "incomplete" && !currentReason.trim()) {
        alert("Harap isi alasan kenapa tugas incomplete!");
        return;
      }

      setSubmittingRowId(jdId);
      try {
        await submitJobDeskStatus(
          jdId,
          currentStatus,
          user?.uid || "",
          currentStatus === "incomplete" ? currentReason.trim() : undefined
        );
      } catch (err) {
        console.error("Failed submitting job desk:", err);
        alert("Gagal mengirim status ke CO_MO.");
      } finally {
        setSubmittingRowId(null);
      }
    },
    [rowStatus, rowReason, user?.uid]
  );

  // Filtered job desks
  const filteredJobDesks = useMemo(() => {
    let result = jobDesks;

    if (divisionFilter !== "all") {
      result = result.filter((jd) => jd.division === divisionFilter);
    }

    if (selectedDate) {
      result = result.filter((jd) => jd.tanggal === selectedDate);
    }

    if (statusFilter !== "all") {
      result = result.filter((jd) => jd.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (jd) =>
          (jd.kegiatan || jd.title || "").toLowerCase().includes(q) ||
          (jd.keterangan || jd.description || "").toLowerCase().includes(q) ||
          (jd.keyId || "").toLowerCase().includes(q) ||
          (jd.hari || "").toLowerCase().includes(q) ||
          (jd.orderLabel || "").toLowerCase().includes(q) ||
          (jd.mbgInstitutionName || "").toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      const dateA = a.tanggal || "";
      const dateB = b.tanggal || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return compareJobDeskTime(a.startTime, b.startTime);
    });
  }, [jobDesks, divisionFilter, selectedDate, statusFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = jobDesks.length;
    const kateringCount = jobDesks.filter((d) => d.division !== "mbg").length;
    const mbgCount = jobDesks.filter((d) => d.division === "mbg").length;

    const completed = jobDesks.filter((jd) => jd.status === "complete").length;
    const incomplete = jobDesks.filter((jd) => jd.status === "incomplete").length;
    const approved = jobDesks.filter((jd) => jd.reviewStatus === "approved").length;
    const rejected = jobDesks.filter((jd) => jd.reviewStatus === "rejected").length;
    const pendingReview = jobDesks.filter((jd) => jd.reviewStatus === "pending_review").length;

    return { total, kateringCount, mbgCount, completed, incomplete, approved, rejected, pendingReview };
  }, [jobDesks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-gray-500">Memuat job desk Anda...</p>
        </div>
      </div>
    );
  }

  if (!assignableRole) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500">Role Anda tidak terdaftar sebagai tim operasional.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-slate-950">
              <User className="h-3.5 w-3.5" /> PIC: {picShortName}
            </span>
            {isDualScopeUser && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400 text-slate-950">
                <Sparkles className="h-3 w-3" /> Distribusi Katering & MBG
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Job Desk Saya — {JOBDESK_ROLE_LABELS[assignableRole]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Centang status tugas (✅ Complete / ❌ Incomplete) lalu klik tombol Submit ke CO_MO.
          </p>
        </div>

        {/* Division Tab Filter for Dual-Scope Users */}
        {isDualScopeUser && (
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
              ⚡ Semua ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setDivisionFilter("katering")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                divisionFilter === "katering"
                  ? "bg-amber-400 text-slate-950 shadow-xs"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              🍱 Katering ({stats.kateringCount})
            </button>
            <button
              type="button"
              onClick={() => setDivisionFilter("mbg")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                divisionFilter === "mbg"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              🥛 MBG ({stats.mbgCount})
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-bold text-gray-500">Total Tugas</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 shadow-xs">
          <p className="text-xs font-bold text-blue-700">Complete (✅)</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 shadow-xs">
          <p className="text-xs font-bold text-orange-700">Incomplete (❌)</p>
          <p className="text-2xl font-black text-orange-700 mt-1">{stats.incomplete}</p>
        </div>
        <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 shadow-xs">
          <p className="text-xs font-bold text-amber-700">Menunggu Review</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{stats.pendingReview}</p>
        </div>
        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <p className="text-xs font-bold text-emerald-700">Approved CO_MO</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{stats.approved}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <label className="block text-[11px] font-bold text-gray-500 mb-1">
            Cari Kegiatan / Keterangan
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari tugas, sekolah, keterangan..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs focus:ring-2 focus:ring-amber-400 focus:bg-white"
            />
          </div>
        </div>

        {/* Filter Date */}
        <div className="relative">
          <label className="block text-[11px] font-bold text-gray-500 mb-1">
            Filter Tanggal
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Filter Status */}
        <div className="relative">
          <label className="block text-[11px] font-bold text-gray-500 mb-1">
            Filter Status Pengerjaan
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-amber-400"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Belum Dikerjakan (Pending)</option>
            <option value="complete">Complete (✅)</option>
            <option value="incomplete">Incomplete (❌)</option>
          </select>
        </div>
      </div>

      {/* Main Table: Excel-Style Spreadsheet View */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-bold text-gray-800">
              Daftar Job Desk ({filteredJobDesks.length} Tugas)
            </p>
          </div>
          {(selectedDate || searchQuery || statusFilter !== "all" || divisionFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate("");
                setSearchQuery("");
                setStatusFilter("all");
                setDivisionFilter("all");
              }}
              className="text-xs font-bold text-amber-600 hover:text-amber-800 cursor-pointer underline"
            >
              Reset Filter
            </button>
          )}
        </div>

        {filteredJobDesks.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-600">
              Tidak ada tugas yang cocok dengan filter
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5 w-28 min-w-[100px]">Divisi</th>
                  <th className="py-3 px-3.5 w-28 min-w-[95px]">Hari</th>
                  <th className="py-3 px-3.5 w-28">Tanggal</th>
                  <th className="py-3 px-3.5 w-24 text-center">Start Time</th>
                  <th className="py-3 px-3.5 w-24">PIC</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Kegiatan</th>
                  <th className="py-3 px-3.5 min-w-[220px]">Keterangan</th>
                  <th className="py-3 px-3.5 w-36 font-mono">Key ID</th>
                  <th className="py-3 px-3.5 min-w-[180px]">Status Pengerjaan (PIC)</th>
                  <th className="py-3 px-3.5 w-32 text-center">Status Review CO_MO</th>
                  <th className="py-3 px-3.5 w-28 text-center">Aksi Submit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredJobDesks.map((jd) => {
                  const currentStatus = rowStatus[jd.id] || jd.status;
                  const currentReason = rowReason[jd.id] || jd.incompleteReason || "";
                  const isApproved = jd.reviewStatus === "approved";
                  const isRejected = jd.reviewStatus === "rejected";
                  const isPendingReview = jd.reviewStatus === "pending_review";
                  const canEdit = !isApproved && !isPendingReview;

                  return (
                    <tr
                      key={jd.id}
                      className={`transition-colors ${
                        isApproved
                          ? "bg-emerald-50/30"
                          : isRejected
                          ? "bg-red-50/30"
                          : isPendingReview
                          ? "bg-amber-50/20"
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
                      <td className="py-3 px-3.5 font-bold text-gray-900">
                        {jd.hari || "-"}
                      </td>
                      {/* Tanggal */}
                      <td className="py-3 px-3.5 text-gray-600 whitespace-nowrap">
                        {jd.tanggal || "-"}
                      </td>
                      {/* Start Time */}
                      <td className="py-3 px-3.5 font-mono font-bold text-center text-gray-700">
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
                        {jd.keterangan || jd.description || "-"}
                        {isRejected && jd.rejectionRemark && (
                          <div className="mt-1.5 p-2 bg-red-100/70 border border-red-200 rounded-lg text-red-800 text-[11px] font-medium">
                            <span className="font-bold">Catatan Penolakan CO_MO:</span>{" "}
                            {jd.rejectionRemark}
                          </div>
                        )}
                      </td>
                      {/* Key ID */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold text-gray-800 bg-gray-100 border border-gray-200">
                          {jd.keyId}
                        </span>
                      </td>

                      {/* Status Pengerjaan (Interactive Buttons) */}
                      <td className="py-3 px-3.5">
                        {canEdit ? (
                          <div className="space-y-2">
                            <div className="flex gap-1.5">
                              {/* Complete Button */}
                              <button
                                type="button"
                                onClick={() =>
                                  setRowStatus((prev) => ({
                                    ...prev,
                                    [jd.id]: "complete",
                                  }))
                                }
                                className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                  currentStatus === "complete"
                                    ? "bg-emerald-500 text-white shadow-xs"
                                    : "bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"
                                }`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Complete
                              </button>

                              {/* Incomplete Button */}
                              <button
                                type="button"
                                onClick={() =>
                                  setRowStatus((prev) => ({
                                    ...prev,
                                    [jd.id]: "incomplete",
                                  }))
                                }
                                className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                  currentStatus === "incomplete"
                                    ? "bg-red-500 text-white shadow-xs"
                                    : "bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-700"
                                }`}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Incomplete
                              </button>
                            </div>

                            {/* Incomplete Reason Textarea */}
                            {currentStatus === "incomplete" && (
                              <div className="space-y-1">
                                <textarea
                                  value={currentReason}
                                  onChange={(e) =>
                                    setRowReason((prev) => ({
                                      ...prev,
                                      [jd.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Tulis alasan incomplete..."
                                  rows={2}
                                  className="w-full px-2.5 py-1 rounded-lg border border-red-300 text-[11px] focus:ring-1 focus:ring-red-400 resize-none bg-white"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            {jd.status === "complete" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                              </span>
                            ) : jd.status === "incomplete" ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                                <AlertCircle className="h-3.5 w-3.5" /> Incomplete
                              </span>
                              {jd.incompleteReason && (
                                <p className="text-[10px] text-orange-700 mt-1">
                                  Alasan: {jd.incompleteReason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Pending</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status Review CO_MO */}
                    <td className="py-3 px-3.5 text-center">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                          <XCircle className="h-3.5 w-3.5" /> Rejected
                        </span>
                      ) : isPendingReview ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                          <Clock className="h-3.5 w-3.5" /> Menunggu Review
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">Belum Submit</span>
                      )}
                    </td>

                    {/* Aksi Submit */}
                    <td className="py-3 px-3.5 text-center">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleSubmitRow(jd.id)}
                          disabled={
                            submittingRowId === jd.id ||
                            currentStatus === "pending" ||
                            (currentStatus === "incomplete" && !currentReason.trim())
                          }
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Send className="h-3 w-3" />
                          {submittingRowId === jd.id ? "..." : isRejected ? "Submit Ulang" : "Submit"}
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-gray-400">
                          {isApproved ? "Tuntas ✓" : "Terkirim ✓"}
                        </span>
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

export default OperationalJobDeskPage;
