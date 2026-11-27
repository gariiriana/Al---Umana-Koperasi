// Laporan Laba Rugi (PRD 07-laporan.md): bandingkan unit/periode, template laporan, ekspor PDF/Excel/CSV.
import { useEffect, useState } from "react";
import { firstDayOfMonthWib, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { deleteReportTemplate, getReportLabaRugi, listAccounts, listReportTemplates, listUnits, saveReportTemplate } from "@/keuangan/api";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { Account, LabaRugiResponse, LabaRugiSection, ReportFilter, ReportTemplate, Unit } from "@/keuangan/types";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame, ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ReportLabaRugiPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplNama, setTplNama] = useState("");
  const [tplSections, setTplSections] = useState<
    { id: string; nama: string; tipe: "kategori" | "rumus"; accountKodes: string[]; add: string[]; sub: string[] }[]
  >([
    { id: "sec_pend", nama: "Pendapatan Usaha", tipe: "kategori", accountKodes: ["4-40000"], add: [], sub: [] },
    { id: "sec_beban", nama: "Beban Pokok & Operasional", tipe: "kategori", accountKodes: ["5-50000", "6-60200"], add: [], sub: [] },
    { id: "sec_bersih", nama: "Laba Bersih Template", tipe: "rumus", accountKodes: [], add: ["sec_pend"], sub: ["sec_beban"] },
  ]);
  const [filter, setFilter] = useState<ReportFilter>({
    dari: firstDayOfMonthWib(),
    sampai: todayWib(),
    banding_dengan: "none",
    banding_periode: "none",
    banding_jumlah: 0,
    tampilkan_akun: true,
  });
  const [data, setData] = useState<LabaRugiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, accRes, tpl, rep] = await Promise.all([
        listUnits(),
        listAccounts(),
        listReportTemplates("laba_rugi"),
        getReportLabaRugi(filter),
      ]);
      setUnits(u);
      setAccounts(accRes.accounts.filter((a) => !a.is_header && a.kategori >= 13 && a.kategori <= 17));
      setTemplates(tpl);
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

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplNama.trim()) return;
    try {
      const saved = await saveReportTemplate({
        laporan: "laba_rugi",
        nama: tplNama.trim(),
        config: { sections: tplSections },
      });
      showToast({ message: "Template kustom tersimpan.", variant: "success" });
      setTplModalOpen(false);
      setTemplates(await listReportTemplates("laba_rugi"));
      setFilter((prev) => ({ ...prev, template_id: saved.id }));
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const renderSection = (sec: LabaRugiSection) => (
    <>
      <tr className="bg-gray-50 font-bold text-[#374151]">
        <td className="px-4 py-2">{sec.title}</td>
        {sec.totals.map((v, i) => <td key={i} className="px-4 py-2 text-right font-mono">{formatSen(v)}</td>)}
      </tr>
      {sec.rows.map((r) => (
        <tr key={`${sec.title}-${r.kode}`}>
          <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
            <span className="font-mono text-xs text-[#9CA3AF] mr-2">{r.kode}</span>
            {r.nama}
          </td>
          {r.values.map((v, i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{formatSen(v)}</td>)}
        </tr>
      ))}
    </>
  );

  const buildExport = () => {
    if (!data) return null;
    const headers = ["Kode", "Akun / Keterangan", ...data.columns];
    const rows: ExportCell[][] = [];
    if (data.customSections && data.customSections.length > 0) {
      for (const sec of data.customSections) {
        rows.push(["", sec.nama, ...sec.totals.map((v) => senCell(v))]);
        for (const r of sec.rows) rows.push([r.kode, `  ${r.nama}`, ...r.values.map((v) => senCell(v))]);
      }
    } else {
      const pushSec = (sec: LabaRugiSection) => {
        rows.push(["", sec.title, ...sec.totals.map((v) => senCell(v))]);
        for (const r of sec.rows) rows.push([r.kode, `  ${r.nama}`, ...r.values.map((v) => senCell(v))]);
      };
      pushSec(data.sections.pendapatan);
      pushSec(data.sections.hpp);
      rows.push(["", "Laba Kotor", ...data.sections.labaKotor.map((v) => senCell(v))]);
      pushSec(data.sections.biayaOperasional);
      rows.push(["", "Pendapatan Bersih Operasional", ...data.sections.pendapatanBersihOperasional.map((v) => senCell(v))]);
      pushSec(data.sections.pendapatanLainnya);
      pushSec(data.sections.biayaLainnya);
      rows.push(["", "Pendapatan Bersih", ...data.sections.pendapatanBersih.map((v) => senCell(v))]);
    }
    return {
      laporan: "laba-rugi",
      title: "Laporan Laba Rugi",
      subtitle: `Periode ${formatTanggal(data.dari)} s.d. ${formatTanggal(data.sampai)}`,
      unitLabel: filter.unit_kode || "Gabungan",
      headers,
      rows,
      filenameBase: `laba-rugi-${data.dari}-${data.sampai}`,
      filter: filter as Record<string, unknown>,
    };
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan Laba Rugi</h1>
          <p className="text-sm text-[#6B7280]">Dapat dibandingkan lintas periode atau antar Anak Perusahaan + kolom Gabungan.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter.template_id || ""}
            onChange={(e) => {
              const id = e.target.value;
              setFilter({ ...filter, template_id: id || undefined });
            }}
            className={`${INPUT_CLS} w-auto`}
          >
            <option value="">Template Standar</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nama}</option>
            ))}
          </select>
          <button type="button" onClick={() => setTplModalOpen(true)} className={BTN_SECONDARY}>Buat Template</button>
          {filter.template_id && (
            <button
              type="button"
              onClick={async () => {
                await deleteReportTemplate(filter.template_id!);
                setFilter({ ...filter, template_id: undefined });
                setTemplates(await listReportTemplates("laba_rugi"));
              }}
              className="text-xs text-red-600 font-bold hover:underline cursor-pointer"
            >
              Hapus Template
            </button>
          )}
        </div>
      </div>

      <ReportFilterBar
        filter={filter}
        onChange={setFilter}
        onRefresh={load}
        units={units}
        loading={loading}
        allowCompare={filter.banding_dengan !== "unit"}
        onExportPdf={() => { const ex = buildExport(); if (ex) exportReportPdf(ex); }}
        onExportExcel={() => { const ex = buildExport(); if (ex) exportReportExcel(ex); }}
        onExportCsv={() => { const ex = buildExport(); if (ex) exportReportCsv(ex); }}
        extra={
          <>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Mode Kolom</label>
              <select
                value={filter.banding_dengan || "none"}
                onChange={(e) => setFilter({ ...filter, banding_dengan: e.target.value as ReportFilter["banding_dengan"] })}
                className={INPUT_CLS}
              >
                <option value="none">Satu Kolom / Banding Periode</option>
                <option value="unit">Bandingkan Antar Unit + Gabungan</option>
                <option value="tag">Bandingkan Berdasarkan Tag</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B5563] pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.tampilkan_akun !== false}
                onChange={(e) => setFilter({ ...filter, tampilkan_akun: e.target.checked })}
              />
              Rincian Akun
            </label>
          </>
        }
      />

      {data && (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-3 text-left">Akun / Kategori</th>
                {data.columns.map((c) => <th key={c} className="px-4 py-3 text-right">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {data.customSections && data.customSections.length > 0 ? (
                data.customSections.map((sec) => (
                  <>
                    <tr key={sec.id} className={sec.tipe === "rumus" ? "bg-amber-100/80 font-extrabold text-[#111827]" : "bg-gray-50 font-bold text-[#374151]"}>
                      <td className="px-4 py-2.5">{sec.nama}</td>
                      {sec.totals.map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(v)}</td>)}
                    </tr>
                    {sec.rows.map((r) => (
                      <tr key={`${sec.id}-${r.kode}`}>
                        <td className="px-4 py-1.5 pl-8 text-[#4B5563]">
                          <span className="font-mono text-xs text-[#9CA3AF] mr-2">{r.kode}</span>
                          {r.nama}
                        </td>
                        {r.values.map((v, i) => <td key={i} className="px-4 py-1.5 text-right font-mono">{formatSen(v)}</td>)}
                      </tr>
                    ))}
                  </>
                ))
              ) : (
                <>
                  {renderSection(data.sections.pendapatan)}
                  {renderSection(data.sections.hpp)}
                  <tr className="bg-amber-50 font-bold">
                    <td className="px-4 py-2.5">Laba Kotor</td>
                    {data.sections.labaKotor.map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(v)}</td>)}
                  </tr>
                  {renderSection(data.sections.biayaOperasional)}
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-4 py-2.5">Pendapatan Bersih Operasional</td>
                    {data.sections.pendapatanBersihOperasional.map((v, i) => <td key={i} className="px-4 py-2.5 text-right font-mono">{formatSen(v)}</td>)}
                  </tr>
                  {renderSection(data.sections.pendapatanLainnya)}
                  {renderSection(data.sections.biayaLainnya)}
                  <tr className="bg-amber-100/80 font-extrabold text-base text-[#111827]">
                    <td className="px-4 py-3">Pendapatan Bersih</td>
                    {data.sections.pendapatanBersih.map((v, i) => <td key={i} className="px-4 py-3 text-right font-mono">{formatSen(v)}</td>)}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ModalFrame open={tplModalOpen} title="Buat Template Laba Rugi Kustom" onClose={() => setTplModalOpen(false)}>
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Template</label>
            <input type="text" required value={tplNama} onChange={(e) => setTplNama(e.target.value)} className={INPUT_CLS} placeholder="mis. Laba Rugi Ringkas Yayasan" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#4B5563]">Bagian Laporan</div>
            {tplSections.map((sec, idx) => (
              <div key={sec.id} className="rounded-xl border border-[#E5E7EB] p-3 space-y-2 bg-[#F9FAFB]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sec.nama}
                    onChange={(e) => setTplSections(tplSections.map((s, i) => (i === idx ? { ...s, nama: e.target.value } : s)))}
                    className={INPUT_CLS}
                  />
                  <span className="text-xs font-bold px-2 py-1 rounded bg-white border">{sec.tipe}</span>
                </div>
                {sec.tipe === "kategori" && (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {accounts.map((a) => {
                      const active = sec.accountKodes.includes(a.kode);
                      return (
                        <button
                          key={a.kode}
                          type="button"
                          onClick={() =>
                            setTplSections(
                              tplSections.map((s, i) =>
                                i === idx
                                  ? {
                                      ...s,
                                      accountKodes: active ? s.accountKodes.filter((x) => x !== a.kode) : [...s.accountKodes, a.kode],
                                    }
                                  : s,
                              ),
                            )
                          }
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border cursor-pointer ${
                            active ? "bg-amber-200 border-amber-500 text-amber-950" : "bg-white border-gray-200 text-gray-600"
                          }`}
                        >
                          {a.kode} {a.nama}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => setTplModalOpen(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Template</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
