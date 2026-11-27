// Halaman Rekonsiliasi Bank (Rilis 3): Impor Mutasi Rekening (8 format bank), Pencocokan Manual/Otomatis & Aturan Rekonsiliasi.
import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Sparkles, Unlink, Upload } from "lucide-react";
import {
  applyReconRules,
  createTxFromStatement,
  importBankStatements,
  listAccounts,
  listBankStatements,
  listDocuments,
  listReconRules,
  listUnits,
  reconcileMatch,
  saveReconRule,
  unmatchReconciliation,
} from "@/keuangan/api";
import { formatSen, formatTanggalShort, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, BankStatement, DocumentSummary, Unit } from "@/keuangan/types";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function RekonsiliasiPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedAcc, setSelectedAcc] = useState("");
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [rules, setRules] = useState<{ id: string; nama: string; arah: string; kondisi: Record<string, unknown>; aksi: Record<string, unknown> }[]>([]);

  const [showImport, setShowImport] = useState(false);
  const [preset, setPreset] = useState("jurnal");
  const [csvText, setCsvText] = useState("");
  const [saving, setSaving] = useState(false);

  const [createForSt, setCreateForSt] = useState<BankStatement | null>(null);
  const [txUnit, setTxUnit] = useState("");
  const [txCounterAcc, setTxCounterAcc] = useState("8-80001");

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleNama, setRuleNama] = useState("");
  const [ruleArah, setRuleArah] = useState<"masuk" | "keluar">("keluar");
  const [ruleContains, setRuleContains] = useState("");
  const [ruleUnit, setRuleUnit] = useState("");
  const [ruleAcc, setRuleAcc] = useState("8-80001");

  const loadMaster = async () => {
    try {
      const [aRes, uList, rList] = await Promise.all([listAccounts(), listUnits(), listReconRules()]);
      const usable = aRes.accounts.filter((a) => !a.is_header && !a.arsip);
      const bankAccs = usable.filter((a) => a.kategori === 3 || a.kategori === 9);
      setAllAccounts(usable);
      setAccounts(bankAccs);
      setUnits(uList);
      setRules(rList);
      if (!selectedAcc && bankAccs[0]) setSelectedAcc(bankAccs[0].kode);
      if (!txUnit && uList[0]) {
        setTxUnit(uList[0].kode);
        setRuleUnit(uList[0].kode);
      }
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  const loadStatements = async () => {
    if (!selectedAcc) return;
    try {
      const [stList, docList] = await Promise.all([listBankStatements({ account_kode: selectedAcc }), listDocuments({ limit: 80 })]);
      setStatements(stList);
      setDocs(docList);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    loadMaster();
  }, []);

  useEffect(() => {
    loadStatements();
  }, [selectedAcc]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await importBankStatements({ account_kode: selectedAcc, preset, csv: csvText });
      showToast({ message: `${res.inserted} mutasi diimpor (${res.skippedDuplicate} duplikat dilewati).`, variant: "success" });
      setShowImport(false);
      setCsvText("");
      await loadStatements();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForSt) return;
    setSaving(true);
    try {
      await createTxFromStatement({ statement_id: createForSt.id, unit_kode: txUnit, account_kode: txCounterAcc });
      showToast({ message: "Transaksi dibuat & langsung dicocokkan.", variant: "success" });
      setCreateForSt(null);
      await loadStatements();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Rekonsiliasi Bank</h1>
          <p className="text-sm text-[#6B7280]">Impor mutasi rekening koran (BCA, Mandiri, BRI, BNI, BSI, Danamon, OCBC, Jurnal) dan cocokkan ke pembukuan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowRuleModal(true)} className={BTN_SECONDARY}>
            <Plus className="h-4 w-4" /> Aturan ({rules.length})
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await applyReconRules();
              showToast({ message: `${res.matchedCount} mutasi dicocokkan otomatis.`, variant: "success" });
              await loadStatements();
            }}
            className={BTN_SECONDARY}
          >
            <Sparkles className="h-4 w-4 text-amber-700" /> Jalankan Aturan
          </button>
          <button type="button" onClick={() => setShowImport(true)} className={BTN_PRIMARY}>
            <Upload className="h-4 w-4" /> Impor Mutasi CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-[#6B7280]">Rekening Kas/Bank:</label>
        <select value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)} className={`${INPUT_CLS} max-w-sm`}>
          {accounts.map((a) => (
            <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
          ))}
        </select>
      </div>

      {statements.length === 0 ? (
        <EmptyState icon={Upload} title="Belum ada mutasi bank diimpor" description="Unggah/tempel CSV mutasi rekening untuk mulai rekonsiliasi." />
      ) : (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 text-left">Tanggal</th>
                <th className="px-4 py-3 text-left">Keterangan Bank</th>
                <th className="px-4 py-3 text-right">Masuk</th>
                <th className="px-4 py-3 text-right">Keluar</th>
                <th className="px-4 py-3 text-left">Status Rekonsiliasi</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {statements.map((s) => (
                <tr key={s.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3">{formatTanggalShort(s.tanggal)}</td>
                  <td className="px-4 py-3">{s.deskripsi}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{s.masuk ? formatSen(s.masuk) : "-"}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-700">{s.keluar ? formatSen(s.keluar) : "-"}</td>
                  <td className="px-4 py-3">
                    {s.matched ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Cocok: {s.matched_doc_no}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Belum Cocok</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    {s.matched ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await unmatchReconciliation({ statement_id: s.id });
                          await loadStatements();
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                      >
                        <Unlink className="h-3.5 w-3.5 inline mr-1" /> Batalkan
                      </button>
                    ) : (
                      <>
                        <select
                          defaultValue=""
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            await reconcileMatch({ statement_id: s.id, document_id: e.target.value });
                            await loadStatements();
                          }}
                          className="rounded-lg border border-[#D1D5DB] text-xs px-2 py-1 max-w-44"
                        >
                          <option value="">Cocokkan ke...</option>
                          {docs.map((d) => (
                            <option key={d.id} value={d.id}>{d.no} ({formatSen(d.total)})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateForSt(s);
                            setTxCounterAcc(s.masuk > 0 ? "7-70000" : "8-80001");
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          + Buat Tx
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalFrame open={showImport} title="Impor Mutasi Rekening (CSV)" onClose={() => setShowImport(false)}>
        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Format CSV Bank</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className={INPUT_CLS}>
              <option value="jurnal">Template Jurnal (Tanggal,Keterangan,Masuk,Keluar)</option>
              <option value="bca">BCA (Tanggal,Keterangan,Jumlah,CR/DB)</option>
              <option value="mandiri">Mandiri</option>
              <option value="bri">BRI</option>
              <option value="bni">BNI</option>
              <option value="bsi">BSI</option>
              <option value="danamon">Danamon</option>
              <option value="ocbc">OCBC</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Tempel Data CSV / Unggah File</label>
            <input
              type="file"
              accept=".csv,.txt"
              className="block text-xs mb-2"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.text().then(setCsvText);
              }}
            />
            <textarea rows={6} required value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="2026-02-01,Bunga Bank,25000,0" className={`${INPUT_CLS} font-mono text-xs`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowImport(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Mengimpor..." : "Impor Mutasi"}</button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={Boolean(createForSt)} title="Buat Transaksi dari Mutasi" onClose={() => setCreateForSt(null)} maxWidth="max-w-md">
        {createForSt && (
          <form onSubmit={handleCreateTx} className="space-y-3">
            <div className="text-xs text-[#6B7280]">{createForSt.deskripsi} — <b>{formatSen(createForSt.masuk || createForSt.keluar)}</b></div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan</label>
              <select required value={txUnit} onChange={(e) => setTxUnit(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Lawan</label>
              <select required value={txCounterAcc} onChange={(e) => setTxCounterAcc(e.target.value)} className={INPUT_CLS}>
                {allAccounts.filter((a) => a.kategori !== 3).map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateForSt(null)} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Memproses..." : "Buat & Cocokkan"}</button>
            </div>
          </form>
        )}
      </ModalFrame>

      <ModalFrame open={showRuleModal} title="Tambah Aturan Rekonsiliasi Otomatis" onClose={() => setShowRuleModal(false)} maxWidth="max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await saveReconRule({
              nama: ruleNama,
              account_kode: selectedAcc || null,
              arah: ruleArah,
              kondisi: { mengandung: ruleContains },
              aksi: { buat_transaksi: true, unit_kode: ruleUnit, account_kode: ruleAcc },
            });
            showToast({ message: "Aturan disimpan.", variant: "success" });
            setShowRuleModal(false);
            setRuleNama("");
            await loadMaster();
          }}
          className="space-y-3"
        >
          <input type="text" required placeholder="Nama aturan (mis. Biaya Admin Bank)" value={ruleNama} onChange={(e) => setRuleNama(e.target.value)} className={INPUT_CLS} />
          <div className="grid grid-cols-2 gap-2">
            <select value={ruleArah} onChange={(e) => setRuleArah(e.target.value as "masuk" | "keluar")} className={INPUT_CLS}>
              <option value="keluar">Uang Keluar</option>
              <option value="masuk">Uang Masuk</option>
            </select>
            <input type="text" required placeholder="Deskripsi mengandung..." value={ruleContains} onChange={(e) => setRuleContains(e.target.value)} className={INPUT_CLS} />
          </div>
          <select value={ruleUnit} onChange={(e) => setRuleUnit(e.target.value)} className={INPUT_CLS}>
            {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
          </select>
          <select value={ruleAcc} onChange={(e) => setRuleAcc(e.target.value)} className={INPUT_CLS}>
            {allAccounts.filter((a) => a.kategori !== 3).map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowRuleModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Aturan</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
