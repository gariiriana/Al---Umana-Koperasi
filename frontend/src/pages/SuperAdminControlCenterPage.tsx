import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft, ArrowRight, ChevronRight, MoreHorizontal,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";
import {
  changeUserRole, createAdHocTask, reviewAdHocTask,
  type AdHocTask, type PerformanceActivity,
} from "@/services/performanceService";
import { ALL_ROLES } from "@/constants/roles";

// ─── Types ───────────────────────────────────────────────────────────────────
type Staff = UserProfile & { uid: string };
type Division = "katering" | "mbg" | "general";
type DrillView = "overview" | "role-detail" | "person-detail";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const divisionFor = (role: string): Division =>
  role.includes("mbg") || role === "MBG2" || role === "mbg2"
    ? "mbg" : ["admin", "monitoring", "super_admin"].includes(role) ? "general" : "katering";

const roleLabel = (role: string) =>
  role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

const taskStatusConfig = [
  { key: "approved", label: "Selesai", color: "#059669" },
  { key: "pending_review", label: "Review", color: "#D97706" },
  { key: "revision_required", label: "Revisi", color: "#DC2626" },
  { key: "pending", label: "Belum", color: "#94A3B8" },
  { key: "in_progress", label: "Proses", color: "#4F46E5" },
] as const;

const ROLE_JOBDESK: Record<string, { tasks: string[]; kpiAspects: string[] }> = {
  admin: { tasks: ["Input pesanan", "Kelola invoice", "Koordinasi pelanggan", "Update jadwal distribusi"], kpiAspects: ["Akurasi data pesanan", "Kecepatan input", "Responsif pelanggan"] },
  tim_produksi: { tasks: ["Proses masak", "Quality control", "Kelola stok bahan", "Jadwal produksi"], kpiAspects: ["Ketepatan waktu produksi", "Kualitas makanan", "Efisiensi bahan"] },
  produksi_1: { tasks: ["Produksi makanan katering", "Kontrol kualitas", "Koordinasi bahan baku"], kpiAspects: ["Output produksi", "Zero defect rate", "Ketepatan jadwal"] },
  distribusi: { tasks: ["Handover barang", "Penjadwalan distribusi", "Koordinasi kurir"], kpiAspects: ["On-time delivery", "Zero loss", "Efisiensi rute"] },
  distribusi_1: { tasks: ["Handover barang", "Penjadwalan distribusi", "Koordinasi kurir"], kpiAspects: ["On-time delivery", "Zero loss", "Efisiensi rute"] },
  kurir: { tasks: ["Pengantaran pesanan", "Bukti delivery", "Konfirmasi penerima"], kpiAspects: ["Delivery success rate", "Ketepatan waktu", "Keluhan pelanggan"] },
  produksi_2: { tasks: ["Support produksi", "Job desk harian", "Dokumentasi"], kpiAspects: ["Task completion rate", "Kualitas support"] },
  distribusi_2: { tasks: ["Job desk distribusi", "Support pengiriman"], kpiAspects: ["Task completion rate", "Keakuratan distribusi"] },
  mo_katering: { tasks: ["Terima pesanan dari admin", "Buat job desk", "Distribusikan tugas"], kpiAspects: ["Kecepatan delegasi", "Keakuratan job desk", "Team utilization"] },
  co_mo_katering: { tasks: ["Review job desk", "Approve/reject submission", "Quality assurance"], kpiAspects: ["Review turnaround", "Approval accuracy", "Feedback quality"] },
  admin_mbg: { tasks: ["Kelola batch MBG", "Input pesanan MBG", "Arsip PM", "Laporan MBG"], kpiAspects: ["Akurasi data", "Kecepatan proses", "Kelengkapan laporan"] },
  produksi_mbg: { tasks: ["Produksi makanan MBG", "Dokumentasi memasak", "Laporan harian"], kpiAspects: ["Output produksi", "Ketepatan porsi", "Dokumentasi lengkap"] },
  dokumentasi_produksiMBG: { tasks: ["Foto proses produksi", "Update status masak", "Arsip dokumentasi"], kpiAspects: ["Kelengkapan foto", "Ketepatan update"] },
  purchasing_mbg: { tasks: ["Belanja bahan baku", "Laporan pembelian", "Negosiasi harga"], kpiAspects: ["Cost efficiency", "Ketepatan belanja"] },
  sub_purchasing_mbg: { tasks: ["Support belanja", "Pencatatan bahan"], kpiAspects: ["Akurasi pencatatan", "Responsivitas"] },
  distribusi_mbg: { tasks: ["QC barang masuk", "Assign kurir MBG", "Kelola pengiriman MBG"], kpiAspects: ["Zero defect QC", "On-time assignment"] },
  kurir_mbg: { tasks: ["Antar makanan MBG", "Bukti foto", "Serah terima"], kpiAspects: ["Delivery success rate", "Ketepatan waktu"] },
  MBG2: { tasks: ["Support produksi MBG", "Job desk harian"], kpiAspects: ["Task completion", "Kontribusi tim"] },
  mbg2: { tasks: ["Support produksi MBG", "Job desk harian"], kpiAspects: ["Task completion", "Kontribusi tim"] },
  produksi_mbg_2: { tasks: ["Support produksi MBG", "Job desk harian"], kpiAspects: ["Task completion", "Kontribusi tim"] },
  distribusi_mbg_2: { tasks: ["Support distribusi MBG", "Job desk distribusi"], kpiAspects: ["Task completion", "Keakuratan"] },
  monitoring: { tasks: ["Pantau pesanan", "Lihat dashboard", "Laporan harian"], kpiAspects: ["Monitoring coverage", "Alert responsiveness"] },
};

// ─── Recommendation Engine ───────────────────────────────────────────────────
function generateRecommendation(person: Staff, pActs: PerformanceActivity[], pTasks: AdHocTask[], allActs: PerformanceActivity[], allStaff: Staff[]) {
  const xp = pActs.reduce((s, a) => s + (a.xp ?? (a.sourceType === "ad_hoc_task" ? 25 : 10)), 0);
  const approved = pTasks.filter((t) => t.status === "approved").length;
  const total = pTasks.length;
  const rate = total > 0 ? approved / total : 0;
  const cateringActs = pActs.filter((a) => a.sourceType === "catering_jobdesk").length;
  const mbgActs = pActs.filter((a) => a.sourceType === "mbg_operation").length;

  const roleBuckets: Record<string, string[]> = {};
  for (const s of allStaff) { if (!roleBuckets[s.role]) roleBuckets[s.role] = []; roleBuckets[s.role].push(s.uid); }
  const roleAvg: Record<string, number> = {};
  for (const [r, uids] of Object.entries(roleBuckets)) {
    roleAvg[r] = uids.length > 0 ? allActs.filter((a) => uids.includes(a.userId)).reduce((s, a) => s + (a.xp ?? 10), 0) / uids.length : 0;
  }
  const avg = roleAvg[person.role] ?? 0;
  const ratio = avg > 0 ? xp / avg : xp > 0 ? 1.5 : 0;

  if (xp === 0 && total === 0)
    return { status: "observasi" as const, role: person.role, summary: "Belum ada data aktivitas yang tercatat. Butuh waktu lebih lama untuk evaluasi yang akurat.", verdict: "Data belum cukup untuk penilaian — lanjutkan observasi dan berikan task untuk mengukur kapabilitas." };
  if (ratio >= 1.3 && rate >= 0.7)
    return { status: "excellent" as const, role: person.role, summary: `Performa ${Math.round(ratio * 100)}% di atas rata-rata role. Completion rate ${Math.round(rate * 100)}%.`, verdict: `Sangat optimal di posisi ${roleLabel(person.role)}. Pertahankan penempatan ini dan pertimbangkan tanggung jawab tambahan.` };
  if (ratio >= 0.8 && rate >= 0.5)
    return { status: "baik" as const, role: person.role, summary: `Performa sesuai standar (${Math.round(ratio * 100)}% dari rata-rata). Ada ruang untuk peningkatan.`, verdict: `Cukup solid di role ${roleLabel(person.role)}. Bisa ditingkatkan dengan coaching dan task yang lebih menantang.` };
  if (xp > 0 && ratio < 0.5) {
    let sugRole = person.role; let note = "Performa di bawah rata-rata role. Perlu evaluasi mendalam dan pendampingan.";
    if (cateringActs > mbgActs && person.role.includes("mbg")) { sugRole = "produksi_1"; note = "Aktivitas katering lebih dominan — pertimbangkan pindah ke divisi Katering."; }
    else if (mbgActs > cateringActs && !person.role.includes("mbg")) { sugRole = "produksi_mbg"; note = "Kontribusi di MBG lebih kuat — pertimbangkan pindah ke divisi MBG."; }
    return { status: "perhatian" as const, role: sugRole, summary: `Performa ${Math.round(ratio * 100)}% dari rata-rata role. ${note}`, verdict: sugRole !== person.role ? `Pertimbangkan penempatan ulang ke ${roleLabel(sugRole)} untuk optimalisasi kontribusi.` : "Berikan pendampingan intensif dan evaluasi ulang dalam 2 minggu." };
  }
  return { status: "cukup" as const, role: person.role, summary: `XP: ${xp}, Task: ${total}. Data masih terbatas untuk rekomendasi kuat.`, verdict: `Lanjutkan di role ${roleLabel(person.role)} sambil kumpulkan lebih banyak data performa.` };
}

// ─── Division config ─────────────────────────────────────────────────────────
const DIV_STYLE = {
  katering: { tag: "Katering", border: "border-l-amber-400", bg: "bg-amber-50", tagBg: "bg-amber-100 text-amber-700", barBg: "bg-amber-400" },
  mbg:      { tag: "MBG",      border: "border-l-teal-400",  bg: "bg-teal-50",  tagBg: "bg-teal-100 text-teal-700",   barBg: "bg-teal-400"  },
  general:  { tag: "Umum",     border: "border-l-indigo-400",bg: "bg-indigo-50", tagBg: "bg-indigo-100 text-indigo-700",barBg: "bg-indigo-400"},
};

// ═════════════════════════════════════════════════════════════════════════════
export function SuperAdminControlCenterPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activities, setActivities] = useState<PerformanceActivity[]>([]);
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<DrillView>("overview");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [newRole, setNewRole] = useState("produksi_1");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");

  useEffect(() => onSnapshot(collection(db, "users"), (s) => setStaff(s.docs.map((d) => ({ ...d.data(), uid: d.id } as Staff)).filter((p) => (p.role as string) !== "pelanggan" && (p.role as string) !== "customer")), (e) => setError(e.message)), []);
  useEffect(() => onSnapshot(collection(db, "performance_activities"), (s) => setActivities(s.docs.map((d) => ({ ...d.data(), id: d.id } as PerformanceActivity))), (e) => setError(e.message)), []);
  useEffect(() => onSnapshot(collection(db, "ad_hoc_tasks"), (s) => setTasks(s.docs.map((d) => ({ ...d.data(), id: d.id } as AdHocTask))), (e) => setError(e.message)), []);

  const roleMetrics = useMemo(() => {
    const m: Record<string, { people: number; xp: number; members: Staff[] }> = {};
    for (const s of staff) { if (!m[s.role]) m[s.role] = { people: 0, xp: 0, members: [] }; m[s.role].people++; m[s.role].members.push(s); }
    for (const [role, v] of Object.entries(m)) v.xp = activities.filter((a) => v.members.some((p) => p.uid === a.userId) && a.roleSnapshot === role).reduce((s, a) => s + (a.xp ?? (a.sourceType === "ad_hoc_task" ? 25 : 10)), 0);
    return Object.entries(m).map(([role, v]) => ({ role, ...v })).sort((a, b) => b.xp - a.xp);
  }, [staff, activities]);

  const maxRoleXp = useMemo(() => Math.max(...roleMetrics.map((r) => r.xp), 1), [roleMetrics]);
  const totalXp = useMemo(() => activities.reduce((s, a) => s + (a.xp ?? (a.sourceType === "ad_hoc_task" ? 25 : 10)), 0), [activities]);
  const pendingReviews = useMemo(() => tasks.filter((t) => t.status === "pending_review"), [tasks]);
  const statusCounts = useMemo(() => { const c: Record<string, number> = {}; for (const s of taskStatusConfig) c[s.key] = tasks.filter((t) => t.status === s.key).length; return c; }, [tasks]);

  const selectedPerson = useMemo(() => staff.find((s) => s.uid === selectedPersonId) ?? null, [staff, selectedPersonId]);
  const selectedRoleMembers = useMemo(() => selectedRole ? staff.filter((s) => s.role === selectedRole) : [], [staff, selectedRole]);
  const personActivities = useMemo(() => selectedPerson ? activities.filter((a) => a.userId === selectedPerson.uid) : [], [activities, selectedPerson]);
  const personTasks = useMemo(() => selectedPerson ? tasks.filter((t) => t.assigneeId === selectedPerson.uid) : [], [tasks, selectedPerson]);
  const personXp = useMemo(() => personActivities.reduce((s, a) => s + (a.xp ?? (a.sourceType === "ad_hoc_task" ? 25 : 10)), 0), [personActivities]);
  const recommendation = useMemo(() => selectedPerson ? generateRecommendation(selectedPerson, personActivities, personTasks, activities, staff) : null, [selectedPerson, personActivities, personTasks, activities, staff]);

  const goToRole = useCallback((r: string) => { setSelectedRole(r); setView("role-detail"); setSelectedPersonId(null); }, []);
  const goToPerson = useCallback((uid: string) => { setSelectedPersonId(uid); setView("person-detail"); setShowTaskForm(false); setShowChangeRole(false); setTaskTitle(""); setTaskInstructions(""); setTaskDeadline(""); const p = staff.find((s) => s.uid === uid); if (p) setNewRole(p.role); }, [staff]);
  const goBack = useCallback(() => { if (view === "person-detail") { setView("role-detail"); setSelectedPersonId(null); } else if (view === "role-detail") { setView("overview"); setSelectedRole(null); } }, [view]);

  const doChangeRole = async () => { if (!user || !selectedPerson) return; setBusy(true); try { await changeUserRole({ userId: selectedPerson.uid, role: newRole, division: divisionFor(newRole), changedBy: user.uid }); setError(""); setShowChangeRole(false); } catch (e) { setError(e instanceof Error ? e.message : "Gagal ubah role."); } finally { setBusy(false); } };
  const doGiveTask = async () => { if (!user || !selectedPerson || !taskTitle.trim() || !taskInstructions.trim()) return; setBusy(true); try { await createAdHocTask({ assigneeId: selectedPerson.uid, assigneeNameSnapshot: selectedPerson.displayName, roleSnapshot: selectedPerson.role, divisionSnapshot: divisionFor(selectedPerson.role), title: taskTitle.trim(), instructions: taskInstructions.trim(), priority: "normal", deadline: taskDeadline || undefined, evidenceRequired: true, createdBy: user.uid }); setTaskTitle(""); setTaskInstructions(""); setTaskDeadline(""); setShowTaskForm(false); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Gagal buat task."); } finally { setBusy(false); } };
  const doReview = async (t: AdHocTask, ok: boolean) => { if (!confirm(ok ? "Setujui task ini?" : "Kembalikan untuk revisi?")) return; try { await reviewAdHocTask(t.id, ok, ok ? "Disetujui Super Admin" : "Mohon perbaiki bukti."); } catch (e) { setError(e instanceof Error ? e.message : "Review gagal."); } };

  const crumbs = useMemo(() => {
    const c: { label: string; onClick?: () => void }[] = [{ label: "Monitoring", onClick: () => { setView("overview"); setSelectedRole(null); setSelectedPersonId(null); } }];
    if (selectedRole) c.push({ label: roleLabel(selectedRole), onClick: view === "person-detail" ? () => { setView("role-detail"); setSelectedPersonId(null); } : undefined });
    if (selectedPerson) c.push({ label: selectedPerson.displayName });
    return c;
  }, [view, selectedRole, selectedPerson]);

  const ds = (role: string) => DIV_STYLE[divisionFor(role)];

  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-6 md:px-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="mb-7 rounded-2xl bg-slate-900 px-6 py-6 md:px-8 md:py-7">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">Super Admin · SDM Performance</p>
        <h1 className="mt-1.5 text-[22px] font-extrabold text-white md:text-[26px]" style={{ letterSpacing: "-0.02em" }}>
          Monitoring Center KPI
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Pantau performa seluruh personel, analisis KPI tiap role, dan dapatkan rekomendasi penempatan.
        </p>
      </header>

      {error && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs font-semibold text-red-400 hover:text-red-600">Tutup</button>
        </div>
      )}

      {view !== "overview" && (
        <nav className="mb-5 flex items-center gap-1.5 text-sm text-slate-400">
          <button onClick={goBack} className="mr-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
              {c.onClick ? <button onClick={c.onClick} className="font-medium hover:text-slate-700 transition-colors">{c.label}</button> : <span className="font-semibold text-slate-800">{c.label}</span>}
            </Fragment>
          ))}
        </nav>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* OVERVIEW                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {view === "overview" && (
        <div className="space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { n: staff.length, label: "Personel Aktif", accent: "border-l-amber-400", icon: "👥" },
              { n: totalXp, label: "Total XP", accent: "border-l-indigo-400", icon: "⚡" },
              { n: pendingReviews.length, label: "Menunggu Review", accent: "border-l-orange-400", icon: "📋" },
              { n: roleMetrics.filter((r) => r.xp > 0).length, label: "Role Aktif", accent: "border-l-emerald-400", icon: "🏷" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border border-slate-200 border-l-[3px] ${s.accent} bg-white px-4 py-4`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900 tabular-nums" style={{ letterSpacing: "-0.03em" }}>{s.n}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{s.label}</p>
                  </div>
                  <span className="text-lg opacity-70">{s.icon}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Role Grid */}
          <section>
            <h2 className="text-[15px] font-extrabold text-slate-900 mb-1">Monitoring per Role</h2>
            <p className="text-xs text-slate-400 mb-4">Klik role untuk lihat performa tiap personel</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {roleMetrics.map((r) => {
                const d = ds(r.role);
                const pct = maxRoleXp > 0 ? (r.xp / maxRoleXp) * 100 : 0;
                return (
                  <button key={r.role} onClick={() => goToRole(r.role)}
                    className={`group flex items-center gap-3 rounded-xl border border-slate-200 border-l-[3px] ${d.border} bg-white px-4 py-3.5 text-left transition-all hover:shadow-md hover:border-slate-300`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-900 truncate">{roleLabel(r.role)}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${d.tagBg}`}>{d.tag}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                        <span>{r.people} org</span>
                        <span className="font-semibold text-slate-800 tabular-nums">{r.xp} XP</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${d.barBg} transition-all duration-700`} style={{ width: `${Math.max(3, pct)}%` }} />
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Bottom: Tasks + Reviews */}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            {/* Task breakdown */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-1">Status Task</h3>
              <p className="text-[11px] text-slate-400 mb-4">{tasks.length} task total</p>
              {/* Mini donut */}
              <div className="flex items-center gap-5 mb-5">
                <div className="relative h-[88px] w-[88px] shrink-0">
                  <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
                    <circle cx="56" cy="56" r="42" fill="none" stroke="#F1F5F9" strokeWidth="10" />
                    {(() => { let off = 0; const c = 2 * Math.PI * 42; const tot = tasks.length || 1; return taskStatusConfig.map((s) => { const v = statusCounts[s.key] ?? 0; const len = (v / tot) * c; const el = v > 0 ? <circle key={s.key} cx="56" cy="56" r="42" fill="none" stroke={s.color} strokeWidth="10" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} /> : null; off += len; return el; }); })()}
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="text-lg font-extrabold text-slate-900 tabular-nums">{tasks.length}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {taskStatusConfig.map((s) => (
                    <div key={s.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.label}
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums">{statusCounts[s.key] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Pending reviews */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Menunggu Review</h3>
                  <p className="text-[11px] text-slate-400">{pendingReviews.length} task perlu ditinjau</p>
                </div>
                {pendingReviews.length > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700 tabular-nums">{pendingReviews.length}</span>}
              </div>
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {pendingReviews.length ? pendingReviews.map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.assigneeNameSnapshot} · {roleLabel(t.roleSnapshot)}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button onClick={() => doReview(t, true)} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 transition-colors">Approve</button>
                        <button onClick={() => doReview(t, false)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Revisi</button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="py-8 text-center"><p className="text-sm text-slate-400">Semua task sudah ditinjau.</p></div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ROLE DETAIL                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {view === "role-detail" && selectedRole && (() => {
        const d = ds(selectedRole);
        const roleXp = activities.filter((a) => selectedRoleMembers.some((m) => m.uid === a.userId)).reduce((s, a) => s + (a.xp ?? 10), 0);
        const jobdesk = ROLE_JOBDESK[selectedRole];
        return (
          <div className="space-y-5">
            <div className={`rounded-2xl border border-slate-200 border-l-4 ${d.border} bg-white p-5 md:p-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${d.tagBg}`}>{d.tag}</span>
                  <h2 className="mt-1.5 text-xl font-extrabold text-slate-900">{roleLabel(selectedRole)}</h2>
                </div>
                <div className="flex gap-8 text-center">
                  <div><p className="text-2xl font-extrabold text-slate-900 tabular-nums">{selectedRoleMembers.length}</p><p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Personel</p></div>
                  <div><p className="text-2xl font-extrabold text-slate-900 tabular-nums">{roleXp}</p><p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Total XP</p></div>
                </div>
              </div>
              {jobdesk && (
                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Tugas Utama</p>
                    {jobdesk.tasks.map((t) => <p key={t} className="text-sm text-slate-700 py-0.5 pl-3 relative before:absolute before:left-0 before:top-[11px] before:h-1 before:w-1 before:rounded-full before:bg-slate-400">{t}</p>)}
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Aspek KPI</p>
                    {jobdesk.kpiAspects.map((k) => <p key={k} className="text-sm text-slate-700 py-0.5 pl-3 relative before:absolute before:left-0 before:top-[11px] before:h-1 before:w-1 before:rounded-full before:bg-amber-400">{k}</p>)}
                  </div>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Personel ({selectedRoleMembers.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {selectedRoleMembers.length ? selectedRoleMembers.map((m) => {
                  const mXp = activities.filter((a) => a.userId === m.uid).reduce((s, a) => s + (a.xp ?? 10), 0);
                  const mTasks = tasks.filter((t) => t.assigneeId === m.uid);
                  const mApproved = mTasks.filter((t) => t.status === "approved").length;
                  return (
                    <button key={m.uid} onClick={() => goToPerson(m.uid)}
                      className="group flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        divisionFor(m.role) === "katering" ? "bg-amber-500" : divisionFor(m.role) === "mbg" ? "bg-teal-500" : "bg-indigo-500"
                      }`}>{(m.displayName ?? "?")[0].toUpperCase()}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{m.displayName}</p></div>
                      <div className="hidden sm:flex items-center gap-5 text-xs text-slate-500 tabular-nums">
                        <span><b className="text-slate-800">{mXp}</b> XP</span>
                        <span><b className="text-slate-800">{mApproved}</b>/{mTasks.length} task</span>
                        <span>Lv {Math.floor(mXp / 100) + 1}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </button>
                  );
                }) : <p className="px-5 py-8 text-center text-sm text-slate-400">Tidak ada personel di role ini.</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PERSON DETAIL                                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {view === "person-detail" && selectedPerson && (
        <div className="space-y-5">

          {/* Profile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white ${
              divisionFor(selectedPerson.role) === "katering" ? "bg-amber-500" : divisionFor(selectedPerson.role) === "mbg" ? "bg-teal-500" : "bg-indigo-500"
            }`}>{(selectedPerson.displayName ?? "?")[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">{selectedPerson.displayName}</h2>
              <p className="text-xs text-slate-500">{roleLabel(selectedPerson.role)} · <span className={`font-semibold ${divisionFor(selectedPerson.role) === "katering" ? "text-amber-600" : divisionFor(selectedPerson.role) === "mbg" ? "text-teal-600" : "text-indigo-600"}`}>{ds(selectedPerson.role).tag}</span></p>
            </div>
            <div className="flex gap-6 text-center">
              {[{ n: personXp, l: "XP" }, { n: Math.floor(personXp / 100) + 1, l: "Level" }, { n: personActivities.length, l: "Aktivitas" }, { n: personTasks.filter((t) => t.status === "approved").length, l: "Selesai" }].map((s) => (
                <div key={s.l}>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{s.n}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* KPI + Rekomendasi */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* KPI */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-4">Breakdown KPI</h3>
              <div className="space-y-3.5">
                {[
                  { label: "Job Desk Katering", val: personActivities.filter((a) => a.sourceType === "catering_jobdesk").length * 10, color: "bg-amber-400" },
                  { label: "Operasional MBG", val: personActivities.filter((a) => a.sourceType === "mbg_operation").length * 10, color: "bg-teal-400" },
                  { label: "Task Tambahan", val: personActivities.filter((a) => a.sourceType === "ad_hoc_task").length * 25, color: "bg-indigo-400" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-600">{r.label}</span>
                      <span className="font-bold text-slate-900 tabular-nums">{r.val} XP</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${r.color} transition-all duration-700`} style={{ width: `${personXp > 0 ? Math.max(3, (r.val / personXp) * 100) : 2}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-6 mb-2.5">Status task</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: "approved", l: "Selesai", c: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                  { k: "pending_review", l: "Review", c: "border-amber-200 bg-amber-50 text-amber-700" },
                  { k: "revision_required", l: "Revisi", c: "border-red-200 bg-red-50 text-red-600" },
                ].map((s) => (
                  <div key={s.k} className={`rounded-lg border px-3 py-2.5 text-center ${s.c}`}>
                    <p className="text-lg font-extrabold tabular-nums">{personTasks.filter((t) => t.status === s.k).length}</p>
                    <p className="text-[10px] font-semibold opacity-75">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rekomendasi */}
            {recommendation && (
              <div className="space-y-3">
                <div className={`rounded-xl p-5 ${
                  recommendation.status === "excellent" ? "bg-emerald-50 border border-emerald-200" :
                  recommendation.status === "baik" ? "bg-blue-50 border border-blue-200" :
                  recommendation.status === "perhatian" ? "bg-amber-50 border border-amber-200" :
                  "bg-slate-50 border border-slate-200"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      recommendation.status === "excellent" ? "bg-emerald-500" :
                      recommendation.status === "baik" ? "bg-blue-500" :
                      recommendation.status === "perhatian" ? "bg-amber-500" : "bg-slate-400"
                    }`} />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kesimpulan Performa</p>
                  </div>
                  <p className={`text-sm font-bold ${
                    recommendation.status === "excellent" ? "text-emerald-800" :
                    recommendation.status === "baik" ? "text-blue-800" :
                    recommendation.status === "perhatian" ? "text-amber-800" : "text-slate-700"
                  }`}>
                    {recommendation.status === "excellent" ? "Performa Excellent" :
                     recommendation.status === "baik" ? "Performa Baik" :
                     recommendation.status === "perhatian" ? "Perlu Perhatian Khusus" :
                     recommendation.status === "cukup" ? "Performa Cukup" : "Dalam Observasi"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{recommendation.verdict}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Rekomendasi Penempatan</p>
                  <div className="flex items-center gap-2.5 text-sm mb-2.5">
                    <span className="font-medium text-slate-500">{roleLabel(selectedPerson.role)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <span className={`font-bold ${recommendation.role === selectedPerson.role ? "text-emerald-700" : "text-amber-700"}`}>
                      {recommendation.role === selectedPerson.role ? "Tetap di posisi ini" : roleLabel(recommendation.role)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{recommendation.summary}</p>
                </div>

                {ROLE_JOBDESK[selectedPerson.role] && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Jobdesk Dievaluasi</p>
                    {ROLE_JOBDESK[selectedPerson.role].tasks.map((t) => (
                      <p key={t} className="text-sm text-slate-700 py-0.5 pl-3 relative before:absolute before:left-0 before:top-[11px] before:h-1 before:w-1 before:rounded-full before:bg-slate-400">{t}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity log */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Riwayat Aktivitas</h3>
              <span className="text-xs text-slate-400 tabular-nums">{personActivities.length} tercatat</span>
            </div>
            {personActivities.length ? (
              <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                {personActivities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{a.title}</p>
                      <p className="text-[11px] text-slate-400">{a.roleSnapshot} · {a.sourceType.replace(/_/g, " ")}</p>
                    </div>
                    <span className="shrink-0 ml-3 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 tabular-nums">+{a.xp ?? 10}</span>
                  </div>
                ))}
              </div>
            ) : <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada aktivitas KPI tercatat.</p>}
          </div>

          {/* Actions */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white">
              <button onClick={() => { setShowChangeRole(!showChangeRole); setShowTaskForm(false); }} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
                <span className="text-sm font-bold text-slate-900">Pindahkan Role</span>
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </button>
              {showChangeRole && (
                <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">Saat ini: <b className="text-slate-700">{roleLabel(selectedPerson.role)}</b></p>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300">
                    {(ALL_ROLES as readonly string[]).filter((r) => !["customer", "pelanggan", "super_admin"].includes(r)).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <button onClick={doChangeRole} disabled={busy || selectedPerson.uid === user?.uid} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Simpan</button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white">
              <button onClick={() => { setShowTaskForm(!showTaskForm); setShowChangeRole(false); }} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
                <span className="text-sm font-bold text-slate-900">Beri Task Tambahan</span>
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </button>
              {showTaskForm && (
                <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">Untuk <b className="text-slate-700">{selectedPerson.displayName}</b></p>
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Judul task" className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300" />
                  <textarea value={taskInstructions} onChange={(e) => setTaskInstructions(e.target.value)} placeholder="Instruksi" rows={3} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                  <div className="flex items-center gap-2">
                    <input type="date" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} className="rounded-lg border border-slate-200 p-2.5 text-sm" />
                    <button onClick={doGiveTask} disabled={busy || !taskTitle.trim() || !taskInstructions.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Kirim</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
