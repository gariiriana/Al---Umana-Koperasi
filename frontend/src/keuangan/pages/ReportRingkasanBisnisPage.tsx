// Laporan Ringkasan Bisnis & Wawasan Rasio Keuangan (PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { getReportRingkasanBisnis, listUnits } from "@/keuangan/api";
import { firstDayOfMonthWib, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { ReportFilter, RingkasanBisnisResponse, Unit } from "@/keuangan/types";
import { ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportRingkasanBisnisPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({ dari: firstDayOfMonthWib(), sampai: todayWib() });
  const [data, setData] = useState<RingkasanBisnisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportRingkasanBisnis(filter)]);
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
    const headers = ["Bagian", "Indikator", "Nilai"];
    const rows: ExportCell[][] = [
      ["Laba Rugi", "Pendapatan", senCell(data.labaRugi.pendapatan)],
      ["Laba Rugi", "Laba Kotor", senCell(data.labaRugi.labaKotor)],
      ["Laba Rugi", "Biaya Operasional", senCell(data.labaRugi.biayaOperasional)],
      ["Laba Rugi", "Pendapatan Bersih", senCell(data.labaRugi.pendapatanBersih)],
      ["Neraca", "Total Aset", senCell(data.neraca.totalAset)],
      ["Neraca", "Total Liabilitas", senCell(data.neraca.totalLiabilitas)],
      ["Neraca", "Total Modal", senCell(data.neraca.totalModal)],
      ["Arus Kas", "Operasional", senCell(data.arusKas.operasional)],
      ["Arus Kas", "Investasi", senCell(data.arusKas.investasi)],
      ["Arus Kas", "Pendanaan", senCell(data.arusKas.pendanaan)],
      ["Arus Kas", "Saldo Kas Akhir", senCell(data.arusKas.saldoAkhir)],
      ...data.wawasan.map((w) => ["Wawasan", w.label, w.nilai === null ? "-" : `${w.nilai}${w.unit}`]),
    ];
    return {
      laporan: "ringkasan-bisnis",
      title: "Ringkasan Bisnis",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `ringkasan-bisnis-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Ringkasan Bisnis</h1>
        <p className="text-sm text-[#6B7280]">Ikhtisar Laba Rugi, Neraca, Arus Kas, serta rasio kesehatan keuangan.</p>
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs space-y-2">
              <h2 className="font-bold text-sm text-amber-800">Laba Rugi</h2>
              <div className="flex justify-between text-xs"><span>Pendapatan</span><span className="font-mono font-bold">{formatSen(data.labaRugi.pendapatan)}</span></div>
              <div className="flex justify-between text-xs"><span>HPP</span><span className="font-mono">{formatSen(data.labaRugi.hpp)}</span></div>
              <div className="flex justify-between text-xs"><span>Biaya Operasional</span><span className="font-mono">{formatSen(data.labaRugi.biayaOperasional)}</span></div>
              <div className="flex justify-between text-sm font-extrabold border-t pt-2">
                <span>Laba Bersih</span><span className="font-mono text-emerald-700">{formatSen(data.labaRugi.pendapatanBersih)}</span>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs space-y-2">
              <h2 className="font-bold text-sm text-amber-800">Neraca</h2>
              <div className="flex justify-between text-xs"><span>Aset Lancar</span><span className="font-mono">{formatSen(data.neraca.asetLancar)}</span></div>
              <div className="flex justify-between text-xs font-bold"><span>Total Aset</span><span className="font-mono">{formatSen(data.neraca.totalAset)}</span></div>
              <div className="flex justify-between text-xs"><span>Total Liabilitas</span><span className="font-mono">{formatSen(data.neraca.totalLiabilitas)}</span></div>
              <div className="flex justify-between text-sm font-extrabold border-t pt-2">
                <span>Total Modal</span><span className="font-mono">{formatSen(data.neraca.totalModal)}</span>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs space-y-2">
              <h2 className="font-bold text-sm text-amber-800">Arus Kas</h2>
              <div className="flex justify-between text-xs"><span>Operasional</span><span className="font-mono">{formatSen(data.arusKas.operasional)}</span></div>
              <div className="flex justify-between text-xs"><span>Investasi</span><span className="font-mono">{formatSen(data.arusKas.investasi)}</span></div>
              <div className="flex justify-between text-xs"><span>Pendanaan</span><span className="font-mono">{formatSen(data.arusKas.pendanaan)}</span></div>
              <div className="flex justify-between text-sm font-extrabold border-t pt-2">
                <span>Saldo Kas Akhir</span><span className="font-mono text-amber-800">{formatSen(data.arusKas.saldoAkhir)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-3">
            <h2 className="font-bold text-base text-[#111827]">Wawasan & Rasio Keuangan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.wawasan.map((w) => (
                <div key={w.key} className="rounded-xl border border-[#E5E7EB] p-3 bg-[#F9FAFB]">
                  <div className="text-xs font-bold text-[#4B5563]">{w.label}</div>
                  <div className="mt-1 text-xl font-extrabold text-[#111827]">
                    {w.nilai === null ? "—" : `${w.nilai.toLocaleString("id-ID")}${w.unit}`}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#6B7280]">{w.penjelasan}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
