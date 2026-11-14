// Rekap Toksan: harian / mingguan / bulanan, pratinjau di layar, export PDF dan DOCX.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { getRekap } from "@/toksan/api";
import { InvoicePanel } from "@/toksan/components/InvoicePanel";
import { NUMERIC_COLUMNS, buildRekapModel, type JenisRekap, type RekapSection } from "@/toksan/export/rekapModel";
import { toksanErrorMessage } from "@/toksan/format";
import { addDays, monthRange, todayWib, weekRange, type Range } from "@/toksan/logic/period";
import type { RekapData } from "@/toksan/types";

const TABS: { value: JenisRekap; label: string }[] = [
  { value: "harian", label: "Harian" },
  { value: "mingguan", label: "Mingguan" },
  { value: "bulanan", label: "Bulanan" },
];

function rangeOf(jenis: JenisRekap, anchor: string): Range {
  if (jenis === "mingguan") return weekRange(anchor);
  if (jenis === "bulanan") return monthRange(anchor);
  return { dari: anchor, sampai: anchor };
}

function shift(jenis: JenisRekap, anchor: string, step: 1 | -1): string {
  if (jenis === "harian") return addDays(anchor, step);
  if (jenis === "mingguan") return addDays(anchor, 7 * step);
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return d.toISOString().slice(0, 10);
}

function SectionTable({ section }: { section: RekapSection }) {
  const right = (i: number) => (NUMERIC_COLUMNS.has(section.columns[i]) ? "text-right" : "text-left");
  return (
    <section className="space-y-2">
      <h3 className="text-base font-bold text-[#111827]">{section.title}</h3>
      <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-[#FBBF24] text-[#111827]">
            <tr>{section.columns.map((c, i) => <th key={c} className={`px-3 py-2 font-bold ${right(i)}`}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {section.rows.map((row, r) => (
              <tr key={r} className={r % 2 ? "bg-[#F9FAFB]" : "bg-white"}>
                {row.map((v, i) => <td key={i} className={`px-3 py-1.5 text-[#111827] ${right(i)}`}>{v}</td>)}
              </tr>
            ))}
          </tbody>
          {section.subtotal && (
            <tfoot className="bg-[#FFFBEB] font-bold">
              <tr>{section.subtotal.map((v, i) => <td key={i} className={`px-3 py-2 ${right(i)}`}>{v}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export function RekapPage() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const today = todayWib();
  const [jenis, setJenis] = useState<JenisRekap>("harian");
  const [invoice, setInvoice] = useState(false);
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<RekapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const range = useMemo(() => rangeOf(jenis, anchor), [jenis, anchor]);
  const adminName = profile?.holderName ?? "";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRekap(range.dari, range.sampai)
      .then((result) => { if (alive) setData(result); })
      .catch((err) => { if (alive) { setData(null); showToast({ message: toksanErrorMessage(err), variant: "error" }); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.dari, range.sampai, showToast]);

  const model = useMemo(() => (data ? buildRekapModel(data, jenis, adminName) : null), [data, jenis, adminName]);
  const hasData = Boolean(data && (data.totals.produksi > 0 || data.obral.length > 0));
  const nextDisabled = rangeOf(jenis, shift(jenis, anchor, 1)).dari > today;

  const runExport = async (kind: "pdf" | "docx") => {
    if (!model) return;
    setExporting(kind);
    try {
      if (kind === "pdf") await (await import("@/toksan/export/rekapPdf")).exportRekapPdf(model);
      else await (await import("@/toksan/export/rekapDocx")).exportRekapDocx(model);
    } catch {
      showToast({ message: "Gagal membuat file. Coba lagi.", variant: "error" });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 pb-28 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <header>
        <h1 className="text-2xl font-bold text-[#111827]">Rekap Penjualan</h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">Pilih periode, cek pratinjaunya, lalu unduh PDF atau Word. Tab Invoice untuk tagihan dapur.</p>
      </header>

      <div role="tablist" aria-label="Jenis rekap" className="inline-flex max-w-full overflow-x-auto rounded-full border border-[#E5E7EB] bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={!invoice && jenis === tab.value}
            onClick={() => { setInvoice(false); setJenis(tab.value); }}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${!invoice && jenis === tab.value ? "bg-[#FBBF24] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"}`}
          >
            {tab.label}
          </button>
        ))}
        <button
          role="tab"
          type="button"
          aria-selected={invoice}
          onClick={() => setInvoice(true)}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${invoice ? "bg-[#FBBF24] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"}`}
        >
          Invoice
        </button>
      </div>

      {invoice ? <InvoicePanel /> : (<>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Periode sebelumnya" onClick={() => setAnchor(shift(jenis, anchor, -1))} className="rounded-full border border-[#E5E7EB] bg-white p-2 hover:border-[#FBBF24]">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {jenis === "bulanan" ? (
          <input
            type="month"
            aria-label="Bulan"
            value={anchor.slice(0, 7)}
            max={today.slice(0, 7)}
            onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-base"
          />
        ) : (
          <input
            type="date"
            aria-label={jenis === "harian" ? "Tanggal" : "Tanggal dalam minggu"}
            value={anchor}
            max={today}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-base"
          />
        )}
        <button type="button" aria-label="Periode berikutnya" disabled={nextDisabled} onClick={() => setAnchor(shift(jenis, anchor, 1))} className="rounded-full border border-[#E5E7EB] bg-white p-2 hover:border-[#FBBF24] disabled:opacity-40">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={!hasData || loading || exporting !== null}
            onClick={() => void runExport("pdf")}
            className="flex items-center gap-2 rounded-full bg-[#111827] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
            Export PDF
          </button>
          <button
            type="button"
            disabled={!hasData || loading || exporting !== null}
            onClick={() => void runExport("docx")}
            className="flex items-center gap-2 rounded-full border border-[#111827] bg-white px-4 py-2.5 text-sm font-bold text-[#111827] disabled:opacity-40"
          >
            {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            Export DOCX
          </button>
        </div>
      </div>

      {loading ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat rekap...
        </p>
      ) : !model ? null : (
        <article className="space-y-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-4 border-b-4 border-double border-[#FBBF24] pb-3">
            <img src="/logo-mark.png" alt="" className="h-14 w-14 object-contain" />
            <div className="flex-1 text-center">
              <p className="text-base font-extrabold tracking-wide text-[#111827] sm:text-lg">{model.kop}</p>
              <p className="text-sm font-bold text-[#111827]">{model.judul}</p>
              <p className="text-xs text-[#6B7280]">{model.periode}</p>
            </div>
            <div className="hidden w-14 sm:block" aria-hidden="true" />
          </div>

          {!hasData ? (
            <p className="rounded-xl bg-[#F9FAFB] p-6 text-center text-sm text-[#6B7280]">Belum ada penjualan di periode ini.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {model.ringkasan.map((item) => (
                  <div key={item.label} className={`rounded-xl px-3 py-2 ${item.label === "Total keseluruhan" ? "col-span-2 bg-[#FBBF24]" : "bg-[#FFFBEB]"}`}>
                    <dt className="text-xs text-[#6B7280]">{item.label}</dt>
                    <dd className="text-sm font-bold text-[#111827]">{item.value}</dd>
                  </div>
                ))}
              </dl>
              {model.sections.map((section) => <SectionTable key={section.title} section={section} />)}
              {model.obral && <SectionTable section={model.obral} />}
              <div className="flex justify-end">
                <p className="rounded-xl bg-[#FBBF24] px-4 py-2 text-base font-extrabold text-[#111827]">TOTAL KESELURUHAN {model.grandTotal}</p>
              </div>
            </>
          )}
        </article>
      )}
      </>)}
    </div>
  );
}
