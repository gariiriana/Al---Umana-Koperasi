import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  CalendarDays,
  Code2,
  Database,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { ALL_ROLES } from "@/constants/roles";
import {
  permanentlyDeleteArchivedDocuments,
  restoreArchivedDocuments,
  subscribeRecycleBin,
  type RecycleBinRecord,
} from "@/services/developerRecycleBinService";

interface ArchiveGroup {
  id: string;
  batchId: string | null;
  title: string;
  subtitle: string;
  records: RecycleBinRecord[];
  deletedAt?: unknown;
  deletedByEmail: string | null;
  deletedByRole: string | null;
  isMbgBatch: boolean;
}

const LEGACY_ROLE = "legacy_unattributed";

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDate(value: unknown): string {
  const date = toDate(value);
  return date ? date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Belum tersinkron";
}

function dateKey(value: unknown): string {
  const date = toDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function monthKey(value: unknown): string {
  const date = toDate(value);
  if (!date) return "";
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function yearKey(value: unknown): string {
  const date = toDate(value);
  return date ? String(date.getFullYear()) : "";
}

function safeJson(data: Record<string, unknown>): string {
  return JSON.stringify(
    data,
    (_key, value) =>
      value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate().toISOString()
        : value,
    2,
  );
}

function getMbgBatchId(record: RecycleBinRecord): string | null {
  if (record.sourcePath.startsWith("mbg_pm_batches/")) return record.documentId;
  const batchId = record.originalData.batchId;
  if (typeof batchId === "string" && batchId) return batchId;
  return record.reason?.match(/batch\s+([^\s]+)/i)?.[1] || null;
}

function roleValue(record: RecycleBinRecord): string {
  return record.deletedByRole || LEGACY_ROLE;
}

function roleLabel(role: string): string {
  if (role === LEGACY_ROLE) return "Arsip lama · role belum tercatat";
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function makeGroups(records: RecycleBinRecord[]): ArchiveGroup[] {
  const grouped = new Map<string, ArchiveGroup>();
  for (const record of records) {
    const batchId = getMbgBatchId(record);
    const key = batchId ? "mbg-batch:" + batchId : "document:" + record.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.records.push(record);
      continue;
    }
    grouped.set(key, {
      id: key,
      batchId,
      title: batchId ? "Batch MBG" : record.sourcePath,
      subtitle: batchId ? "ID batch: " + batchId : record.reason || "Dokumen individual",
      records: [record],
      deletedAt: record.deletedAt,
      deletedByEmail: record.deletedByEmail,
      deletedByRole: record.deletedByRole || null,
      isMbgBatch: Boolean(batchId),
    });
  }

  for (const group of grouped.values()) {
    if (!group.batchId) continue;
    const parent = group.records.find((record) => record.sourcePath === "mbg_pm_batches/" + group.batchId);
    const batchDate = parent?.originalData.tanggal;
    group.title = "Batch MBG" + (typeof batchDate === "string" && batchDate ? " · " + batchDate : "");
    if (new Set(group.records.map(roleValue)).size > 1) group.deletedByRole = "mixed";
  }

  return [...grouped.values()];
}

function deletedRoleLabel(role: string | null): string {
  if (role === "mixed") return "Role campuran";
  return roleLabel(role || LEGACY_ROLE);
}

function matchesFilters(record: RecycleBinRecord, roleFilter: string, exactDate: string, monthFilter: string, yearFilter: string): boolean {
  const currentDate = dateKey(record.deletedAt);
  const currentMonth = monthKey(record.deletedAt);
  const currentYear = yearKey(record.deletedAt);
  const roleMatches = roleFilter === "all" || roleValue(record) === roleFilter;
  const dateMatches = !exactDate || currentDate === exactDate;
  const monthMatches = monthFilter === "all" || currentMonth === monthFilter;
  const yearMatches = yearFilter === "all" || currentYear === yearFilter;
  return roleMatches && dateMatches && monthMatches && yearMatches;
}

export function DeveloperControlCenterPage() {
  const [records, setRecords] = useState<RecycleBinRecord[]>([]);
  const [selected, setSelected] = useState<ArchiveGroup | null>(null);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [exactDate, setExactDate] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => subscribeRecycleBin(setRecords, (err) => setError(err.message)), []);

  const groups = useMemo(() => makeGroups(records), [records]);

  const monthOptions = useMemo(() => {
    const values = [...new Set(records.map((record) => monthKey(record.deletedAt)).filter(Boolean))];
    return values.sort((a, b) => b.localeCompare(a));
  }, [records]);

  const yearOptions = useMemo(() => {
    const values = [...new Set(records.map((record) => yearKey(record.deletedAt)).filter(Boolean))];
    return values.sort((a, b) => Number(b) - Number(a));
  }, [records]);

  const visibleGroups = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return groups.filter((group) => {
      const text = [
        group.title,
        group.subtitle,
        group.deletedByEmail,
        group.deletedByRole,
        ...group.records.flatMap((record) => [record.sourcePath, record.reason]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return group.records.some((record) => matchesFilters(record, roleFilter, exactDate, monthFilter, yearFilter)) && (!query || text.includes(query));
    });
  }, [groups, keyword, roleFilter, exactDate, monthFilter, yearFilter]);

  const stats = useMemo(() => {
    const visibleRecords = groups
      .flatMap((group) => group.records)
      .filter((record) => matchesFilters(record, roleFilter, exactDate, monthFilter, yearFilter));
    return {
      actions: visibleGroups.length,
      documents: visibleRecords.length,
      roles: new Set(visibleRecords.map(roleValue)).size,
    };
  }, [groups, visibleGroups, roleFilter, exactDate, monthFilter, yearFilter]);

  const selectedInspectionRecord = useMemo(() => {
    if (!selected) return null;
    return (
      selected.records.find(
        (record) => selected.batchId && record.sourcePath === "mbg_pm_batches/" + selected.batchId,
      ) || selected.records[0]
    );
  }, [selected]);

  const resetFilters = () => {
    setKeyword("");
    setRoleFilter("all");
    setExactDate("");
    setMonthFilter("all");
    setYearFilter("all");
  };

  const restoreGroup = async (group: ArchiveGroup, overwrite = false) => {
    setBusyId(group.id);
    try {
      await restoreArchivedDocuments(
        group.records.map((record) => record.id),
        overwrite,
      );
      setError("");
      if (selected?.id === group.id) setSelected(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pemulihan data gagal.";
      setError(message);
      if (!overwrite && message.includes("sudah berisi data") && window.confirm("Ada data baru di lokasi asli. Timpa seluruh data batch dengan versi arsip?")) {
        await restoreGroup(group, true);
      }
    } finally {
      setBusyId(null);
    }
  };

  const destroyGroup = async (group: ArchiveGroup) => {
    if (!window.confirm("Hapus permanen " + group.records.length + " dokumen dari " + group.title + "? Tindakan ini tidak dapat dibatalkan.")) return;
    setBusyId(group.id);
    try {
      await permanentlyDeleteArchivedDocuments(group.records.map((record) => record.id));
      if (selected?.id === group.id) setSelected(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penghapusan permanen gagal.");
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters = Boolean(keyword || exactDate || roleFilter !== "all" || monthFilter !== "all" || yearFilter !== "all");

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950 p-6 text-white shadow-xl">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200"><Code2 className="h-4 w-4" /> Developer · Audit Restricted</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Audit Recycle Bin</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">Lacak setiap data yang dihapus, siapa rolenya, kapan waktunya, lalu pulihkan satu batch tanpa menimpa data baru.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 lg:min-w-36">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-100">Aksi tampil</p>
            <p className="mt-1 text-3xl font-black">{stats.actions}</p>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><ShieldAlert className="h-5 w-5 shrink-0" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Database className="h-5 w-5 text-cyan-700" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">Batch / aksi terarsip</p><p className="mt-1 text-2xl font-black text-slate-900">{stats.actions}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><ArchiveRestore className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">Dokumen cocok filter</p><p className="mt-1 text-2xl font-black text-slate-900">{stats.documents}</p></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><ShieldAlert className="h-5 w-5 text-amber-600" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-700">Role terdeteksi</p><p className="mt-1 text-2xl font-black text-amber-950">{stats.roles}</p></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><Filter className="h-5 w-5 text-cyan-700" /> Filter audit</h2>
            <p className="mt-1 text-sm text-slate-500">Tanggal memakai waktu saat data dihapus, bukan tanggal isi batch. Arsip lama dicocokkan ke role profil berdasarkan UID penghapus.</p>
          </div>
          {hasFilters && <button onClick={resetFilters} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" /> Reset filter</button>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Cari sumber</span><span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Batch, path, email" className="w-full bg-transparent text-sm text-slate-800 outline-none" /></span></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Role penghapus</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"><option value="all">Semua role</option><option value={LEGACY_ROLE}>Arsip lama · role belum tercatat</option>{ALL_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tanggal hapus</span><span className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><CalendarDays className="h-4 w-4 text-slate-400" /><input type="date" value={exactDate} onChange={(event) => setExactDate(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" /></span></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Bulan hapus</span><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"><option value="all">Semua bulan</option>{monthOptions.map((month) => <option key={month} value={month}>{new Date(month + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tahun hapus</span><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"><option value="all">Semua tahun</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div><h2 className="text-xl font-black text-slate-900">Tabel audit penghapusan</h2><p className="mt-1 text-sm text-slate-500">{visibleGroups.length} aksi tampil · {records.length} dokumen di jendela arsip</p></div>
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Sinkronkan</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-black">Tanggal hapus</th><th className="px-5 py-3 font-black">Role</th><th className="px-5 py-3 font-black">Batch / sumber</th><th className="px-5 py-3 font-black">Dokumen</th><th className="px-5 py-3 font-black">Penghapus</th><th className="px-5 py-3 text-right font-black">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleGroups.map((group) => <tr key={group.id} onClick={() => setSelected(group)} className={"cursor-pointer align-top transition hover:bg-cyan-50/50 " + (selected?.id === group.id ? "bg-cyan-50" : "")}>
                <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-700"><span className="block">{formatDate(group.deletedAt)}</span><span className="mt-1 block text-xs font-normal text-slate-400">{group.subtitle}</span></td>
                <td className="px-5 py-4"><span className={"inline-flex max-w-48 rounded-full px-2.5 py-1 text-xs font-bold " + (group.deletedByRole === LEGACY_ROLE || !group.deletedByRole ? "bg-amber-100 text-amber-800" : group.deletedByRole === "mixed" ? "bg-violet-100 text-violet-800" : "bg-cyan-100 text-cyan-800")}>{deletedRoleLabel(group.deletedByRole)}</span></td>
                <td className="max-w-[290px] px-5 py-4"><p className="font-semibold text-slate-900">{group.title}</p>{group.batchId && <p className="mt-1 break-all font-mono text-xs text-slate-400">{group.batchId}</p>}</td>
                <td className="px-5 py-4 text-sm font-black text-slate-800">{group.records.length}<span className="ml-1 text-xs font-medium text-slate-400">dokumen</span></td>
                <td className="max-w-52 break-all px-5 py-4 text-sm text-slate-600">{group.deletedByEmail || "Tidak tercatat"}</td>
                <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-2"><button onClick={() => setSelected(group)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Detail</button><button disabled={busyId === group.id} onClick={() => void restoreGroup(group)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><ArchiveRestore className="h-3.5 w-3.5" /> Pulihkan</button><button disabled={busyId === group.id} onClick={() => void destroyGroup(group)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Permanen</button></div></td>
              </tr>)}
              {!visibleGroups.length && <tr><td colSpan={6} className="px-5 py-16 text-center text-sm font-semibold text-slate-400">Tidak ada arsip yang cocok dengan filter ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && selectedInspectionRecord && <section className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Inspeksi arsip</p><h2 className="mt-1 text-xl font-black">{selected.title}</h2></div><button onClick={() => setSelected(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Tutup detail"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm"><p><span className="text-slate-400">Role:</span> {deletedRoleLabel(selected.deletedByRole)}</p><p className="mt-2"><span className="text-slate-400">Dihapus:</span> {formatDate(selected.deletedAt)}</p><p className="mt-2 break-all"><span className="text-slate-400">Penghapus:</span> {selected.deletedByEmail || "Tidak tercatat"}</p><p className="mt-2"><span className="text-slate-400">Dokumen terkait:</span> {selected.records.length}</p></div>
          <div className="mt-4 max-h-56 space-y-2 overflow-auto rounded-2xl bg-black/40 p-4">{selected.records.map((record) => <p key={record.id} className="break-all font-mono text-xs text-cyan-50">{record.sourcePath}</p>)}</div>
          <button disabled={busyId === selected.id} onClick={() => void restoreGroup(selected)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><ArchiveRestore className="h-4 w-4" /> Pulihkan {selected.records.length} dokumen</button>
        </aside>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Snapshot mentah</p><p className="mt-2 break-all font-mono text-xs text-slate-500">{selectedInspectionRecord.sourcePath}</p><pre className="mt-4 max-h-[28rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-cyan-50">{safeJson(selectedInspectionRecord.originalData)}</pre></div>
      </section>}
    </div>
  );
}
