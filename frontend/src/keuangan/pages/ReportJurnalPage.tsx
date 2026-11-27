// Laporan Jurnal (PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { getReportJurnal, listUnits } from "@/keuangan/api";
import { DOC_TYPE_LABELS, firstDayOfMonthWib, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { JurnalReportResponse, ReportFilter, Unit } from "@/keuangan/types";
import { ReportFilterBar, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportJurnalPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({ dari: firstDayOfMonthWib(), sampai: todayWib() });
  const [data, setData] = useState<JurnalReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportJurnal(filter)]);
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
    const headers = ["Tanggal", "Transaksi & Nomor", "Kode Akun", "Nama Akun", "Unit", "Keterangan", "Debit", "Kredit"];
    const rows: ExportCell[][] = [];
    for (const e of data.entries) {
      for (const l of e.lines) {
        rows.push([
          formatTanggal(e.tanggal),
          `${DOC_TYPE_LABELS[e.type] || e.type} #${e.no}`,
          l.account_kode,
          l.account_nama,
          l.unit_kode,
          l.keterangan,
          l.debit ? senCell(l.debit) : "",
          l.kredit ? senCell(l.kredit) : "",
        ]);
      }
    }
    rows.push(["", "TOTAL", "", "", "", "", senCell(data.grandDebit), senCell(data.grandKredit)]);
    return {
      laporan: "jurnal",
      title: "Laporan Jurnal",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `jurnal-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Jurnal</h1>
        <p className="text-sm text-[#6B7280]">Daftar kronologis seluruh ayat jurnal double-entry tiap transaksi.</p>
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

      <div className="space-y-3">
        {data?.entries.map((e) => (
          <div key={e.document_id} className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
            <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-bold text-[#111827]">
                {formatTanggal(e.tanggal)} — {DOC_TYPE_LABELS[e.type] || e.type} <span className="font-mono text-amber-700">#{e.no}</span>
              </div>
              <div className="text-[#6B7280]">{e.memo}</div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#E5E7EB]">
                {e.lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-mono text-xs w-28">{l.account_kode}</td>
                    <td className="px-4 py-2 font-medium text-[#111827]">{l.account_nama}</td>
                    <td className="px-4 py-2 w-24"><UnitBadge kode={l.unit_kode} /></td>
                    <td className="px-4 py-2 text-xs text-[#6B7280]">{l.keterangan}</td>
                    <td className="px-4 py-2 text-right font-mono w-36">{l.debit ? formatSen(l.debit) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono w-36">{l.kredit ? formatSen(l.kredit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {data && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3 flex flex-wrap justify-between font-extrabold text-sm text-[#111827]">
            <span>Grand Total Jurnal ({data.entries.length} dokumen)</span>
            <span className="font-mono space-x-6">
              <span>Debit: {formatSen(data.grandDebit)}</span>
              <span>Kredit: {formatSen(data.grandKredit)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
