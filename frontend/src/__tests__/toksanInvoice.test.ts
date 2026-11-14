import { describe, expect, it } from "vitest";
import { terbilang } from "@/toksan/logic/terbilang";
import { buildInvoiceModel, defaultInvoiceNumber } from "@/toksan/export/invoiceModel";
import type { RekapData } from "@/toksan/types";

describe("terbilang", () => {
  it.each([
    [0, "NOL RUPIAH"],
    [11, "SEBELAS RUPIAH"],
    [15, "LIMA BELAS RUPIAH"],
    [100, "SERATUS RUPIAH"],
    [1_000, "SERIBU RUPIAH"],
    [1_105_000, "SATU JUTA SERATUS LIMA RIBU RUPIAH"],
    [9_676_933, "SEMBILAN JUTA ENAM RATUS TUJUH PULUH ENAM RIBU SEMBILAN RATUS TIGA PULUH TIGA RUPIAH"],
    [2_000_000_000, "DUA MILIAR RUPIAH"],
  ])("%i → %s", (n, words) => {
    expect(terbilang(n)).toBe(words);
  });
});

const line = (productId: string, productName: string, dapur: "bakery" | "hangat_saji", harga: number, produksi: number, retur: number) =>
  ({ productId, productName, dapur, harga, produksi, terjual: produksi - retur, retur, omzet: (produksi - retur) * harga });

const DATA: RekapData = {
  dari: "2026-11-09",
  sampai: "2026-11-14",
  totals: { produksi: 0, terjual: 0, retur: 0, omzet: 0, obralJumlah: 0, obralOmzet: 0, produkTerjual: 0 },
  produk: [
    line("p1", "Risol Mayo", "bakery", 3500, 60, 3),
    line("p1", "Risol Mayo", "bakery", 4000, 5, 0),
    line("p3", "Kue Tok", "bakery", 2800, 4, 4), // nothing sold: not billed
    line("p2", "Dimsum", "hangat_saji", 8600, 96, 0),
  ],
  produkPerSesi: [], produkPerPihak: [], perHari: [], perSesi: [], perPihak: [], perDapur: [], obral: [],
};

const INPUT = {
  dapur: "bakery" as const,
  nomor: "TKS-BKR-20261114",
  tanggal: "2026-11-14",
  jatuhTempo: "2026-11-21",
  diskon: 1_500,
  catatan: "Penjualan Toko Santri 9 – 14 November 2026",
  pesan: "Transfer ke BNI 123",
};

describe("buildInvoiceModel", () => {
  it("bills the chosen dapur only: products sold × reseller price, one line per price, returns not billed", () => {
    const m = buildInvoiceModel(DATA, INPUT);
    expect(m.lines).toEqual([
      { no: 1, keterangan: "Risol Mayo", qty: "57 Pcs", harga: "3.500,00", jumlah: "199.500,00" },
      { no: 2, keterangan: "Risol Mayo", qty: "5 Pcs", harga: "4.000,00", jumlah: "20.000,00" },
    ]);
    expect([m.subtotal, m.diskon, m.total, m.sisaTagihan]).toEqual(["219.500,00", "1.500,00", "218.000,00", "218.000,00"]);
    expect(m.terbilang).toBe("DUA RATUS DELAPAN BELAS RIBU RUPIAH");
  });

  it("carries the invoice header, customer and dates in dd-mm-yyyy", () => {
    const m = buildInvoiceModel(DATA, INPUT);
    expect(m.penjual).toBe("KOPERASI AL UMANAA SEJAHTERA MANDIRI");
    expect(m.unit).toBe("Dapur Bakery");
    expect(m.pelanggan).toBe("Toko Santri (Toksan)");
    expect(m.tags).toBe("Toko Santri, Dapur Bakery");
    expect([m.nomor, m.tanggal, m.jatuhTempo]).toEqual(["TKS-BKR-20261114", "14-11-2026", "21-11-2026"]);
    expect(m.fileName).toBe("Invoice-TKS-BKR-20261114");
  });

  it("a discount larger than the subtotal never makes the total negative", () => {
    const m = buildInvoiceModel(DATA, { ...INPUT, dapur: "hangat_saji", diskon: 10_000_000 });
    expect(m.lines.map((l) => l.keterangan)).toEqual(["Dimsum"]);
    expect([m.subtotal, m.diskon, m.total]).toEqual(["825.600,00", "825.600,00", "0,00"]);
  });

  it("default invoice number: TKS-<dapur code>-<last date>", () => {
    expect(defaultInvoiceNumber("bakery", "2026-11-14")).toBe("TKS-BKR-20261114");
    expect(defaultInvoiceNumber("hangat_saji", "2026-11-15")).toBe("TKS-HS-20261115");
  });
});
