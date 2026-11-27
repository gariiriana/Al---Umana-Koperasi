// Laporan Buku Besar (PRD 07-laporan.md).
import { useEffect, useState } from "react";
import { getReportBukuBesar, listAccounts, listUnits } from "@/keuangan/api";
import { DOC_TYPE_LABELS, firstDayOfMonthWib, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { Account, BukuBesarResponse, ReportFilter, Unit } from "@/keuangan/types";
import { INPUT_CLS, ReportFilterBar, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportBukuBesarPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({
    dari: firstDayOfMonthWib(),
    sampai: todayWib(),
    account_kodes: "",
    saldo_akhir_saja: false,
  });
  const [data, setData] = useState<BukuBesarResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, a, rep] = await Promise.all([listUnits(), listAccounts(), getReportBukuBesar(filter)]);
      setUnits(u);
      setAccounts(a.accounts.filter((x) => !x.is_header));
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
    const headers = ["Akun", "Tanggal", "Transaksi", "Nomor", "Unit", "Keterangan", "Debit", "Kredit", "Saldo"];
    const rows: ExportCell[][] = [];
    for (const g of data.groups) {
      rows.push([`${g.kode} ${g.nama}`, "", "Saldo Awal", "", "", "", "", "", senCell(g.saldo_awal)]);
      for (const r of g.rows) {
        rows.push([
          `${g.kode}`,
          formatTanggal(r.tanggal),
          DOC_TYPE_LABELS[r.transaksi] || r.transaksi,
          r.nomor,
          r.unit_kode,
          r.keterangan,
          r.debit ? senCell(r.debit) : "",
          r.kredit ? senCell(r.kredit) : "",
          senCell(r.saldo),
        ]);
      }
      rows.push([`${g.kode} ${g.nama}`, "", "Saldo Akhir", "", "", "", senCell(g.total_debit), senCell(g.total_kredit), senCell(g.saldo_akhir)]);
    }
    return {
      laporan: "buku-besar",
      title: "Laporan Buku Besar",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `buku-besar-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Buku Besar</h1>
        <p className="text-sm text-[#6B7280]">Mutasi dan saldo berjalan setiap akun pada periode terpilih.</p>
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
        extra={
          <>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Filter Akun</label>
              <select
                value={filter.account_kodes || ""}
                onChange={(e) => setFilter({ ...filter, account_kodes: e.target.value || undefined })}
                className={INPUT_CLS}
              >
                <option value="">Semua Akun Aktif</option>
                {accounts.map((a) => (
                  <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                ))}
              </select>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B5563] pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(filter.saldo_akhir_saja)}
                onChange={(e) => setFilter({ ...filter, saldo_akhir_saja: e.target.checked })}
              />
              Ringkas (Saldo Akhir Saja)
            </label>
          </>
        }
      />

      <div className="space-y-4">
        {data?.groups.map((g) => (
          <div key={g.kode} className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
            <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-xs font-bold text-amber-700 mr-2">{g.kode}</span>
                <span className="font-bold text-sm text-[#111827]">{g.nama}</span>
                <span className="ml-2 text-xs text-[#6B7280]">({g.kategori_nama})</span>
              </div>
              <div className="text-xs font-bold text-[#374151] space-x-4">
                <span>Saldo Awal: {formatSen(g.saldo_awal)}</span>
                <span className="text-amber-800">Saldo Akhir: {formatSen(g.saldo_akhir)}</span>
              </div>
            </div>
            {!filter.saldo_akhir_saja && g.rows.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50/70 text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
                  <tr>
                    <th className="px-4 py-2 text-left">Tanggal</th>
                    <th className="px-4 py-2 text-left">Transaksi</th>
                    <th className="px-4 py-2 text-left">Nomor</th>
                    <th className="px-4 py-2 text-left">Unit</th>
                    <th className="px-4 py-2 text-left">Keterangan</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Kredit</th>
                    <th className="px-4 py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-1.5 whitespace-nowrap text-xs">{formatTanggal(r.tanggal)}</td>
                      <td className="px-4 py-1.5 text-xs">{DOC_TYPE_LABELS[r.transaksi] || r.transaksi}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-amber-700">{r.nomor}</td>
                      <td className="px-4 py-1.5"><UnitBadge kode={r.unit_kode} /></td>
                      <td className="px-4 py-1.5 text-xs text-[#4B5563]">{r.keterangan}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-xs">{r.debit ? formatSen(r.debit) : "—"}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-xs">{r.kredit ? formatSen(r.kredit) : "—"}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-xs font-bold">{formatSen(r.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {data && data.groups.length === 0 && (
          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">
            Tidak ada mutasi buku besar pada periode ini.
          </div>
        )}
      </div>
    </div>
  );
}
