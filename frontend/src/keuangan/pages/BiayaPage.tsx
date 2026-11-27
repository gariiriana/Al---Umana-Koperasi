// Halaman Biaya (Rilis 2): Catat biaya tunai / bayar nanti, rincian, pelunasan via Kirim Uang.
import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Receipt, Trash2 } from "lucide-react";
import { createDocument, createTransaction, deleteTransaction, listAccounts, listContacts, listTaxes, listTransactions, listUnits } from "@/keuangan/api";
import { formatSen, formatTanggalShort, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, Contact, Tax, TransactionDocument, Unit } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function BiayaPage() {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<TransactionDocument[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tanggal, setTanggal] = useState(todayWib());
  const [unitKode, setUnitKode] = useState("");
  const [contactId, setContactId] = useState("");
  const [bayarNanti, setBayarNanti] = useState(false);
  const [bayarDari, setBayarDari] = useState("1-10002");
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<{ account_kode: string; deskripsi: string; jumlah: number; tax_id: string }[]>([
    { account_kode: "6-60900", deskripsi: "", jumlah: 0, tax_id: "" },
  ]);

  const [payDoc, setPayDoc] = useState<TransactionDocument | null>(null);
  const [payAcc, setPayAcc] = useState("1-10002");
  const [payTgl, setPayTgl] = useState(todayWib());

  const load = async () => {
    setLoading(true);
    try {
      const [list, u, a, c, t] = await Promise.all([
        listTransactions({ family: "expense", status: statusFilter }),
        listUnits(),
        listAccounts(),
        listContacts(),
        listTaxes(),
      ]);
      setDocs(list);
      setUnits(u);
      setAccounts(a.accounts.filter((x) => !x.is_header && !x.arsip));
      setContacts(c);
      setTaxes(t.filter((x) => x.aktif));
      if (!unitKode && u[0]) setUnitKode(u[0].kode);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createTransaction({
        type: "expense",
        tanggal,
        unit_kode: unitKode,
        contact_id: contactId || null,
        bayar_nanti: bayarNanti,
        bayar_dari: bayarNanti ? undefined : bayarDari,
        jatuh_tempo: bayarNanti && jatuhTempo ? jatuhTempo : undefined,
        memo,
        lines: lines.map((l) => ({
          account_kode: l.account_kode,
          deskripsi: l.deskripsi,
          jumlah: l.jumlah,
          tax_id: l.tax_id || null,
        })),
      });
      showToast({ message: "Biaya berhasil dicatat.", variant: "success" });
      setShowCreate(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDoc) return;
    setSaving(true);
    try {
      await createDocument({
        type: "send_money",
        tanggal: payTgl,
        unit_kode: payDoc.unit_kode,
        contact_id: payDoc.contact_id,
        bayar_dari: payAcc,
        expense_allocations: [{ document_id: payDoc.id, amount: payDoc.sisa }],
      });
      showToast({ message: "Biaya berhasil dilunasi.", variant: "success" });
      setPayDoc(null);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const cashAccs = accounts.filter((a) => a.kategori === 3 || a.kategori === 9);
  const expenseAccs = accounts.filter((a) => a.kategori >= 15 || a.kategori === 2 || a.kategori === 5);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Biaya</h1>
          <p className="text-sm text-[#6B7280]">Catat beban operasional langsung dari kas/bank maupun Biaya Bayar Nanti.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" /> Buat Biaya Baru
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { k: "", l: "Semua" },
          { k: "belum_dibayar", l: "Belum Dibayar" },
          { k: "jatuh_tempo", l: "Jatuh Tempo" },
          { k: "lunas", l: "Lunas" },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setStatusFilter(t.k)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              statusFilter === t.k ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB] text-[#374151]"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {!loading && docs.length === 0 ? (
        <EmptyState icon={Receipt} title="Belum ada catatan biaya" description="Tambahkan pengeluaran listrik, gaji, perlengkapan, dan biaya lain di sini." />
      ) : (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 text-left">No / Tanggal</th>
                <th className="px-4 py-3 text-left">Penerima</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Sisa</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3">
                    <div className="font-bold">{d.no}</div>
                    <div className="text-xs text-[#6B7280]">{formatTanggalShort(d.tanggal)} {d.memo ? `· ${d.memo}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">{d.contact_nama || "-"}</td>
                  <td className="px-4 py-3"><UnitBadge kode={d.unit_kode} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${d.status === "lunas" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatSen(d.total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{d.sisa > 0 ? formatSen(d.sisa) : "-"}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {d.sisa > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayDoc(d);
                          setPayTgl(todayWib());
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        Bayar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteTransaction(d.id);
                          showToast({ message: "Biaya dihapus.", variant: "success" });
                          await load();
                        } catch (e) {
                          showToast({ message: keuanganErrorMessage(e), variant: "error" });
                        }
                      }}
                      className={BTN_DANGER}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalFrame open={showCreate} title="Catat Biaya Baru" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal</label>
              <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan</label>
              <select required value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Penerima / Vendor</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={INPUT_CLS}>
                <option value="">-- Opsional (wajib jika bayar nanti) --</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.nama_tampilan}</option>)}
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={bayarNanti} onChange={(e) => setBayarNanti(e.target.checked)} className="h-4 w-4 accent-amber-600" />
                Bayar Nanti (Hutang Biaya)
              </label>
            </div>
            {!bayarNanti ? (
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Bayar Dari Akun *</label>
                <select required value={bayarDari} onChange={(e) => setBayarDari(e.target.value)} className={INPUT_CLS}>
                  {cashAccs.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Jatuh Tempo</label>
                <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} className={INPUT_CLS} />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Memo</label>
              <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} className={INPUT_CLS} />
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#6B7280]">Rincian Beban</span>
              <button type="button" onClick={() => setLines([...lines, { account_kode: "6-60900", deskripsi: "", jumlah: 0, tax_id: "" }])} className={BTN_SECONDARY}>
                <Plus className="h-3.5 w-3.5" /> Baris
              </button>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select value={l.account_kode} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, account_kode: e.target.value } : x))} className={`${INPUT_CLS} sm:col-span-4`}>
                  {expenseAccs.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
                </select>
                <input type="text" placeholder="Deskripsi" value={l.deskripsi} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, deskripsi: e.target.value } : x))} className={`${INPUT_CLS} sm:col-span-3`} />
                <div className="sm:col-span-3">
                  <RupiahInput valueSen={l.jumlah} onChangeSen={(v) => setLines(lines.map((x, i) => i === idx ? { ...x, jumlah: v } : x))} />
                </div>
                <select value={l.tax_id} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, tax_id: e.target.value } : x))} className={`${INPUT_CLS} sm:col-span-2`}>
                  <option value="">Non-Pajak</option>
                  {taxes.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Biaya"}</button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={Boolean(payDoc)} title={payDoc ? `Lunasi Biaya ${payDoc.no}` : ""} onClose={() => setPayDoc(null)} maxWidth="max-w-md">
        {payDoc && (
          <form onSubmit={handleSettle} className="space-y-3">
            <p className="text-sm">Total sisa: <b className="font-mono">{formatSen(payDoc.sisa)}</b></p>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal</label>
              <input type="date" required value={payTgl} onChange={(e) => setPayTgl(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Bayar Dari</label>
              <select required value={payAcc} onChange={(e) => setPayAcc(e.target.value)} className={INPUT_CLS}>
                {cashAccs.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayDoc(null)} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={saving} className={BTN_PRIMARY}>
                <CheckCircle2 className="h-4 w-4" /> {saving ? "Memproses..." : "Bayar Lunas"}
              </button>
            </div>
          </form>
        )}
      </ModalFrame>
    </div>
  );
}
