import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Activity, ClipboardPlus, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";
import { changeUserRole, createAdHocTask, reviewAdHocTask, type AdHocTask, type PerformanceActivity } from "@/services/performanceService";
import { ALL_ROLES } from "@/constants/roles";

type Staff = UserProfile & { uid: string };
const divisionFor = (role: string): "katering" | "mbg" | "general" => role.includes("mbg") || role === "MBG2" || role === "mbg2" ? "mbg" : ["admin", "monitoring", "super_admin"].includes(role) ? "general" : "katering";
const roleLabel = (role: string) => role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const taskStatus = [
  { key: "approved", label: "Disetujui", color: "#059669" },
  { key: "pending_review", label: "Review", color: "#F59E0B" },
  { key: "revision_required", label: "Revisi", color: "#E11D48" },
  { key: "pending", label: "Belum mulai", color: "#94A3B8" },
] as const;

function DonutChart({ values }: { values: Array<{ label: string; value: number; color: string }> }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return <div className="relative h-44 w-44 shrink-0">
    <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-label="Komposisi status task">
      <circle cx="56" cy="56" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="13" />
      {total > 0 && values.filter((item) => item.value > 0).map((item) => {
        const length = item.value / total * circumference;
        const circle = <circle key={item.label} cx="56" cy="56" r={radius} fill="none" stroke={item.color} strokeWidth="13" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
        offset += length;
        return circle;
      })}
    </svg>
    <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-2xl font-black text-slate-900">{total}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Task</p></div></div>
  </div>;
}

function RoleBarChart({ rows }: { rows: Array<{ role: string; people: number; xp: number }> }) {
  const max = Math.max(...rows.map((row) => row.xp), 1);
  return <div className="space-y-3">{rows.length ? rows.map((row) => <div key={row.role}>
    <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-700">{roleLabel(row.role)} <span className="font-medium text-slate-400">· {row.people} org</span></span><span className="font-black text-slate-900">{row.xp} XP</span></div>
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-amber-400 transition-all" style={{ width: `${Math.max(5, row.xp / max * 100)}%` }} /></div>
  </div>) : <p className="py-10 text-center text-sm text-slate-400">Belum ada aktivitas KPI tervalidasi.</p>}</div>;
}

export function SuperAdminControlCenterPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activities, setActivities] = useState<PerformanceActivity[]>([]);
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [role, setRole] = useState("produksi_1");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onSnapshot(collection(db, "users"), (snapshot) => setStaff(snapshot.docs.map((item) => ({ ...item.data(), uid: item.id } as Staff)).filter((item) => item.role !== "pelanggan")), (err) => setError(err.message)), []);
  useEffect(() => onSnapshot(collection(db, "performance_activities"), (snapshot) => setActivities(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as PerformanceActivity))), (err) => setError(err.message)), []);
  useEffect(() => onSnapshot(collection(db, "ad_hoc_tasks"), (snapshot) => setTasks(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as AdHocTask))), (err) => setError(err.message)), []);

  const selected = useMemo(() => staff.find((item) => item.uid === selectedId), [staff, selectedId]);
  const pendingReviews = useMemo(() => tasks.filter((task) => task.status === "pending_review"), [tasks]);
  const roleMetrics = useMemo(() => Object.entries(staff.reduce<Record<string, { people: number; xp: number }>>((map, person) => {
    const current = map[person.role] ?? { people: 0, xp: 0 }; current.people += 1; map[person.role] = current; return map;
  }, {})).map(([activeRole, metric]) => ({ role: activeRole, ...metric, xp: activities.filter((item) => item.roleSnapshot === activeRole).reduce((sum, item) => sum + (item.xp ?? (item.sourceType === "ad_hoc_task" ? 25 : 10)), 0) })).sort((a, b) => b.xp - a.xp), [staff, activities]);
  const statusMetrics = useMemo(() => taskStatus.map((status) => ({ ...status, value: tasks.filter((task) => task.status === status.key).length })), [tasks]);
  const totalXp = useMemo(() => activities.reduce((sum, item) => sum + (item.xp ?? (item.sourceType === "ad_hoc_task" ? 25 : 10)), 0), [activities]);

  const setUserRole = async () => {
    if (!user || !selected) return; setBusy(true);
    try { await changeUserRole({ userId: selected.uid, role, division: divisionFor(role), changedBy: user.uid }); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Perubahan role gagal disimpan."); }
    finally { setBusy(false); }
  };
  const giveTask = async () => {
    if (!user || !selected || !title.trim() || !instructions.trim()) return; setBusy(true);
    try { await createAdHocTask({ assigneeId: selected.uid, assigneeNameSnapshot: selected.displayName, roleSnapshot: selected.role, divisionSnapshot: divisionFor(selected.role), title: title.trim(), instructions: instructions.trim(), priority: "normal", deadline: deadline || undefined, evidenceRequired: true, createdBy: user.uid }); setTitle(""); setInstructions(""); setDeadline(""); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Task tambahan gagal dibuat."); }
    finally { setBusy(false); }
  };
  const review = async (task: AdHocTask, approved: boolean) => {
    if (!confirm(approved ? "Setujui task ini?" : "Kembalikan task untuk revisi?")) return;
    try { await reviewAdHocTask(task.id, approved, approved ? "Disetujui Super Admin" : "Mohon perbaiki bukti atau hasil task."); }
    catch (err) { setError(err instanceof Error ? err.message : "Review task gagal."); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-xl"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" /><div className="relative"><p className="text-sm font-bold text-amber-300">SUPER ADMIN · SDM PERFORMANCE</p><h1 className="mt-1 text-3xl font-black tracking-tight">Control Center KPI</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Pantau progres seluruh role, validasi task, dan arahkan tim Katering maupun MBG dari satu layar.</p></div></section>

    {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Personel aktif</p><p className="mt-2 text-3xl font-black text-slate-900">{staff.length}</p><p className="mt-1 text-xs font-semibold text-emerald-600">Lintas Katering & MBG</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total XP tervalidasi</p><p className="mt-2 text-3xl font-black text-violet-700">{totalXp}</p><p className="mt-1 text-xs font-semibold text-slate-500">Dari {activities.length} aktivitas sah</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Menunggu review</p><p className="mt-2 text-3xl font-black text-amber-500">{pendingReviews.length}</p><p className="mt-1 text-xs font-semibold text-slate-500">Task tambahan masuk</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Role berkontribusi</p><p className="mt-2 text-3xl font-black text-emerald-600">{roleMetrics.filter((item) => item.xp > 0).length}</p><p className="mt-1 text-xs font-semibold text-slate-500">Role dengan KPI aktif</p></div></section>

    <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">KPI per Role</p><h2 className="mt-1 text-xl font-black text-slate-900">Kontribusi XP Role Aktif</h2></div><TrendingUp className="h-8 w-8 text-amber-400" /></div><div className="mt-6"><RoleBarChart rows={roleMetrics} /></div></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Kesehatan Task</p><h2 className="mt-1 text-xl font-black text-slate-900">Status Task Tambahan</h2><div className="mt-5 flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row"><DonutChart values={statusMetrics} /><div className="w-full space-y-2">{statusMetrics.map((item) => <div key={item.key} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-semibold text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span><span className="font-black text-slate-900">{item.value}</span></div>)}</div></div></div></section>

    <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black text-slate-900"><Users className="h-5 w-5 text-violet-700" /> Personel & Role</h2><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); const found = staff.find((item) => item.uid === event.target.value); if (found) setRole(found.role); }} className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-300"><option value="">Pilih personel</option>{staff.map((item) => <option key={item.uid} value={item.uid}>{item.displayName} — {roleLabel(item.role)}</option>)}</select>{selected && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-900">{selected.displayName}</p><p className="mt-1 text-sm text-slate-500">Role aktif: {roleLabel(selected.role)}</p><label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Pindahkan ke role</label><select value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold">{(ALL_ROLES as readonly string[]).filter((item) => !["customer", "pelanggan", "super_admin"].includes(item)).map((item) => <option key={item}>{roleLabel(item)}</option>)}</select><button onClick={setUserRole} disabled={busy || selected.uid === user?.uid} className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Simpan Role</button></div>}</div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black text-slate-900"><ClipboardPlus className="h-5 w-5 text-violet-700" /> Beri Task Tambahan</h2>{selected ? <div className="mt-4 space-y-3"><p className="text-sm text-slate-500">Ditujukan untuk <b className="text-slate-800">{selected.displayName}</b> · snapshot role <b className="text-slate-800">{roleLabel(selected.role)}</b>.</p><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul task" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-300"/><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Instruksi lengkap" rows={4} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-300"/><div className="flex flex-wrap items-center gap-3"><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm"/><button onClick={giveTask} disabled={busy || !title.trim() || !instructions.trim()} className="rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40">Kirim Task</button></div></div> : <p className="mt-4 text-sm text-slate-400">Pilih personel terlebih dahulu.</p>}</div></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-600">Perlu tindakan</p><h2 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900"><ShieldCheck className="h-5 w-5 text-violet-700" /> Task Menunggu Review</h2></div><Sparkles className="h-7 w-7 text-amber-400" /></div><div className="mt-5 space-y-3">{pendingReviews.length ? pendingReviews.map((task) => <div key={task.id} className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><b className="text-slate-900">{task.title}</b><p className="mt-1 text-sm text-slate-600">{task.assigneeNameSnapshot} · {roleLabel(task.roleSnapshot)}</p><p className="mt-2 text-sm text-slate-600">Bukti: {task.evidenceNote || "Belum ada keterangan"}</p></div><div className="flex shrink-0 items-start gap-2"><button onClick={() => review(task, true)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Approve</button><button onClick={() => review(task, false)} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-600">Minta Revisi</button></div></div></div>) : <div className="py-10 text-center"><Activity className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-400">Tidak ada task yang menunggu review.</p></div>}</div></section>
  </div>;
}
