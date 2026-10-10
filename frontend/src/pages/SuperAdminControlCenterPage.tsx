import { useEffect, useMemo, useState, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { FileSpreadsheet, Plus, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  changeUserRole, createAdHocTask, setAccountHolderName, subscribeAllAdHocTasks,
  type AdHocTask,
} from "@/services/performanceService";
import { AccountNamesTable } from "@/components/kpi/AccountNamesTable";
import { accountNameHint, personName } from "@/utils/personName";
import { ALL_ROLES, KPI_EXCLUDED_ROLES } from "@/constants/roles";
import { AssessmentPanel, StatusPill, SummaryStrip, TaskDetail } from "@/components/kpi/TaskKpiWidgets";
import { SidePanel } from "@/components/ui/SidePanel";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { CreateTaskModal, type TaskAssignee } from "@/components/kpi/CreateTaskModal";
import { KPI_STATUS_STYLE, fmtNum, fmtPct, roleLabel } from "@/components/kpi/kpiStyles";
import { useNow } from "@/hooks/useNow";
import { getJakartaDate } from "@/utils/date";
import { exportKpiExcel, type KpiPersonSheet } from "@/utils/kpiExcelExporter";
import {
  KPI_STATUS_LABEL, assessKpi, formatDeadline, formatDuration, formatWib, lateMinutes, monthLabel,
  summarizeTasks, taskKpiStatus, taskMonthKey, toMillis, type TaskKpiStatus,
} from "@/utils/taskKpi";

/** `name` = nama orang pemegang akun (holderName), jatuh ke nama akun kalau belum diisi. */
type Staff = UserProfile & { uid: string; name: string };
type Division = "katering" | "mbg" | "general";
type Tab = "task" | "kpi" | "akun";
const CUSTOMER_ROLES = ["pelanggan", "customer"];
type StatusFilter = "semua" | TaskKpiStatus;

const divisionFor = (role: string): Division =>
  role.includes("mbg") || role === "MBG2" || role === "mbg2"
    ? "mbg" : ["admin", "monitoring", "super_admin"].includes(role) ? "general" : "katering";

const inputCls = "rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-[#FBBF24] px-3.5 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const btnSecondary = "inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm font-semibold text-[#374151] hover:bg-[#F9FAFB] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const th = "px-4 py-2.5 text-left text-xs font-semibold text-[#6B7280]";

export function SuperAdminControlCenterPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const now = useNow();
  const today = getJakartaDate();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [tab, setTab] = useState<Tab>("task");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");
  const [taskSearch, setTaskSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("semua");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [createFor, setCreateFor] = useState<string | null | undefined>(undefined);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Akun tanpa displayName (mis. baru dibuat) diberi nama cadangan supaya pencarian/sort tidak crash.
  useEffect(() => onSnapshot(collection(db, "users"), (s) => setStaff(s.docs.map((d) => {
    const data = d.data() as Partial<Staff>;
    return { ...data, uid: d.id, displayName: data.displayName || data.email || "Tanpa Nama", role: data.role ?? "", name: personName(data) } as Staff;
  })), (e) => setError(e.message)), []);
  useEffect(() => subscribeAllAdHocTasks(setTasks, (e) => setError(e.message)), []);

  const periode = monthLabel(month);
  const kpiStaff = useMemo(() => staff.filter((s) => !KPI_EXCLUDED_ROLES.includes(s.role)), [staff]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.uid, s])), [staff]);
  const nameOf = useCallback((t: AdHocTask) => staffById.get(t.assigneeId)?.name ?? t.assigneeNameSnapshot, [staffById]);
  const internalAccounts = useMemo(() => staff.filter((s) => !CUSTOMER_ROLES.includes(s.role)), [staff]);
  const roleOf = useCallback((t: AdHocTask) => staffById.get(t.assigneeId)?.role ?? t.roleSnapshot, [staffById]);

  const monthTasks = useMemo(() => tasks.filter((t) => taskMonthKey(t) === month), [tasks, month]);
  const tasksByUser = useMemo(() => {
    const m = new Map<string, AdHocTask[]>();
    for (const t of monthTasks) m.set(t.assigneeId, [...(m.get(t.assigneeId) ?? []), t]);
    return m;
  }, [monthTasks]);
  const overall = useMemo(() => summarizeTasks(monthTasks, now), [monthTasks, now]);

  // ── Daftar Task ──
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { semua: monthTasks.length, proses: 0, terpenuhi: 0, terlambat: 0 };
    for (const t of monthTasks) c[taskKpiStatus(t, now)]++;
    return c;
  }, [monthTasks, now]);
  const visibleTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return monthTasks
      .filter((t) => statusFilter === "semua" || taskKpiStatus(t, now) === statusFilter)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || nameOf(t).toLowerCase().includes(q))
      .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  }, [monthTasks, statusFilter, taskSearch, now, nameOf]);

  // ── Rekap KPI ──
  const kpiRoles = useMemo(() => [...new Set(kpiStaff.map((s) => s.role))].sort((a, b) => roleLabel(a).localeCompare(roleLabel(b))), [kpiStaff]);
  const kpiRows = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    return kpiStaff
      .filter((p) => roleFilter === "semua" || p.role === roleFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
      .map((p) => {
        const summary = summarizeTasks(tasksByUser.get(p.uid) ?? [], now);
        return { person: p, summary, assessment: assessKpi(summary, p.name, periode) };
      })
      .sort((a, b) => (b.assessment.nilai ?? -1) - (a.assessment.nilai ?? -1) || b.summary.total - a.summary.total || a.person.name.localeCompare(b.person.name, "id"));
  }, [kpiStaff, roleFilter, personSearch, tasksByUser, now, periode]);

  // ── Panel ──
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const selectedPerson = useMemo(() => staff.find((s) => s.uid === selectedPersonId) ?? null, [staff, selectedPersonId]);
  const personTasks = useMemo(() => selectedPerson ? [...(tasksByUser.get(selectedPerson.uid) ?? [])].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")) : [], [tasksByUser, selectedPerson]);
  const personSummary = useMemo(() => summarizeTasks(personTasks, now), [personTasks, now]);
  const personAssessment = useMemo(() => selectedPerson ? assessKpi(personSummary, selectedPerson.name, periode) : null, [personSummary, selectedPerson, periode]);
  const canGiveTask = (p: Staff | null) => !!p && !KPI_EXCLUDED_ROLES.includes(p.role);

  const openPerson = (uid: string) => { setSelectedPersonId(uid); setNewRole(staffById.get(uid)?.role ?? ""); };

  const assignees: TaskAssignee[] = useMemo(() => kpiStaff.map((p) => ({ uid: p.uid, displayName: p.name, role: p.role })), [kpiStaff]);
  const doSaveHolder = async (uid: string, holderName: string) => {
    try {
      await setAccountHolderName(uid, holderName);
      const account = staffById.get(uid);
      showToast({ message: holderName.trim() ? `Akun ${account?.displayName ?? ""} atas nama ${holderName.trim()}` : `Nama untuk akun ${account?.displayName ?? ""} dihapus`, variant: "success" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan nama.");
      throw e;
    }
  };
  const doCreate = async ({ assignee, title, instructions, deadline }: { assignee: TaskAssignee; title: string; instructions: string; deadline: string }) => {
    if (!user) throw new Error("Sesi login sudah berakhir.");
    await createAdHocTask({ assigneeId: assignee.uid, assigneeNameSnapshot: assignee.displayName, roleSnapshot: assignee.role, divisionSnapshot: divisionFor(assignee.role), title, instructions, deadline, createdBy: user.uid });
    showToast({ message: `Task terkirim ke ${assignee.displayName}`, variant: "success" });
    const key = deadline.slice(0, 7);
    if (key !== month) setMonth(key);
  };
  const doChangeRole = async () => {
    if (!user || !selectedPerson || !newRole || newRole === selectedPerson.role) return;
    setBusy(true);
    try { await changeUserRole({ userId: selectedPerson.uid, role: newRole, division: divisionFor(newRole), changedBy: user.uid }); showToast({ message: `Role ${selectedPerson.name} diubah ke ${roleLabel(newRole)}`, variant: "success" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal ubah role."); }
    finally { setBusy(false); }
  };
  const sheetFor = (uid: string, list: AdHocTask[]): KpiPersonSheet => {
    const p = staffById.get(uid);
    return { name: p?.name || list[0]?.assigneeNameSnapshot || "Tanpa Nama", role: roleLabel(p?.role || list[0]?.roleSnapshot || "-"), tasks: list };
  };
  const doExport = (people: KpiPersonSheet[]) => { try { exportKpiExcel(people, month, now); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Gagal export Excel."); } };

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-6 md:px-6 font-['Hanken_Grotesk',system-ui,sans-serif]">

      {/* Header */}
      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">KPI & Task</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">Beri task ke personel dan pantau ketepatan waktu penyelesaiannya.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={month} onChange={setMonth} today={today} />
          <button type="button" className={btnSecondary} disabled={monthTasks.length === 0}
            title={monthTasks.length === 0 ? `Belum ada task di ${periode}` : "Satu sheet per orang"}
            onClick={() => doExport([...tasksByUser.entries()].map(([uid, list]) => sheetFor(uid, list)))}>
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
          <button type="button" className={btnPrimary} onClick={() => setCreateFor(null)}>
            <Plus className="h-4 w-4" /> Buat Task
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-sm text-[#B91C1C]">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs font-semibold hover:underline cursor-pointer">Tutup</button>
        </div>
      )}

      <SummaryStrip summary={overall} totalLabel={`Task ${periode}`} />

      {/* Tabs */}
      <div className="mt-6 flex gap-6 border-b border-[#E5E7EB]">
        {([["task", `Daftar Task`, monthTasks.length], ["kpi", "Rekap KPI per Orang", kpiStaff.length], ["akun", "Akun & Nama", internalAccounts.length]] as const).map(([key, label, n]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors cursor-pointer ${tab === key ? "border-[#111827] text-[#111827]" : "border-transparent text-[#6B7280] hover:text-[#111827]"}`}>
            {label} <span className="ml-1 text-xs font-medium text-[#9CA3AF]">{n}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Daftar Task ── */}
      {tab === "task" && (
        <div className="mt-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-lg border border-[#E5E7EB] bg-white p-0.5">
              {(["semua", "proses", "terpenuhi", "terlambat"] as StatusFilter[]).map((s) => (
                <button key={s} type="button" onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${statusFilter === s ? "bg-[#111827] text-white" : "text-[#374151] hover:bg-[#F3F4F6]"}`}>
                  {s === "semua" ? "Semua" : KPI_STATUS_LABEL[s]} <span className="opacity-60">{statusCounts[s]}</span>
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Cari judul atau nama" className={`${inputCls} w-full pl-9 sm:w-64`} />
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            {monthTasks.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-semibold text-[#111827]">Belum ada task untuk {periode}</p>
                <p className="mt-1 text-sm text-[#6B7280]">Task yang kamu buat akan muncul di sini, lengkap dengan status ketepatan waktunya.</p>
                <button type="button" className={`${btnPrimary} mt-4`} onClick={() => setCreateFor(null)}><Plus className="h-4 w-4" /> Buat Task</button>
              </div>
            ) : visibleTasks.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-[#6B7280]">Tidak ada task yang cocok dengan filter.</p>
            ) : (
              <table className="w-full">
                <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <tr>
                    <th className={th}>Task</th>
                    <th className={`${th} hidden md:table-cell`}>Untuk</th>
                    <th className={`${th} hidden md:table-cell`}>Deadline</th>
                    <th className={`${th} hidden lg:table-cell`}>Disubmit</th>
                    <th className={`${th} text-right`}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {visibleTasks.map((t) => {
                    const status = taskKpiStatus(t, now);
                    const submitted = toMillis(t.submittedAt);
                    return (
                      <tr key={t.id} tabIndex={0} onClick={() => setSelectedTaskId(t.id)} onKeyDown={(e) => { if (e.key === "Enter") setSelectedTaskId(t.id); }}
                        className="cursor-pointer hover:bg-[#F9FAFB] focus:outline-none focus-visible:bg-[#FFFBEB]">
                        <td className="px-4 py-3 align-top">
                          <p className="text-sm font-semibold text-[#111827]">{t.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-[#6B7280] md:hidden">{nameOf(t)} · {formatDeadline(t.deadline)}</p>
                          <p className="mt-0.5 hidden max-w-[440px] truncate text-xs text-[#6B7280] md:block">{t.instructions}</p>
                        </td>
                        <td className="hidden px-4 py-3 align-top md:table-cell">
                          <p className="text-sm text-[#111827]">{nameOf(t)}</p>
                          <p className="text-xs text-[#6B7280]">{roleLabel(roleOf(t))}</p>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 align-top text-sm text-[#374151] md:table-cell">{formatDeadline(t.deadline)}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3 align-top text-sm text-[#374151] lg:table-cell">
                          {Number.isNaN(submitted) ? <span className="text-[#9CA3AF]">Belum</span> : formatWib(submitted)}
                          {status === "terlambat" && <p className="text-xs text-[#B91C1C]">telat {formatDuration(lateMinutes(t, now))}</p>}
                        </td>
                        <td className="px-4 py-3 text-right align-top"><StatusPill status={status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Rekap KPI ── */}
      {tab === "kpi" && (
        <div className="mt-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#6B7280]">Nilai = 70% ketepatan waktu + 20% penyelesaian + 10% keterlambatan. Klik nama untuk detail.</p>
            <div className="flex gap-2">
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="semua">Semua role</option>
                {kpiRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
              <label className="relative flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <input value={personSearch} onChange={(e) => setPersonSearch(e.target.value)} placeholder="Cari nama" className={`${inputCls} w-full pl-9 sm:w-48`} />
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <table className="w-full">
              <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <tr>
                  <th className={th}>Nama</th>
                  <th className={`${th} text-right`}>Task</th>
                  <th className={`${th} hidden text-right md:table-cell`}>Terpenuhi</th>
                  <th className={`${th} hidden text-right md:table-cell`}>Terlambat</th>
                  <th className={`${th} hidden text-right md:table-cell`}>Proses</th>
                  <th className={`${th} hidden text-right sm:table-cell`}>Tepat waktu</th>
                  <th className={`${th} text-right`}>Nilai</th>
                  <th className={`${th} w-px`}><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {kpiRows.map(({ person, summary, assessment }) => (
                  <tr key={person.uid} tabIndex={0} onClick={() => openPerson(person.uid)} onKeyDown={(e) => { if (e.key === "Enter") openPerson(person.uid); }}
                    className="cursor-pointer hover:bg-[#F9FAFB] focus:outline-none focus-visible:bg-[#FFFBEB]">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-[#111827]">{person.name}</p>
                      <p className="text-xs text-[#6B7280]">
                        {roleLabel(person.role)}
                        {accountNameHint(person) && <span className="text-[#9CA3AF]"> · akun {accountNameHint(person)}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-[#111827]">{summary.total}</td>
                    <td className={`hidden px-4 py-3 text-right text-sm tabular-nums md:table-cell ${summary.terpenuhi ? KPI_STATUS_STYLE.terpenuhi.text : "text-[#D1D5DB]"}`}>{summary.terpenuhi}</td>
                    <td className={`hidden px-4 py-3 text-right text-sm tabular-nums md:table-cell ${summary.terlambat ? KPI_STATUS_STYLE.terlambat.text : "text-[#D1D5DB]"}`}>{summary.terlambat}</td>
                    <td className={`hidden px-4 py-3 text-right text-sm tabular-nums md:table-cell ${summary.proses ? KPI_STATUS_STYLE.proses.text : "text-[#D1D5DB]"}`}>{summary.proses}</td>
                    <td className="hidden px-4 py-3 text-right text-sm tabular-nums text-[#111827] sm:table-cell">{fmtPct(summary.ketepatanWaktu)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums">
                      <span className="font-bold text-[#111827]">{fmtNum(assessment.nilai)}</span>
                      {assessment.grade !== "-" && <span className="ml-1.5 text-xs font-semibold text-[#6B7280]">{assessment.grade}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setCreateFor(person.uid); }}
                        className="whitespace-nowrap rounded-md border border-[#E5E7EB] px-2.5 py-1 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] cursor-pointer">
                        + Task
                      </button>
                    </td>
                  </tr>
                ))}
                {kpiRows.length === 0 && <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-[#6B7280]">Tidak ada personel yang cocok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Akun & Nama ── */}
      {tab === "akun" && <AccountNamesTable accounts={internalAccounts} roleLabel={roleLabel} onSave={doSaveHolder} />}

      {/* ── Panel: detail orang ── */}
      <SidePanel open={!!selectedPerson && !!personAssessment} onClose={() => setSelectedPersonId(null)}
        title={selectedPerson?.name ?? ""}
        subtitle={selectedPerson ? `${roleLabel(selectedPerson.role)}${accountNameHint(selectedPerson) ? ` · akun ${accountNameHint(selectedPerson)}` : ""} · ${periode}` : ""}
        footer={selectedPerson && (
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={personTasks.length === 0} onClick={() => doExport([sheetFor(selectedPerson.uid, personTasks)])}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
            {canGiveTask(selectedPerson) && (
              <button type="button" className={btnPrimary} onClick={() => setCreateFor(selectedPerson.uid)}><Plus className="h-4 w-4" /> Beri Task</button>
            )}
          </div>
        )}>
        {selectedPerson && personAssessment && (
          <div className="space-y-5">
            <SummaryStrip summary={personSummary} />
            <AssessmentPanel assessment={personAssessment} periode={periode} />

            <section>
              <h3 className="mb-2 text-sm font-semibold text-[#111827]">Task {periode}</h3>
              {personTasks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#E5E7EB] px-4 py-6 text-center text-sm text-[#6B7280]">Belum ada task di bulan ini.</p>
              ) : (
                <ul className="divide-y divide-[#F3F4F6] rounded-lg border border-[#E5E7EB]">
                  {personTasks.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setSelectedTaskId(t.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#F9FAFB] cursor-pointer">
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
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-[#111827]">Pindahkan role</h3>
              <div className="flex gap-2">
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={`${inputCls} flex-1 cursor-pointer`}>
                  {(ALL_ROLES as readonly string[]).filter((r) => !["customer", "pelanggan", "super_admin"].includes(r)).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <button type="button" onClick={doChangeRole} className={btnSecondary}
                  disabled={busy || newRole === selectedPerson.role || selectedPerson.uid === user?.uid}>
                  Simpan
                </button>
              </div>
            </section>
          </div>
        )}
      </SidePanel>

      {/* ── Panel: detail task ── */}
      <SidePanel open={!!selectedTask} onClose={() => setSelectedTaskId(null)}
        title={selectedTask?.title ?? ""} subtitle={selectedTask ? `${nameOf(selectedTask)} · ${roleLabel(roleOf(selectedTask))}` : ""}>
        {selectedTask && <TaskDetail task={selectedTask} now={now} />}
      </SidePanel>

      <CreateTaskModal open={createFor !== undefined} onClose={() => setCreateFor(undefined)}
        people={assignees} defaultAssigneeId={createFor} roleLabel={roleLabel} onCreate={doCreate} />
    </div>
  );
}
