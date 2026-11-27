// Atur Saldo Awal per Anak Perusahaan & Tanggal Konversi (PRD 01-dasar.md).
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Info, Loader2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { getOpeningBalance, listAccounts, listUnits, saveOpeningBalance } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, Unit } from "@/keuangan/types";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, RupiahInput } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function SaldoAwalPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitKode, setUnitKode] = useState("");
  const [tanggal, setTanggal] = useState(todayWib());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [amounts, setAmounts] = useState<Record<string, { debit: number; kredit: number }>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listUnits(), listAccounts()])
      .then(([u, a]) => {
        setUnits(u);
        if (u[0] && !unitKode) setUnitKode(u[0].kode);
        setAccounts(a.accounts.filter((x) => !x.is_header && !x.arsip && x.sistem === 0 && x.kode !== "3-30999"));
      })
      .catch((e) => showToast({ message: keuanganErrorMessage(e), variant: "error" }));
  }, []);

  useEffect(() => {
    if (!unitKode) return;
    getOpeningBalance(unitKode)
      .then((res) => {
        const next: Record<string, { debit: number; kredit: number }> = {};
        if (res.openingBalance) {
          setTanggal(res.openingBalance.tanggal);
          setStatus(res.openingBalance.status);
          for (const l of res.lines) {
            if (l.account_kode === "3-30999") continue;
            next[l.account_kode] = {
              debit: l.jumlah > 0 ? l.jumlah : 0,
              kredit: l.jumlah < 0 ? Math.abs(l.jumlah) : 0,
            };
          }
        } else {
          setStatus(null);
        }
        setAmounts(next);
      })
      .catch((e) => showToast({ message: keuanganErrorMessage(e), variant: "error" }));
  }, [unitKode]);

  const totalDebit = Object.values(amounts).reduce((s, v) => s + (v.debit || 0), 0);
  const totalKredit = Object.values(amounts).reduce((s, v) => s + (v.kredit || 0), 0);
  const selisih = totalDebit - totalKredit;

  const handleSave = async (targetStatus: "draf" | "selesai") => {
    if (!unitKode) {
      showToast({ message: "Pilih anak perusahaan terlebih dahulu.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const lines = Object.entries(amounts)
        .filter(([, v]) => v.debit > 0 || v.kredit > 0)
        .map(([account_kode, v]) => ({
          account_kode,
          debit: v.debit || 0,
          kredit: v.kredit || 0,
        }));
      await saveOpeningBalance({ unit_kode: unitKode, tanggal, status: targetStatus, lines });
      setStatus(targetStatus);
      showToast({
        message: targetStatus === "selesai" ? "Saldo Awal diterbitkan dan diposting ke buku besar." : "Draf Saldo Awal disimpan.",
        variant: "success",
      });
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/keuangan/akun" className={BTN_SECONDARY}>
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Link>
          <div>
            <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Atur Saldo Awal</h1>
            <p className="text-sm text-[#6B7280]">Masukkan saldo awal tiap akun per anak perusahaan pada tanggal konversi pembukuan.</p>
          </div>
        </div>
        {status && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Status: {status === "selesai" ? "Diterbitkan" : "Draf"}
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-end gap-4 shadow-xs">
        <div>
          <label className="block text-xs font-bold text-[#4B5563] mb-1">Anak Perusahaan</label>
          <select value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
            {units.length === 0 && <option value="">Belum ada anak perusahaan</option>}
            {units.map((u) => (
              <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#4B5563] mb-1">Tanggal Konversi</label>
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={INPUT_CLS} />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" disabled={saving || !unitKode} onClick={() => handleSave("draf")} className={BTN_SECONDARY}>
            <Save className="h-4 w-4" /> Simpan sebagai Draf
          </button>
          <button type="button" disabled={saving || !unitKode} onClick={() => handleSave("selesai")} className={BTN_PRIMARY}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Terbitkan Saldo Awal
          </button>
        </div>
      </div>

      {selisih !== 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-900">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          <span>
            Selisih antara Debit ({formatSen(totalDebit)}) dan Kredit ({formatSen(totalKredit)}) sebesar{" "}
            <strong>{formatSen(Math.abs(selisih))}</strong> akan otomatis dicatat ke akun penyeimbang{" "}
            <code>3-30999 Ekuitas Saldo Awal</code> saat diterbitkan.
          </span>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-3 text-left">Kode</th>
              <th className="px-4 py-3 text-left">Nama Akun</th>
              <th className="px-4 py-3 text-left">Kategori</th>
              <th className="px-4 py-3 text-right w-48">Debit (Rp)</th>
              <th className="px-4 py-3 text-right w-48">Kredit (Rp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {accounts.map((acc) => {
              const cur = amounts[acc.kode] || { debit: 0, kredit: 0 };
              return (
                <tr key={acc.kode}>
                  <td className="px-4 py-2 font-mono text-xs">{acc.kode}</td>
                  <td className="px-4 py-2 font-medium text-[#111827]">{acc.nama}</td>
                  <td className="px-4 py-2 text-xs text-[#6B7280]">{acc.kategori_nama}</td>
                  <td className="px-4 py-1.5">
                    <RupiahInput
                      valueSen={cur.debit}
                      onChangeSen={(v) => setAmounts({ ...amounts, [acc.kode]: { debit: v, kredit: v > 0 ? 0 : cur.kredit } })}
                    />
                  </td>
                  <td className="px-4 py-1.5">
                    <RupiahInput
                      valueSen={cur.kredit}
                      onChangeSen={(v) => setAmounts({ ...amounts, [acc.kode]: { debit: v > 0 ? 0 : cur.debit, kredit: v } })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-[#F9FAFB] font-bold border-t-2 border-[#E5E7EB]">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3 text-right font-mono">{formatSen(totalDebit)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatSen(totalKredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
