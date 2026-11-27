// Laporan Neraca (PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getReportNeraca, listUnits } from "@/keuangan/api";
import { formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { NeracaResponse, ReportFilter, Unit } from "@/keuangan/types";
import { INPUT_CLS, ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportNeracaPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({
    sampai: todayWib(),
    kedalaman: 3,
    banding_periode: "none",
    banding_jumlah: 0,
  });
  const [data, setData] = useState<NeracaResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportNeraca(filter)]);
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
    const headers = ["Kode", "Akun / Keterangan", ...data.columns];
    const rows: ExportCell[][] = [];
    rows.push(["", "ASET", ...data.columns.map(() => "")]);
    for (const grp of data.sections.aset) {
      rows.push(["", `  ${grp.title}`, ...grp.totals.map((v) => senCell(v))]);
      for (const r of grp.rows) rows.push([r.kode, `    ${r.nama}`, ...r.values.map((v) => senCell(v))]);
    }
    rows.push(["", "Total Aset", ...data.sections.totalAset.map((v) => senCell(v))]);
    rows.push(["", "LIABILITAS", ...data.columns.map(() => "")]);
    for (const grp of data.sections.liabilitas) {
      rows.push(["", `  ${grp.title}`, ...grp.totals.map((v) => senCell(v))]);
      for (const r of grp.rows) rows.push([r.kode, `    ${r.nama}`, ...r.values.map((v) => senCell(v))]);
    }
    rows.push(["", "Total Liabilitas", ...data.sections.totalLiabilitas.map((v) => senCell(v))]);
    rows.push(["", data.sections.modal.title, ...data.sections.modal.totals.map((v) => senCell(v))]);
    for (const r of data.sections.modal.rows) rows.push([r.kode, `  ${r.nama}`, ...r.values.map((v) => senCell(v))]);
    rows.push(["", "Total Liabilitas dan Modal Pemilik", ...data.sections.totalLiabilitasModal.map((v) => senCell(v))]);
    return {
      laporan: "neraca",
      title: "Neraca",
      subtitle: `Per tanggal ${formatTanggal(data.sampai)}${data.konsolidasi ? " (Konsolidasi — akun antar unit dieliminasi)" : ""}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `neraca-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Neraca</h1>
          <p className="text-xs text-[#6B7280]">
            Aset = Liabilitas + Modal. {data?.konsolidasi ? "Mode Gabungan (1-10150 & 2-20150 dieliminasi otomatis)." : `Unit ${filter.unit_kode}`}
          </p>
        </div>
        {data && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${data.seimbang ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
            {data.seimbang ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {data.seimbang ? "Neraca Seimbang" : `Selisih ${formatSen(data.selisih)}`}
          </div>
        )}
      </div>

      <ReportFilterBar
        singleDateMode
        filter={filter}
        onChange={setFilter}
        onRefresh={load}
        units={units}
        loading={loading}
        onExportPdf={() => { const ex = buildExport(); if (ex) exportReportPdf(ex); }}
        onExportExcel={() => { const ex = buildExport(); if (ex) exportReportExcel(ex); }}
        onExportCsv={() => { const ex = buildExport(); if (ex) exportReportCsv(ex); }}
        extra={
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Kedalaman Akun</label>
            <select value={filter.kedalaman || 3} onChange={(e) => setFilter({ ...filter, kedalaman: Number(e.target.value) })} className={INPUT_CLS}>
              <option value={1}>Ringkas (Kategori Saja)</option>
              <option value={3}>Detail (Semua Akun)</option>
            </select>
          </div>
        }
      />

      {data && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-3 text-left">Akun</th>
                {data.columns.map((c) => (
                  <th key={c} className="px-4 py-3 text-right">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              <tr className="bg-amber-50/70 font-extrabold text-[#111827]">
                <td colSpan={1 + data.columns.length} className="px-4 py-2.5">ASET</td>
              </tr>
              {data.sections.aset.map((grp) => (
                <>
                  <tr key={grp.title} className="bg-gray-50/70 font-bold text-[#374151]">
                    <td className="px-4 py-2">{grp.title}</td>
                    {grp.totals.map((v, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(v)}</td>)}
                  </tr>
                  {grp.rows.map((r) => (
                    <tr key={`${grp.title}-${r.kode}-${r.nama}`}>
                      <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
                        {r.kode && <span className="font-mono text-xs mr-2 text-[#9CA3AF]">{r.kode}</span>}
                        {r.nama}
                      </td>
                      {r.values.map((v, i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{formatSen(v)}</td>)}
                    </tr>
                  ))}
                </>
              ))}
              <tr className="bg-amber-100/60 font-extrabold text-[#111827]">
                <td className="px-4 py-2.5">Total Aset</td>
                {data.sections.totalAset.map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(v)}</td>)}
              </tr>

              <tr className="bg-amber-50/70 font-extrabold text-[#111827]">
                <td colSpan={1 + data.columns.length} className="px-4 py-2.5">LIABILITAS & MODAL</td>
              </tr>
              {data.sections.liabilitas.map((grp) => (
                <>
                  <tr key={grp.title} className="bg-gray-50/70 font-bold text-[#374151]">
                    <td className="px-4 py-2">{grp.title}</td>
                    {grp.totals.map((v, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(v)}</td>)}
                  </tr>
                  {grp.rows.map((r) => (
                    <tr key={`${grp.title}-${r.kode}-${r.nama}`}>
                      <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
                        {r.kode && <span className="font-mono text-xs mr-2 text-[#9CA3AF]">{r.kode}</span>}
                        {r.nama}
                      </td>
                      {r.values.map((v, i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{formatSen(v)}</td>)}
                    </tr>
                  ))}
                </>
              ))}
              <tr className="bg-gray-100 font-bold">
                <td className="px-4 py-2">Total Liabilitas</td>
                {data.sections.totalLiabilitas.map((v, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(v)}</td>)}
              </tr>

              <tr className="bg-gray-50/70 font-bold text-[#374151]">
                <td className="px-4 py-2">{data.sections.modal.title}</td>
                {data.sections.modal.totals.map((v, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(v)}</td>)}
              </tr>
              {data.sections.modal.rows.map((r) => (
                <tr key={`modal-${r.kode}-${r.nama}`}>
                  <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
                    {r.kode && <span className="font-mono text-xs mr-2 text-[#9CA3AF]">{r.kode}</span>}
                    {r.nama}
                  </td>
                  {r.values.map((v, i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{formatSen(v)}</td>)}
                </tr>
              ))}
              <tr className="bg-amber-100/60 font-extrabold text-[#111827]">
                <td className="px-4 py-2.5">Total Liabilitas dan Modal Pemilik</td>
                {data.sections.totalLiabilitasModal.map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(v)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
