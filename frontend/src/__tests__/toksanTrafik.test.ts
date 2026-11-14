import { describe, expect, it } from "vitest";
import { buildTrafik } from "@/toksan/logic/trafik";
import type { RekapData } from "@/toksan/types";

const line = (productId: string, productName: string, dapur: "bakery" | "hangat_saji", harga: number, produksi: number, retur: number) =>
  ({ productId, productName, dapur, harga, produksi, terjual: produksi - retur, retur, omzet: (produksi - retur) * harga });

const DATA: RekapData = {
  dari: "2026-11-09",
  sampai: "2026-11-15",
  totals: { produksi: 0, terjual: 0, retur: 0, omzet: 0, obralJumlah: 0, obralOmzet: 0, produkTerjual: 0 },
  produk: [
    line("p1", "Risol Mayo", "bakery", 3500, 60, 3),
    line("p1", "Risol Mayo", "bakery", 4000, 5, 0), // same product, new price: merged
    line("p3", "Kue Tok", "bakery", 2800, 20, 15),
    line("p4", "Garlic Bread", "bakery", 5200, 49, 18),
    line("p2", "Dimsum", "hangat_saji", 8600, 96, 0),
    line("p5", "Paket Kosong", "hangat_saji", 5000, 4, 4), // nothing sold
  ],
  produkPerSesi: [],
  produkPerPihak: [
    { productId: "p1", productName: "Risol Mayo", dapur: "bakery", pihak: "rijal", produksi: 40, terjual: 37, retur: 3, omzet: 129_500 },
    { productId: "p2", productName: "Dimsum", dapur: "hangat_saji", pihak: "nisaa", produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
  ],
  perHari: [{ tanggal: "2026-11-13", produksi: 1, terjual: 1, retur: 0, omzet: 100 }],
  perSesi: [{ sesi: "pagi", terjual: 48, omzet: 168_000 }],
  perPihak: [{ pihak: "rijal", terjual: 37, omzet: 129_500 }],
  perDapur: [],
  obral: [],
};

describe("buildTrafik", () => {
  it("merges price lines and ranks by terjual", () => {
    const t = buildTrafik(DATA, { dapur: "semua", pihak: "semua" });
    expect(t.terlaris.map((p) => [p.name, p.terjual])).toEqual([["Dimsum", 96], ["Risol Mayo", 62], ["Garlic Bread", 31], ["Kue Tok", 5]]);
  });

  it("KPIs: omzet, terjual, retur % with one decimal, products that sold", () => {
    const t = buildTrafik(DATA, { dapur: "semua", pihak: "semua" });
    expect(t.kpi).toEqual({ omzet: 199_500 + 20_000 + 14_000 + 161_200 + 825_600, terjual: 194, returPersen: 17.1, produkAktif: 4 });
  });

  it("filtering by dapur changes terlaris", () => {
    const t = buildTrafik(DATA, { dapur: "hangat_saji", pihak: "semua" });
    expect(t.terlaris.map((p) => p.name)).toEqual(["Dimsum"]);
  });

  it("palingSepi excludes zero-sales products and products already in terlaris", () => {
    const many: RekapData = { ...DATA, produk: Array.from({ length: 14 }, (_, i) => line(`x${i}`, `Produk ${i}`, "bakery", 1000, i + 1, 0)) };
    const t = buildTrafik(many, { dapur: "semua", pihak: "semua" });
    expect(t.terlaris).toHaveLength(10);
    expect(t.palingSepi.map((p) => p.name)).toEqual(["Produk 0", "Produk 1", "Produk 2", "Produk 3"]);
    expect(buildTrafik(DATA, { dapur: "semua", pihak: "semua" }).palingSepi).toEqual([]);
  });

  it("pihak filter uses per-pihak product data", () => {
    const t = buildTrafik(DATA, { dapur: "semua", pihak: "nisaa" });
    expect(t.terlaris.map((p) => p.name)).toEqual(["Dimsum"]);
    expect(t.kpi.omzet).toBe(825_600);
  });

  it("highest retur: produksi >= 10, sorted by percentage", () => {
    const t = buildTrafik(DATA, { dapur: "semua", pihak: "semua" });
    expect(t.returTertinggi).toEqual([
      { name: "Kue Tok", retur: 15, persen: 75 },
      { name: "Garlic Bread", retur: 18, persen: 36.7 },
      { name: "Risol Mayo", retur: 3, persen: 4.6 },
    ]);
  });

  it("empty data gives zeros and empty lists", () => {
    const empty: RekapData = { ...DATA, produk: [], produkPerPihak: [], perHari: [], perSesi: [], perPihak: [] };
    const t = buildTrafik(empty, { dapur: "semua", pihak: "semua" });
    expect(t.kpi).toEqual({ omzet: 0, terjual: 0, returPersen: 0, produkAktif: 0 });
    expect(t.terlaris).toEqual([]);
    expect(t.returTertinggi).toEqual([]);
    expect(t.harian).toEqual([]);
  });
});
