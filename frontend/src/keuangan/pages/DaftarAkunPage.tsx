// Halaman Daftar Akun / Chart of Accounts (COA) sesuai PRD 01-dasar.md.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { Download, FilePlus2, Lock, Plus, RotateCcw, Scale, Search, Trash2, Upload } from "lucide-react";
import { createAccount, deleteAccount, importAccounts, listAccounts, listTaxes, listUnits, resetAccounts, updateAccount } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, AccountCategory, Tax, Unit } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function DaftarAkunPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [showArsip, setShowArsip] = useState(false);
  const [search, setSearch] = useState("");
  const [katFilter, setKatFilter] = useState<number | "">("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({
    kode: "",
    nama: "",
    kategori: 3,
    header_kode: "",
    is_header: false,
    deskripsi: "",
    tax_id: "",
    bank_nama: "",
    no_rekening: "",
    unit_kode: "",
  });

  const load = async () => {
    try {
      const [res, u, t] = await Promise.all([
        listAccounts({ unit_kode: unitFilter || undefined, arsip: showArsip }),
        listUnits(),
        listTaxes(),
      ]);
      setAccounts(res.accounts);
      setCategories(res.categories);
      setUnits(u);
      setTaxes(t);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [unitFilter, showArsip]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (katFilter !== "" && a.kategori !== Number(katFilter)) return false;
      if (q && !a.kode.toLowerCase().includes(q) && !a.nama.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [accounts, search, katFilter]);

  const headerOptions = useMemo(
    () => accounts.filter((a) => a.is_header && a.kategori === Number(form.kategori)),
    [accounts, form.kategori],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      kode: "",
      nama: "",
      kategori: 16,
      header_kode: "",
      is_header: false,
      deskripsi: "",
      tax_id: "",
      bank_nama: "",
      no_rekening: "",
      unit_kode: "",
    });
    setModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    setForm({
      kode: acc.kode,
      nama: acc.nama,
      kategori: acc.kategori,
      header_kode: acc.header_kode || "",
      is_header: Boolean(acc.is_header),
      deskripsi: acc.deskripsi || "",
      tax_id: acc.tax_id || "",
      bank_nama: acc.bank_nama || "",
      no_rekening: acc.no_rekening || "",
      unit_kode: acc.unit_kode || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await updateAccount(editing.kode, {
          nama: form.nama,
          kategori: Number(form.kategori),
          deskripsi: form.deskripsi,
          tax_id: form.tax_id || null,
          bank_nama: form.bank_nama || null,
          no_rekening: form.no_rekening || null,
          unit_kode: form.unit_kode || null,
        });
        showToast({ message: `Akun ${editing.kode} diperbarui.`, variant: "success" });
      } else {
        await createAccount({
          kode: form.kode.trim() || undefined,
          nama: form.nama,
          kategori: Number(form.kategori),
          header_kode: form.header_kode || null,
          is_header: form.is_header,
          deskripsi: form.deskripsi,
          tax_id: form.tax_id || null,
          bank_nama: form.bank_nama || null,
          no_rekening: form.no_rekening || null,
          unit_kode: form.unit_kode || null,
        });
        showToast({ message: "Akun baru ditambahkan.", variant: "success" });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleArchive = async (acc: Account) => {
    try {
      await updateAccount(acc.kode, { arsip: acc.arsip ? 0 : 1 });
      showToast({ message: acc.arsip ? "Akun diaktifkan kembali." : "Akun diarsipkan.", variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleDelete = async (acc: Account) => {
    if (!window.confirm(`Hapus akun ${acc.kode} — ${acc.nama}?`)) return;
    try {
      await deleteAccount(acc.kode);
      showToast({ message: "Akun dihapus.", variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Kembalikan Daftar Akun ke bawaan? Hanya bisa jika belum ada transaksi.")) return;
    try {
      await resetAccounts();
      showToast({ message: "Daftar akun dikembalikan ke bawaan.", variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleExport = () => {
    const aoa = [
      ["Kode Akun", "Nama Akun", "Kategori ID", "Kategori", "Header Kode", "Is Header", "Unit", "Bank", "No Rekening", "Deskripsi"],
      ...accounts.map((a) => [
        a.kode,
        a.nama,
        a.kategori,
        a.kategori_nama || "",
        a.header_kode || "",
        a.is_header,
        a.unit_kode || "",
        a.bank_nama || "",
        a.no_rekening || "",
        a.deskripsi || "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Akun");
    XLSX.writeFile(wb, "daftar-akun-al-umanaa.xlsx");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const rows = raw.map((r) => ({
        kode: String(r["Kode Akun"] ?? r.kode ?? "").trim(),
        nama: String(r["Nama Akun"] ?? r.nama ?? "").trim(),
        kategori: Number(r["Kategori ID"] ?? r.kategori ?? 0),
        header_kode: String(r["Header Kode"] ?? r.header_kode ?? "").trim() || null,
        is_header: Number(r["Is Header"] ?? r.is_header ?? 0) ? 1 : 0,
        deskripsi: String(r.Deskripsi ?? r.deskripsi ?? "").trim(),
      }));
      const res = await importAccounts(rows);
      showToast({ message: `${res.imported} akun diimpor.`, variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Daftar Akun (COA)</h1>
          <p className="text-sm text-[#6B7280]">17 kategori akun standar pembukuan + akun antar unit otomatis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/keuangan/akun/saldo-awal" className={BTN_SECONDARY}>
            <Scale className="h-4 w-4 text-amber-600" /> Atur Saldo Awal
          </Link>
          <Link to="/keuangan/jurnal-umum" className={BTN_SECONDARY}>
            <FilePlus2 className="h-4 w-4 text-amber-600" /> Buat Jurnal Umum
          </Link>
          <button type="button" onClick={openCreate} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Buat Akun Baru
          </button>
        </div>
      </div>

      {/* Filter & Actions */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kode atau nama akun..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLS} pl-9`}
          />
        </div>
        <select value={katFilter} onChange={(e) => setKatFilter(e.target.value ? Number(e.target.value) : "")} className={`${INPUT_CLS} w-auto`}>
          <option value="">Semua Kategori (1–17)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}. {c.nama}
            </option>
          ))}
        </select>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className={`${INPUT_CLS} w-auto`}>
          <option value="">Saldo Gabungan</option>
          {units.map((u) => (
            <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B5563] cursor-pointer">
          <input type="checkbox" checked={showArsip} onChange={(e) => setShowArsip(e.target.checked)} />
          Tampilkan Arsip
        </label>
        <div className="flex items-center gap-2 ml-auto">
          <label className={BTN_SECONDARY}>
            <Upload className="h-4 w-4" /> Impor
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
          </label>
          <button type="button" onClick={handleExport} className={BTN_SECONDARY}>
            <Download className="h-4 w-4" /> Ekspor
          </button>
          <button type="button" onClick={handleReset} className={BTN_SECONDARY} title="Reset ke akun bawaan">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabel COA */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-3 text-left">Kode Akun</th>
              <th className="px-4 py-3 text-left">Nama Akun</th>
              <th className="px-4 py-3 text-left">Kategori</th>
              <th className="px-4 py-3 text-left">Unit</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {filtered.map((a) => (
              <tr key={a.kode} className={`${a.is_header ? "bg-amber-50/40 font-bold" : ""} ${a.arsip ? "opacity-55" : ""}`}>
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                  {a.kode}
                  {a.sistem === 1 && (
                    <span title="Akun Sistem" className="inline-flex align-middle ml-1">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2.5 ${a.header_kode ? "pl-8" : ""}`}>
                  {a.kategori === 3 && !a.is_header ? (
                    <Link to={`/keuangan/kas-bank/${encodeURIComponent(a.kode)}/bku`} className="font-semibold text-amber-700 hover:underline">
                      {a.nama}
                    </Link>
                  ) : (
                    <span>{a.nama}</span>
                  )}
                  {a.is_header === 1 && <span className="ml-2 text-[10px] rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Header</span>}
                  {a.arsip === 1 && <span className="ml-2 text-[10px] rounded bg-gray-200 px-1.5 py-0.5 text-gray-700">Arsip</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-[#4B5563]">{a.kategori_nama}</td>
                <td className="px-4 py-2.5">
                  {(a.kategori === 3 || a.kategori === 9) && !a.is_header ? <UnitBadge kode={a.unit_kode} /> : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap">{formatSen(a.saldo || 0)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                  {a.sistem === 0 && (
                    <>
                      <button type="button" onClick={() => openEdit(a)} className="text-xs font-bold text-amber-700 hover:underline cursor-pointer">
                        Ubah
                      </button>
                      <button type="button" onClick={() => handleArchive(a)} className="text-xs font-semibold text-[#6B7280] hover:underline cursor-pointer">
                        {a.arsip ? "Aktifkan" : "Arsip"}
                      </button>
                      {!a.locked && !a.locked_mapping && (
                        <button type="button" onClick={() => handleDelete(a)} className="text-red-500 hover:text-red-700 cursor-pointer" title="Hapus">
                          <Trash2 className="inline h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalFrame open={modalOpen} title={editing ? `Ubah Akun ${editing.kode}` : "Buat Akun Baru"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nomor Kode Akun {editing ? "" : "(kosongkan untuk otomatis)"}</label>
              <input type="text" value={form.kode} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, kode: e.target.value })} className={INPUT_CLS} placeholder="mis. 6-60099" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Kategori</label>
              <select
                value={form.kategori}
                disabled={Boolean(editing?.locked)}
                onChange={(e) => setForm({ ...form, kategori: Number(e.target.value), header_kode: "" })}
                className={INPUT_CLS}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.id}. {c.nama}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Akun</label>
            <input type="text" required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className={INPUT_CLS} />
          </div>
          {!editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">Sub-Akun Dari Header (opsional)</label>
                <select value={form.header_kode} onChange={(e) => setForm({ ...form, header_kode: e.target.value })} className={INPUT_CLS}>
                  <option value="">— Bukan sub-akun —</option>
                  {headerOptions.map((h) => (
                    <option key={h.kode} value={h.kode}>{h.kode} — {h.nama}</option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[#374151] pt-4 cursor-pointer">
                <input type="checkbox" checked={form.is_header} onChange={(e) => setForm({ ...form, is_header: e.target.checked })} />
                Jadikan Akun Header (induk saja)
              </label>
            </div>
          )}

          {(Number(form.kategori) === 3 || Number(form.kategori) === 9) && !form.is_header && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#F9FAFB] p-3 border border-[#E5E7EB]">
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">Unit Pemilik Rekening</label>
                <select value={form.unit_kode} onChange={(e) => setForm({ ...form, unit_kode: e.target.value })} className={INPUT_CLS}>
                  <option value="">Bersama (Semua Unit)</option>
                  {units.map((u) => (
                    <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Bank</label>
                <input type="text" value={form.bank_nama} onChange={(e) => setForm({ ...form, bank_nama: e.target.value })} className={INPUT_CLS} placeholder="BSI / Mandiri / Kas" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">No. Rekening</label>
                <input type="text" value={form.no_rekening} onChange={(e) => setForm({ ...form, no_rekening: e.target.value })} className={INPUT_CLS} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Pajak Default (opsional)</label>
              <select value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={INPUT_CLS}>
                <option value="">— Tanpa Pajak Default —</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>{t.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Deskripsi</label>
              <input type="text" value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} className={INPUT_CLS} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            {editing && !editing.locked && !editing.locked_mapping && (
              <button type="button" onClick={() => handleDelete(editing)} className={BTN_DANGER}>
                Hapus
              </button>
            )}
            <button type="button" onClick={() => setModalOpen(false)} className={BTN_SECONDARY}>
              Batal
            </button>
            <button type="submit" className={BTN_PRIMARY}>
              Simpan Akun
            </button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
