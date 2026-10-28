import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { listAdminRequests, reviewAdminRequest } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { errorMessage } from "@/absensi/errorMessage";
import {
  LEAVE_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  formatLogWaktu,
  formatTanggalPanjang,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, RequestStatus } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const STATUS_BADGE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border border-rose-200",
};

/** Tab Admin untuk menyetujui atau menolak Permohonan Cuti dan Pergantian Shift karyawan. */
export function PersetujuanTab() {
  const { reloadMe } = useAbsensiSession();
  const [filter, setFilter] = useState<RequestStatus | "all">("pending");
  const [requests, setRequests] = useState<AbsensiRequestView[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (nextFilter: RequestStatus | "all") => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminRequests(nextFilter);
      setRequests(res.requests);
      setPendingCount(res.pendingCount);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const handleReview = async (req: AbsensiRequestView, action: "approve" | "reject") => {
    setBusyId(req.id);
    setError(null);
    try {
      await reviewAdminRequest(req.id, { action, note: notes[req.id]?.trim() || undefined });
      await load(filter);
      await reloadMe();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Persetujuan Cuti & Pergantian Shift
          </h2>
          <p className="text-xs font-medium text-neutral-500">
            {pendingCount > 0 ? `${pendingCount} pengajuan menunggu persetujuan` : "Tidak ada pengajuan tertunda"}
          </p>
        </div>
        <Button variant="outlined" size="sm" loading={loading} onClick={() => void load(filter)}>
          Muat ulang
        </Button>
      </div>

      {/* Filter Status */}
      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1.5">
        {([
          ["pending", "Menunggu"],
          ["approved", "Disetujui"],
          ["rejected", "Ditolak"],
          ["all", "Semua"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition ${
              filter === key ? "bg-amber-400 text-neutral-900 shadow-2xs" : "text-neutral-600 hover:bg-amber-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {requests === null && !error && (
        <p className="py-10 text-center text-sm text-neutral-500">Memuat pengajuan...</p>
      )}

      {requests?.length === 0 && (
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-10 text-center">
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-neutral-800">
            Tidak ada data pengajuan pada kategori ini
          </p>
        </div>
      )}

      {requests && requests.length > 0 && (
        <ul className="space-y-3">
          {requests.map((req) => {
            const busy = busyId === req.id;
            return (
              <li key={req.id} className="space-y-3 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                        {req.employeeName}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">
                        {req.kind === "pergantian_shift"
                          ? "Pergantian Shift"
                          : req.leaveSubtype || `Permohonan ${LEAVE_TYPE_LABEL[req.leaveType ?? "cuti"]}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-neutral-600">
                      {req.startDate === req.endDate
                        ? formatTanggalPanjang(req.startDate)
                        : `${formatTanggalPanjang(req.startDate)} – ${formatTanggalPanjang(req.endDate)}`}
                    </p>
                  </div>

                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[req.status]}`}>
                    {REQUEST_STATUS_LABEL[req.status]}
                  </span>
                </div>

                {req.kind === "pergantian_shift" ? (
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5 text-xs font-semibold text-amber-950">
                    <p>{req.fromShift} → {req.toShift}</p>
                    {req.partnerName && (
                      <p className="mt-0.5 text-amber-800">Rekan pengganti: {req.partnerName}</p>
                    )}
                  </div>
                ) : (
                  (req.partnerName || req.attachmentName) && (
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {req.partnerName && (
                        <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-amber-900">
                          Karyawan pengganti: {req.partnerName}
                        </span>
                      )}
                      {req.attachmentName && (
                        <span className="rounded-xl bg-neutral-100 px-3 py-1.5 text-neutral-700">
                          Dokumen pendukung: {req.attachmentName}
                        </span>
                      )}
                    </div>
                  )
                )}

                <p className="rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-700">
                  <span className="font-bold text-neutral-900">Alasan:</span> "{req.reason}"
                </p>

                {req.status === "pending" ? (
                  <div className="space-y-2.5 pt-1">
                    <input
                      type="text"
                      maxLength={300}
                      placeholder="Catatan persetujuan / penolakan (opsional)..."
                      value={notes[req.id] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={busy}
                        leftIcon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => void handleReview(req, "approve")}
                      >
                        Setujui
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        leftIcon={<X className="h-3.5 w-3.5" />}
                        onClick={() => void handleReview(req, "reject")}
                      >
                        Tolak
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                    <span>
                      Diproses oleh <strong className="text-neutral-700">{req.reviewerName ?? "Admin"}</strong>
                      {req.reviewedAt ? ` · ${formatLogWaktu(req.reviewedAt)}` : ""}
                    </span>
                    {req.reviewNote && (
                      <span className="italic text-neutral-600">Catatan: "{req.reviewNote}"</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

