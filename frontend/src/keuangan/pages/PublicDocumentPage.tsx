// Tautan Publik Dokumen (/f/:token — tanpa login, read-only, dapat diunduh PDF).
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { getPublicDocument } from "@/keuangan/api";
import { DOC_TYPE_LABELS, formatSen, formatTanggal, keuanganErrorMessage } from "@/keuangan/format";
import { exportReportPdf } from "@/keuangan/export/reportExport";
import { BTN_PRIMARY } from "@/keuangan/components/KeuanganUi";

export function PublicDocumentPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublicDocument>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicDocument(token)
      .then(setData)
      .catch((e) => setError(keuanganErrorMessage(e)));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-4">
        <div className="max-w-md rounded-2xl bg-white border border-red-200 p-6 text-center space-y-2 shadow-sm">
          <h1 className="font-bold text-lg text-red-700">Tautan Tidak Valid</h1>
          <p className="text-sm text-[#4B5563]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
      </div>
    );
  }

  const d = data.document;

  const handlePdf = () => {
    exportReportPdf({
      laporan: "public-doc",
      title: `${DOC_TYPE_LABELS[d.type] || d.type} #${d.no}`,
      subtitle: `Tanggal: ${formatTanggal(d.tanggal)} | Unit: ${d.unit_nama || d.unit_kode}`,
      unitLabel: d.unit_kode,
      headers: ["Akun / Item", "Deskripsi", "Jumlah"],
      rows: [
        ...data.lines.map((l) => [
          `${l.account_kode} ${l.account_nama || ""}`.trim(),
          l.deskripsi || "-",
          formatSen(l.jumlah),
        ]),
        ["", "Total", formatSen(d.total)],
      ],
      filenameBase: `dokumen-${d.no}`,
    });
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] py-8 px-4">
      <div className="max-w-3xl mx-auto rounded-2xl bg-white border border-[#E5E7EB] p-6 sm:p-8 shadow-md space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
              {String(data.company?.nama || "Koperasi & Unit Usaha Al-Umanaa")}
            </div>
            <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827] mt-1">
              {DOC_TYPE_LABELS[d.type] || d.type} #{d.no}
            </h1>
            <div className="text-sm text-[#6B7280] mt-1">
              Tanggal {formatTanggal(d.tanggal)} • Unit {d.unit_nama || d.unit_kode}
            </div>
          </div>
          <button type="button" onClick={handlePdf} className={BTN_PRIMARY}>
            <Download className="h-4 w-4" /> Unduh PDF
          </button>
        </div>

        {d.contact_nama && (
          <div className="text-sm">
            <div className="text-xs font-bold text-[#6B7280]">Kontak / Pihak Terkait</div>
            <div className="font-bold text-[#111827]">{d.contact_nama}</div>
            {d.contact_alamat && <div className="text-xs text-[#6B7280]">{d.contact_alamat}</div>}
          </div>
        )}

        <table className="w-full text-sm border border-[#E5E7EB] rounded-xl overflow-hidden">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280]">
            <tr>
              <th className="px-4 py-2.5 text-left">Akun</th>
              <th className="px-4 py-2.5 text-left">Deskripsi</th>
              <th className="px-4 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-2 font-medium">{l.account_kode} {l.account_nama}</td>
                <td className="px-4 py-2 text-xs text-[#6B7280]">{l.deskripsi || "—"}</td>
                <td className="px-4 py-2 text-right font-mono">{formatSen(l.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center border-t border-[#E5E7EB] pt-4">
          <div className="text-xs text-[#6B7280] whitespace-pre-line">{d.pesan}</div>
          <div className="text-right">
            <div className="text-xs text-[#6B7280]">Total</div>
            <div className="text-xl font-extrabold text-[#111827] font-mono">{formatSen(d.total)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
