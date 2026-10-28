import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarPlus, RefreshCcw, X } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { createRequest, getRekan, listMyRequests } from "@/absensi/api";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { errorMessage } from "@/absensi/errorMessage";
import {
  LEAVE_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  formatLogWaktu,
  formatTanggalPanjang,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, CoworkerView, LeaveType, RequestStatus } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const SHIFT_PRESETS = [
  "Shift Pagi (07:00 - 15:00)",
  "Shift Siang (15:00 - 23:00)",
  "Shift Malam (23:00 - 07:00)",
  "Shift Reguler (08:00 - 17:00)",
];

const STATUS_BADGE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border border-rose-200",
};

const fieldClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";
const labelClass = "block space-y-1 text-xs font-bold text-neutral-700";

/** Halaman karyawan: ajukan Permohonan Cuti / Pergantian Shift dan pantau status persetujuan Admin. */
export function PengajuanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialForm = searchParams.get("buat");
  const [activeModal, setActiveModal] = useState<"cuti" | "shift" | null>(
    initialForm === "cuti" || initialForm === "shift" ? initialForm : null,
  );
  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  const [requests, setRequests] = useState<AbsensiRequestView[] | null>(null);
  const [coworkers, setCoworkers] = useState<CoworkerView[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form Permohonan Cuti
  const today = workDateWIB(Date.now());
  const [leaveType, setLeaveType] = useState<LeaveType>("cuti");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [leaveReason, setLeaveReason] = useState("");

  // Form Pergantian Shift
  const [shiftDate, setShiftDate] = useState(today);
  const [fromShift, setFromShift] = useState(SHIFT_PRESETS[0]);
  const [toShift, setToShift] = useState(SHIFT_PRESETS[1]);
  const [partnerUid, setPartnerUid] = useState("");
  const [shiftReason, setShiftReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get("buat");
    if (param === "cuti" || param === "shift") {
      setActiveModal(param);
    }
  }, [searchParams]);

  const closeModal = () => {
    setActiveModal(null);
    setFormError(null);
    if (searchParams.has("buat")) {
      const next = new URLSearchParams(searchParams);
      next.delete("buat");
      setSearchParams(next, { replace: true });
    }
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

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (startDate > endDate) {
      setFormError("Tanggal mulai harus sebelum atau sama dengan tanggal selesai.");
      return;
    }
    setSubmitting(true);
    try {
      await createRequest({
        kind: "cuti",
        leaveType,
        startDate,
        endDate,
        reason: leaveReason.trim(),
      });
      setLeaveReason("");
      closeModal();
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
        partnerUid: partnerUid || undefined,
        reason: shiftReason.trim(),
      });
      setShiftReason("");
      setPartnerUid("");
      closeModal();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = requests?.filter((r) => (filter === "all" ? true : r.status === filter)) ?? null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            Pengajuan & Persetujuan
          </h1>
          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
        {/* Tombol Buat Pengajuan */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setActiveModal("cuti")}
            className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white p-3.5 text-left shadow-2xs transition hover:border-amber-400 hover:bg-amber-50/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-neutral-900">
                Permohonan Cuti
              </p>
              <p className="text-[11px] text-neutral-500">Cuti, Sakit, atau Izin</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("shift")}
            className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white p-3.5 text-left shadow-2xs transition hover:border-amber-400 hover:bg-amber-50/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <RefreshCcw className="h-5 w-5" />
            </div>
            <div>
              <p className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-neutral-900">
                Pergantian Shift
              </p>
              <p className="text-[11px] text-neutral-500">Tukar / ubah jadwal</p>
            </div>
          </button>
        </div>

        {/* Filter Status */}
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1">
          {([
            ["all", "Semua"],
            ["pending", "Menunggu"],
            ["approved", "Disetujui"],
            ["rejected", "Ditolak"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex-1 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filter === key ? "bg-amber-400 text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {filtered === null && !error && (
          <p className="py-10 text-center text-sm text-neutral-400">Memuat daftar pengajuan...</p>
        )}
        {filtered?.length === 0 && (
          <div className="rounded-3xl border border-neutral-200/80 bg-white px-6 py-12 text-center">
            <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-neutral-800">
              Belum ada pengajuan
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Ketuk tombol Permohonan Cuti atau Pergantian Shift di atas untuk membuat pengajuan baru.
            </p>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((req) => (
              <li key={req.id} className="rounded-3xl border border-neutral-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-extrabold tracking-wide text-amber-700 uppercase">
                      {req.kind === "pergantian_shift"
                        ? "Pergantian Shift"
                        : `Permohonan ${LEAVE_TYPE_LABEL[req.leaveType ?? "cuti"]}`}
                    </span>
                    <p className="mt-0.5 font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">
                      {req.startDate === req.endDate
                        ? formatTanggalPanjang(req.startDate)
                        : `${formatTanggalPanjang(req.startDate)} – ${formatTanggalPanjang(req.endDate)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_BADGE[req.status]}`}>
                    {REQUEST_STATUS_LABEL[req.status]}
                  </span>
                </div>

                {req.kind === "pergantian_shift" && (
                  <div className="mt-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-950">
                    <p>{req.fromShift} → {req.toShift}</p>
                    {req.partnerName && <p className="mt-0.5 text-[11px] text-amber-800">Rekan pengganti: {req.partnerName}</p>}
                  </div>
                )}

                <p className="mt-2 text-xs text-neutral-600">Alasan: "{req.reason}"</p>

                {req.reviewNote && (
                  <p className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                    <span className="font-bold">Catatan Admin ({req.reviewerName ?? "Admin"}):</span> {req.reviewNote}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-neutral-400">
                  Diajukan {formatLogWaktu(req.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Modal Form Permohonan Cuti */}
      {activeModal === "cuti" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Form Permohonan Cuti"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={closeModal}
        >
          <form
            onSubmit={submitLeave}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3.5 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Ajukan Permohonan Cuti / Izin
              </h2>
              <button type="button" onClick={closeModal} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className={labelClass}>
              <span>Kategori</span>
              <select className={fieldClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                <option value="cuti">Cuti</option>
                <option value="sakit">Sakit</option>
                <option value="izin">Izin Keperluan</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                <span>Dari Tanggal</span>
                <input
                  type="date"
                  required
                  className={fieldClass}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </label>
              <label className={labelClass}>
                <span>Sampai Tanggal</span>
                <input
                  type="date"
                  required
                  className={fieldClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>

            <label className={labelClass}>
              <span>Alasan / Keterangan</span>
              <textarea
                required
                minLength={2}
                maxLength={500}
                rows={3}
                placeholder="Tuliskan keterangan permohonan..."
                className={fieldClass}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
              />
            </label>

            {formError && <p role="alert" className="text-xs font-semibold text-rose-600">{formError}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outlined" className="flex-1" onClick={closeModal}>
                Batal
              </Button>
              <Button type="submit" variant="primary" className="flex-1" loading={submitting}>
                Kirim Pengajuan
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Form Pergantian Shift */}
      {activeModal === "shift" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Form Pergantian Shift"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={closeModal}
        >
          <form
            onSubmit={submitShiftSwap}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3.5 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Ajukan Pergantian Shift
              </h2>
              <button type="button" onClick={closeModal} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100">
                <X className="h-4 w-4" />
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
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              <span>Shift Tujuan / Pengganti</span>
              <select className={fieldClass} value={toShift} onChange={(e) => setToShift(e.target.value)}>
                {SHIFT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              <span>Rekan Tukar Shift (Opsional)</span>
              <select className={fieldClass} value={partnerUid} onChange={(e) => setPartnerUid(e.target.value)}>
                <option value="">-- Tanpa rekan tertentu --</option>
                {coworkers.map((c) => (
                  <option key={c.uid} value={c.uid}>{c.name}</option>
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

            {formError && <p role="alert" className="text-xs font-semibold text-rose-600">{formError}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outlined" className="flex-1" onClick={closeModal}>
                Batal
              </Button>
              <Button type="submit" variant="primary" className="flex-1" loading={submitting}>
                Kirim Pengajuan
              </Button>
            </div>
          </form>
        </div>
      )}

      <EmployeeBottomNav />
    </div>
  );
}

