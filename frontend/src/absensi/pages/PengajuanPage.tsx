import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, FileText, Plus, Trash2 } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { createRequest, getRekan, listMyRequests } from "@/absensi/api";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { errorMessage } from "@/absensi/errorMessage";
import {
  LEAVE_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  bulanWIB,
  expandDatesInRange,
  formatHariTanggal,
  geserBulan,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, CoworkerView, LeaveType } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

export interface LeaveSubtypeOption {
  label: string;
  category: LeaveType;
  defaultSaldo: number;
}

/** Daftar lengkap 15 Jenis Cuti sesuai referensi SS 2. */
export const LEAVE_SUBTYPE_OPTIONS: readonly LeaveSubtypeOption[] = [
  { label: "Cuti Besar (Long Service)", category: "cuti", defaultSaldo: 0 },
  { label: "Cuti Hari Besar Daerah", category: "cuti", defaultSaldo: 2 },
  { label: "Cuti melahirkan", category: "cuti", defaultSaldo: 90 },
  { label: "Cuti Tahunan", category: "cuti", defaultSaldo: 12 },
  { label: "Isteri keguguran kandungan", category: "cuti", defaultSaldo: 45 },
  { label: "Kematian anggota keluarga dalam satu rumah", category: "izin", defaultSaldo: 1 },
  { label: "Kematian suami/ isteri, orang tua/ mertua atau anak/ menantu", category: "izin", defaultSaldo: 2 },
  { label: "Khitanan anak", category: "izin", defaultSaldo: 2 },
  { label: "Paternity (hak karyawan pria untuk menyertai istrinya pada saat melahirkan)", category: "cuti", defaultSaldo: 2 },
  { label: "Pembaptisan anak", category: "izin", defaultSaldo: 2 },
  { label: "Pernikahan", category: "cuti", defaultSaldo: 3 },
  { label: "Pernikahan anak", category: "izin", defaultSaldo: 2 },
  { label: "Pulang Awal", category: "izin", defaultSaldo: 5 },
  { label: "Replacement Off (Cuti Pengganti)", category: "cuti", defaultSaldo: 3 },
  { label: "Sakit", category: "sakit", defaultSaldo: 14 },
] as const;

const SHIFT_PRESETS = [
  "Shift Pagi (07:00 - 15:00)",
  "Shift Siang (15:00 - 23:00)",
  "Shift Malam (23:00 - 07:00)",
  "Shift Reguler (08:00 - 17:00)",
];

const BULAN_PENDEK_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HARI_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Format "Monday, 19 Oct - Tuesday, 20 Oct 2026" seperti di SS 1. */
function formatRangeCardDate(startDate: string, endDate: string): string {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    return {
      dayName: HARI_EN[utc.getUTCDay()],
      day: d,
      month: BULAN_PENDEK_EN[m - 1],
      year: y,
    };
  };
  const s = parse(startDate);
  const e = parse(endDate);
  return `${s.dayName}, ${s.day} ${s.month} - ${e.dayName}, ${e.day} ${e.month} ${e.year}`;
}

/** Format "19 Oct 2026, 17:47" dalam WIB seperti footer kartu SS 1. */
function formatFooterTime(ms: number): string {
  const d = new Date(ms + 7 * 3600_000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = BULAN_PENDEK_EN[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

const fieldClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";
const labelClass = "block space-y-1.5 text-xs font-extrabold text-neutral-900";

/**
 * Halaman Permohonan Cuti & Pergantian Shift (Referensi SS 1, SS 2, SS 3):
 * - Mode Riwayat ("Permohonan Cuti Saya") dikelompokkan per periode (BULAN INI, BULAN LALU, PERMINTAAN LAMA) + tombol "+"
 * - Mode Form Input ("Permohonan Cuti") dengan pemilih bottom-sheet 15 Jenis Cuti, Saldo Tersedia,
 *   Tanggal Mulai/Selesai, Alasan, Karyawan Pengganti, Dokumen Pendukung, dan Penyetuju.
 */
export function PengajuanPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialParam = searchParams.get("buat");

  // View mode: "history" (SS 1), "cuti-form" (SS 3), atau "shift-form"
  const [viewMode, setViewMode] = useState<"history" | "cuti-form" | "shift-form">(
    initialParam === "cuti" ? "cuti-form" : initialParam === "shift" ? "shift-form" : "history",
  );
  const [historyTab, setHistoryTab] = useState<"cuti" | "shift">(
    initialParam === "shift" ? "shift" : "cuti",
  );

  const [requests, setRequests] = useState<AbsensiRequestView[] | null>(null);
  const [coworkers, setCoworkers] = useState<CoworkerView[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Collapsible sections di History View (SS 1)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // State Form Permohonan Cuti (SS 2 & SS 3)
  const today = workDateWIB(Date.now());
  const [selectedSubtype, setSelectedSubtype] = useState<string>(LEAVE_SUBTYPE_OPTIONS[0].label);
  const [showJenisSheet, setShowJenisSheet] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");
  const [leavePartnerUid, setLeavePartnerUid] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // State Form Pergantian Shift
  const [shiftDate, setShiftDate] = useState(today);
  const [fromShift, setFromShift] = useState(SHIFT_PRESETS[0]);
  const [toShift, setToShift] = useState(SHIFT_PRESETS[1]);
  const [shiftPartnerUid, setShiftPartnerUid] = useState("");
  const [shiftReason, setShiftReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get("buat");
    if (param === "cuti") {
      setHistoryTab("cuti");
      setViewMode("cuti-form");
    } else if (param === "shift") {
      setHistoryTab("shift");
      setViewMode("shift-form");
    }
  }, [searchParams]);

  const clearBuatParam = useCallback(() => {
    if (searchParams.has("buat")) {
      const next = new URLSearchParams(searchParams);
      next.delete("buat");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openHistoryView = () => {
    setFormError(null);
    setViewMode("history");
    clearBuatParam();
  };

  const openCutiForm = () => {
    setFormError(null);
    setHistoryTab("cuti");
    setViewMode("cuti-form");
  };

  const openShiftForm = () => {
    setFormError(null);
    setHistoryTab("shift");
    setViewMode("shift-form");
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listMyRequests();
      setRequests(res.requests);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    getRekan()
      .then((res) => setCoworkers(res.coworkers))
      .catch(() => {});
  }, [load]);

  const currentSubtypeObj = useMemo(
    () => LEAVE_SUBTYPE_OPTIONS.find((item) => item.label === selectedSubtype) ?? null,
    [selectedSubtype],
  );

  // Hitung Saldo Tersedia berdasarkan jenis cuti yang dipilih dikurangi hari cuti yang sudah disetujui
  const availableSaldo = useMemo(() => {
    if (!currentSubtypeObj) return 0;
    const usedDays = (requests ?? [])
      .filter(
        (r) =>
          r.kind === "cuti" &&
          r.status === "approved" &&
          (r.leaveSubtype === currentSubtypeObj.label ||
            (!r.leaveSubtype && r.leaveType === currentSubtypeObj.category)),
      )
      .reduce((acc, r) => acc + expandDatesInRange(r.startDate, r.endDate).length, 0);
    return Math.max(0, currentSubtypeObj.defaultSaldo - usedDays);
  }, [currentSubtypeObj, requests]);

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedSubtype) {
      setFormError("Silakan pilih jenis cuti terlebih dahulu.");
      return;
    }
    if (startDate > endDate) {
      setFormError("Tanggal mulai harus sebelum atau sama dengan tanggal selesai.");
      return;
    }
    const category: LeaveType = currentSubtypeObj?.category ?? "cuti";
    setSubmitting(true);
    try {
      await createRequest({
        kind: "cuti",
        leaveType: category,
        leaveSubtype: selectedSubtype,
        startDate,
        endDate,
        partnerUid: leavePartnerUid || undefined,
        attachmentName: attachmentName || undefined,
        reason: leaveReason.trim(),
      });
      setLeaveReason("");
      setLeavePartnerUid("");
      setAttachmentName(null);
      openHistoryView();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitShiftSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (fromShift.trim() === toShift.trim()) {
      setFormError("Shift asal dan shift pengganti tidak boleh sama.");
      return;
    }
    setSubmitting(true);
    try {
      await createRequest({
        kind: "pergantian_shift",
        date: shiftDate,
        fromShift: fromShift.trim(),
        toShift: toShift.trim(),
        partnerUid: shiftPartnerUid || undefined,
        reason: shiftReason.trim(),
      });
      setShiftReason("");
      setShiftPartnerUid("");
      openHistoryView();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Kelompokkan permohonan berdasarkan periode: BULAN INI, BULAN LALU, PERMINTAAN LAMA (SS 1)
  const groupedRequests = useMemo(() => {
    if (!requests) return null;
    const filtered = requests.filter((r) =>
      historyTab === "cuti" ? r.kind === "cuti" : r.kind === "pergantian_shift",
    );
    const currMonth = bulanWIB(Date.now());
    const lastMonth = geserBulan(currMonth, -1);

    const bulanIni: AbsensiRequestView[] = [];
    const bulanLalu: AbsensiRequestView[] = [];
    const permintaanLama: AbsensiRequestView[] = [];

    for (const req of filtered) {
      const reqMonth = req.startDate.slice(0, 7);
      if (reqMonth >= currMonth) {
        bulanIni.push(req);
      } else if (reqMonth === lastMonth) {
        bulanLalu.push(req);
      } else {
        permintaanLama.push(req);
      }
    }

    const groups: Array<{ key: string; title: string; items: AbsensiRequestView[] }> = [];
    if (bulanIni.length > 0) groups.push({ key: "bulan-ini", title: "BULAN INI", items: bulanIni });
    if (bulanLalu.length > 0) groups.push({ key: "bulan-lalu", title: "BULAN LALU", items: bulanLalu });
    if (permintaanLama.length > 0) groups.push({ key: "permintaan-lama", title: "PERMINTAAN LAMA", items: permintaanLama });
    return groups;
  }, [requests, historyTab]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ============================================================================
  // LAYAR 1: FORM INPUT PERMOHONAN CUTI (Referensi SS 3 + Bottom Sheet SS 2)
  // ============================================================================
  if (viewMode === "cuti-form") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Form Permohonan Cuti"
        className="min-h-screen bg-[#F8FAFC] pb-28 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900"
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
            <button
              type="button"
              aria-label="Kembali"
              onClick={openHistoryView}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
              Permohonan Cuti
            </h1>
            <NotificationBellButton variant="plain" />
          </div>
        </header>

        <form onSubmit={submitLeave} className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
          {/* Jenis Cuti + Tombol Lihat Riwayat */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-neutral-900">Jenis Cuti</span>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-extrabold text-neutral-950">
                  i
                </span>
              </div>
              <button
                type="button"
                onClick={openHistoryView}
                className="rounded-lg border border-amber-500 bg-white px-3 py-1 text-xs font-bold text-amber-800 transition hover:bg-amber-50"
              >
                Lihat Riwayat
              </button>
            </div>

            <button
              type="button"
              aria-label="Pilih Jenis Cuti"
              onClick={() => setShowJenisSheet(true)}
              className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-left text-sm font-semibold text-neutral-900 shadow-2xs transition hover:border-amber-400"
            >
              <span className={selectedSubtype ? "text-neutral-900" : "text-neutral-400"}>
                {selectedSubtype || "Pilih Jenis Cuti"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-amber-700" />
            </button>

            <p className="mt-1.5 text-right text-xs text-neutral-500">
              Saldo Tersedia:{" "}
              <span className="font-extrabold text-amber-700">{availableSaldo} hari</span>
            </p>
          </div>

          {/* Tanggal Mulai & Tanggal Selesai */}
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span>Tanggal Mulai</span>
              <input
                type="date"
                required
                aria-label="Tanggal Mulai"
                className={fieldClass}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </label>
            <label className={labelClass}>
              <span>Tanggal Selesai</span>
              <input
                type="date"
                required
                aria-label="Tanggal Selesai"
                className={fieldClass}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          {/* Alasan */}
          <label className={labelClass}>
            <span>Alasan</span>
            <textarea
              required
              minLength={2}
              maxLength={500}
              rows={3}
              aria-label="Alasan"
              placeholder="Masukkan alasan cuti"
              className={fieldClass}
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
            />
          </label>

          {/* Karyawan Pengganti */}
          <label className={labelClass}>
            <span>Karyawan Pengganti</span>
            <select
              aria-label="Karyawan Pengganti"
              className={fieldClass}
              value={leavePartnerUid}
              onChange={(e) => setLeavePartnerUid(e.target.value)}
            >
              <option value="">Pilih Karyawan</option>
              {coworkers.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="border-t border-neutral-200/80 pt-2" />

          {/* Dokumen Pendukung */}
          <div className="space-y-2.5">
            <span className="block text-xs font-extrabold text-neutral-900">Dokumen Pendukung</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setAttachmentName(file.name);
              }}
            />

            {attachmentName ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-xs font-bold text-amber-950">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-amber-700" />
                  <span className="truncate">{attachmentName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentName(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="ml-2 rounded-lg p-1 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus file"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500 bg-white py-3 text-xs font-extrabold text-amber-800 transition hover:bg-amber-50"
              >
                <Plus className="h-4 w-4" />
                <span>Pilih File</span>
              </button>
            )}

            {/* Kotak Info Penyetuju */}
            <div className="rounded-xl border border-amber-400/80 bg-amber-50/60 px-4 py-3.5 text-xs font-bold text-amber-900">
              Penyetuju: Admin Absensi
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
              {formError}
            </p>
          )}

          {/* Sticky Bottom Action Buttons (Batalkan & Kirim Permohonan) */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
            <div className="mx-auto flex max-w-md gap-3">
              <button
                type="button"
                onClick={openHistoryView}
                className="flex-1 rounded-xl bg-neutral-100 py-3 text-xs font-extrabold text-neutral-600 transition hover:bg-neutral-200"
              >
                Batalkan
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-extrabold text-neutral-950 shadow-sm transition hover:bg-amber-500 disabled:opacity-50"
              >
                {submitting ? "Mengirim..." : "Kirim Permohonan"}
              </button>
            </div>
          </div>
        </form>

        {/* Bottom Sheet: Pilih Jenis Cuti (Referensi SS 2) */}
        {showJenisSheet && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pilih Jenis"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45"
            onClick={() => setShowJenisSheet(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
            >
              <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-300" />
              <div className="flex items-center justify-between px-5 py-3.5">
                <h2 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">
                  Pilih Jenis
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubtype("");
                    setShowJenisSheet(false);
                  }}
                  className="text-xs font-extrabold text-amber-700 hover:text-amber-800"
                >
                  Hapus
                </button>
              </div>

              <div className="space-y-2.5 overflow-y-auto px-5 pb-6">
                {LEAVE_SUBTYPE_OPTIONS.map((opt) => {
                  const active = selectedSubtype === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setSelectedSubtype(opt.label);
                        setShowJenisSheet(false);
                      }}
                      className={`w-full rounded-xl border px-4 py-3.5 text-left text-xs leading-relaxed transition ${
                        active
                          ? "border-amber-400 bg-amber-50/90 font-extrabold text-neutral-900"
                          : "border-neutral-200/90 bg-white font-semibold text-neutral-800 hover:border-amber-300 hover:bg-amber-50/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // LAYAR 2: FORM INPUT PERGANTIAN SHIFT
  // ============================================================================
  if (viewMode === "shift-form") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Form Pergantian Shift"
        className="min-h-screen bg-[#F8FAFC] pb-28 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900"
      >
        <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
            <button
              type="button"
              aria-label="Kembali"
              onClick={openHistoryView}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
              Pergantian Shift
            </h1>
            <NotificationBellButton variant="plain" />
          </div>
        </header>

        <form onSubmit={submitShiftSwap} className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-neutral-900">Detail Pergantian Jadwal</span>
            <button
              type="button"
              onClick={openHistoryView}
              className="rounded-lg border border-amber-500 bg-white px-3 py-1 text-xs font-bold text-amber-800 transition hover:bg-amber-50"
            >
              Lihat Riwayat
            </button>
          </div>

          <label className={labelClass}>
            <span>Tanggal Shift</span>
            <input
              type="date"
              required
              className={fieldClass}
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
            />
          </label>

          <label className={labelClass}>
            <span>Shift Asal</span>
            <select className={fieldClass} value={fromShift} onChange={(e) => setFromShift(e.target.value)}>
              {SHIFT_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>Shift Tujuan / Pengganti</span>
            <select className={fieldClass} value={toShift} onChange={(e) => setToShift(e.target.value)}>
              {SHIFT_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>Rekan Tukar Shift (Opsional)</span>
            <select
              className={fieldClass}
              value={shiftPartnerUid}
              onChange={(e) => setShiftPartnerUid(e.target.value)}
            >
              <option value="">-- Tanpa rekan tertentu --</option>
              {coworkers.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>Alasan Pergantian Shift</span>
            <textarea
              required
              minLength={2}
              maxLength={500}
              rows={3}
              placeholder="Tuliskan alasan pergantian jadwal shift..."
              className={fieldClass}
              value={shiftReason}
              onChange={(e) => setShiftReason(e.target.value)}
            />
          </label>

          <div className="rounded-xl border border-amber-400/80 bg-amber-50/60 px-4 py-3.5 text-xs font-bold text-amber-900">
            Penyetuju: Admin Absensi
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
              {formError}
            </p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
            <div className="mx-auto flex max-w-md gap-3">
              <button
                type="button"
                onClick={openHistoryView}
                className="flex-1 rounded-xl bg-neutral-100 py-3 text-xs font-extrabold text-neutral-600 transition hover:bg-neutral-200"
              >
                Batalkan
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-extrabold text-neutral-950 shadow-sm transition hover:bg-amber-500 disabled:opacity-50"
              >
                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // LAYAR 3: RIWAYAT PERMOHONAN CUTI SAYA (Referensi SS 1)
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      {/* Header Atas */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <button
            type="button"
            aria-label="Kembali ke Beranda"
            onClick={() => navigate("/absensi")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            {historyTab === "cuti" ? "Permohonan Cuti" : "Pergantian Shift"}
          </h1>
          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
        {/* Baris Judul + Tombol "+" Bulat Kuning Khas (Referensi SS 1) */}
        <div className="flex items-center justify-between">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            {historyTab === "cuti" ? "Permohonan Cuti Saya" : "Pergantian Shift Saya"}
          </h2>
          <button
            type="button"
            aria-label={historyTab === "cuti" ? "Tambah Permohonan Cuti" : "Tambah Pergantian Shift"}
            onClick={() => (historyTab === "cuti" ? openCutiForm() : openShiftForm())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-neutral-950 shadow-sm transition hover:scale-105 hover:bg-amber-500"
          >
            <Plus className="h-5 w-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Tab Switcher Cuti vs Pergantian Shift */}
        <div className="flex gap-1.5 rounded-2xl border border-neutral-200/90 bg-white p-1">
          <button
            type="button"
            onClick={() => setHistoryTab("cuti")}
            className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition ${
              historyTab === "cuti"
                ? "bg-amber-400 text-neutral-950 shadow-2xs"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Permohonan Cuti
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("shift")}
            className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition ${
              historyTab === "shift"
                ? "bg-amber-400 text-neutral-950 shadow-2xs"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Pergantian Shift
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {groupedRequests === null && !error && (
          <p className="py-10 text-center text-sm text-neutral-400">Memuat riwayat permohonan...</p>
        )}

        {groupedRequests?.length === 0 && (
          <div className="rounded-3xl border border-neutral-200/80 bg-white px-6 py-12 text-center shadow-2xs">
            <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-800">
              {historyTab === "cuti" ? "Belum ada permohonan cuti" : "Belum ada pengajuan pergantian shift"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Ketuk tombol <strong>+</strong> di kanan atas untuk membuat permohonan baru.
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                onClick={() => (historyTab === "cuti" ? openCutiForm() : openShiftForm())}
              >
                {historyTab === "cuti" ? "+ Buat Permohonan Cuti" : "+ Ajukan Pergantian Shift"}
              </Button>
            </div>
          </div>
        )}

        {/* Daftar Riwayat Dikelompokkan per Periode (BULAN INI / BULAN LALU / PERMINTAAN LAMA) */}
        {groupedRequests &&
          groupedRequests.map((group) => {
            const isCollapsed = Boolean(collapsedSections[group.key]);
            return (
              <section key={group.key} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleSection(group.key)}
                  className="flex w-full items-center justify-between py-1 text-left"
                >
                  <span className="text-xs font-extrabold tracking-wider text-neutral-500 uppercase">
                    {group.title}
                  </span>
                  <span
                    className={`text-[10px] text-amber-600 transition-transform ${
                      isCollapsed ? "rotate-180" : ""
                    }`}
                  >
                    ▲
                  </span>
                </button>

                {!isCollapsed && (
                  <ul className="space-y-3">
                    {group.items.map((req) => {
                      const title =
                        req.kind === "pergantian_shift"
                          ? "Pergantian Shift"
                          : req.leaveSubtype || LEAVE_TYPE_LABEL[req.leaveType ?? "cuti"];
                      const dotColor =
                        req.status === "approved"
                          ? "bg-emerald-500"
                          : req.status === "rejected"
                            ? "bg-rose-500"
                            : "bg-amber-400";

                      return (
                        <li
                          key={req.id}
                          className="rounded-2xl border border-neutral-200/75 bg-white p-4 shadow-2xs"
                        >
                          {/* Baris Atas: Nama Jenis Cuti & Titik Status */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                              {title}
                            </h3>
                            <span
                              className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dotColor}`}
                              title={REQUEST_STATUS_LABEL[req.status]}
                            />
                          </div>

                          {/* Baris Tanggal */}
                          <p className="mt-1.5 text-xs font-medium text-neutral-500">
                            {req.kind === "pergantian_shift"
                              ? `Tanggal: ${formatHariTanggal(req.startDate)} (${req.fromShift} → ${req.toShift})`
                              : `Tanggal: ${formatRangeCardDate(req.startDate, req.endDate)}`}
                          </p>

                          {/* Baris Alasan (Italic seperti SS 1) */}
                          <p className="mt-1.5 text-xs italic text-neutral-500">
                            Alasan: {req.reason}
                          </p>

                          {(req.partnerName || req.attachmentName) && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                              {req.partnerName && (
                                <span className="rounded-lg bg-amber-50 px-2.5 py-0.5 text-amber-900">
                                  Pengganti: {req.partnerName}
                                </span>
                              )}
                              {req.attachmentName && (
                                <span className="rounded-lg bg-neutral-100 px-2.5 py-0.5 text-neutral-700">
                                  Lampiran: {req.attachmentName}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="my-3 border-t border-neutral-100" />

                          {/* Baris Status */}
                          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-600 text-[10px] font-bold text-white">
                              i
                            </span>
                            <span>Status: {REQUEST_STATUS_LABEL[req.status]}</span>
                          </div>

                          {req.reviewNote && (
                            <p className="mt-2 rounded-xl bg-amber-50/70 px-3 py-1.5 text-xs text-amber-950">
                              Catatan: "{req.reviewNote}"
                            </p>
                          )}

                          <div className="my-3 border-t border-neutral-100" />

                          {/* Footer: Penyetuju & Timestamp */}
                          <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500">
                            <span>Penyetuju: {req.reviewerName ?? "Admin Absensi"}</span>
                            <span>{formatFooterTime(req.reviewedAt ?? req.createdAt)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
      </main>

      <EmployeeBottomNav />
    </div>
  );
}
