// Laporan Neraca Saldo (Trial Balance — PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { getReportNeracaSaldo, listUnits } from "@/keuangan/api";
import { firstDayOfMonthWib, formatAngkaSen, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf } from "@/keuangan/export/reportExport";
import type { NeracaSaldoResponse, ReportFilter, Unit } from "@/keuangan/types";
import { ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportNeracaSaldoPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({ dari: firstDayOfMonthWib(), sampai: todayWib() });
  const [data, setData] = useState<NeracaSaldoResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportNeracaSaldo(filter)]);
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
    const headers = ["Kode", "Nama Akun", "Awal Debit", "Awal Kredit", "Pergerakan Debit", "Pergerakan Kredit", "Akhir Debit", "Akhir Kredit"];
    const rows = [
      ...data.rows.map((r) => [
        r.kode,
        r.nama,
        formatAngkaSen(r.awal_debit),
        formatAngkaSen(r.awal_kredit),
        formatAngkaSen(r.gerak_debit),
        formatAngkaSen(r.gerak_kredit),
        formatAngkaSen(r.akhir_debit),
        formatAngkaSen(r.akhir_kredit),
      ]),
      [
        "",
        "TOTAL",
        formatAngkaSen(data.totals.awal_debit),
        formatAngkaSen(data.totals.awal_kredit),
        formatAngkaSen(data.totals.gerak_debit),
        formatAngkaSen(data.totals.gerak_kredit),
        formatAngkaSen(data.totals.akhir_debit),
        formatAngkaSen(data.totals.akhir_kredit),
      ],
    ];
    return {
      laporan: "neraca-saldo",
      title: "Laporan Neraca Saldo",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `neraca-saldo-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Neraca Saldo</h1>
        <p className="text-sm text-[#6B7280]">Saldo awal, pergerakan debit/kredit periode, dan saldo akhir per akun.</p>
      </div>

      <ReportFilterBar
        filter={filter}
        onChange={setFilter}
        onRefresh={load}
        units={units}
        loading={loading}
        allowCompare={false}
        onExportPdf={() => { const ex = buildExport(); if (ex) exportReportPdf(ex); }}
        onExportExcel={() => { const ex = buildExport(); if (ex) exportReportExcel(ex); }}
        onExportCsv={() => { const ex = buildExport(); if (ex) exportReportCsv(ex); }}
      />

      {data && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left">Kode</th>
                <th rowSpan={2} className="px-3 py-2 text-left">Nama Akun</th>
                <th colSpan={2} className="px-3 py-1.5 text-center border-l border-[#E5E7EB]">Saldo Awal</th>
                <th colSpan={2} className="px-3 py-1.5 text-center border-l border-[#E5E7EB]">Pergerakan</th>
                <th colSpan={2} className="px-3 py-1.5 text-center border-l border-[#E5E7EB]">Saldo Akhir</th>
              </tr>
              <tr>
                <th className="px-3 py-1.5 text-right border-l border-[#E5E7EB]">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
                <th className="px-3 py-1.5 text-right border-l border-[#E5E7EB]">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
                <th className="px-3 py-1.5 text-right border-l border-[#E5E7EB]">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {data.rows.map((r) => (
                <tr key={r.kode}>
                  <td className="px-3 py-2 font-mono">{r.kode}</td>
                  <td className="px-3 py-2 font-medium text-[#111827]">{r.nama}</td>
                  <td className="px-3 py-2 text-right font-mono border-l border-[#E5E7EB]">{formatSen(r.awal_debit)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatSen(r.awal_kredit)}</td>
                  <td className="px-3 py-2 text-right font-mono border-l border-[#E5E7EB]">{formatSen(r.gerak_debit)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatSen(r.gerak_kredit)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold border-l border-[#E5E7EB]">{formatSen(r.akhir_debit)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{formatSen(r.akhir_kredit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-amber-50 font-extrabold border-t-2 border-[#E5E7EB]">
              <tr>
                <td colSpan={2} className="px-3 py-2.5 text-right">Total</td>
                <td className="px-3 py-2.5 text-right font-mono border-l border-[#E5E7EB]">{formatSen(data.totals.awal_debit)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatSen(data.totals.awal_kredit)}</td>
                <td className="px-3 py-2.5 text-right font-mono border-l border-[#E5E7EB]">{formatSen(data.totals.gerak_debit)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatSen(data.totals.gerak_kredit)}</td>
                <td className="px-3 py-2.5 text-right font-mono border-l border-[#E5E7EB]">{formatSen(data.totals.akhir_debit)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatSen(data.totals.akhir_kredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
