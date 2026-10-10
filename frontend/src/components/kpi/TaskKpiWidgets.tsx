// ============================================================================
// Komponen tampilan KPI Task Super Admin
// Dipakai di Control Center (Super Admin) dan Performa Saya (tiap akun)
// ============================================================================

import { useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import type { AdHocTask } from "@/services/performanceService";
import {
  KPI_STATUS_LABEL, formatDeadline, formatDuration, formatWib, lateMinutes, taskKpiStatus, toMillis,
  type KpiAssessment, type KpiSummary, type TaskKpiStatus,
} from "@/utils/taskKpi";
import { KPI_STATUS_STYLE } from "@/components/kpi/kpiStyles";

const GRADE_STYLE: Record<KpiAssessment["grade"], string> = {
  A: "bg-emerald-50 border-emerald-200 text-emerald-800",
  B: "bg-blue-50 border-blue-200 text-blue-800",
  C: "bg-amber-50 border-amber-200 text-amber-800",
  D: "bg-red-50 border-red-200 text-red-800",
  "-": "bg-slate-50 border-slate-200 text-slate-700",
};

export function KpiStatusBadge({ status }: { status: TaskKpiStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${KPI_STATUS_STYLE[status].badge}`}>
      {KPI_STATUS_LABEL[status]}
    </span>
  );
}

/** Tiga kotak Proses / Terpenuhi / Terlambat dengan jumlah dan persen dari total task. */
export function KpiStatusTiles({ summary }: { summary: KpiSummary }) {
  const tiles: { key: TaskKpiStatus; n: number; pct: number }[] = [
    { key: "proses", n: summary.proses, pct: summary.pctProses },
    { key: "terpenuhi", n: summary.terpenuhi, pct: summary.pctTerpenuhi },
    { key: "terlambat", n: summary.terlambat, pct: summary.pctTerlambat },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <div key={t.key} className={`rounded-xl border px-3 py-2.5 text-center ${KPI_STATUS_STYLE[t.key].badge}`}>
          <p className="text-xl font-extrabold tabular-nums">{t.pct}%</p>
          <p className="text-[11px] font-bold">{KPI_STATUS_LABEL[t.key]} · {t.n}</p>
        </div>
      ))}
    </div>
  );
}

/** Bar bertumpuk Proses / Terpenuhi / Terlambat. */
export function KpiStackedBar({ summary }: { summary: KpiSummary }) {
  if (summary.total === 0) return <div className="h-1.5 w-full rounded-full bg-slate-100" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={KPI_STATUS_STYLE.terpenuhi.bar} style={{ width: `${summary.pctTerpenuhi}%` }} />
      <div className={KPI_STATUS_STYLE.terlambat.bar} style={{ width: `${summary.pctTerlambat}%` }} />
      <div className={KPI_STATUS_STYLE.proses.bar} style={{ width: `${summary.pctProses}%` }} />
    </div>
  );
}

/** Kartu penilaian KPI otomatis: nilai, grade, komponen, kesimpulan, rekomendasi. */
export function KpiAssessmentCard({ assessment, periode }: { assessment: KpiAssessment; periode: string }) {
  const a = assessment;
  return (
    <div className={`rounded-xl border p-5 ${GRADE_STYLE[a.grade]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Penilaian KPI · {periode}</p>
          <p className="mt-1 text-lg font-extrabold">{a.predikat}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-black tabular-nums leading-none">{a.nilai ?? "-"}</p>
          <p className="text-[11px] font-bold mt-1">Grade {a.grade}</p>
        </div>
      </div>
      {a.komponen.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {a.komponen.map((k) => (
            <div key={k.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold">{k.label} <span className="opacity-60">({Math.round(k.bobot * 100)}%)</span></span>
                <span className="font-bold tabular-nums">{k.skor}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                <div className="h-full rounded-full bg-current opacity-60" style={{ width: `${Math.max(2, k.skor)}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] opacity-70">{k.keterangan}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm leading-relaxed text-slate-700">{a.kesimpulan}</p>
      <p className="mt-2 text-sm leading-relaxed font-semibold">{a.rekomendasi}</p>
    </div>
  );
}

/** Daftar task dengan status KPI. `onSubmit` memunculkan tombol Submit untuk task yang belum disubmit. */
export function KpiTaskList({ tasks, now, onSubmit, emptyText }: {
  tasks: AdHocTask[]; now: number; onSubmit?: (task: AdHocTask) => void; emptyText: string;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  if (tasks.length === 0) return <p className="px-5 py-8 text-center text-sm text-slate-400">{emptyText}</p>;
  const sorted = [...tasks].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  return (
    <>
      <div className="divide-y divide-slate-100">
        {sorted.map((t) => {
          const status = taskKpiStatus(t, now);
          const submitted = toMillis(t.submittedAt);
          return (
            <div key={t.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                  {onSubmit && <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap">{t.instructions}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    Deadline {formatDeadline(t.deadline)}
                    {" · "}
                    {Number.isNaN(submitted) ? "Belum submit" : `Submit ${formatWib(submitted)}`}
                    {status === "terlambat" && <span className="font-semibold text-red-600"> · terlambat {formatDuration(lateMinutes(t, now))}</span>}
                  </p>
                  {t.evidenceNote && <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">📝 {t.evidenceNote}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {t.evidencePhoto && (
                      <button type="button" title="Lihat foto bukti" onClick={() => setPhoto(t.evidencePhoto!)}
                        className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 cursor-pointer">
                        <ImageIcon className="h-4 w-4" />
                      </button>
                    )}
                    <KpiStatusBadge status={status} />
                  </div>
                  {onSubmit && Number.isNaN(submitted) && (
                    <button type="button" onClick={() => onSubmit(t)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition-colors cursor-pointer">
                      Submit Selesai
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {photo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setPhoto(null)}>
          <div className="relative max-w-2xl w-full">
            <button type="button" onClick={() => setPhoto(null)} className="absolute -top-10 right-0 rounded-full bg-white/90 p-1.5 text-slate-700 cursor-pointer" aria-label="Tutup foto">
              <X className="h-5 w-5" />
            </button>
            <img src={photo} alt="Foto bukti task" className="w-full rounded-xl object-contain max-h-[80vh] bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
