// Trafik Produk: produk mana yang laku, mana yang sepi, retur tertinggi, per dapur dan pihak.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { getRekap } from "@/toksan/api";
import { BarList, LineChart, SERIES, SplitBar } from "@/toksan/components/Charts";
import { DAPUR_LABEL, PIHAK_LABEL, SESI_LABEL, formatAngka, formatRupiah, formatTanggal, toksanErrorMessage } from "@/toksan/format";
import { monthRange, todayWib, weekLabel, weekRange, type Range } from "@/toksan/logic/period";
import { buildTrafik, type TrafikFilter } from "@/toksan/logic/trafik";
import { DAPUR_LIST, PIHAK_LIST, SESI_LIST, type RekapData } from "@/toksan/types";

type Periode = "hari" | "minggu" | "bulan" | "pilih";

const card = "rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm";
const select = "rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#111827]";

export function TrafikPage() {
  const { showToast } = useToast();
  const today = todayWib();
  const [periode, setPeriode] = useState<Periode>("minggu");
  const [custom, setCustom] = useState<Range>(() => weekRange(today));
  const [filter, setFilter] = useState<TrafikFilter>({ dapur: "semua", pihak: "semua" });
  const [data, setData] = useState<RekapData | null>(null);
  const [loading, setLoading] = useState(true);

  const range: Range = useMemo(() => {
    if (periode === "hari") return { dari: today, sampai: today };
    if (periode === "bulan") return monthRange(today);
    if (periode === "pilih") return custom;
    return weekRange(today);
  }, [periode, custom, today]);
  const rangeValid = range.dari <= range.sampai;

  useEffect(() => {
    if (!rangeValid) return;
    let alive = true;
    setLoading(true);
    getRekap(range.dari, range.sampai)
      .then((result) => { if (alive) setData(result); })
      .catch((err) => { if (alive) showToast({ message: toksanErrorMessage(err), variant: "error" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.dari, range.sampai, rangeValid, showToast]);

  const trafik = useMemo(() => (data ? buildTrafik(data, filter, today) : null), [data, filter, today]);
  const rangeText = range.dari === range.sampai ? formatTanggal(range.dari) : weekLabel(range);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-5 pb-28 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <header>
        <h1 className="text-2xl font-bold text-[#111827]">Trafik Produk</h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">{rangeText}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Periode" value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} className={select}>
          <option value="hari">Hari ini</option>
          <option value="minggu">Minggu ini</option>
          <option value="bulan">Bulan ini</option>
          <option value="pilih">Pilih tanggal</option>
        </select>
        {periode === "pilih" && (
          <>
            <input type="date" aria-label="Dari" value={custom.dari} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, dari: e.target.value })} className={select} />
            <span className="text-sm text-[#6B7280]">s/d</span>
            <input type="date" aria-label="Sampai" value={custom.sampai} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, sampai: e.target.value })} className={select} />
          </>
        )}
        <select aria-label="Dapur" value={filter.dapur} onChange={(e) => setFilter({ ...filter, dapur: e.target.value as TrafikFilter["dapur"] })} className={select}>
          <option value="semua">Semua dapur</option>
          {DAPUR_LIST.map((d) => <option key={d} value={d}>{DAPUR_LABEL[d]}</option>)}
        </select>
        <select aria-label="Pihak" value={filter.pihak} onChange={(e) => setFilter({ ...filter, pihak: e.target.value as TrafikFilter["pihak"] })} className={select}>
          <option value="semua">Rijal & Nisaa</option>
          {PIHAK_LIST.map((p) => <option key={p} value={p}>{PIHAK_LABEL[p]}</option>)}
        </select>
      </div>

      {!rangeValid ? (
        <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">Tanggal "dari" harus sebelum "sampai".</p>
      ) : loading || !trafik ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat trafik...
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Omzet", value: formatRupiah(trafik.kpi.omzet) },
              { label: "Terjual", value: `${formatAngka(trafik.kpi.terjual)} pcs` },
              { label: "Retur", value: `${trafik.kpi.returPersen.toLocaleString("id-ID")}%` },
              { label: "Produk laku", value: `${formatAngka(trafik.kpi.produkAktif)} jenis` },
            ].map((tile) => (
              <div key={tile.label} className={card}>
                <dt className="text-xs font-semibold text-[#6B7280]">{tile.label}</dt>
                <dd className="mt-1 text-xl font-extrabold text-[#111827]">{tile.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 md:grid-cols-2">
            <section className={card} aria-labelledby="terlaris">
              <h2 id="terlaris" className="mb-2 text-base font-bold text-[#111827]">Terlaris</h2>
              <BarList items={trafik.terlaris.map((p) => ({ name: p.name, value: p.terjual }))} emptyText="Belum ada penjualan." />
            </section>
            <section className={card} aria-labelledby="sepi">
              <h2 id="sepi" className="mb-2 text-base font-bold text-[#111827]">Paling sepi</h2>
              <BarList
                items={trafik.palingSepi.map((p) => ({ name: p.name, value: p.terjual }))}
                max={trafik.terlaris[0]?.terjual}
                emptyText={trafik.terlaris.length ? "Semua produk yang terjual sudah masuk daftar terlaris." : "Belum ada penjualan."}
              />
            </section>
          </div>

          <section className={card} aria-labelledby="harian">
            <h2 id="harian" className="text-base font-bold text-[#111827]">Omzet per hari</h2>
            <p className="mb-2 text-xs text-[#6B7280]">Semua dapur dan pihak</p>
            <LineChart points={trafik.harian} label={`Omzet per hari, ${rangeText}`} />
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <section className={card} aria-labelledby="pihak">
              <h2 id="pihak" className="mb-1 text-base font-bold text-[#111827]">Rijal vs Nisaa</h2>
              <p className="mb-3 text-xs text-[#6B7280]">Terjual, semua dapur</p>
              <SplitBar parts={PIHAK_LIST.map((p, i) => {
                const row = trafik.pihak.find((x) => x.pihak === p);
                return { label: PIHAK_LABEL[p], value: row?.terjual ?? 0, color: SERIES[i], detail: formatRupiah(row?.omzet ?? 0) };
              })} />
            </section>
            <section className={card} aria-labelledby="sesi">
              <h2 id="sesi" className="mb-1 text-base font-bold text-[#111827]">Per sesi</h2>
              <p className="mb-3 text-xs text-[#6B7280]">Terjual, semua dapur</p>
              <SplitBar parts={SESI_LIST.map((s, i) => {
                const row = trafik.sesi.find((x) => x.sesi === s);
                return { label: SESI_LABEL[s], value: row?.terjual ?? 0, color: SERIES[i], detail: formatAngka(row?.terjual ?? 0) };
              })} />
            </section>
            <section className={card} aria-labelledby="retur">
              <h2 id="retur" className="mb-2 text-base font-bold text-[#111827]">Retur tertinggi</h2>
              {trafik.returTertinggi.length === 0 ? (
                <p className="text-sm text-[#6B7280]">Tidak ada retur berarti.</p>
              ) : (
                <ul className="space-y-1.5">
                  {trafik.returTertinggi.map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold text-[#111827]">{r.name}</span>
                      <span className="shrink-0 text-[#374151]">{formatAngka(r.retur)} pcs · <b>{r.persen.toLocaleString("id-ID")}%</b></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
