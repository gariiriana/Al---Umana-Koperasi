// Halaman Kunci Periode & Tutup Buku (PRD 01-dasar.md).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Lock, RotateCcw } from "lucide-react";
import { cancelPeriodClosing, createPeriodClosing, listAccounts, listPeriodClosings, previewClosing } from "@/keuangan/api";
import { formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, PeriodClosing } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, RupiahInput } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function KunciTutupBukuPage() {
  const { showToast } = useToast();
  const [closings, setClosings] = useState<PeriodClosing[]>([]);
  const [latestCompletedId, setLatestCompletedId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tipe, setTipe] = useState<"kunci" | "tutup">("tutup");
  const [sampai, setSampai] = useState(todayWib());
  const [memo, setMemo] = useState("");
  const [labaDitahan, setLabaDitahan] = useState("3-30001");
  const [bebanPajak, setBebanPajak] = useState(0);
  const [preview, setPreview] = useState<{
    dari: string;
    sampai: string;
    checklist: { recalcRunning: boolean; hasNegativeStock: boolean; pendingDepreciation: number; canProceed: boolean };
    netProfit: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [pc, acc] = await Promise.all([listPeriodClosings(), listAccounts()]);
      setClosings(pc.closings);
      setLatestCompletedId(pc.latestCompletedId);
      setAccounts(acc.accounts.filter((a) => !a.is_header && a.kategori === 12));
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePreview = async () => {
    try {
      const res = await previewClosing(sampai);
      setPreview(res);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPeriodClosing({
        tipe,
        sampai,
        status: "selesai",
        memo,
        akun_laba_ditahan: tipe === "tutup" ? labaDitahan : undefined,
        beban_pajak: tipe === "tutup" && bebanPajak > 0 ? bebanPajak : undefined,
      });
      showToast({ message: tipe === "tutup" ? "Tutup Buku selesai. Saldo laba dipindahkan ke Laba Ditahan." : "Periode berhasil dikunci.", variant: "success" });
      setPreview(null);
      setMemo("");
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    const alasan = window.prompt("Alasan pembatalan kunci/tutup buku terakhir:");
    if (!alasan?.trim()) return;
    try {
      await cancelPeriodClosing(id, alasan.trim());
      showToast({ message: "Kunci/Tutup buku dibatalkan.", variant: "success" });
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/keuangan/daftar-lainnya" className={BTN_SECONDARY}>
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Kunci Periode & Tutup Buku</h1>
          <p className="text-sm text-[#6B7280]">Kunci tanggal dari perubahan transaksi atau lakukan Tutup Buku untuk menutup akun pendapatan & beban.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Jenis Proses</label>
            <select value={tipe} onChange={(e) => setTipe(e.target.value as "kunci" | "tutup")} className={INPUT_CLS}>
              <option value="tutup">Tutup Buku (Nol-kan Laba Rugi → Laba Ditahan)</option>
              <option value="kunci">Kunci Periode Saja (Tanpa Jurnal Penutup)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Sampai Tanggal</label>
            <input type="date" required value={sampai} onChange={(e) => setSampai(e.target.value)} className={INPUT_CLS} />
          </div>
          {tipe === "tutup" && (
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Akun Laba Ditahan</label>
              <select value={labaDitahan} onChange={(e) => setLabaDitahan(e.target.value)} className={INPUT_CLS}>
                {accounts.map((a) => (
                  <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tipe === "tutup" && (
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Beban Pajak Penghasilan (opsional, Rp)</label>
              <RupiahInput valueSen={bebanPajak} onChangeSen={setBebanPajak} />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Memo</label>
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Tutup buku bulan..." className={INPUT_CLS} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handlePreview} className={BTN_SECONDARY}>
            Periksa Pratinjau & Checklist
          </button>
          <button type="submit" disabled={saving} className={BTN_PRIMARY}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Jalankan {tipe === "tutup" ? "Tutup Buku" : "Kunci Periode"}
          </button>
        </div>

        {preview && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2 text-xs">
            <div className="font-bold text-amber-900">
              Pratinjau Periode {formatTanggal(preview.dari)} s.d. {formatTanggal(preview.sampai)}
            </div>
            <div>Laba Bersih yang akan dipindahkan: <strong className="font-mono">{formatSen(preview.netProfit)}</strong></div>
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              {preview.checklist.canProceed ? "Semua checklist aman (tidak ada rekalkulasi HPP, stok minus, atau penyusutan tertunda)." : "Perhatian: masih ada item checklist tertunda."}
            </div>
          </div>
        )}
      </form>

      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-3 text-left">Tipe</th>
              <th className="px-4 py-3 text-left">Periode</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Memo</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {closings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-[#6B7280]">Belum ada riwayat kunci periode / tutup buku.</td>
              </tr>
            ) : (
              closings.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-bold capitalize">{c.tipe === "tutup" ? "Tutup Buku" : "Kunci Periode"}</td>
                  <td className="px-4 py-2.5 text-xs">{formatTanggal(c.dari)} s.d. {formatTanggal(c.sampai)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c.status === "selesai" ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#4B5563]">
                    {c.memo}
                    {c.alasan_batal && <span className="text-red-600 block">Alasan batal: {c.alasan_batal}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.id === latestCompletedId && c.status === "selesai" && (
                      <button type="button" onClick={() => handleCancel(c.id)} className={BTN_DANGER}>
                        <RotateCcw className="h-3.5 w-3.5" /> Batalkan
                      </button>
                    )}
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
