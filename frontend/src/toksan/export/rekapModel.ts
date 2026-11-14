// Isi rekap (layar, PDF, DOCX) dibangun sekali di sini supaya ketiganya selalu sama.
import { DAPUR_LABEL, SESI_LABEL, formatAngka, formatRupiah, formatTanggal, formatTanggalPanjang, namaHari } from "@/toksan/format";
import { datesBetween, monthLabel, todayWib, weekLabel, weekRange } from "@/toksan/logic/period";
import { DAPUR_LIST, type RekapData } from "@/toksan/types";

export type JenisRekap = "harian" | "mingguan" | "bulanan";

export interface RekapSection {
  title: string;
  columns: string[];
  rows: string[][];
  subtotal: string[] | null;
}

export interface RekapModel {
  jenis: JenisRekap;
  kop: string;
  judul: string;
  periode: string;
  ringkasan: { label: string; value: string }[];
  sections: RekapSection[];
  obral: RekapSection | null;
  grandTotal: string;
  footer: { tempatTanggal: string; jabatan: string; nama: string };
  fileName: string;
}

const JUDUL: Record<JenisRekap, string> = { harian: "Harian", mingguan: "Mingguan", bulanan: "Bulanan" };

/** Columns that hold numbers or money: right-aligned in every output. */
export const NUMERIC_COLUMNS = new Set(["Harga", "Produksi", "Terjual", "Retur", "Omzet", "Jumlah", "Total", "Harga normal", "Harga obral"]);

const persen = (part: number, whole: number) =>
  `${(whole === 0 ? 0 : (part / whole) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

function periodeText(data: RekapData, jenis: JenisRekap): string {
  if (jenis === "harian") return formatTanggalPanjang(data.dari);
  if (jenis === "bulanan") return monthLabel(data.dari);
  return weekLabel(data);
}

function dapurSections(data: RekapData, jenis: JenisRekap): RekapSection[] {
  const sections: RekapSection[] = [];
  for (const dapur of DAPUR_LIST) {
    const sums = data.perDapur.find((d) => d.dapur === dapur);
    if (!sums || sums.produksi === 0) continue;
    const label = DAPUR_LABEL[dapur];
    const sub = [formatAngka(sums.produksi), formatAngka(sums.terjual), formatAngka(sums.retur), formatRupiah(sums.omzet)];
    if (jenis === "harian") {
      const lines = data.produkPerSesi.filter((p) => p.dapur === dapur);
      sections.push({
        title: label,
        columns: ["No", "Produk", "Sesi", "Harga", "Produksi", "Terjual", "Retur", "Omzet"],
        rows: lines.map((p, i) => [String(i + 1), p.productName, SESI_LABEL[p.sesi], formatRupiah(p.harga), formatAngka(p.produksi), formatAngka(p.terjual), formatAngka(p.retur), formatRupiah(p.omzet)]),
        subtotal: ["", `Subtotal ${label}`, "", "", ...sub],
      });
    } else {
      const lines = data.produk.filter((p) => p.dapur === dapur);
      sections.push({
        title: label,
        columns: ["No", "Produk", "Harga", "Produksi", "Terjual", "Retur", "Omzet"],
        rows: lines.map((p, i) => [String(i + 1), p.productName, formatRupiah(p.harga), formatAngka(p.produksi), formatAngka(p.terjual), formatAngka(p.retur), formatRupiah(p.omzet)]),
        subtotal: ["", `Subtotal ${label}`, "", ...sub],
      });
    }
  }
  return sections;
}

function perHariSection(data: RekapData): RekapSection {
  const byDate = new Map(data.perHari.map((d) => [d.tanggal, d]));
  const rows = datesBetween(data.dari, data.sampai).map((tanggal) => {
    const d = byDate.get(tanggal);
    return [namaHari(tanggal), formatTanggal(tanggal), formatAngka(d?.terjual ?? 0), formatAngka(d?.retur ?? 0), formatRupiah(d?.omzet ?? 0)];
  });
  return {
    title: "Omzet per Hari",
    columns: ["Hari", "Tanggal", "Terjual", "Retur", "Omzet"],
    rows,
    subtotal: ["", "Total", formatAngka(data.totals.terjual), formatAngka(data.totals.retur), formatRupiah(data.totals.omzet)],
  };
}

function perMingguSection(data: RekapData): RekapSection {
  const byDate = new Map(data.perHari.map((d) => [d.tanggal, d]));
  const weeks: string[][] = [];
  for (const tanggal of datesBetween(data.dari, data.sampai)) {
    const last = weeks[weeks.length - 1];
    if (last && weekRange(last[0]).dari === weekRange(tanggal).dari) last.push(tanggal);
    else weeks.push([tanggal]);
  }
  const rows = weeks.map((dates, i) => {
    const terjual = dates.reduce((sum, t) => sum + (byDate.get(t)?.terjual ?? 0), 0);
    const omzet = dates.reduce((sum, t) => sum + (byDate.get(t)?.omzet ?? 0), 0);
    const label = dates.length === 1 ? formatTanggal(dates[0]) : weekLabel({ dari: dates[0], sampai: dates[dates.length - 1] });
    return [`Minggu ${i + 1}`, label, formatAngka(terjual), formatRupiah(omzet)];
  });
  return {
    title: "Omzet per Minggu",
    columns: ["Minggu", "Periode", "Terjual", "Omzet"],
    rows,
    subtotal: ["", "Total", formatAngka(data.totals.terjual), formatRupiah(data.totals.omzet)],
  };
}

function obralSection(data: RekapData): RekapSection | null {
  if (data.obral.length === 0) return null;
  return {
    title: "Obral",
    columns: ["No", "Tanggal", "Produk", "Dapur", "Harga normal", "Harga obral", "Jumlah", "Total"],
    rows: data.obral.map((o, i) => [
      String(i + 1), formatTanggal(o.tanggal), o.productName, DAPUR_LABEL[o.dapur], formatRupiah(o.hargaNormal),
      formatRupiah(o.hargaObral), formatAngka(o.jumlah), formatRupiah(o.hargaObral * o.jumlah),
    ]),
    subtotal: ["", "Total obral", "", "", "", "", formatAngka(data.totals.obralJumlah), formatRupiah(data.totals.obralOmzet)],
  };
}

export function buildRekapModel(data: RekapData, jenis: JenisRekap, adminName: string, dicetak: string = todayWib()): RekapModel {
  const t = data.totals;
  const pihak = (p: "rijal" | "nisaa") => data.perPihak.find((x) => x.pihak === p)?.omzet ?? 0;
  const sections = dapurSections(data, jenis);
  if (jenis === "mingguan") sections.push(perHariSection(data));
  if (jenis === "bulanan") sections.push(perMingguSection(data));
  const range = data.dari === data.sampai ? data.dari : `${data.dari}_${data.sampai}`;

  return {
    jenis,
    kop: "YAYASAN LEMBAGA WAKAF AL UMANAA",
    judul: `TOKO SANTRI — Rekap Penjualan ${JUDUL[jenis]}`,
    periode: `Periode: ${periodeText(data, jenis)}`,
    ringkasan: [
      { label: "Omzet penjualan", value: formatRupiah(t.omzet) },
      { label: "Terjual", value: `${formatAngka(t.terjual)} pcs` },
      { label: "Retur", value: `${formatAngka(t.retur)} pcs (${persen(t.retur, t.produksi)})` },
      { label: "Produk terjual", value: `${formatAngka(t.produkTerjual)} jenis` },
      ...(["pagi", "siang", "sore"] as const).map((s) => {
        const row = data.perSesi.find((x) => x.sesi === s);
        return { label: `Sesi ${SESI_LABEL[s]}`, value: `${formatRupiah(row?.omzet ?? 0)} (${formatAngka(row?.terjual ?? 0)} pcs)` };
      }),
      { label: "Obral", value: `${formatRupiah(t.obralOmzet)} (${formatAngka(t.obralJumlah)} pcs)` },
      { label: "Rijal", value: formatRupiah(pihak("rijal")) },
      { label: "Nisaa", value: formatRupiah(pihak("nisaa")) },
      { label: "Total keseluruhan", value: formatRupiah(t.omzet + t.obralOmzet) },
    ],
    sections,
    obral: obralSection(data),
    grandTotal: formatRupiah(t.omzet + t.obralOmzet),
    // No holder name: leave a line to sign by hand instead of printing the account name.
    footer: { tempatTanggal: `Sukabumi, ${formatTanggal(dicetak)}`, jabatan: "Admin Toksan", nama: adminName.trim() || "( ................................ )" },
    fileName: `Rekap-Toksan-${JUDUL[jenis]}-${range}`,
  };
}
