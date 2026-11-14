// Angka untuk halaman Trafik Produk, dihitung dari data rekap yang sama dengan export.
import { datesBetween } from "@/toksan/logic/period";
import type { Dapur, Pihak, RekapData, Sesi } from "@/toksan/types";

export interface TrafikFilter {
  dapur: Dapur | "semua";
  pihak: Pihak | "semua";
  sesi?: Sesi | "semua";
}

export interface ProdukTrafik {
  productId: string;
  name: string;
  dapur: Dapur;
  produksi: number;
  terjual: number;
  retur: number;
  omzet: number;
}

export interface Trafik {
  kpi: { omzet: number; terjual: number; returPersen: number; produkAktif: number };
  terlaris: ProdukTrafik[];
  palingSepi: ProdukTrafik[];
  harian: { tanggal: string; omzet: number }[];
  pihak: { pihak: Pihak; terjual: number; omzet: number }[];
  sesi: { sesi: Sesi; terjual: number; omzet: number }[];
  returTertinggi: { name: string; retur: number; persen: number }[];
}

const TOP = 10;
const MIN_PRODUKSI_FOR_RETUR = 10;
const oneDecimal = (n: number) => Math.round(n * 10) / 10;
const byName = (a: ProdukTrafik, b: ProdukTrafik) => a.name.localeCompare(b.name, "id");

function products(data: RekapData, filter: TrafikFilter): ProdukTrafik[] {
  const sesi = filter.sesi ?? "semua";
  let list: (RekapData["produk"][number] | RekapData["produkPerSesi"][number] | RekapData["produkPerPihak"][number])[];
  if (sesi !== "semua" && filter.pihak !== "semua" && data.produkDetail) {
    list = data.produkDetail.filter((p) => p.sesi === sesi && p.pihak === filter.pihak);
  } else if (sesi !== "semua") {
    list = data.produkPerSesi.filter((p) => p.sesi === sesi);
  } else if (filter.pihak !== "semua") {
    list = data.produkPerPihak.filter((p) => p.pihak === filter.pihak);
  } else {
    list = data.produk;
  }
  const merged = new Map<string, ProdukTrafik>();
  for (const p of list) {
    if (filter.dapur !== "semua" && p.dapur !== filter.dapur) continue;
    const current = merged.get(p.productId) ?? { productId: p.productId, name: p.productName, dapur: p.dapur, produksi: 0, terjual: 0, retur: 0, omzet: 0 };
    current.produksi += p.produksi;
    current.terjual += p.terjual;
    current.retur += p.retur;
    current.omzet += p.omzet;
    merged.set(p.productId, current);
  }
  return [...merged.values()];
}

/** Every day from `dari` to min(`sampai`, today) so quiet days show as 0 instead of vanishing; future days are left out. */
function harianFilled(data: RekapData, today?: string): { tanggal: string; omzet: number }[] {
  if (data.perHari.length === 0) return [];
  const byDate = new Map(data.perHari.map((d) => [d.tanggal, d.omzet]));
  const end = today && today < data.sampai ? today : data.sampai;
  return datesBetween(data.dari, end).map((tanggal) => ({ tanggal, omzet: byDate.get(tanggal) ?? 0 }));
}

export function buildTrafik(data: RekapData, filter: TrafikFilter, today?: string): Trafik {
  const list = products(data, filter);
  const sold = list.filter((p) => p.terjual > 0);
  const terlaris = [...sold].sort((a, b) => b.terjual - a.terjual || byName(a, b)).slice(0, TOP);
  const inTop = new Set(terlaris.map((p) => p.productId));
  const palingSepi = [...sold].filter((p) => !inTop.has(p.productId)).sort((a, b) => a.terjual - b.terjual || byName(a, b)).slice(0, TOP);

  const produksi = list.reduce((s, p) => s + p.produksi, 0);
  const retur = list.reduce((s, p) => s + p.retur, 0);

  return {
    kpi: {
      omzet: list.reduce((s, p) => s + p.omzet, 0),
      terjual: list.reduce((s, p) => s + p.terjual, 0),
      returPersen: produksi === 0 ? 0 : oneDecimal((retur / produksi) * 100),
      produkAktif: sold.length,
    },
    terlaris,
    palingSepi,
    harian: harianFilled(data, today),
    pihak: data.perPihak,
    sesi: data.perSesi,
    returTertinggi: list
      .filter((p) => p.produksi >= MIN_PRODUKSI_FOR_RETUR && p.retur > 0)
      .map((p) => ({ name: p.name, retur: p.retur, persen: oneDecimal((p.retur / p.produksi) * 100) }))
      .sort((a, b) => b.persen - a.persen || a.name.localeCompare(b.name, "id"))
      .slice(0, 5),
  };
}
