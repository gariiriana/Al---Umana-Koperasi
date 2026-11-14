// Tab "Invoice" di Rekap: tagihan satu dapur ke Toko Santri untuk rentang tanggal, pratinjau + export PDF.
import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { getRekap } from "@/toksan/api";
import { buildInvoiceModel, defaultInvoiceNumber } from "@/toksan/export/invoiceModel";
import { DAPUR_LABEL, toksanErrorMessage } from "@/toksan/format";
import { digitsOnly } from "@/toksan/logic/inputRows";
import { addDays, todayWib, weekLabel, weekRange } from "@/toksan/logic/period";
import type { Dapur, RekapData } from "@/toksan/types";

const DAPUR_INVOICE: Dapur[] = ["bakery", "hangat_saji"];
const field = "w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-base text-[#111827] focus:border-[#FBBF24] focus:outline-none";
const labelCls = "text-xs font-semibold text-[#6B7280]";

// Teks rekening diingat per dapur di browser ini (bukan data penting, hanya kemudahan).
const pesanKey = (d: Dapur) => `toksan:invoice-pesan:${d}`;
const readPesan = (d: Dapur) => { try { return localStorage.getItem(pesanKey(d)) ?? ""; } catch { return ""; } };
const writePesan = (d: Dapur, v: string) => { try { localStorage.setItem(pesanKey(d), v); } catch { /* ignore */ } };

export function InvoicePanel() {
  const { showToast } = useToast();
  const today = todayWib();
  const week = weekRange(today);
  const [dapur, setDapur] = useState<Dapur>("bakery");
  const [dari, setDari] = useState(week.dari);
  const [sampai, setSampai] = useState(week.sampai > today ? today : week.sampai);
  const [nomorEdited, setNomorEdited] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState(today);
  const [jatuhTempo, setJatuhTempo] = useState(addDays(today, 7));
  const [diskon, setDiskon] = useState<number | null>(null);
  const [catatanEdited, setCatatanEdited] = useState<string | null>(null);
  const [pesan, setPesan] = useState(() => readPesan("bakery"));
  const [data, setData] = useState<RekapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const rangeValid = dari <= sampai;
  const periode = weekLabel({ dari, sampai });
  const nomor = nomorEdited ?? defaultInvoiceNumber(dapur, sampai);
  const catatan = catatanEdited ?? `Penjualan Toko Santri ${periode}`;

  useEffect(() => {
    if (!rangeValid) return;
    let alive = true;
    setLoading(true);
    getRekap(dari, sampai)
      .then((result) => { if (alive) setData(result); })
      .catch((err) => { if (alive) { setData(null); showToast({ message: toksanErrorMessage(err), variant: "error" }); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dari, sampai, rangeValid, showToast]);

  const model = useMemo(
    () => (data ? buildInvoiceModel(data, { dapur, nomor, tanggal, jatuhTempo, diskon: diskon ?? 0, catatan, pesan }) : null),
    [data, dapur, nomor, tanggal, jatuhTempo, diskon, catatan, pesan],
  );

  const pickDapur = (d: Dapur) => {
    setDapur(d);
    setNomorEdited(null);
    setPesan(readPesan(d));
  };

  const runExport = async () => {
    if (!model) return;
    setExporting(true);
    try {
      writePesan(dapur, pesan);
      await (await import("@/toksan/export/invoicePdf")).exportInvoicePdf(model);
    } catch {
      showToast({ message: "Gagal membuat invoice. Coba lagi.", variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
        <div>
          <p className={labelCls}>Tagihan dari dapur</p>
          <div className="mt-1 flex gap-2">
            {DAPUR_INVOICE.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dapur === d}
                onClick={() => pickDapur(d)}
                className={`rounded-full border px-4 py-2 text-sm font-bold ${dapur === d ? "border-[#F59E0B] bg-[#FBBF24] text-[#111827]" : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#FBBF24]"}`}
              >
                {DAPUR_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Dari
            <input type="date" aria-label="Dari" value={dari} max={today} onChange={(e) => e.target.value && setDari(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={labelCls}>Sampai
            <input type="date" aria-label="Sampai" value={sampai} max={today} onChange={(e) => e.target.value && setSampai(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={labelCls}>No. Faktur
            <input aria-label="No. Faktur" value={nomor} onChange={(e) => setNomorEdited(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={labelCls}>Tanggal faktur
            <input type="date" aria-label="Tanggal faktur" value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={labelCls}>Jatuh tempo
            <input type="date" aria-label="Jatuh tempo" value={jatuhTempo} onChange={(e) => e.target.value && setJatuhTempo(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={labelCls}>Diskon (Rp)
            <input inputMode="numeric" aria-label="Diskon (Rp)" value={diskon ?? ""} placeholder="0" onChange={(e) => setDiskon(digitsOnly(e.target.value))} className={`mt-1 ${field}`} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Catatan
            <input aria-label="Catatan" value={catatan} onChange={(e) => setCatatanEdited(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Pesan / rekening pembayaran
            <textarea aria-label="Pesan" rows={3} value={pesan} onChange={(e) => setPesan(e.target.value)} placeholder="mis. pembayaran ke rekening BNI ... a.n. ..." className={`mt-1 ${field}`} />
          </label>
        </div>
        {!rangeValid && <p className="text-sm font-semibold text-red-600">Tanggal "Dari" harus sebelum "Sampai".</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5" aria-label="Pratinjau invoice">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold text-[#111827]">Invoice {model?.unit ?? ""} → Toko Santri</p>
            <p className="text-xs text-[#6B7280]">{periode} · retur tidak ditagih</p>
          </div>
          <button
            type="button"
            disabled={!model || model.lines.length === 0 || loading || exporting || !rangeValid}
            onClick={() => void runExport()}
            className="flex items-center gap-2 rounded-full bg-[#111827] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
            Export Invoice PDF
          </button>
        </div>

        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 p-6 text-[#6B7280]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat...</p>
        ) : !model || model.lines.length === 0 ? (
          <p className="rounded-xl bg-[#F9FAFB] p-6 text-center text-sm text-[#6B7280]">Belum ada penjualan {DAPUR_LABEL[dapur]} di periode ini.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] text-[#374151]">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">No</th>
                    <th className="px-3 py-2 text-left font-bold">Keterangan</th>
                    <th className="hidden px-3 py-2 text-right font-bold sm:table-cell">Qty</th>
                    <th className="hidden px-3 py-2 text-right font-bold sm:table-cell">Harga satuan</th>
                    <th className="px-3 py-2 text-right font-bold">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {model.lines.map((l) => (
                    <tr key={`${l.no}`} className="border-t border-[#F3F4F6]">
                      <td className="px-3 py-1.5 align-top">{l.no}</td>
                      <td className="px-3 py-1.5">
                        {l.keterangan}
                        <span className="block text-xs text-[#6B7280] sm:hidden">{l.qty} × {l.harga}</span>
                      </td>
                      <td className="hidden px-3 py-1.5 text-right sm:table-cell">{l.qty}</td>
                      <td className="hidden px-3 py-1.5 text-right sm:table-cell">{l.harga}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top">{l.jumlah}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-[#6B7280]">Subtotal</dt><dd className="text-right">{model.subtotal}</dd>
              <dt className="text-[#6B7280]">Diskon</dt><dd className="text-right">{model.diskon}</dd>
              <dt className="font-bold">TOTAL</dt><dd className="text-right font-bold">{model.total}</dd>
            </dl>
            <p className="rounded-xl bg-[#FFFBEB] px-3 py-2 text-xs text-[#374151]"><span className="font-semibold">Terbilang:</span> <span>{model.terbilang}</span></p>
          </>
        )}
      </section>
    </div>
  );
}
