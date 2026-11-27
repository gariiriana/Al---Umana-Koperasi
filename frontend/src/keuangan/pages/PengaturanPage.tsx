// Pengaturan Keuangan (Rilis 1): Perusahaan, Pemetaan Akun, Penomoran, Audit Log.
import { useEffect, useState } from "react";
import { Building, History, ListChecks, Sliders } from "lucide-react";
import {
  getAccountMapping,
  getNumbering,
  getSettings,
  listAccounts,
  listAudit,
  updateAccountMapping,
  updateNumbering,
  updateSettings,
} from "@/keuangan/api";
import { DOC_TYPE_LABELS, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, AccountMappingItem, AuditLogRow, NumberingRule } from "@/keuangan/types";
import { BTN_PRIMARY, INPUT_CLS } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

type TabKey = "perusahaan" | "pemetaan" | "penomoran" | "audit";

export function PengaturanPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("perusahaan");
  const [company, setCompany] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<AccountMappingItem[]>([]);
  const [mapDraft, setMapDraft] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [numbering, setNumbering] = useState<NumberingRule[]>([]);
  const [audits, setAudits] = useState<AuditLogRow[]>([]);

  const load = async () => {
    try {
      const [s, mp, acc, num, aud] = await Promise.all([
        getSettings(),
        getAccountMapping(),
        listAccounts(),
        getNumbering(),
        listAudit({ limit: 80 }),
      ]);
      const p = (s.settings.perusahaan || {}) as Record<string, string>;
      setCompany(p);
      setMapping(mp);
      setMapDraft(Object.fromEntries(mp.map((m) => [m.key, m.account_kode])));
      setAccounts(acc.accounts.filter((a) => !a.is_header && !a.arsip));
      setNumbering(num);
      setAudits(aud);
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
