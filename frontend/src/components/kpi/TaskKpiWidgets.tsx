// ============================================================================
// Komponen tampilan KPI Task Super Admin
// Dipakai di Control Center (Super Admin) dan Performa Saya (tiap akun)
// ============================================================================

import type { ReactNode } from "react";
import type { AdHocTask } from "@/services/performanceService";
import {
  KPI_STATUS_LABEL, formatDeadline, formatDuration, formatWib, lateMinutes, taskKpiStatus, toMillis,
  type KpiAssessment, type KpiSummary, type TaskKpiStatus,
} from "@/utils/taskKpi";
import { KPI_STATUS_STYLE, fmtNum, fmtPct } from "@/components/kpi/kpiStyles";

export function StatusPill({ status }: { status: TaskKpiStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${KPI_STATUS_STYLE[status].pill}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: KPI_STATUS_STYLE[status].dot }} />
      {KPI_STATUS_LABEL[status]}
    </span>
  );
}

/** Satu baris angka ringkas: Total · Proses · Terpenuhi · Terlambat · Ketepatan waktu. */
export function SummaryStrip({ summary, totalLabel = "Task" }: { summary: KpiSummary; totalLabel?: string }) {
  const items: { label: string; value: string; sub?: string; cls?: string }[] = [
    { label: totalLabel, value: String(summary.total) },
    { label: "Proses", value: String(summary.proses), sub: fmtPct(summary.pctProses), cls: KPI_STATUS_STYLE.proses.text },
    { label: "Terpenuhi", value: String(summary.terpenuhi), sub: fmtPct(summary.pctTerpenuhi), cls: KPI_STATUS_STYLE.terpenuhi.text },
    { label: "Terlambat", value: String(summary.terlambat), sub: fmtPct(summary.pctTerlambat), cls: KPI_STATUS_STYLE.terlambat.text },
    { label: "Ketepatan waktu", value: fmtPct(summary.ketepatanWaktu) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 rounded-xl border border-[#E5E7EB] bg-white divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB]">
      {items.map((it, i) => (
        <div key={it.label} className={`px-4 py-3 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
          <p className="text-xs text-[#6B7280]">{it.label}</p>
          <p className={`mt-0.5 text-xl font-bold tabular-nums ${it.cls ?? "text-[#111827]"}`}>
            {it.value}
            {it.sub && <span className="ml-1.5 text-xs font-medium text-[#9CA3AF]">{it.sub}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

const GRADE_TEXT: Record<KpiAssessment["grade"], string> = {
  A: "text-[#047857]", B: "text-[#1D4ED8]", C: "text-[#B45309]", D: "text-[#B91C1C]", "-": "text-[#6B7280]",
};

/** Penilaian KPI otomatis: nilai, grade, komponen, kesimpulan, rekomendasi. */
export function AssessmentPanel({ assessment, periode }: { assessment: KpiAssessment; periode: string }) {
  const a = assessment;
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white">
      <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-[#F3F4F6]">
        <div>
          <h3 className="text-sm font-semibold text-[#111827]">Penilaian KPI</h3>
          <p className="text-xs text-[#6B7280]">{periode}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tabular-nums leading-none ${GRADE_TEXT[a.grade]}`}>{fmtNum(a.nilai)}</p>
          <p className={`mt-1 text-xs font-semibold ${GRADE_TEXT[a.grade]}`}>{a.grade === "-" ? a.predikat : `${a.grade} · ${a.predikat}`}</p>
        </div>
      </div>
      {a.komponen.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {a.komponen.map((k) => (
              <tr key={k.label} className="border-b border-[#F3F4F6]">
                <td className="px-4 py-2">
                  <p className="text-[#111827]">{k.label} <span className="text-xs text-[#9CA3AF]">bobot {Math.round(k.bobot * 100)}%</span></p>
                  <p className="text-xs text-[#6B7280]">{k.keterangan}</p>
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-[#111827] align-top">{fmtNum(k.skor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="px-4 py-3 space-y-2 text-sm leading-relaxed">
        <p className="text-[#374151]">{a.kesimpulan}</p>
        <p className="text-[#111827]"><span className="font-semibold">Rekomendasi:</span> {a.rekomendasi}</p>
      </div>
    </section>
  );
}

/** Detail lengkap satu task (isi panel samping). */
export function TaskDetail({ task, now, assigneeName }: { task: AdHocTask; now: number; assigneeName?: string }) {
  const status = taskKpiStatus(task, now);
  const submitted = toMillis(task.submittedAt);
  const rows: [string, ReactNode][] = [
    ...(assigneeName ? [["Untuk", assigneeName] as [string, ReactNode]] : []),
    ["Status", <StatusPill status={status} />],
    ["Deadline", formatDeadline(task.deadline)],
    ["Disubmit", Number.isNaN(submitted) ? "Belum submit" : formatWib(submitted)],
    ...(status === "terlambat" ? [["Terlambat", formatDuration(lateMinutes(task, now))] as [string, ReactNode]] : []),
    ["Dibuat", formatWib(toMillis(task.createdAt))],
  ];
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid grid-cols-[110px_1fr] gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#6B7280]">{k}</dt>
            <dd className="text-[#111827]">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h4 className="text-xs font-semibold text-[#6B7280] mb-1">Instruksi</h4>
        <p className="whitespace-pre-wrap text-[#111827]">{task.instructions}</p>
      </div>
      {task.evidenceNote && (
        <div>
          <h4 className="text-xs font-semibold text-[#6B7280] mb-1">Keterangan pekerjaan</h4>
          <p className="whitespace-pre-wrap text-[#111827]">{task.evidenceNote}</p>
        </div>
      )}
      {task.evidencePhoto && (
        <div>
          <h4 className="text-xs font-semibold text-[#6B7280] mb-1">Foto bukti</h4>
          <img src={task.evidencePhoto} alt="Foto bukti" className="w-full rounded-lg border border-[#E5E7EB] object-contain max-h-80 bg-[#F9FAFB]" />
        </div>
      )}
    </div>
  );
}
