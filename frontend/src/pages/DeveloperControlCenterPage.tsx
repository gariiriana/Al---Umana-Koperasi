import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArchiveRestore, Code2, Database, Eye, RefreshCw, Search, ShieldAlert, Trash2 } from "lucide-react";
import {
  permanentlyDeleteArchivedDocument,
  restoreArchivedDocument,
  subscribeRecycleBin,
  type RecycleBinRecord,
} from "@/services/developerRecycleBinService";

function formatDate(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString("id-ID");
  }
  if (typeof value === "string") return new Date(value).toLocaleString("id-ID");
  return "Sedang disinkronkan";
}

function safeJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, (_key, value) => {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return value;
  }, 2);
}

export function DeveloperControlCenterPage() {
  const [records, setRecords] = useState<RecycleBinRecord[]>([]);
  const [selected, setSelected] = useState<RecycleBinRecord | null>(null);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => subscribeRecycleBin(setRecords, (err) => setError(err.message)), []);

  const visibleRecords = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record) => [record.sourcePath, record.documentId, record.deletedByEmail, record.reason]
      .filter(Boolean).join(" ").toLowerCase().includes(keyword));
  }, [filter, records]);

  const restore = async (record: RecycleBinRecord, overwrite = false) => {
    setBusyId(record.id);
    try {
      await restoreArchivedDocument(record.id, overwrite);
      setError("");
      if (selected?.id === record.id) setSelected(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pemulihan data gagal.";
      setError(message);
      if (message.includes("sudah berisi data") && window.confirm("Data di lokasi asli sudah ada. Timpa dengan versi arsip?")) {
        await restore(record, true);
      }
    } finally {
      setBusyId(null);
    }
  };

  const destroy = async (record: RecycleBinRecord) => {
    if (!window.confirm(`Hapus permanen ${record.sourcePath}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setBusyId(record.id);
    try {
      await permanentlyDeleteArchivedDocument(record.id);
      if (selected?.id === record.id) setSelected(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Penghapusan permanen gagal.");
    } finally {
      setBusyId(null);
    }
  };

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-cyan-950 to-indigo-950 p-7 text-white shadow-xl">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200"><Code2 className="h-4 w-4" /> Developer · Restricted</p><h1 className="mt-2 text-3xl font-black tracking-tight">Developer Control Center</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Kontrol pemulihan data lintas role. Setiap penghapusan yang memakai alur aplikasi disalin terlebih dahulu ke recycle bin.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3"><p className="text-xs font-bold uppercase tracking-wider text-cyan-100">Arsip tersedia</p><p className="mt-1 text-3xl font-black">{records.length}</p></div></div>
    </section>

    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><ShieldAlert className="h-5 w-5 shrink-0" />{error}</div>}

    <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Database className="h-6 w-6 text-cyan-700" /><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Dokumen tersimpan</p><p className="mt-1 text-3xl font-black text-slate-900">{records.length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ArchiveRestore className="h-6 w-6 text-emerald-600" /><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Mode pemulihan</p><p className="mt-1 text-lg font-black text-slate-900">Aman, tanpa timpa</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><AlertTriangle className="h-6 w-6 text-amber-600" /><p className="mt-4 text-xs font-bold uppercase tracking-wider text-amber-700">Akses berkuasa</p><p className="mt-1 text-lg font-black text-amber-950">Developer only</p></div></section>

    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-900">Recycle Bin</h2><p className="mt-1 text-sm text-slate-500">Maksimum 250 arsip terbaru ditampilkan.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-slate-400"><Search className="h-4 w-4" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Cari path, email, alasan" className="w-48 bg-transparent text-sm text-slate-800 outline-none" /></label></div><div className="mt-5 max-h-[34rem] space-y-2 overflow-y-auto pr-1">{visibleRecords.length ? visibleRecords.map((record) => <article key={record.id} className={`rounded-2xl border p-4 transition ${selected?.id === record.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200 hover:border-slate-300"}`}><button onClick={() => setSelected(record)} className="w-full text-left"><p className="break-all font-mono text-sm font-bold text-slate-900">{record.sourcePath}</p><p className="mt-2 text-xs text-slate-500">{formatDate(record.deletedAt)} · {record.deletedByEmail || "Sistem / tidak diketahui"}</p>{record.reason && <p className="mt-1 text-xs font-medium text-slate-600">{record.reason}</p>}</button><div className="mt-3 flex flex-wrap gap-2"><button disabled={busyId === record.id} onClick={() => void restore(record)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><ArchiveRestore className="h-3.5 w-3.5" /> Pulihkan</button><button onClick={() => setSelected(record)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Detail</button><button disabled={busyId === record.id} onClick={() => void destroy(record)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Permanen</button></div></article>) : <p className="py-12 text-center text-sm font-semibold text-slate-400">Tidak ada arsip yang cocok.</p>}</div></div>
      <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-100 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Inspeksi arsip</p><h2 className="mt-1 text-xl font-black">{selected ? selected.documentId : "Pilih data"}</h2></div><RefreshCw className="h-6 w-6 text-cyan-300" /></div>{selected ? <><div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm"><p><span className="text-slate-400">Path asal:</span> <span className="break-all font-mono text-cyan-100">{selected.sourcePath}</span></p><p className="mt-2"><span className="text-slate-400">Penghapus:</span> {selected.deletedByEmail || "Tidak tercatat"}</p><p className="mt-2"><span className="text-slate-400">Alasan:</span> {selected.reason || "Tidak ada"}</p></div><pre className="mt-4 max-h-[25rem] overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-5 text-cyan-50">{safeJson(selected.originalData)}</pre><button disabled={busyId === selected.id} onClick={() => void restore(selected)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><ArchiveRestore className="h-4 w-4" /> Pulihkan ke lokasi asal</button></> : <p className="mt-10 text-sm text-slate-400">Pilih arsip dari panel kiri untuk memeriksa snapshot mentah dan melakukan pemulihan.</p>}</aside></section>
  </div>;
}
