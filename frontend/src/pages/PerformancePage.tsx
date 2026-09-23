import { useEffect, useState } from "react";
import { ClipboardList, Sparkles, History, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AdHocTask,
  type PerformanceActivity,
  type RoleAssignment,
  subscribeMyActivities,
  subscribeMyAdHocTasks,
  subscribeRoleAssignments,
  submitAdHocTask,
} from "@/services/performanceService";

const taskLabels: Record<AdHocTask["status"], string> = {
  pending: "Belum dikerjakan", in_progress: "Sedang dikerjakan", pending_review: "Menunggu review", revision_required: "Perlu revisi", approved: "Disetujui",
};

export function PerformancePage() {
  const { user, profile } = useAuth();
  const [activities, setActivities] = useState<PerformanceActivity[]>([]);
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [selectedTask, setSelectedTask] = useState<AdHocTask | null>(null);
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const cleanups = [subscribeMyActivities(user.uid, setActivities), subscribeMyAdHocTasks(user.uid, setTasks), subscribeRoleAssignments(user.uid, setRoles)];
    return () => cleanups.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const xp = activities.reduce((total, activity) => total + (activity.xp ?? (activity.sourceType === "ad_hoc_task" ? 25 : 10)), 0);
  const level = Math.floor(xp / 100) + 1;
  const submit = async () => {
    if (!selectedTask || !evidence.trim()) return;
    setSaving(true);
    try { await submitAdHocTask(selectedTask.id, evidence.trim()); setSelectedTask(null); setEvidence(""); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Gagal mengirim task untuk review."); }
    finally { setSaving(false); }
  };

  return <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    <section className="rounded-3xl bg-gradient-to-r from-indigo-950 to-violet-700 text-white p-6 md:p-8">
      <p className="text-indigo-200 text-sm font-bold">PERFORMA SAYA</p>
      <h1 className="text-3xl font-black mt-1">Halo, {profile?.displayName || "Tim Al Umana"}</h1>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div><p className="text-indigo-200 text-xs">LEVEL</p><p className="text-3xl font-black">{level}</p></div>
        <div><p className="text-indigo-200 text-xs">XP</p><p className="text-3xl font-black">{xp}</p></div>
        <div><p className="text-indigo-200 text-xs">TUGAS VALID</p><p className="text-3xl font-black">{activities.length}</p></div>
      </div>
    </section>

    <section className="grid md:grid-cols-2 gap-5">
      <div className="rounded-2xl border bg-white p-5"><h2 className="font-black flex gap-2"><ClipboardList /> Tugas Rutin</h2><p className="text-sm text-slate-500 mt-1">Hasil task rutin yang sudah disetujui CO-MO.</p>
        <div className="mt-4 space-y-2">{activities.length ? activities.map((item) => <div key={item.id} className="rounded-xl bg-emerald-50 p-3 text-sm"><b>{item.title}</b><p className="text-emerald-700">{item.roleSnapshot} · {item.divisionSnapshot}</p></div>) : <p className="text-sm text-slate-400">Belum ada task rutin yang tervalidasi.</p>}</div>
      </div>
      <div className="rounded-2xl border bg-white p-5"><h2 className="font-black flex gap-2"><Sparkles /> Task Tambahan</h2><p className="text-sm text-slate-500 mt-1">Task dari Super Admin dengan bukti, review, dan revisi.</p>
        <div className="mt-4 space-y-2">{tasks.length ? tasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full text-left rounded-xl bg-violet-50 p-3 text-sm"><b>{task.title}</b><p className="text-violet-700">{taskLabels[task.status]} · {task.deadline || "tanpa deadline"}</p></button>) : <p className="text-sm text-slate-400">Belum ada task tambahan.</p>}</div>
      </div>
    </section>

    <section className="rounded-2xl border bg-white p-5"><h2 className="font-black flex gap-2"><History /> Riwayat Role</h2><div className="mt-4 grid md:grid-cols-2 gap-3">{roles.length ? roles.map((role) => <div key={role.id} className="rounded-xl bg-slate-50 p-3"><b>{role.role}</b><p className="text-sm text-slate-500">{role.division} · {role.status === "active" ? "Role aktif" : "Role sebelumnya"}</p></div>) : <p className="text-sm text-slate-400">Riwayat role akan mulai tercatat saat role diubah lewat Control Center.</p>}</div></section>

    {selectedTask && <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50"><div className="bg-white rounded-2xl p-6 max-w-lg w-full"><h2 className="font-black text-xl">{selectedTask.title}</h2><p className="mt-2 text-slate-600 whitespace-pre-wrap">{selectedTask.instructions}</p><p className="mt-3 text-sm font-semibold text-violet-700">Status: {taskLabels[selectedTask.status]}</p>{selectedTask.reviewerNote && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm">Catatan reviewer: {selectedTask.reviewerNote}</p>}{["pending", "in_progress", "revision_required"].includes(selectedTask.status) && <><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} className="mt-4 w-full rounded-xl border p-3" rows={4} placeholder="Tulis keterangan atau tautan bukti pekerjaan..." />{error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}<button disabled={saving || !evidence.trim()} onClick={submit} className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-white font-bold disabled:opacity-40"><Send className="inline h-4" /> Kirim untuk Review</button></>}<button onClick={() => { setSelectedTask(null); setError(""); }} className="ml-3 text-sm font-bold text-slate-500">Tutup</button></div></div>}
  </div>;
}
