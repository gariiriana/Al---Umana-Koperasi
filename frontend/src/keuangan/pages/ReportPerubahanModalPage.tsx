// Laporan Perubahan Modal — format asli Mekari Jurnal (PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { getReportPerubahanModal, listUnits } from "@/keuangan/api";
import { firstDayOfMonthWib, formatAngkaSen, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf } from "@/keuangan/export/reportExport";
import type { PerubahanModalResponse, ReportFilter, Unit } from "@/keuangan/types";
import { ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportPerubahanModalPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({
    dari: firstDayOfMonthWib(),
    sampai: todayWib(),
    banding_periode: "none",
    banding_jumlah: 0,
  });
  const [data, setData] = useState<PerubahanModalResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportPerubahanModal(filter)]);
      setUnits(u);
      setData(rep);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buildExport = () => {
    if (!data) return null;
    const headers = ["Periode", "Kode Akun", "Nama Akun", "Permulaan", "Debit", "Kredit", "Saldo Akhir"];
    const rows: (string | number)[][] = [];
    for (const blk of data.blocks) {
      for (const r of blk.rows) {
        rows.push([blk.label, r.kode_akun, r.nama_akun, formatAngkaSen(r.permulaan), formatAngkaSen(r.debit), formatAngkaSen(r.kredit), formatAngkaSen(r.saldo_akhir)]);
      }
      rows.push([blk.label, "", "Total", formatAngkaSen(blk.total.permulaan), formatAngkaSen(blk.total.debit), formatAngkaSen(blk.total.kredit), formatAngkaSen(blk.total.saldo_akhir)]);
      rows.push([blk.label, "", "Pergerakan", "", "", "", formatAngkaSen(blk.pergerakan)]);
    }
    return {
      laporan: "perubahan-modal",
      title: "Laporan Perubahan Modal",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `perubahan-modal-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Perubahan Modal</h1>
        <p className="text-sm text-[#6B7280]">
          Menampilkan akun ekuitas (3-30000 s.d. 3-30999): Permulaan, Debit, Kredit, Saldo Akhir, Total, dan Pergerakan.
        </p>
      </div>

      <ReportFilterBar
        filter={filter}
        onChange={setFilter}
        onRefresh={load}
        units={units}
        loading={loading}
        onExportPdf={() => { const ex = buildExport(); if (ex) exportReportPdf(ex); }}
        onExportExcel={() => { const ex = buildExport(); if (ex) exportReportExcel(ex); }}
        onExportCsv={() => { const ex = buildExport(); if (ex) exportReportCsv(ex); }}
      />

      {data?.blocks.map((blk) => (
        <div key={blk.label} className="space-y-3">
          <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
            <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB] font-bold text-sm text-[#111827]">
              Periode {blk.label}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Kode Akun</th>
                  <th className="px-4 py-2.5 text-left">Nama Akun</th>
                  <th className="px-4 py-2.5 text-right">Permulaan</th>
                  <th className="px-4 py-2.5 text-right">Debit</th>
                  <th className="px-4 py-2.5 text-right">Kredit</th>
                  <th className="px-4 py-2.5 text-right">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {blk.rows.map((r) => (
                  <tr key={r.kode_akun}>
                    <td className="px-4 py-2 font-mono text-xs">{r.kode_akun}</td>
                    <td className="px-4 py-2 font-medium text-[#111827]">{r.nama_akun}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatSen(r.permulaan)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatSen(r.debit)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatSen(r.kredit)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatSen(r.saldo_akhir)}</td>
                  </tr>
                ))}
                <tr className="bg-amber-50 font-extrabold">
                  <td colSpan={2} className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatSen(blk.total.permulaan)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatSen(blk.total.debit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatSen(blk.total.kredit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatSen(blk.total.saldo_akhir)}</td>
                </tr>
                <tr className="bg-amber-100/70 font-extrabold">
                  <td colSpan={5} className="px-4 py-2.5">Pergerakan</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatSen(blk.pergerakan)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {blk.catatan && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs text-blue-900">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
              <span>{blk.catatan}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
