// Halaman Manajemen Anggaran & Laporan Anggaran Laba Rugi (Rilis 3).
import { useEffect, useState } from "react";
import { BarChart3, Plus, Trash2 } from "lucide-react";
import { deleteBudget, getBudgetReport, listAccounts, listBudgets, listUnits, saveBudget } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell } from "@/keuangan/export/reportExport";
import type { Account, Budget, Unit } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function AnggaranPage() {
  const { showToast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState<{ budget: Budget | null; months: string[]; rows: { kode: string; nama: string; anggaran: number; aktual: number; selisih: number; persen: number | null }[] } | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [nama, setNama] = useState("");
  const [unitKode, setUnitKode] = useState("");
  const [mulai, setMulai] = useState(todayWib().slice(0, 7));
  const [periode, setPeriode] = useState(12);
  const [lines, setLines] = useState<{ account_kode: string; bulan: string; nilai: number }[]>([
    { account_kode: "4-40000", bulan: todayWib().slice(0, 7), nilai: 0 },
  ]);

  const load = async () => {
    try {
      const [bList, uList, aRes] = await Promise.all([listBudgets(), listUnits(), listAccounts()]);
      setBudgets(bList);
      setUnits(uList);
      setAccounts(aRes.accounts.filter((a) => !a.is_header && !a.arsip && a.kategori >= 13));
      if (!unitKode && uList[0]) setUnitKode(uList[0].kode);
      const targetId = selectedId || bList[0]?.id || "";
      if (targetId) {
        if (!selectedId) setSelectedId(targetId);
        setReport(await getBudgetReport(targetId));
      } else {
        setReport(null);
      }
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [selectedId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveBudget({ nama, unit_kode: unitKode, mulai, jumlah_periode: periode, lines });
      showToast({ message: "Anggaran berhasil disimpan.", variant: "success" });
      setShowCreate(false);
      setNama("");
      setSelectedId(res.budget.id);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const buildExport = () => ({
    laporan: "anggaran-laba-rugi",
    title: `Anggaran Laba Rugi — ${report?.budget?.nama || ""}`,
    subtitle: `Unit ${report?.budget?.unit_kode || "-"} · ${report?.months[0] || ""} s.d. ${report?.months[report.months.length - 1] || ""}`,
    headers: ["Kode", "Nama Akun", "Anggaran", "Aktual", "Selisih", "Realisasi (%)"],
    rows: (report?.rows || []).map((r) => [
      r.kode,
      r.nama,
      senCell(r.anggaran),
      senCell(r.aktual),
      senCell(r.selisih),
      r.persen !== null ? `${r.persen}%` : "-",
    ]),
    filenameBase: `anggaran-laba-rugi-${report?.budget?.mulai || todayWib()}`,
  });

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Manajemen Anggaran</h1>
          <p className="text-sm text-[#6B7280]">Susun anggaran pendapatan & beban per anak perusahaan dan pantau Anggaran Laba Rugi.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" /> Buat Anggaran Baru
        </button>
      </div>

      {budgets.length === 0 ? (
        <EmptyState icon={BarChart3} title="Belum ada anggaran" description="Buat anggaran bulanan untuk membandingkan target dengan realisasi Laba Rugi." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-[#E5E7EB] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold text-[#6B7280]">Pilih Anggaran:</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={`${INPUT_CLS} w-auto`}>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>{b.nama} ({b.unit_kode} · {b.mulai})</option>
                ))}
              </select>
              {selectedId && (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteBudget(selectedId);
                    setSelectedId("");
                    await load();
                  }}
                  className={BTN_DANGER}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              )}
            </div>
            {report && (
              <div className="flex gap-2">
                <button type="button" onClick={() => exportReportPdf(buildExport())} className={BTN_SECONDARY}>PDF</button>
                <button type="button" onClick={() => exportReportExcel(buildExport())} className={BTN_SECONDARY}>Excel</button>
                <button type="button" onClick={() => exportReportCsv(buildExport())} className={BTN_SECONDARY}>CSV</button>
              </div>
            )}
          </div>

          {report && (
            <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-3 text-left">Kode & Nama Akun</th>
                    <th className="px-4 py-3 text-right">Anggaran</th>
                    <th className="px-4 py-3 text-right">Aktual</th>
                    <th className="px-4 py-3 text-right">Selisih</th>
                    <th className="px-4 py-3 text-right">Realisasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {report.rows.map((r) => (
                    <tr key={r.kode}>
                      <td className="px-4 py-3 font-semibold">{r.kode} — {r.nama}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatSen(r.anggaran)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatSen(r.aktual)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${r.selisih < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {formatSen(r.selisih)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{r.persen !== null ? `${r.persen}%` : "-"}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-[#6B7280]">Belum ada baris anggaran atau aktual di periode ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModalFrame open={showCreate} title="Buat Anggaran Baru" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nama Anggaran *</label>
              <input type="text" required value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan</label>
              <select required value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Bulan Mulai (YYYY-MM)</label>
              <input type="month" required value={mulai} onChange={(e) => setMulai(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Jumlah Bulan</label>
              <input type="number" min={1} max={24} value={periode} onChange={(e) => setPeriode(Number(e.target.value || 12))} className={INPUT_CLS} />
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#6B7280]">Target per Akun & Bulan</span>
              <button type="button" onClick={() => setLines([...lines, { account_kode: accounts[0]?.kode || "6-60900", bulan: mulai, nilai: 0 }])} className={BTN_SECONDARY}>
                <Plus className="h-3.5 w-3.5" /> Tambah Target
              </button>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select value={l.account_kode} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, account_kode: e.target.value } : x))} className={`${INPUT_CLS} sm:col-span-5`}>
                  {accounts.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
                </select>
                <input type="month" value={l.bulan} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, bulan: e.target.value } : x))} className={`${INPUT_CLS} sm:col-span-3`} />
                <div className="sm:col-span-3">
                  <RupiahInput valueSen={l.nilai} onChangeSen={(v) => setLines(lines.map((x, i) => i === idx ? { ...x, nilai: v } : x))} />
                </div>
                <button type="button" onClick={() => lines.length > 1 && setLines(lines.filter((_, i) => i !== idx))} className="text-red-600 p-1 sm:col-span-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Anggaran"}</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
