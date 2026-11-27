// Form Jurnal Umum + Daftar & Impor Batch Jurnal Umum (PRD 01-dasar.md).
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import {
  createDocument,
  deleteDocument,
  getDocument,
  importJournalBatch,
  listAccounts,
  listDocuments,
  listTags,
  listUnits,
  updateDocument,
} from "@/keuangan/api";
import { formatSen, formatTanggal, keuanganErrorMessage, parseRupiahToSen, todayWib } from "@/keuangan/format";
import type { Account, DocumentSummary, Tag, Unit } from "@/keuangan/types";
import { AttachmentSection, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

interface JournalRowDraft {
  account_kode: string;
  unit_kode: string;
  deskripsi: string;
  debit: number;
  kredit: number;
}

export function JurnalUmumPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [no, setNo] = useState("");
  const [tanggal, setTanggal] = useState(todayWib());
  const [memo, setMemo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rows, setRows] = useState<JournalRowDraft[]>([
    { account_kode: "", unit_kode: "", deskripsi: "", debit: 0, kredit: 0 },
    { account_kode: "", unit_kode: "", deskripsi: "", debit: 0, kredit: 0 },
  ]);
  const [attachments, setAttachments] = useState<{ id: string; filename: string; mime: string; size: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [u, a, t, d] = await Promise.all([listUnits(), listAccounts(), listTags(), listDocuments({ type: "journal" })]);
      setUnits(u);
      setAccounts(a.accounts.filter((x) => !x.is_header && !x.arsip && x.sistem === 0));
      setTags(t.tags);
      setDocs(d);
      if (u[0]) {
        setRows((prev) => prev.map((r) => (r.unit_kode ? r : { ...r, unit_kode: u[0].kode })));
      }
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const totalKredit = rows.reduce((s, r) => s + (r.kredit || 0), 0);

  // Cek keseimbangan per unit
  const unbalancedUnits = useMemo(() => {
    const map = new Map<string, { d: number; k: number }>();
    for (const r of rows) {
      if (!r.unit_kode) continue;
      const cur = map.get(r.unit_kode) || { d: 0, k: 0 };
      cur.d += r.debit || 0;
      cur.k += r.kredit || 0;
      map.set(r.unit_kode, cur);
    }
    return [...map.entries()].filter(([, v]) => v.d !== v.k).map(([k]) => k);
  }, [rows]);

  const resetForm = () => {
    setEditId(null);
    setNo("");
    setTanggal(todayWib());
    setMemo("");
    setSelectedTags([]);
    setAttachments([]);
    const u0 = units[0]?.kode || "";
    setRows([
      { account_kode: "", unit_kode: u0, deskripsi: "", debit: 0, kredit: 0 },
      { account_kode: "", unit_kode: u0, deskripsi: "", debit: 0, kredit: 0 },
    ]);
  };

  const openDoc = async (id: string) => {
    try {
      const detail = await getDocument(id);
      setEditId(detail.document.id);
      setNo(detail.document.no);
      setTanggal(detail.document.tanggal);
      setMemo(detail.document.memo);
      setSelectedTags(detail.tags.map((t) => t.id));
      setAttachments(detail.attachments);
      setRows(
        detail.journal.map((jl) => ({
          account_kode: jl.account_kode,
          unit_kode: jl.unit_kode,
          deskripsi: jl.keterangan,
          debit: jl.debit,
          kredit: jl.kredit,
        })),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRows = rows.filter((r) => r.account_kode && (r.debit > 0 || r.kredit > 0));
    if (cleanRows.length < 2) {
      showToast({ message: "Minimal 2 baris jurnal harus diisi.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: "journal",
        no: no.trim() || undefined,
        tanggal,
        unit_kode: cleanRows[0].unit_kode,
        memo,
        tags: selectedTags,
        attachment_ids: attachments.map((a) => a.id),
        lines: cleanRows,
      };
      if (editId) {
        await updateDocument(editId, payload);
        showToast({ message: "Jurnal Umum diperbarui.", variant: "success" });
      } else {
        await createDocument(payload);
        showToast({ message: "Jurnal Umum tersimpan.", variant: "success" });
      }
      resetForm();
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus jurnal umum ini?")) return;
    try {
      await deleteDocument(id);
      if (editId === id) resetForm();
      showToast({ message: "Jurnal Umum dihapus.", variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const importedRows = raw.map((r) => ({
        no: String(r["No Transaksi"] ?? r.no ?? "").trim(),
        tanggal: String(r.Tanggal ?? r.tanggal ?? todayWib()).slice(0, 10),
        unit_kode: String(r.Unit ?? r.unit_kode ?? units[0]?.kode ?? "").trim().toUpperCase(),
        account_kode: String(r["Kode Akun"] ?? r.account_kode ?? "").trim(),
        deskripsi: String(r.Deskripsi ?? r.deskripsi ?? "").trim(),
        memo: String(r.Memo ?? r.memo ?? "").trim(),
        debit: typeof r.Debit === "number" ? Math.round(r.Debit * 100) : parseRupiahToSen(String(r.Debit ?? r.debit ?? 0)),
        kredit: typeof r.Kredit === "number" ? Math.round(r.Kredit * 100) : parseRupiahToSen(String(r.Kredit ?? r.kredit ?? 0)),
      }));
      const res = await importJournalBatch(importedRows);
      showToast({ message: `${res.imported} jurnal umum berhasil diimpor.`, variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/keuangan/akun" className={BTN_SECONDARY}>
            <ArrowLeft className="h-4 w-4" /> Daftar Akun
          </Link>
          <div>
            <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Jurnal Umum</h1>
            <p className="text-sm text-[#6B7280]">Entri jurnal manual double-entry. Harus seimbang total maupun per anak perusahaan.</p>
          </div>
        </div>
        <label className={BTN_SECONDARY}>
          <Upload className="h-4 w-4" /> Impor Jurnal (Excel/CSV)
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportExcel} />
        </label>
      </div>

      {/* Form Jurnal */}
      <form onSubmit={handleSave} className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-[#111827]">
            {editId ? `Ubah Jurnal ${no}` : "Buat Jurnal Umum Baru"}
          </h2>
          {editId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold text-amber-700 hover:underline cursor-pointer">
              + Buat Jurnal Baru
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nomor Transaksi (opsional)</label>
            <input type="text" placeholder="Otomatis" value={no} onChange={(e) => setNo(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Tanggal</label>
            <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Memo</label>
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Keterangan jurnal..." className={INPUT_CLS} />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#6B7280]">Tag:</span>
            {tags.map((t) => {
              const active = selectedTags.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTags(active ? selectedTags.filter((x) => x !== t.id) : [...selectedTags, t.id])}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer ${
                    active ? "bg-amber-100 border-amber-400 text-amber-900" : "bg-white border-gray-200 text-gray-600"
                  }`}
                >
                  #{t.nama}
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280]">
              <tr>
                <th className="px-3 py-2 text-left">Akun</th>
                <th className="px-3 py-2 text-left">Anak Perusahaan</th>
                <th className="px-3 py-2 text-left">Deskripsi</th>
                <th className="px-3 py-2 text-right">Debit (Rp)</th>
                <th className="px-3 py-2 text-right">Kredit (Rp)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td className="p-2 min-w-[210px]">
                    <select
                      value={r.account_kode}
                      onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, account_kode: e.target.value } : x)))}
                      className={INPUT_CLS}
                    >
                      <option value="">— Pilih Akun —</option>
                      {accounts.map((a) => (
                        <option key={a.kode} value={a.kode}>
                          {a.kode} — {a.nama}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 min-w-[140px]">
                    <select
                      value={r.unit_kode}
                      onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, unit_kode: e.target.value } : x)))}
                      className={INPUT_CLS}
                    >
                      {units.map((u) => (
                        <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 min-w-[160px]">
                    <input
                      type="text"
                      value={r.deskripsi}
                      onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, deskripsi: e.target.value } : x)))}
                      className={INPUT_CLS}
                      placeholder="Deskripsi baris"
                    />
                  </td>
                  <td className="p-2 min-w-[140px]">
                    <RupiahInput
                      valueSen={r.debit}
                      onChangeSen={(v) => setRows(rows.map((x, i) => (i === idx ? { ...x, debit: v, kredit: v > 0 ? 0 : x.kredit } : x)))}
                    />
                  </td>
                  <td className="p-2 min-w-[140px]">
                    <RupiahInput
                      valueSen={r.kredit}
                      onChangeSen={(v) => setRows(rows.map((x, i) => (i === idx ? { ...x, kredit: v, debit: v > 0 ? 0 : x.debit } : x)))}
                    />
                  </td>
                  <td className="p-2 text-center">
                    {rows.length > 2 && (
                      <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="text-red-500 cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F9FAFB] font-bold border-t border-[#E5E7EB]">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-right">Total</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatSen(totalDebit)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatSen(totalKredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setRows([...rows, { account_kode: "", unit_kode: rows[rows.length - 1]?.unit_kode || units[0]?.kode || "", deskripsi: "", debit: 0, kredit: 0 }])}
            className={BTN_SECONDARY}
          >
            <Plus className="h-4 w-4" /> Tambah Baris
          </button>
          <div className="text-xs font-bold">
            {totalDebit === totalKredit && totalDebit > 0 && unbalancedUnits.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Seimbang total dan per unit
              </span>
            ) : unbalancedUnits.length > 0 ? (
              <span className="text-red-600">Tidak seimbang pada unit: {unbalancedUnits.join(", ")}</span>
            ) : (
              <span className="text-red-600">Selisih: {formatSen(Math.abs(totalDebit - totalKredit))}</span>
            )}
          </div>
        </div>

        <AttachmentSection
          documentId={editId || undefined}
          attachments={attachments}
          onUploaded={(att) => setAttachments((p) => [...p, att])}
          onDeleted={(id) => setAttachments((p) => p.filter((x) => x.id !== id))}
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
          {editId && (
            <button type="button" onClick={() => handleDelete(editId)} className={BTN_DANGER}>
              Hapus
            </button>
          )}
          <button type="submit" disabled={saving || totalDebit === 0 || totalDebit !== totalKredit || unbalancedUnits.length > 0} className={BTN_PRIMARY}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editId ? "Simpan Perubahan" : "Buat Jurnal"}
          </button>
        </div>
      </form>

      {/* Daftar Jurnal Umum */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <div className="px-5 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
          <h3 className="font-bold text-sm text-[#111827] flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-amber-600" /> Riwayat Jurnal Umum
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-2.5 text-left">Tanggal</th>
              <th className="px-4 py-2.5 text-left">Nomor</th>
              <th className="px-4 py-2.5 text-left">Unit</th>
              <th className="px-4 py-2.5 text-left">Memo</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-[#6B7280]">Belum ada transaksi Jurnal Umum.</td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggal(d.tanggal)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-amber-700">{d.no}</td>
                  <td className="px-4 py-2.5"><UnitBadge kode={d.unit_kode} /></td>
                  <td className="px-4 py-2.5 text-xs text-[#4B5563]">{d.memo || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">{formatSen(d.total)}</td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button type="button" onClick={() => openDoc(d.id)} className="text-xs font-bold text-amber-700 hover:underline cursor-pointer">
                      Buka
                    </button>
                    <button type="button" onClick={() => handleDelete(d.id)} className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
