// Halaman Kas & Bank (PRD 02-kas-bank.md): 4 kartu ringkas + daftar akun kas/bank + aksi Terima/Kirim/Transfer Uang.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { createAccount, listAccounts, listContacts, listKasBank, listTaxes, listUnits } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, Contact, KasBankListResponse, Tax, Unit } from "@/keuangan/types";
import { CashTxModal, type CashTxMode } from "@/keuangan/components/CashTxModal";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function KasBankPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<KasBankListResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [cashModal, setCashModal] = useState<{ mode: CashTxMode; kode?: string } | null>(null);
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [newAcc, setNewAcc] = useState({ kode: "", nama: "", kategori: 3, unit_kode: "", bank_nama: "", no_rekening: "" });

  const load = async () => {
    try {
      const [kb, u, a, c, t] = await Promise.all([
        listKasBank(unitFilter || undefined),
        listUnits(),
        listAccounts(),
        listContacts(),
        listTaxes(),
      ]);
      setData(kb);
      setUnits(u);
      setAccounts(a.accounts);
      setContacts(c);
      setTaxes(t);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [unitFilter]);

  const handleCreateCashAcc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAccount({
        kode: newAcc.kode.trim() || undefined,
        nama: newAcc.nama,
        kategori: Number(newAcc.kategori),
        unit_kode: newAcc.unit_kode || null,
        bank_nama: newAcc.bank_nama || null,
        no_rekening: newAcc.no_rekening || null,
      });
      showToast({ message: "Akun Kas & Bank berhasil ditambahkan.", variant: "success" });
      setNewAccOpen(false);
      setNewAcc({ kode: "", nama: "", kategori: 3, unit_kode: "", bank_nama: "", no_rekening: "" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Kas & Bank</h1>
          <p className="text-sm text-[#6B7280]">Klik akun untuk membuka BKU (Buku Kas Umum) dengan saldo berjalan per transaksi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCashModal({ mode: "receive_money" })} className={BTN_SECONDARY}>
            <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> Terima Uang
          </button>
          <button type="button" onClick={() => setCashModal({ mode: "send_money" })} className={BTN_SECONDARY}>
            <ArrowUpRight className="h-4 w-4 text-red-600" /> Kirim Uang
          </button>
          <button type="button" onClick={() => setCashModal({ mode: "transfer_money" })} className={BTN_SECONDARY}>
            <ArrowRightLeft className="h-4 w-4 text-blue-600" /> Transfer Uang
          </button>
          <button type="button" onClick={() => setNewAccOpen(true)} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Buat Akun Baru
          </button>
        </div>
      </div>

      {/* 4 Kartu Ringkas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-emerald-200 p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Pemasukan 30 Hari Terakhir</div>
          <div className="mt-1 text-lg font-extrabold text-emerald-700">{formatSen(data?.summary.pemasukan30Hari || 0)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-red-200 p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Pengeluaran 30 Hari Terakhir</div>
          <div className="mt-1 text-lg font-extrabold text-red-700">{formatSen(data?.summary.pengeluaran30Hari || 0)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-amber-200 p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Total Saldo Kas & Bank</div>
          <div className="mt-1 text-lg font-extrabold text-[#111827]">{formatSen(data?.summary.saldoKasBank || 0)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Total Saldo Kartu Kredit</div>
          <div className="mt-1 text-lg font-extrabold text-[#111827]">{formatSen(data?.summary.saldoKartuKredit || 0)}</div>
        </div>
      </div>

      {/* Filter Anak Perusahaan */}
      <div className="flex items-center justify-between gap-3">
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className={`${INPUT_CLS} max-w-xs`}>
          <option value="">Semua Anak Perusahaan</option>
          {units.map((u) => (
            <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
          ))}
        </select>
      </div>

      {/* Daftar Akun Kas & Bank */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-3 text-left">Kode Akun</th>
              <th className="px-4 py-3 text-left">Nama Akun</th>
              <th className="px-4 py-3 text-left">Bank & Rekening</th>
              <th className="px-4 py-3 text-left">Unit Pemilik</th>
              <th className="px-4 py-3 text-right">Saldo Jurnal</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {(data?.accounts || []).map((acc) => (
              <tr key={acc.kode} className="hover:bg-amber-50/30">
                <td className="px-4 py-3 font-mono text-xs">{acc.kode}</td>
                <td className="px-4 py-3">
                  <Link to={`/keuangan/kas-bank/${encodeURIComponent(acc.kode)}/bku`} className="font-bold text-amber-700 hover:underline">
                    {acc.nama}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-[#4B5563]">
                  {acc.bank_nama ? `${acc.bank_nama}${acc.no_rekening ? ` (${acc.no_rekening})` : ""}` : "—"}
                </td>
                <td className="px-4 py-3"><UnitBadge kode={acc.unit_kode} /></td>
                <td className="px-4 py-3 text-right font-mono font-bold text-[#111827]">{formatSen(acc.saldo_jurnal)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                  <Link
                    to={`/keuangan/kas-bank/${encodeURIComponent(acc.kode)}/bku`}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Buka BKU
                  </Link>
                  <button
                    type="button"
                    onClick={() => setCashModal({ mode: "receive_money", kode: acc.kode })}
                    className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    + Terima
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashModal({ mode: "send_money", kode: acc.kode })}
                    className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                  >
                    − Kirim
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cashModal && (
        <CashTxModal
          open={Boolean(cashModal)}
          mode={cashModal.mode}
          defaultCashKode={cashModal.kode}
          accounts={accounts}
          units={units}
          contacts={contacts}
          taxes={taxes}
          onClose={() => setCashModal(null)}
          onSaved={load}
        />
      )}

      <ModalFrame open={newAccOpen} title="Buat Akun Kas & Bank Baru" onClose={() => setNewAccOpen(false)} maxWidth="max-w-lg">
        <form onSubmit={handleCreateCashAcc} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Kode (kosongkan untuk otomatis)</label>
              <input type="text" value={newAcc.kode} onChange={(e) => setNewAcc({ ...newAcc, kode: e.target.value })} className={INPUT_CLS} placeholder="1-10003" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Jenis</label>
              <select value={newAcc.kategori} onChange={(e) => setNewAcc({ ...newAcc, kategori: Number(e.target.value) })} className={INPUT_CLS}>
                <option value={3}>Kas & Bank</option>
                <option value={9}>Kartu Kredit</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Akun</label>
            <input type="text" required value={newAcc.nama} onChange={(e) => setNewAcc({ ...newAcc, nama: e.target.value })} className={INPUT_CLS} placeholder="BSI Unit TKS" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Unit Pemilik</label>
            <select value={newAcc.unit_kode} onChange={(e) => setNewAcc({ ...newAcc, unit_kode: e.target.value })} className={INPUT_CLS}>
              <option value="">Bersama (Semua Unit)</option>
              {units.map((u) => (
                <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Bank</label>
              <input type="text" value={newAcc.bank_nama} onChange={(e) => setNewAcc({ ...newAcc, bank_nama: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nomor Rekening</label>
              <input type="text" value={newAcc.no_rekening} onChange={(e) => setNewAcc({ ...newAcc, no_rekening: e.target.value })} className={INPUT_CLS} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => setNewAccOpen(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Akun</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
