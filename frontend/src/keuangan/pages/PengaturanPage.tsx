// Pengaturan Keuangan (Rilis 1): Perusahaan, Pemetaan Akun, Penomoran, Audit Log.
import { useEffect, useState } from "react";
import { Building, CheckCircle2, Coins, History, ListChecks, ShieldCheck, Sliders, Trash2, XCircle } from "lucide-react";
import {
  decideApproval,
  deleteApprovalRule,
  getAccountMapping,
  getNumbering,
  getSettings,
  listAccounts,
  listApprovalRules,
  listAudit,
  listCurrencies,
  listExchangeRates,
  listPendingApprovals,
  saveApprovalRule,
  saveCurrency,
  saveExchangeRate,
  updateAccountMapping,
  updateNumbering,
  updateSettings,
} from "@/keuangan/api";
import { DOC_TYPE_LABELS, formatSen, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, AccountMappingItem, ApprovalRule, AuditLogRow, CurrencyItem, ExchangeRateItem, NumberingRule, TransactionDocument } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

type TabKey = "perusahaan" | "pemetaan" | "penomoran" | "approval" | "kurs" | "audit";

export function PengaturanPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("perusahaan");
  const [company, setCompany] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<AccountMappingItem[]>([]);
  const [mapDraft, setMapDraft] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [numbering, setNumbering] = useState<NumberingRule[]>([]);
  const [audits, setAudits] = useState<AuditLogRow[]>([]);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<TransactionDocument[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [rates, setRates] = useState<ExchangeRateItem[]>([]);
  const [newRuleTipe, setNewRuleTipe] = useState("sales_invoice");
  const [newRuleMin, setNewRuleMin] = useState(0);
  const [newRuleStages, setNewRuleStages] = useState<{ nama: string; tipe: "semua" | "satu"; approversText: string }[]>([
    { nama: "Tahap 1", tipe: "satu", approversText: "" },
  ]);
  const [curKode, setCurKode] = useState("USD");
  const [curNama, setCurNama] = useState("US Dollar");
  const [rateKursRp, setRateKursRp] = useState(15500);

  const load = async () => {
    try {
      const [s, mp, acc, num, aud, apr, pend, cur, rts] = await Promise.all([
        getSettings(),
        getAccountMapping(),
        listAccounts(),
        getNumbering(),
        listAudit({ limit: 80 }),
        listApprovalRules(),
        listPendingApprovals(),
        listCurrencies(),
        listExchangeRates(),
      ]);
      const p = (s.settings.perusahaan || {}) as Record<string, string>;
      setCompany(p);
      setMapping(mp);
      setMapDraft(Object.fromEntries(mp.map((m) => [m.key, m.account_kode])));
      setAccounts(acc.accounts.filter((a) => !a.is_header && !a.arsip));
      setNumbering(num);
      setAudits(aud);
      setApprovalRules(apr);
      setPendingApprovals(pend);
      setCurrencies(cur);
      setRates(rts);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({ perusahaan: company });
      showToast({ message: "Pengaturan perusahaan disimpan.", variant: "success" });
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const saveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateAccountMapping(mapDraft);
      setMapping(updated);
      showToast({ message: "Pemetaan akun diperbarui.", variant: "success" });
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const saveNumbering = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateNumbering(numbering);
      setNumbering(updated);
      showToast({ message: "Format penomoran transaksi disimpan.", variant: "success" });
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Pengaturan Keuangan</h1>
        <p className="text-sm text-[#6B7280]">Identitas lembaga, pemetaan akun default sistem, penomoran dokumen, dan log audit.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "perusahaan", label: "Perusahaan", icon: Building },
          { key: "pemetaan", label: "Pemetaan Akun", icon: Sliders },
          { key: "penomoran", label: "Penomoran Transaksi", icon: ListChecks },
          { key: "approval", label: `Persetujuan (${pendingApprovals.length})`, icon: ShieldCheck },
          { key: "kurs", label: "Mata Uang & Kurs", icon: Coins },
          { key: "audit", label: "Audit Log", icon: History },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer ${
                tab === t.key ? "bg-[#FBBF24] text-[#111827]" : "bg-white border border-[#E5E7EB] text-[#6B7280]"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "perusahaan" && (
        <form onSubmit={saveCompany} className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Yayasan / Koperasi Induk</label>
              <input type="text" value={company.nama || ""} onChange={(e) => setCompany({ ...company, nama: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Telepon</label>
              <input type="text" value={company.telepon || ""} onChange={(e) => setCompany({ ...company, telepon: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">NPWP</label>
              <input type="text" value={company.npwp || ""} onChange={(e) => setCompany({ ...company, npwp: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Website</label>
              <input type="text" value={company.website || ""} onChange={(e) => setCompany({ ...company, website: e.target.value })} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Alamat</label>
            <textarea rows={2} value={company.alamat || ""} onChange={(e) => setCompany({ ...company, alamat: e.target.value })} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>Simpan Pengaturan</button>
          </div>
        </form>
      )}

      {tab === "pemetaan" && (
        <form onSubmit={saveMapping} className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <p className="text-xs text-[#6B7280]">Akun default yang digunakan Worker saat membuat jurnal otomatis dari transaksi.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mapping.map((m) => (
              <div key={m.key}>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">{m.label}</label>
                <select
                  disabled={m.locked}
                  value={mapDraft[m.key] || m.account_kode}
                  onChange={(e) => setMapDraft({ ...mapDraft, [m.key]: e.target.value })}
                  className={INPUT_CLS}
                >
                  {accounts
                    .filter((a) => m.allowedCategories.includes(a.kategori))
                    .map((a) => (
                      <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                    ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>Simpan Pemetaan</button>
          </div>
        </form>
      )}

      {tab === "penomoran" && (
        <form onSubmit={saveNumbering} className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2 text-left">Jenis Transaksi</th>
                  <th className="px-3 py-2 text-left">Format ({`{NO}, {UNIT}, {YYYY}, {MM}`})</th>
                  <th className="px-3 py-2 text-right">Digit</th>
                  <th className="px-3 py-2 text-right">Mulai Dari</th>
                  <th className="px-3 py-2 text-left">Reset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {numbering.map((n, idx) => (
                  <tr key={n.doc_type}>
                    <td className="px-3 py-2 font-bold">{DOC_TYPE_LABELS[n.doc_type] || n.doc_type}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={n.format}
                        onChange={(e) => setNumbering(numbering.map((x, i) => (i === idx ? { ...x, format: e.target.value } : x)))}
                        className={INPUT_CLS}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        type="number"
                        value={n.digits}
                        onChange={(e) => setNumbering(numbering.map((x, i) => (i === idx ? { ...x, digits: Number(e.target.value || 5) } : x)))}
                        className={INPUT_CLS}
                      />
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input
                        type="number"
                        value={n.start_no}
                        onChange={(e) => setNumbering(numbering.map((x, i) => (i === idx ? { ...x, start_no: Number(e.target.value || 10001) } : x)))}
                        className={INPUT_CLS}
                      />
                    </td>
                    <td className="px-3 py-2 w-32">
                      <select
                        value={n.reset}
                        onChange={(e) => setNumbering(numbering.map((x, i) => (i === idx ? { ...x, reset: e.target.value as NumberingRule["reset"] } : x)))}
                        className={INPUT_CLS}
                      >
                        <option value="tidak">Tidak</option>
                        <option value="bulan">Bulanan</option>
                        <option value="tahun">Tahunan</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>Simpan Penomoran</button>
          </div>
        </form>
      )}

      {tab === "approval" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-[#111827]">Alur Persetujuan Dokumen (Approval)</h3>
              <p className="text-xs text-[#6B7280]">Default MATI. Jika diaktifkan, dokumen sesuai aturan menunggu persetujuan sebelum diposting ke buku besar.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean((company as unknown as { approval_aktif?: boolean }).approval_aktif)}
                onChange={async (e) => {
                  const next = { ...company, approval_aktif: e.target.checked };
                  await updateSettings({ perusahaan: next });
                  await load();
                  showToast({ message: `Approval ${e.target.checked ? "diaktifkan" : "dimatikan"}.`, variant: "success" });
                }}
                className="h-4 w-4 accent-amber-600"
              />
              Aktifkan Persetujuan
            </label>
          </div>

          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-4">
            <h4 className="font-bold text-sm">Tambah Aturan Persetujuan (Maksimal 4 Tahap)</h4>
            <div className="flex flex-wrap gap-2">
              <select value={newRuleTipe} onChange={(e) => setNewRuleTipe(e.target.value)} className={`${INPUT_CLS} w-52`}>
                <option value="sales_invoice">Faktur Penjualan</option>
                <option value="sales_order">Pemesanan Penjualan</option>
                <option value="purchase_invoice">Tagihan Pembelian</option>
                <option value="purchase_order">Pemesanan Pembelian</option>
                <option value="expense">Biaya</option>
                <option value="stock_adjustment">Penyesuaian Stok</option>
                <option value="warehouse_transfer">Transfer Gudang</option>
              </select>
              <input type="number" min={0} placeholder="Minimal Rp" value={newRuleMin} onChange={(e) => setNewRuleMin(Number(e.target.value || 0))} className={`${INPUT_CLS} w-40`} />
              {newRuleStages.length < 4 && (
                <button
                  type="button"
                  onClick={() => setNewRuleStages([...newRuleStages, { nama: `Tahap ${newRuleStages.length + 1}`, tipe: "satu", approversText: "" }])}
                  className={BTN_SECONDARY}
                >
                  + Tambah Tahap
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const tahap = newRuleStages.map((s) => ({
                      nama: s.nama,
                      tipe: s.tipe,
                      approver_uids: s.approversText.split(",").map((x) => x.trim()).filter(Boolean),
                    }));
                    await saveApprovalRule({ tipe: newRuleTipe, kriteria: { min_total: newRuleMin * 100 }, tahap });
                    showToast({ message: "Aturan persetujuan disimpan.", variant: "success" });
                    await load();
                  } catch (err) {
                    showToast({ message: keuanganErrorMessage(err), variant: "error" });
                  }
                }}
                className={BTN_PRIMARY}
              >
                Simpan Aturan
              </button>
            </div>

            <div className="space-y-2">
              {newRuleStages.map((st, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-xl bg-[#F9FAFB] p-2.5 border border-[#E5E7EB]">
                  <input
                    type="text"
                    placeholder={`Nama Tahap ${idx + 1}`}
                    value={st.nama}
                    onChange={(e) => setNewRuleStages(newRuleStages.map((x, i) => (i === idx ? { ...x, nama: e.target.value } : x)))}
                    className={`${INPUT_CLS} sm:col-span-3`}
                  />
                  <select
                    value={st.tipe}
                    onChange={(e) => setNewRuleStages(newRuleStages.map((x, i) => (i === idx ? { ...x, tipe: e.target.value as "semua" | "satu" } : x)))}
                    className={`${INPUT_CLS} sm:col-span-3`}
                  >
                    <option value="satu">Cukup salah satu setuju</option>
                    <option value="semua">Semua penyetuju harus setuju</option>
                  </select>
                  <input
                    type="text"
                    placeholder="UID penyetuju (pisahkan koma, mis. uid1, uid2)"
                    value={st.approversText}
                    onChange={(e) => setNewRuleStages(newRuleStages.map((x, i) => (i === idx ? { ...x, approversText: e.target.value } : x)))}
                    className={`${INPUT_CLS} sm:col-span-5`}
                  />
                  {newRuleStages.length > 1 && (
                    <button type="button" onClick={() => setNewRuleStages(newRuleStages.filter((_, i) => i !== idx))} className="text-red-600 p-1 justify-self-end sm:col-span-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="divide-y divide-[#F3F4F6] text-xs">
              {approvalRules.map((r) => (
                <div key={r.id} className="py-2 flex justify-between items-center gap-2">
                  <div>
                    <b>{DOC_TYPE_LABELS[r.tipe] || r.tipe}</b> · Minimal: {formatSen(r.kriteria.min_total || 0)} · {r.tahap.length} tahap
                    <div className="text-[#6B7280]">
                      {r.tahap.map((t, ti) => `T${ti + 1} (${t.tipe === "semua" ? "Semua" : "Salah satu"}: ${(t.approver_uids || []).join(", ")})`).join(" → ")}
                    </div>
                  </div>
                  <button type="button" onClick={async () => { await deleteApprovalRule(r.id); await load(); }} className={BTN_DANGER}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
            <h4 className="font-bold text-sm">Dokumen Menunggu Persetujuan ({pendingApprovals.length})</h4>
            {pendingApprovals.map((d) => (
              <div key={d.id} className="rounded-xl border border-[#E5E7EB] p-3 flex flex-wrap justify-between items-center gap-2 text-xs">
                <div><b>{d.no}</b> · {DOC_TYPE_LABELS[d.type] || d.type} · <span className="font-mono">{formatSen(d.total)}</span></div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await decideApproval(d.id, { keputusan: "approve" });
                        showToast({ message: "Persetujuan dicatat.", variant: "success" });
                        await load();
                      } catch (err) {
                        showToast({ message: keuanganErrorMessage(err), variant: "error" });
                      }
                    }}
                    className={BTN_PRIMARY}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Setujui
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await decideApproval(d.id, { keputusan: "reject" });
                        showToast({ message: "Dokumen ditolak.", variant: "success" });
                        await load();
                      } catch (err) {
                        showToast({ message: keuanganErrorMessage(err), variant: "error" });
                      }
                    }}
                    className={BTN_SECONDARY}
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-600" /> Tolak
                  </button>
                </div>
              </div>
            ))}
            {pendingApprovals.length === 0 && <p className="text-xs text-[#6B7280]">Tidak ada dokumen menunggu persetujuan.</p>}
          </div>
        </div>
      )}

      {tab === "kurs" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
            <h3 className="font-bold text-sm">Mata Uang Asing & Kurs Manual</h3>
            <div className="flex flex-wrap gap-2">
              <input type="text" value={curKode} onChange={(e) => setCurKode(e.target.value)} placeholder="USD" className={`${INPUT_CLS} w-24`} />
              <input type="text" value={curNama} onChange={(e) => setCurNama(e.target.value)} placeholder="Nama" className={`${INPUT_CLS} w-44`} />
              <button type="button" onClick={async () => { await saveCurrency({ kode: curKode, nama: curNama, simbol: curKode }); await load(); }} className={BTN_SECONDARY}>
                Simpan Mata Uang
              </button>
              <input type="number" value={rateKursRp} onChange={(e) => setRateKursRp(Number(e.target.value || 1))} className={`${INPUT_CLS} w-36`} />
              <button
                type="button"
                onClick={async () => {
                  await saveExchangeRate({ currency_kode: curKode, tanggal: todayWib(), kurs: rateKursRp * 1_000_000 });
                  await load();
                  showToast({ message: "Kurs manual disimpan.", variant: "success" });
                }}
                className={BTN_PRIMARY}
              >
                Simpan Kurs Hari Ini
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {currencies.map((c) => <span key={c.kode} className="rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] px-2.5 py-1"><b>{c.kode}</b> — {c.nama}</span>)}
            </div>
            <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-[#F9FAFB]"><tr><th className="px-3 py-2 text-left">Tanggal</th><th className="px-3 py-2 text-left">Mata Uang</th><th className="px-3 py-2 text-right">Kurs (IDR)</th></tr></thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {rates.map((r, i) => (
                    <tr key={i}><td className="px-3 py-2">{r.tanggal}</td><td className="px-3 py-2 font-bold">{r.currency_kode}</td><td className="px-3 py-2 text-right font-mono">{(r.kurs / 1_000_000).toLocaleString("id-ID")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="w-full text-xs">
            <thead className="bg-[#F9FAFB] font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-2.5 text-left">Waktu</th>
                <th className="px-4 py-2.5 text-left">Pengguna</th>
                <th className="px-4 py-2.5 text-left">Entitas</th>
                <th className="px-4 py-2.5 text-left">Aksi</th>
                <th className="px-4 py-2.5 text-left">ID Entitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(a.at).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-2 font-semibold">{a.by_name || a.by}</td>
                  <td className="px-4 py-2">{a.entity}</td>
                  <td className="px-4 py-2 uppercase font-bold text-amber-700">{a.action}</td>
                  <td className="px-4 py-2 font-mono">{a.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
