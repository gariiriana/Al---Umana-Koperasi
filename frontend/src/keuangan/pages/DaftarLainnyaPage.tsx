// Daftar Lainnya (Rilis 1): Anak Perusahaan, Tag, Pajak, Syarat & Cara Pembayaran, Tutup Buku.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CreditCard, Hash, Lock, Percent, Plus, Timer, Trash2 } from "lucide-react";
import {
  createTag,
  createTax,
  createUnit,
  deletePaymentMethod,
  deletePaymentTerm,
  deleteTag,
  deleteTax,
  listAccounts,
  listPaymentMethods,
  listPaymentTerms,
  listTags,
  listTaxes,
  listUnits,
  savePaymentMethod,
  savePaymentTerm,
  updateUnit,
} from "@/keuangan/api";
import { keuanganErrorMessage } from "@/keuangan/format";
import type { Account, PaymentMethod, PaymentTerm, Tag, Tax, Unit } from "@/keuangan/types";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

type TabKey = "units" | "tags" | "taxes" | "terms" | "methods";

export function DaftarLainnyaPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("units");
  const [units, setUnits] = useState<Unit[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Form states
  const [unitModal, setUnitModal] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [uForm, setUForm] = useState({ kode: "", nama: "", alamat: "", telepon: "", pj_nama: "", pj_jabatan: "", bank_nama: "", bank_no_rekening: "" });

  const [newTagName, setNewTagName] = useState("");
  const [taxModal, setTaxModal] = useState(false);
  const [tForm, setTForm] = useState({
    nama: "",
    persen: "11",
    pengali_11_12: false,
    pemotongan: false,
    akun_jual: "2-20500",
    akun_beli: "1-10500",
  });

  const [newTermName, setNewTermName] = useState("");
  const [newTermDays, setNewTermDays] = useState("14");
  const [newMethodName, setNewMethodName] = useState("");

  const load = async () => {
    try {
      const [u, tg, tx, tm, mt, acc] = await Promise.all([
        listUnits(true),
        listTags(),
        listTaxes(),
        listPaymentTerms(),
        listPaymentMethods(),
        listAccounts(),
      ]);
      setUnits(u);
      setTags(tg.tags);
      setTaxes(tx);
      setTerms(tm);
      setMethods(mt);
      setAccounts(acc.accounts.filter((a) => !a.is_header));
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveUnitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editUnit) {
        await updateUnit(editUnit.kode, uForm);
        showToast({ message: `Unit ${editUnit.kode} diperbarui.`, variant: "success" });
      } else {
        await createUnit(uForm);
        showToast({ message: "Anak perusahaan ditambahkan (beserta gudang utama default).", variant: "success" });
      }
      setUnitModal(false);
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleSaveTax = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTax({
        nama: tForm.nama,
        tipe: "satu",
        persen_bp: Math.round(Number(tForm.persen || 0) * 100),
        pengali_11_12: tForm.pengali_11_12,
        pemotongan: tForm.pemotongan,
        akun_jual: tForm.akun_jual,
        akun_beli: tForm.akun_beli,
      });
      showToast({ message: "Pajak ditambahkan.", variant: "success" });
      setTaxModal(false);
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Daftar Lainnya</h1>
          <p className="text-sm text-[#6B7280]">Master anak perusahaan, tag transaksi, pajak, syarat/cara pembayaran, dan tutup buku.</p>
        </div>
        <Link to="/keuangan/daftar-lainnya/tutup-buku" className={BTN_PRIMARY}>
          <Lock className="h-4 w-4" /> Kunci Periode & Tutup Buku
        </Link>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "units", label: "Anak Perusahaan", icon: Building2 },
          { key: "tags", label: "Tag", icon: Hash },
          { key: "taxes", label: "Daftar Pajak", icon: Percent },
          { key: "terms", label: "Syarat Pembayaran", icon: Timer },
          { key: "methods", label: "Cara Pembayaran", icon: CreditCard },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition ${
                active ? "bg-[#FBBF24] text-[#111827]" : "bg-white border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "units" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-[#111827]">Anak Perusahaan (Unit Usaha)</h2>
            <button
              type="button"
              onClick={() => {
                setEditUnit(null);
                setUForm({ kode: "", nama: "", alamat: "", telepon: "", pj_nama: "", pj_jabatan: "", bank_nama: "", bank_no_rekening: "" });
                setUnitModal(true);
              }}
              className={BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" /> Tambah Unit
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {units.length === 0 ? (
              <div className="col-span-full text-center py-6 text-sm text-[#6B7280]">
                Belum ada anak perusahaan. Tambahkan minimal 1 unit (mis. TKS, KTR, PST).
              </div>
            ) : (
              units.map((u) => (
                <div key={u.kode} className="rounded-xl border border-[#E5E7EB] p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">{u.kode}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditUnit(u);
                        setUForm({
                          kode: u.kode,
                          nama: u.nama,
                          alamat: u.alamat || "",
                          telepon: u.telepon || "",
                          pj_nama: u.pj_nama || "",
                          pj_jabatan: u.pj_jabatan || "",
                          bank_nama: u.bank_nama || "",
                          bank_no_rekening: u.bank_no_rekening || "",
                        });
                        setUnitModal(true);
                      }}
                      className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      Ubah
                    </button>
                  </div>
                  <div className="font-bold text-sm text-[#111827]">{u.nama}</div>
                  {u.pj_nama && <div className="text-xs text-[#6B7280]">PJ: {u.pj_nama} ({u.pj_jabatan})</div>}
                  {u.bank_nama && <div className="text-xs text-[#6B7280]">Bank: {u.bank_nama} {u.bank_no_rekening}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "tags" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="Nama tag baru (mis. Ramadan, Dapur MBG)..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className={INPUT_CLS}
            />
            <button
              type="button"
              onClick={async () => {
                if (!newTagName.trim()) return;
                await createTag(newTagName.trim());
                setNewTagName("");
                load();
              }}
              className={BTN_PRIMARY}
            >
              Tambah
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-semibold text-[#111827]">
                #{t.nama}
                <button type="button" onClick={async () => { await deleteTag(t.id); load(); }} className="text-red-500 cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === "taxes" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-[#111827]">Tarif Pajak (Mendukung Pengali 11/12, PPh Pemotongan, & Grup Pajak)</h2>
            <button type="button" onClick={() => setTaxModal(true)} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" /> Pajak Baru
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-2.5 text-left">Nama Pajak</th>
                <th className="px-4 py-2.5 text-left">Tipe</th>
                <th className="px-4 py-2.5 text-right">Tarif</th>
                <th className="px-4 py-2.5 text-left">Keterangan</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {taxes.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-2.5 font-bold">{tx.nama}</td>
                  <td className="px-4 py-2.5 text-xs capitalize">{tx.tipe}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{(tx.persen_bp / 100).toLocaleString("id-ID")}%</td>
                  <td className="px-4 py-2.5 text-xs text-[#6B7280]">
                    {tx.pengali_11_12 ? "Pengali DPP Nilai Lain 11/12 • " : ""}
                    {tx.pemotongan ? "Pemotongan (mengurangi pembayaran)" : tx.tipe === "grup" ? (tx.majemuk ? "Majemuk" : "Gabungan") : "Pajak Pertambahan"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteTax(tx.id);
                          load();
                        } catch (e) {
                          showToast({ message: keuanganErrorMessage(e), variant: "error" });
                        }
                      }}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="inline h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "terms" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap gap-2 max-w-lg">
            <input type="text" placeholder="Nama syarat (mis. Net 14)" value={newTermName} onChange={(e) => setNewTermName(e.target.value)} className={`${INPUT_CLS} flex-1`} />
            <input type="number" min={0} placeholder="Hari" value={newTermDays} onChange={(e) => setNewTermDays(e.target.value)} className={`${INPUT_CLS} w-24`} />
            <button
              type="button"
              onClick={async () => {
                if (!newTermName.trim()) return;
                await savePaymentTerm({ nama: newTermName.trim(), hari: Number(newTermDays || 0) });
                setNewTermName("");
                load();
              }}
              className={BTN_PRIMARY}
            >
              Simpan
            </button>
          </div>
          <ul className="divide-y divide-[#E5E7EB]">
            {terms.map((tm) => (
              <li key={tm.id} className="py-2 flex items-center justify-between text-sm">
                <span><strong>{tm.nama}</strong> — {tm.hari} hari</span>
                <button type="button" onClick={async () => { await deletePaymentTerm(tm.id); load(); }} className="text-red-500 cursor-pointer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "methods" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="flex gap-2 max-w-md">
            <input type="text" placeholder="Cara pembayaran (mis. QRIS, Transfer Bank)" value={newMethodName} onChange={(e) => setNewMethodName(e.target.value)} className={INPUT_CLS} />
            <button
              type="button"
              onClick={async () => {
                if (!newMethodName.trim()) return;
                await savePaymentMethod({ nama: newMethodName.trim() });
                setNewMethodName("");
                load();
              }}
              className={BTN_PRIMARY}
            >
              Simpan
            </button>
          </div>
          <ul className="divide-y divide-[#E5E7EB]">
            {methods.map((mt) => (
              <li key={mt.id} className="py-2 flex items-center justify-between text-sm font-medium">
                <span>{mt.nama}</span>
                <button type="button" onClick={async () => { await deletePaymentMethod(mt.id); load(); }} className="text-red-500 cursor-pointer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ModalFrame open={unitModal} title={editUnit ? `Ubah Unit ${editUnit.kode}` : "Tambah Anak Perusahaan"} onClose={() => setUnitModal(false)}>
        <form onSubmit={saveUnitForm} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Kode Unit (1–10 huruf/angka)</label>
              <input type="text" required disabled={Boolean(editUnit)} value={uForm.kode} onChange={(e) => setUForm({ ...uForm, kode: e.target.value.toUpperCase() })} className={INPUT_CLS} placeholder="TKS" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Anak Perusahaan</label>
              <input type="text" required value={uForm.nama} onChange={(e) => setUForm({ ...uForm, nama: e.target.value })} className={INPUT_CLS} placeholder="Toko Santri" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Penanggung Jawab</label>
              <input type="text" value={uForm.pj_nama} onChange={(e) => setUForm({ ...uForm, pj_nama: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Jabatan PJ</label>
              <input type="text" value={uForm.pj_jabatan} onChange={(e) => setUForm({ ...uForm, pj_jabatan: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Bank Pembayaran (Faktur)</label>
              <input type="text" value={uForm.bank_nama} onChange={(e) => setUForm({ ...uForm, bank_nama: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">No. Rekening</label>
              <input type="text" value={uForm.bank_no_rekening} onChange={(e) => setUForm({ ...uForm, bank_no_rekening: e.target.value })} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Alamat</label>
            <input type="text" value={uForm.alamat} onChange={(e) => setUForm({ ...uForm, alamat: e.target.value })} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => setUnitModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Unit</button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={taxModal} title="Tambah Pajak Baru" onClose={() => setTaxModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveTax} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Pajak</label>
            <input type="text" required value={tForm.nama} onChange={(e) => setTForm({ ...tForm, nama: e.target.value })} className={INPUT_CLS} placeholder="PPN 11%" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Tarif Efektif (%)</label>
            <input type="number" step="0.01" required value={tForm.persen} onChange={(e) => setTForm({ ...tForm, persen: e.target.value })} className={INPUT_CLS} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={tForm.pengali_11_12} onChange={(e) => setTForm({ ...tForm, pengali_11_12: e.target.checked, pemotongan: false })} />
              Pengali 11/12 (PPN 12% Nilai Lain)
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={tForm.pemotongan} onChange={(e) => setTForm({ ...tForm, pemotongan: e.target.checked, pengali_11_12: false })} />
              Pajak Pemotongan (PPh)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Akun Pajak Penjualan</label>
              <select value={tForm.akun_jual} onChange={(e) => setTForm({ ...tForm, akun_jual: e.target.value })} className={INPUT_CLS}>
                {accounts.map((a) => <option key={a.kode} value={a.kode}>{a.kode} {a.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Akun Pajak Pembelian</label>
              <select value={tForm.akun_beli} onChange={(e) => setTForm({ ...tForm, akun_beli: e.target.value })} className={INPUT_CLS}>
                {accounts.map((a) => <option key={a.kode} value={a.kode}>{a.kode} {a.nama}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => setTaxModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Pajak</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
