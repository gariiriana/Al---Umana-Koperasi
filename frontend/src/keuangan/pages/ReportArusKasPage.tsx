// Laporan Arus Kas (Langsung & Tidak Langsung, PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { getReportArusKas, listUnits } from "@/keuangan/api";
import { firstDayOfMonthWib, formatAngkaSen, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf } from "@/keuangan/export/reportExport";
import type { ArusKasResponse, ReportFilter, Unit } from "@/keuangan/types";
import { INPUT_CLS, ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportArusKasPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({
    dari: firstDayOfMonthWib(),
    sampai: todayWib(),
    metode: "langsung",
    tampilkan_akun: false,
    banding_periode: "none",
    banding_jumlah: 0,
  });
  const [data, setData] = useState<ArusKasResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, rep] = await Promise.all([listUnits(), getReportArusKas(filter)]);
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
    const headers = ["Aktivitas / Pos Arus Kas", ...data.columns];
    const rows: (string | number)[][] = [];
    const collectActivity = (title: string, getter: (b: ArusKasResponse["data"][number]) => ArusKasResponse["data"][number]["operasional"]) => {
      rows.push([title, ...data.data.map((b) => formatAngkaSen(getter(b).total))]);
      const keys = new Map<string, string>();
      data.data.forEach((b) => getter(b).items.forEach((it) => keys.set(it.key, it.label)));
      for (const [k, label] of keys.entries()) {
        rows.push([
          `  ${label}`,
          ...data.data.map((b) => formatAngkaSen(getter(b).items.find((x) => x.key === k)?.nilai || 0)),
        ]);
      }
    };
    collectActivity("Arus Kas dari Aktivitas Operasional", (b) => b.operasional);
    collectActivity("Arus Kas dari Aktivitas Investasi", (b) => b.investasi);
    collectActivity("Arus Kas dari Aktivitas Pendanaan", (b) => b.pendanaan);
    rows.push(["Kenaikan (Penurunan) Bersih Kas", ...data.data.map((b) => formatAngkaSen(b.kenaikanKas))]);
    rows.push(["Saldo Kas & Setara Kas Awal", ...data.data.map((b) => formatAngkaSen(b.saldoAwal))]);
    rows.push(["Saldo Kas & Setara Kas Akhir", ...data.data.map((b) => formatAngkaSen(b.saldoAkhir))]);

    return {
      laporan: "arus-kas",
      title: `Laporan Arus Kas (${data.metode === "langsung" ? "Metode Langsung" : "Metode Tidak Langsung"})`,
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `arus-kas-${data.metode}-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  const renderSection = (title: string, getter: (b: ArusKasResponse["data"][number]) => ArusKasResponse["data"][number]["operasional"]) => {
    if (!data) return null;
    const keys = new Map<string, string>();
    data.data.forEach((b) => getter(b).items.forEach((it) => keys.set(it.key, it.label)));
    return (
      <>
        <tr className="bg-gray-50 font-bold text-[#374151]">
          <td className="px-4 py-2">{title}</td>
          {data.data.map((b, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(getter(b).total)}</td>)}
        </tr>
        {[...keys.entries()].map(([k, label]) => (
          <tr key={`${title}-${k}`}>
            <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
              <div>{label}</div>
              {filter.tampilkan_akun && data.data[0]?.operasional && (() => {
                const it = getter(data.data[0]).items.find((x) => x.key === k);
                if (!it?.accounts?.length) return null;
                return (
                  <div className="mt-1 space-y-0.5 text-[11px] text-[#6B7280]">
                    {it.accounts.map((a) => (
                      <div key={a.kode}>{a.kode} {a.nama}: {formatSen(a.nilai)}</div>
                    ))}
                  </div>
                );
              })()}
            </td>
            {data.data.map((b, i) => (
              <td key={i} className="px-4 py-1.5 text-right font-mono">
                {formatSen(getter(b).items.find((x) => x.key === k)?.nilai || 0)}
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Arus Kas</h1>
          <p className="text-sm text-[#6B7280]">Metode Langsung & Tidak Langsung, terverifikasi dengan saldo Kas & Bank di Neraca.</p>
        </div>
        {data && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${data.cocok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
            {data.cocok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {data.cocok ? "Cocok dengan Saldo Kas & Bank" : "Selisih terhadap Saldo Akun Kas"}
          </div>
        )}
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
        extra={
          <>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Metode</label>
              <select
                value={filter.metode || "langsung"}
                onChange={(e) => setFilter({ ...filter, metode: e.target.value as "langsung" | "tidak_langsung" })}
                className={INPUT_CLS}
              >
                <option value="langsung">Langsung</option>
                <option value="tidak_langsung">Tidak Langsung</option>
              </select>
            </div>
            {filter.metode !== "tidak_langsung" && (
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B5563] pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(filter.tampilkan_akun)}
                  onChange={(e) => setFilter({ ...filter, tampilkan_akun: e.target.checked })}
                />
                Rincian Akun
              </label>
            )}
          </>
        }
      />

      {data && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-3 text-left">Aktivitas</th>
                {data.columns.map((c) => <th key={c} className="px-4 py-3 text-right">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {renderSection("Arus Kas dari Aktivitas Operasional", (b) => b.operasional)}
              {renderSection("Arus Kas dari Aktivitas Investasi", (b) => b.investasi)}
              {renderSection("Arus Kas dari Aktivitas Pendanaan", (b) => b.pendanaan)}
              <tr className="bg-amber-50 font-bold">
                <td className="px-4 py-2.5">Kenaikan (Penurunan) Bersih Kas</td>
                {data.data.map((b, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(b.kenaikanKas)}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-[#4B5563]">Saldo Kas & Setara Kas Awal Periode</td>
                {data.data.map((b, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(b.saldoAwal)}</td>)}
              </tr>
              <tr className="bg-amber-100/80 font-extrabold text-base text-[#111827]">
                <td className="px-4 py-3">Saldo Kas & Setara Kas Akhir Periode</td>
                {data.data.map((b, i) => <td key={i} className="px-4 py-3 text-right font-mono">{formatSen(b.saldoAkhir)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
