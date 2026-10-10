import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, ClipboardList, History, Send, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AdHocTask,
  type RoleAssignment,
  subscribeMyAdHocTasks,
  subscribeRoleAssignments,
  submitAdHocTask,
} from "@/services/performanceService";
import { compressImageBase64 } from "@/services/mbgDeliveryService";
import { KpiAssessmentCard, KpiStatusTiles, KpiTaskList } from "@/components/kpi/TaskKpiWidgets";
import { useNow } from "@/hooks/useNow";
import { getJakartaDate } from "@/utils/date";
import {
  assessKpi, deadlineMillis, formatDeadline, isSubmitted, monthLabel, summarizeTasks, taskMonthKey,
} from "@/utils/taskKpi";

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error("Gagal membaca foto."));
  reader.readAsDataURL(file);
});

export function PerformancePage() {
  const { user, profile } = useAuth();
  const now = useNow();
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [month, setMonth] = useState(() => getJakartaDate().slice(0, 7));
  const [selectedTask, setSelectedTask] = useState<AdHocTask | null>(null);
  const [evidence, setEvidence] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const cleanups = [subscribeMyAdHocTasks(user.uid, setTasks), subscribeRoleAssignments(user.uid, setRoles)];
    return () => cleanups.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const name = profile?.displayName || "Tim Al Umana";
  const periode = monthLabel(month);
  const monthTasks = useMemo(() => tasks.filter((t) => taskMonthKey(t) === month), [tasks, month]);
  const openTasks = useMemo(() => tasks.filter((t) => !isSubmitted(t) && taskMonthKey(t) !== null), [tasks]);
  const summary = useMemo(() => summarizeTasks(monthTasks, now), [monthTasks, now]);
  const assessment = useMemo(() => assessKpi(summary, name, periode), [summary, name, periode]);

  const closeModal = () => { setSelectedTask(null); setEvidence(""); setPhoto(null); setError(""); };

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    try { setPhoto(await compressImageBase64(await readAsDataUrl(file), 1024, 1024, 0.7)); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal memproses foto."); }
  };

  const submit = async () => {
    if (!selectedTask || !evidence.trim()) return;
    setSaving(true);
    try { await submitAdHocTask(selectedTask.id, evidence.trim(), photo ?? undefined); closeModal(); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal submit task."); }
    finally { setSaving(false); }
  };

  const selectedLate = selectedTask ? now > deadlineMillis(selectedTask.deadline) : false;

  return <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
    <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-slate-700 text-white p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-amber-400 text-xs font-bold tracking-widest">PERFORMA SAYA</p>
          <h1 className="text-2xl md:text-3xl font-black mt-1">Halo, {name}</h1>
          <p className="text-slate-300 text-sm mt-1">KPI dihitung dari ketepatan waktu submit task dari Super Admin.</p>
        </div>
        <label className="text-xs text-slate-300">
          <span className="block mb-1 font-semibold">Periode</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white [color-scheme:dark]" />
        </label>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div><p className="text-slate-400 text-xs">KETEPATAN WAKTU</p><p className="text-3xl font-black tabular-nums">{summary.ketepatanWaktu == null ? "-" : `${summary.ketepatanWaktu}%`}</p></div>
        <div><p className="text-slate-400 text-xs">NILAI KPI</p><p className="text-3xl font-black tabular-nums">{assessment.nilai ?? "-"} <span className="text-base font-bold text-amber-400">{assessment.grade !== "-" && assessment.grade}</span></p></div>
        <div><p className="text-slate-400 text-xs">TASK {periode.toUpperCase()}</p><p className="text-3xl font-black tabular-nums">{summary.total}</p></div>
      </div>
    </section>

    {openTasks.length > 0 && (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-amber-200">
          <h2 className="font-black flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /> Task Belum Disubmit ({openTasks.length})</h2>
          <p className="text-xs text-amber-800 mt-0.5">Submit sebelum deadline supaya dihitung Terpenuhi. Lewat deadline tetap bisa submit, tapi dihitung Terlambat.</p>
        </div>
        <div className="bg-white">
          <KpiTaskList tasks={openTasks} now={now} onSubmit={(t) => setSelectedTask(t)} emptyText="" />
        </div>
      </section>
    )}

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <KpiStatusTiles summary={summary} />
        <KpiAssessmentCard assessment={assessment} periode={periode} />
      </div>
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="font-black flex gap-2"><ClipboardList /> Task {periode}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Task dari Super Admin dengan deadline di bulan ini.</p>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          <KpiTaskList tasks={monthTasks} now={now} onSubmit={(t) => setSelectedTask(t)} emptyText={`Belum ada task dari Super Admin untuk ${periode}.`} />
        </div>
      </div>
    </section>

    <section className="rounded-2xl border bg-white p-5"><h2 className="font-black flex gap-2"><History /> Riwayat Role</h2><div className="mt-4 grid md:grid-cols-2 gap-3">{roles.length ? roles.map((role) => <div key={role.id} className="rounded-xl bg-slate-50 p-3"><b>{role.role}</b><p className="text-sm text-slate-500">{role.division} · {role.status === "active" ? "Role aktif" : "Role sebelumnya"}</p></div>) : <p className="text-sm text-slate-400">Riwayat role akan mulai tercatat saat role diubah lewat Control Center.</p>}</div></section>

    {selectedTask && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-black text-xl">{selectedTask.title}</h2>
          <button type="button" onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-2 text-slate-600 whitespace-pre-wrap">{selectedTask.instructions}</p>
        <p className={`mt-3 text-sm font-semibold ${selectedLate ? "text-red-600" : "text-slate-700"}`}>
          Deadline: {formatDeadline(selectedTask.deadline)}{selectedLate && " — sudah lewat, submit sekarang akan dihitung Terlambat"}
        </p>

        <label className="mt-4 block text-sm font-bold text-slate-800">Keterangan pekerjaan <span className="text-red-500">*</span></label>
        <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm" rows={4} placeholder="Jelaskan apa yang sudah dikerjakan (boleh sertakan link)..." />

        <p className="mt-3 text-sm font-bold text-slate-800">Foto bukti <span className="font-normal text-slate-400">(opsional)</span></p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        {photo ? (
          <div className="mt-1 relative">
            <img src={photo} alt="Foto bukti" className="w-full max-h-56 object-contain rounded-xl border bg-slate-50" />
            <button type="button" onClick={() => setPhoto(null)} className="absolute top-2 right-2 rounded-lg bg-white/90 p-1.5 text-red-600 shadow cursor-pointer" aria-label="Hapus foto"><Trash2 className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
            <Camera className="inline h-4 mr-1" /> Ambil / Pilih Foto
          </button>
        )}

        {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}
        <p className="mt-3 text-xs text-slate-500">Submit bersifat final dan tidak bisa diubah. Waktu submit dicatat otomatis dari server.</p>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={saving || !evidence.trim()} onClick={submit} className="rounded-xl bg-slate-900 px-4 py-2 text-white font-bold disabled:opacity-40 cursor-pointer"><Send className="inline h-4" /> {saving ? "Mengirim..." : "Submit Selesai"}</button>
          <button type="button" onClick={closeModal} className="text-sm font-bold text-slate-500 cursor-pointer">Batal</button>
        </div>
      </div>
    </div>}
  </div>;
}
