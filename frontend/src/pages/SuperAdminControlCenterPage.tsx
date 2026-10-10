import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowLeft, ChevronRight, FileSpreadsheet, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";
import {
  changeUserRole, createAdHocTask, subscribeAllAdHocTasks,
  type AdHocTask,
} from "@/services/performanceService";
import { ALL_ROLES, KPI_EXCLUDED_ROLES } from "@/constants/roles";
import { KpiAssessmentCard, KpiStackedBar, KpiStatusTiles, KpiTaskList } from "@/components/kpi/TaskKpiWidgets";
import { KPI_STATUS_STYLE } from "@/components/kpi/kpiStyles";
import { useNow } from "@/hooks/useNow";
import { getJakartaDate } from "@/utils/date";
import { exportKpiExcel, type KpiPersonSheet } from "@/utils/kpiExcelExporter";
import {
  KPI_STATUS_LABEL, assessKpi, formatDeadline, formatDuration, lateMinutes, monthLabel,
  summarizeTasks, taskKpiStatus, taskMonthKey, type KpiSummary, type TaskKpiStatus,
} from "@/utils/taskKpi";

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

const DIV_STYLE = {
  katering: { tag: "Katering", border: "border-l-amber-400", tagBg: "bg-amber-100 text-amber-700", avatar: "bg-amber-500", text: "text-amber-600" },
  mbg:      { tag: "MBG",      border: "border-l-teal-400",  tagBg: "bg-teal-100 text-teal-700",   avatar: "bg-teal-500",  text: "text-teal-600" },
  general:  { tag: "Umum",     border: "border-l-indigo-400", tagBg: "bg-indigo-100 text-indigo-700", avatar: "bg-indigo-500", text: "text-indigo-600" },
};

const pctLabel = (s: KpiSummary) => (s.ketepatanWaktu == null ? "-" : `${s.ketepatanWaktu}%`);

// ═════════════════════════════════════════════════════════════════════════════
export function SuperAdminControlCenterPage() {
  const { user } = useAuth();
  const now = useNow();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [month, setMonth] = useState(() => getJakartaDate().slice(0, 7));
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

  useEffect(() => onSnapshot(collection(db, "users"), (s) => setStaff(s.docs.map((d) => ({ ...d.data(), uid: d.id } as Staff))), (e) => setError(e.message)), []);
  useEffect(() => subscribeAllAdHocTasks(setTasks, (e) => setError(e.message)), []);

  const periode = monthLabel(month);
  const kpiStaff = useMemo(() => staff.filter((s) => !KPI_EXCLUDED_ROLES.includes(s.role)), [staff]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.uid, s])), [staff]);
  const monthTasks = useMemo(() => tasks.filter((t) => taskMonthKey(t) === month), [tasks, month]);
  const tasksByUser = useMemo(() => {
    const m = new Map<string, AdHocTask[]>();
    for (const t of monthTasks) m.set(t.assigneeId, [...(m.get(t.assigneeId) ?? []), t]);
    return m;
  }, [monthTasks]);
  const tasksOf = useCallback((uid: string) => tasksByUser.get(uid) ?? [], [tasksByUser]);

  const overall = useMemo(() => summarizeTasks(monthTasks, now), [monthTasks, now]);
  const roleMetrics = useMemo(() => {
    const m: Record<string, Staff[]> = {};
    for (const s of kpiStaff) (m[s.role] ??= []).push(s);
    return Object.entries(m)
      .map(([role, members]) => ({ role, members, summary: summarizeTasks(members.flatMap((p) => tasksOf(p.uid)), now) }))
      .sort((a, b) => b.summary.total - a.summary.total || roleLabel(a.role).localeCompare(roleLabel(b.role)));
  }, [kpiStaff, tasksOf, now]);
  const lateTasks = useMemo(
    () => monthTasks.filter((t) => taskKpiStatus(t, now) === "terlambat").sort((a, b) => lateMinutes(b, now) - lateMinutes(a, now)),
    [monthTasks, now],
  );

  const selectedPerson = useMemo(() => staff.find((s) => s.uid === selectedPersonId) ?? null, [staff, selectedPersonId]);
  const selectedRoleMembers = useMemo(() => selectedRole ? kpiStaff.filter((s) => s.role === selectedRole) : [], [kpiStaff, selectedRole]);
  const personTasks = useMemo(() => selectedPerson ? tasksOf(selectedPerson.uid) : [], [tasksOf, selectedPerson]);
  const personSummary = useMemo(() => summarizeTasks(personTasks, now), [personTasks, now]);
  const personAssessment = useMemo(() => selectedPerson ? assessKpi(personSummary, selectedPerson.displayName, periode) : null, [personSummary, selectedPerson, periode]);
  const canGiveTask = !!selectedPerson && !KPI_EXCLUDED_ROLES.includes(selectedPerson.role);

  const goToRole = useCallback((r: string) => { setSelectedRole(r); setView("role-detail"); setSelectedPersonId(null); }, []);
  const goToPerson = useCallback((uid: string) => { const p = staff.find((s) => s.uid === uid); setSelectedPersonId(uid); setSelectedRole(p?.role ?? null); setView("person-detail"); setShowTaskForm(false); setShowChangeRole(false); setTaskTitle(""); setTaskInstructions(""); setTaskDeadline(""); if (p) setNewRole(p.role); }, [staff]);
  const goBack = useCallback(() => { if (view === "person-detail") { setView("role-detail"); setSelectedPersonId(null); } else if (view === "role-detail") { setView("overview"); setSelectedRole(null); } }, [view]);

  const doChangeRole = async () => { if (!user || !selectedPerson) return; setBusy(true); try { await changeUserRole({ userId: selectedPerson.uid, role: newRole, division: divisionFor(newRole), changedBy: user.uid }); setError(""); setShowChangeRole(false); } catch (e) { setError(e instanceof Error ? e.message : "Gagal ubah role."); } finally { setBusy(false); } };
  const doGiveTask = async () => {
    if (!user || !selectedPerson || !canGiveTask || !taskTitle.trim() || !taskInstructions.trim() || !taskDeadline) return;
    setBusy(true);
    try {
      await createAdHocTask({ assigneeId: selectedPerson.uid, assigneeNameSnapshot: selectedPerson.displayName, roleSnapshot: selectedPerson.role, divisionSnapshot: divisionFor(selectedPerson.role), title: taskTitle.trim(), instructions: taskInstructions.trim(), deadline: taskDeadline, createdBy: user.uid });
      setTaskTitle(""); setTaskInstructions(""); setTaskDeadline(""); setShowTaskForm(false); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal buat task."); } finally { setBusy(false); }
  };

  const sheetFor = useCallback((uid: string, list: AdHocTask[]): KpiPersonSheet => {
    const p = staffById.get(uid);
    return { name: p?.displayName || list[0]?.assigneeNameSnapshot || "Tanpa Nama", role: roleLabel(p?.role || list[0]?.roleSnapshot || "-"), tasks: list };
  }, [staffById]);
  const doExport = (people: KpiPersonSheet[]) => { try { exportKpiExcel(people, month, now); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Gagal export Excel."); } };

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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">Super Admin · SDM Performance</p>
            <h1 className="mt-1.5 text-[22px] font-extrabold text-white md:text-[26px]" style={{ letterSpacing: "-0.02em" }}>
              Monitoring Center KPI
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              KPI dihitung dari ketepatan waktu submit task yang diberikan Super Admin.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              <span className="block mb-1 font-semibold">Periode</span>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white [color-scheme:dark]" />
            </label>
            <button type="button" onClick={() => doExport([...tasksByUser.entries()].map(([uid, list]) => sheetFor(uid, list)))}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer">
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
          </div>
        </div>
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
              { n: kpiStaff.length, label: "Personel Dinilai", accent: "border-l-amber-400", icon: "👥" },
              { n: overall.total, label: `Task ${periode}`, accent: "border-l-indigo-400", icon: "📋" },
              { n: pctLabel(overall), label: "Ketepatan Waktu", accent: "border-l-emerald-400", icon: "⏱" },
              { n: overall.terlambat, label: "Task Terlambat", accent: "border-l-red-400", icon: "⚠️" },
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
            <p className="text-xs text-slate-400 mb-4">Klik role untuk lihat KPI tiap personel · % = ketepatan waktu {periode}</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {roleMetrics.map((r) => {
                const d = ds(r.role);
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
                        <span>{r.members.length} org</span>
                        <span>{r.summary.total} task</span>
                        <span className="font-semibold text-slate-800 tabular-nums">{r.summary.total ? pctLabel(r.summary) : "Belum ada task"}</span>
                      </div>
                      <KpiStackedBar summary={r.summary} />
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Bottom: Status + Late tasks */}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-1">Status Task</h3>
              <p className="text-[11px] text-slate-400 mb-4">{overall.total} task · {periode}</p>
              <div className="flex items-center gap-5">
                <div className="relative h-[88px] w-[88px] shrink-0">
                  <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
                    <circle cx="56" cy="56" r="42" fill="none" stroke="#F1F5F9" strokeWidth="10" />
                    {(() => {
                      let off = 0; const c = 2 * Math.PI * 42; const tot = overall.total || 1;
                      return (["terpenuhi", "terlambat", "proses"] as TaskKpiStatus[]).map((k) => {
                        const v = overall[k]; const len = (v / tot) * c;
                        const el = v > 0 ? <circle key={k} cx="56" cy="56" r="42" fill="none" stroke={KPI_STATUS_STYLE[k].dot} strokeWidth="10" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} /> : null;
                        off += len; return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="text-lg font-extrabold text-slate-900 tabular-nums">{overall.total}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {(["proses", "terpenuhi", "terlambat"] as TaskKpiStatus[]).map((k) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KPI_STATUS_STYLE[k].dot }} />{KPI_STATUS_LABEL[k]}
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums">{overall[k]} · {k === "proses" ? overall.pctProses : k === "terpenuhi" ? overall.pctTerpenuhi : overall.pctTerlambat}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Task Terlambat</h3>
                  <p className="text-[11px] text-slate-400">{lateTasks.length} task melewati deadline · {periode}</p>
                </div>
              </div>
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {lateTasks.length ? lateTasks.map((t) => (
                  <button key={t.id} onClick={() => goToPerson(t.assigneeId)} className="block w-full rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-left hover:bg-slate-100 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{staffById.get(t.assigneeId)?.displayName ?? t.assigneeNameSnapshot} · deadline {formatDeadline(t.deadline)}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        {t.submittedAt ? "+" : "belum submit · "}{formatDuration(lateMinutes(t, now))}
                      </span>
                    </div>
                  </button>
                )) : (
                  <div className="py-8 text-center"><p className="text-sm text-slate-400">Tidak ada task terlambat.</p></div>
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
        const rs = summarizeTasks(selectedRoleMembers.flatMap((m) => tasksOf(m.uid)), now);
        return (
          <div className="space-y-5">
            <div className={`rounded-2xl border border-slate-200 border-l-4 ${d.border} bg-white p-5 md:p-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${d.tagBg}`}>{d.tag}</span>
                  <h2 className="mt-1.5 text-xl font-extrabold text-slate-900">{roleLabel(selectedRole)}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{periode}</p>
                </div>
                <div className="flex gap-8 text-center">
                  <div><p className="text-2xl font-extrabold text-slate-900 tabular-nums">{selectedRoleMembers.length}</p><p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Personel</p></div>
                  <div><p className="text-2xl font-extrabold text-slate-900 tabular-nums">{rs.total}</p><p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Task</p></div>
                  <div><p className="text-2xl font-extrabold text-slate-900 tabular-nums">{pctLabel(rs)}</p><p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Tepat Waktu</p></div>
                </div>
              </div>
              <div className="mt-5"><KpiStatusTiles summary={rs} /></div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-900">Personel ({selectedRoleMembers.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {selectedRoleMembers.length ? selectedRoleMembers.map((m) => {
                  const ms = summarizeTasks(tasksOf(m.uid), now);
                  const ma = assessKpi(ms, m.displayName, periode);
                  return (
                    <button key={m.uid} onClick={() => goToPerson(m.uid)}
                      className="group flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ds(m.role).avatar}`}>{(m.displayName ?? "?")[0].toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{m.displayName}</p>
                        <p className="text-[11px] text-slate-400 sm:hidden">{ms.total} task · {pctLabel(ms)}</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-5 text-xs text-slate-500 tabular-nums">
                        <span><b className="text-slate-800">{ms.total}</b> task</span>
                        <span className="text-emerald-700"><b>{ms.terpenuhi}</b> terpenuhi</span>
                        <span className="text-red-600"><b>{ms.terlambat}</b> terlambat</span>
                        <span className="text-blue-700"><b>{ms.proses}</b> proses</span>
                        <span className="w-14 text-right font-bold text-slate-800">{pctLabel(ms)}</span>
                        <span className="w-16 text-right font-bold text-slate-800">{ma.nilai == null ? "-" : `${ma.nilai} · ${ma.grade}`}</span>
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
      {view === "person-detail" && selectedPerson && personAssessment && (
        <div className="space-y-5">

          {/* Profile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white ${ds(selectedPerson.role).avatar}`}>{(selectedPerson.displayName ?? "?")[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-extrabold text-slate-900">{selectedPerson.displayName}</h2>
              <p className="text-xs text-slate-500">{roleLabel(selectedPerson.role)} · <span className={`font-semibold ${ds(selectedPerson.role).text}`}>{ds(selectedPerson.role).tag}</span> · {periode}</p>
            </div>
            <div className="flex items-center gap-6 text-center">
              {[{ n: personSummary.total, l: "Task" }, { n: pctLabel(personSummary), l: "Tepat Waktu" }, { n: personAssessment.nilai ?? "-", l: "Nilai KPI" }].map((s) => (
                <div key={s.l}>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">{s.n}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{s.l}</p>
                </div>
              ))}
              <button type="button" disabled={personTasks.length === 0} onClick={() => doExport([sheetFor(selectedPerson.uid, personTasks)])}
                title="Export rekap KPI orang ini ke Excel"
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
            </div>
          </div>

          {/* KPI + Task list */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <KpiStatusTiles summary={personSummary} />
              <KpiAssessmentCard assessment={personAssessment} periode={periode} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Task {periode}</h3>
                <span className="text-xs text-slate-400 tabular-nums">{personTasks.length} task</span>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                <KpiTaskList tasks={personTasks} now={now} emptyText={`Belum ada task untuk ${periode}.`} />
              </div>
            </div>
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
            {canGiveTask && (
              <div className="rounded-xl border border-slate-200 bg-white">
                <button onClick={() => { setShowTaskForm(!showTaskForm); setShowChangeRole(false); }} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
                  <span className="text-sm font-bold text-slate-900">Beri Task</span>
                  <MoreHorizontal className="h-4 w-4 text-slate-400" />
                </button>
                {showTaskForm && (
                  <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">Untuk <b className="text-slate-700">{selectedPerson.displayName}</b></p>
                    <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Judul task" className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300" />
                    <textarea value={taskInstructions} onChange={(e) => setTaskInstructions(e.target.value)} placeholder="Instruksi" rows={3} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                    <label className="block text-xs font-semibold text-slate-600">
                      Deadline (tanggal & jam WIB) <span className="text-red-500">*</span>
                      <input type="datetime-local" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal" />
                    </label>
                    <button onClick={doGiveTask} disabled={busy || !taskTitle.trim() || !taskInstructions.trim() || !taskDeadline} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Kirim Task</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
