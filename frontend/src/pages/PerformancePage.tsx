import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  type AdHocTask,
  type RoleAssignment,
  subscribeMyAdHocTasks,
  subscribeRoleAssignments,
  submitAdHocTask,
  uploadEvidenceOriginal,
} from "@/services/performanceService";
import { EVIDENCE_ORIGINAL_MAX_BYTES, formatBytes, prepareEvidencePhoto, type EvidencePhoto } from "@/utils/evidencePhoto";
import { AssessmentPanel, StatusPill, SummaryStrip, TaskDetail } from "@/components/kpi/TaskKpiWidgets";
import { SidePanel } from "@/components/ui/SidePanel";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { roleLabel } from "@/components/kpi/kpiStyles";
import { useNow } from "@/hooks/useNow";
import { getJakartaDate } from "@/utils/date";
import { personName } from "@/utils/personName";
import { useEscapeLayer } from "@/hooks/useEscapeLayer";
import {
  assessKpi, deadlineMillis, formatDeadline, formatDuration, isSubmitted, monthLabel, summarizeTasks, taskKpiStatus, taskMonthKey,
} from "@/utils/taskKpi";

const inputCls = "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";

/** "sisa 2 jam 15 menit" / "lewat 3 jam" */
function timeLeft(task: AdHocTask, now: number) {
  const diff = Math.round((deadlineMillis(task.deadline) - now) / 60000);
  return diff > 0
    ? { text: `sisa ${formatDuration(diff)}`, late: false, urgent: diff <= 24 * 60 }
    : { text: `lewat ${formatDuration(-diff)}`, late: true, urgent: true };
}

export function PerformancePage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const now = useNow();
  const today = getJakartaDate();
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [submitTask, setSubmitTask] = useState<AdHocTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [photo, setPhoto] = useState<EvidencePhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** 0–1 selama foto asli diunggah, null kalau tidak sedang mengunggah */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const cleanups = [subscribeMyAdHocTasks(user.uid, setTasks), subscribeRoleAssignments(user.uid, setRoles)];
    return () => cleanups.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const name = profile ? personName(profile) : "Tim Al Umana";
  const periode = monthLabel(month);
  const monthTasks = useMemo(() => tasks.filter((t) => taskMonthKey(t) === month).sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")), [tasks, month]);
  const openTasks = useMemo(() => tasks.filter((t) => !isSubmitted(t) && taskMonthKey(t) !== null).sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")), [tasks]);
  const summary = useMemo(() => summarizeTasks(monthTasks, now), [monthTasks, now]);
  const assessment = useMemo(() => assessKpi(summary, name, periode), [summary, name, periode]);
  const detailTask = useMemo(() => tasks.find((t) => t.id === detailTaskId) ?? null, [tasks, detailTaskId]);

  const closeSubmit = () => { setSubmitTask(null); setEvidence(""); setPhoto(null); setError(""); };
  useEscapeLayer(!!submitTask, () => { if (!saving) closeSubmit(); });

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try { setPhoto(await prepareEvidencePhoto(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal memproses foto."); }
    finally { setPhotoBusy(false); }
  };

  const submit = async () => {
    if (!submitTask || !evidence.trim() || photoBusy) return;
    if (photo && !navigator.onLine) {
      setError("Sedang offline. Foto asli butuh koneksi untuk diunggah — coba lagi setelah online.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let original;
      if (photo) {
        setUploadProgress(0);
        original = await uploadEvidenceOriginal(submitTask.id, photo.file, setUploadProgress);
      }
      await submitAdHocTask(submitTask.id, evidence.trim(), photo?.dataUrl, original);
      showToast({ message: `"${submitTask.title}" sudah disubmit`, variant: "success" });
      closeSubmit();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal submit task."); }
    finally { setSaving(false); setUploadProgress(null); }
  };

  const submitLate = submitTask ? now > deadlineMillis(submitTask.deadline) : false;

  return <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 space-y-6 font-['Hanken_Grotesk',system-ui,sans-serif]">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-[#111827]">Performa Saya</h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">Halo, {name}. KPI kamu dihitung dari ketepatan waktu submit task dari Super Admin.</p>
      </div>
      <PeriodSelect value={month} onChange={setMonth} today={today} />
    </header>

    {/* Perlu dikerjakan */}
    <section>
      <h2 className="mb-2 text-sm font-semibold text-[#111827]">Perlu dikerjakan <span className="ml-1 text-xs font-medium text-[#9CA3AF]">{openTasks.length}</span></h2>
      {openTasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E7EB] bg-white px-4 py-6 text-center text-sm text-[#6B7280]">Tidak ada task yang perlu dikerjakan.</p>
      ) : (
        <ul className="divide-y divide-[#F3F4F6] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          {openTasks.map((t) => {
            const left = timeLeft(t, now);
            return (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => setDetailTaskId(t.id)} className="min-w-0 text-left cursor-pointer">
                  <p className="text-sm font-semibold text-[#111827]">{t.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-[#6B7280]">{t.instructions}</p>
                  <p className="mt-1 text-xs">
                    <span className="text-[#374151]">Deadline {formatDeadline(t.deadline)}</span>
                    <span className={`ml-2 font-semibold ${left.late ? "text-[#B91C1C]" : left.urgent ? "text-[#B45309]" : "text-[#6B7280]"}`}>{left.text}</span>
                  </p>
                </button>
                <button type="button" onClick={() => setSubmitTask(t)}
                  className="shrink-0 rounded-lg bg-[#FBBF24] px-4 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] cursor-pointer">
                  Submit
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>

    {/* Rekap bulan */}
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[#111827]">Rekap {periode}</h2>
      <SummaryStrip summary={summary} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AssessmentPanel assessment={assessment} periode={periode} />
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#F3F4F6] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#111827]">Task {periode}</h3>
          </div>
          {monthTasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#6B7280]">Belum ada task dari Super Admin untuk {periode}.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-[#F3F4F6] overflow-y-auto">
              {monthTasks.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setDetailTaskId(t.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#F9FAFB] cursor-pointer">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#111827]">{t.title}</span>
                      <span className="block text-xs text-[#6B7280]">Deadline {formatDeadline(t.deadline)}</span>
                    </span>
                    <StatusPill status={taskKpiStatus(t, now)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>

    {roles.length > 0 && (
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[#111827]">Riwayat role</h2>
        <ul className="divide-y divide-[#F3F4F6] rounded-xl border border-[#E5E7EB] bg-white">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-[#111827]">{roleLabel(role.role)}</span>
              <span className={role.status === "active" ? "font-semibold text-[#047857]" : "text-[#6B7280]"}>{role.status === "active" ? "Aktif" : "Sebelumnya"}</span>
            </li>
          ))}
        </ul>
      </section>
    )}

    {/* Detail task */}
    <SidePanel open={!!detailTask} onClose={() => setDetailTaskId(null)} title={detailTask?.title ?? ""}
      footer={detailTask && !isSubmitted(detailTask) && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setSubmitTask(detailTask); setDetailTaskId(null); }}
            className="rounded-lg bg-[#FBBF24] px-4 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] cursor-pointer">Submit</button>
        </div>
      )}>
      {detailTask && <TaskDetail task={detailTask} now={now} />}
    </SidePanel>

    {/* Submit */}
    {submitTask && <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Submit task" className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#111827]">Submit task</h2>
            <p className="text-sm text-[#6B7280] truncate">{submitTask.title}</p>
          </div>
          <button type="button" onClick={closeSubmit} aria-label="Tutup" className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] cursor-pointer"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <p className={`rounded-lg px-3 py-2 text-sm ${submitLate ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-[#F9FAFB] text-[#374151]"}`}>
            Deadline {formatDeadline(submitTask.deadline)}
            {submitLate ? " — sudah lewat, submit sekarang dihitung Terlambat." : ` — ${timeLeft(submitTask, now).text}.`}
          </p>

          <label className="block">
            <span className="text-sm font-medium text-[#374151]">Keterangan pekerjaan <span className="text-[#B91C1C]">*</span></span>
            <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={4}
              className={`${inputCls} mt-1 resize-none`} placeholder="Jelaskan apa yang sudah dikerjakan (boleh sertakan link)" />
          </label>

          <div>
            <span className="text-sm font-medium text-[#374151]">Foto bukti <span className="font-normal text-[#9CA3AF]">(opsional, maks {formatBytes(EVIDENCE_ORIGINAL_MAX_BYTES)}, disimpan utuh)</span></span>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {photo ? (
              <div className="mt-1">
                <div className="relative">
                  <img src={photo.dataUrl} alt="Foto bukti" className="w-full max-h-56 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] object-contain" />
                  <button type="button" onClick={() => setPhoto(null)} disabled={saving} aria-label="Hapus foto" className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-[#B91C1C] shadow cursor-pointer disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
                <p className="mt-1 text-xs text-[#6B7280]">Foto asli {formatBytes(photo.originalBytes)} akan diunggah utuh saat submit.</p>
                {uploadProgress !== null && (
                  <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress * 100)}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                      <div className="h-full bg-[#FBBF24] transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">Mengunggah foto… {Math.round(uploadProgress * 100)}%</p>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#D1D5DB] py-3 text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-60 cursor-pointer">
                <Camera className="h-4 w-4" /> {photoBusy ? "Memproses foto…" : "Ambil atau pilih foto"}
              </button>
            )}
          </div>

          {error && <p className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</p>}
          <p className="text-xs text-[#6B7280]">Submit bersifat final. Waktu submit dicatat otomatis dari server.</p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[#E5E7EB] px-5 py-3">
          <button type="button" onClick={closeSubmit} className="rounded-lg px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6] cursor-pointer">Batal</button>
          <button type="button" disabled={saving || photoBusy || !evidence.trim()} onClick={submit}
            className="rounded-lg bg-[#FBBF24] px-4 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {uploadProgress !== null ? `Mengunggah ${Math.round(uploadProgress * 100)}%…` : saving ? "Mengirim…" : "Submit Selesai"}
          </button>
        </footer>
      </div>
    </div>}
  </div>;
}
