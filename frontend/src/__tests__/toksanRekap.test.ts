import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildRekapModel } from "@/toksan/export/rekapModel";
import { buildRekapDocxBlob } from "@/toksan/export/rekapDocx";
import type { RekapData } from "@/toksan/types";


const DATA: RekapData = {
  dari: "2026-11-09",
  sampai: "2026-11-15",
  totals: { produksi: 156, terjual: 153, retur: 3, omzet: 1_025_100, obralJumlah: 12, obralOmzet: 24_000, produkTerjual: 2 },
  produk: [
    { productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, produksi: 60, terjual: 57, retur: 3, omzet: 199_500 },
    { productId: "p2", productName: "Dimsum", dapur: "hangat_saji", harga: 8600, produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
  ],
  produkPerSesi: [
    { productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "pagi", produksi: 50, terjual: 48, retur: 2, omzet: 168_000 },
    { productId: "p1", productName: "Risol Mayo", dapur: "bakery", harga: 3500, sesi: "siang", produksi: 10, terjual: 9, retur: 1, omzet: 31_500 },
    { productId: "p2", productName: "Dimsum", dapur: "hangat_saji", harga: 8600, sesi: "siang", produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
  ],
  produkPerPihak: [],
  perHari: [
    { tanggal: "2026-11-13", produksi: 126, terjual: 124, retur: 2, omzet: 923_600 },
    { tanggal: "2026-11-14", produksi: 30, terjual: 29, retur: 1, omzet: 101_500 },
  ],
  perSesi: [],
  perPihak: [{ pihak: "rijal", terjual: 37, omzet: 129_500 }, { pihak: "nisaa", terjual: 116, omzet: 895_600 }],
  perDapur: [
    { dapur: "bakery", produksi: 60, terjual: 57, retur: 3, omzet: 199_500 },
    { dapur: "hangat_saji", produksi: 96, terjual: 96, retur: 0, omzet: 825_600 },
  ],
  obral: [{ id: "o1", tanggal: "2026-11-14", productId: "p1", productName: "Risol Mayo", dapur: "bakery", hargaNormal: 3500, hargaObral: 2000, jumlah: 12, catatan: null }],
};

describe("buildRekapModel", () => {
  const weekly = buildRekapModel(DATA, "mingguan", "Nabila", "2026-11-15");

  it("uses the exact letterhead strings", () => {
    expect(weekly.kop).toBe("YAYASAN LEMBAGA WAKAF AL UMANAA");
    expect(weekly.judul).toBe("TOKO SANTRI — Rekap Penjualan Mingguan");
    expect(weekly.periode).toBe("Periode: 9 – 15 November 2026");
    expect(buildRekapModel({ ...DATA, dari: "2026-11-14", sampai: "2026-11-14" }, "harian", "Nabila", "2026-11-14").periode)
      .toBe("Periode: Sabtu, 14 November 2026");
    expect(buildRekapModel({ ...DATA, dari: "2026-11-01", sampai: "2026-11-30" }, "bulanan", "Nabila", "2026-11-30").periode)
      .toBe("Periode: November 2026");
  });

  it("summarises omzet, retur percentage, pihak and obral", () => {
    const values = Object.fromEntries(weekly.ringkasan.map((r) => [r.label, r.value]));
    expect(values["Omzet penjualan"]).toBe("Rp1.025.100");
    expect(values["Retur"]).toBe("3 pcs (1,9%)");
    expect(values["Rijal"]).toBe("Rp129.500");
    expect(values["Nisaa"]).toBe("Rp895.600");
    expect(values["Obral"]).toBe("Rp24.000 (12 pcs)");
    expect(weekly.grandTotal).toBe("Rp1.049.100");
  });

  it("one section per dapur with sales, empty dapur omitted, with subtotals", () => {
    const titles = weekly.sections.map((s) => s.title);
    expect(titles).toEqual(["Bakery", "Hangat Saji", "Omzet per Hari"]);
    const bakery = weekly.sections[0];
    expect(bakery.columns).toEqual(["No", "Produk", "Harga", "Produksi", "Terjual", "Retur", "Omzet"]);
    expect(bakery.rows).toEqual([["1", "Risol Mayo", "Rp3.500", "60", "57", "3", "Rp199.500"]]);
    expect(bakery.subtotal).toEqual(["", "Subtotal Bakery", "", "60", "57", "3", "Rp199.500"]);
  });

  it("mingguan lists all 7 days from Senin, zero days included", () => {
    const perHari = weekly.sections.find((s) => s.title === "Omzet per Hari");
    expect(perHari?.rows.map((r) => r[0])).toEqual(["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]);
    expect(perHari?.rows[4]).toEqual(["Jumat", "13 November 2026", "124", "2", "Rp923.600"]);
    expect(perHari?.rows[0]).toEqual(["Senin", "9 November 2026", "0", "0", "Rp0"]);
  });

  it("harian splits each product per sesi", () => {
    const daily = buildRekapModel({ ...DATA, dari: "2026-11-14", sampai: "2026-11-14" }, "harian", "Nabila", "2026-11-14");
    const bakery = daily.sections.find((s) => s.title === "Bakery");
    expect(bakery?.columns).toContain("Sesi");
    expect(bakery?.rows.map((r) => r[2])).toEqual(["Pagi", "Siang"]);
  });

  it("bulanan adds omzet per minggu clipped to the month", () => {
    const monthly = buildRekapModel({ ...DATA, dari: "2026-11-01", sampai: "2026-11-30" }, "bulanan", "Nabila", "2026-11-30");
    const perMinggu = monthly.sections.find((s) => s.title === "Omzet per Minggu");
    expect(perMinggu?.rows.map((r) => r[1])).toEqual(["1 November 2026", "2 – 8 November 2026", "9 – 15 November 2026", "16 – 22 November 2026", "23 – 29 November 2026", "30 November 2026"]);
    expect(perMinggu?.rows[2]).toEqual(["Minggu 3", "9 – 15 November 2026", "153", "Rp1.025.100"]);
  });

  it("obral table and footer", () => {
    expect(weekly.obral?.rows).toEqual([["1", "14 November 2026", "Risol Mayo", "Bakery", "Rp3.500", "Rp2.000", "12", "Rp24.000"]]);
    expect(weekly.footer).toEqual({ tempatTanggal: "Sukabumi, 15 November 2026", jabatan: "Admin Toksan", nama: "Nabila" });
  });

  it("without a holder name the signature is a blank line to sign by hand", () => {
    const unnamed = buildRekapModel(DATA, "mingguan", "  ", "2026-11-15");
    expect(unnamed.footer.nama).toBe("( ................................ )");
  });

  it("no obral → no obral table", () => {
    expect(buildRekapModel({ ...DATA, obral: [] }, "mingguan", "Nabila", "2026-11-15").obral).toBeNull();
  });
});

describe("rekap PDF", () => {
  it("renders the letterhead, tables and page numbers", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const { buildRekapPdf } = await import("@/toksan/export/rekapPdf");
    const { bytesToDataUrl } = await import("@/toksan/export/logo");
    const logo = bytesToDataUrl(new Uint8Array(readFileSync("public/logo-mark.png")));
    const model = buildRekapModel(DATA, "mingguan", "Nabila", "2026-11-15");
    const doc = buildRekapPdf(model, logo);
    const raw = doc.output();
    expect(raw).toContain("YAYASAN LEMBAGA WAKAF AL UMANAA");
    expect(raw).toContain("Risol Mayo");
    expect(raw).toContain(`Halaman 1 dari ${doc.getNumberOfPages()}`);
    expect(raw).not.toContain("Admin Toksan");
    expect(raw).not.toContain("Sukabumi,");
    if (process.env.TOKSAN_PDF_OUT) writeFileSync(process.env.TOKSAN_PDF_OUT, new Uint8Array(doc.output("arraybuffer")));
  });
});

describe("rekap DOCX", () => {
  it("contains the letterhead and the product rows without TTD block", async () => {
    const blob = await buildRekapDocxBlob(buildRekapModel(DATA, "mingguan", "Nabila", "2026-11-15"), null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("YAYASAN LEMBAGA WAKAF AL UMANAA");
    expect(xml).toContain("TOKO SANTRI — Rekap Penjualan Mingguan");
    expect(xml).toContain("Risol Mayo");
    expect(xml).toContain("Rp1.049.100");
    expect(xml).not.toContain("Admin Toksan");
    expect(xml).not.toContain("Sukabumi,");
  });
});
