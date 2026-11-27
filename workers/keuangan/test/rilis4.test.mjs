import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Rilis 4 — Produksi (BoM, Work Order, Overhead, Variance), Multi Mata Uang & Kurs, Batch/Seri & Gudang Bertingkat", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
  });

  after(async () => {
    await ctx.dispose();
  });

  test("Produksi penyusunan (bahan + overhead + selisih biaya standar) & pemisahan + gudang bertingkat + batch/seri", async () => {
    // Gudang Induk & Gudang Bin (induk_id)
    const whMain = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "G-UTAMA", nama: "Gudang Utama", unit_kode: "TKS" } })).data.warehouse.id;
    const whBin = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "RAK-A1", nama: "Rak A1", unit_kode: "TKS", induk_id: whMain } })).data.warehouse.id;
    assert.ok(whBin);

    // Produk bahan baku (batch tracked) & hasil meja
    const pKayu = (
      await call(ctx.env, deps, "POST", "/products", {
        body: { nama: "Kayu Jati", sku: "KY-01", satuan: "batang", monitor_stok: 1, pelacakan: "batch", dibeli: 1, harga_beli: sen(10_000) },
      })
    ).data.product.id;
    const pMeja = (
      await call(ctx.env, deps, "POST", "/products", {
        body: { nama: "Meja Belajar", sku: "MJ-01", satuan: "unit", monitor_stok: 1, pelacakan: "serial", dijual: 1, harga_jual: sen(80_000) },
      })
    ).data.product.id;

    const vendor = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "vendor", nama_tampilan: "Supplier Kayu" } })).data.contact.id;

    // Beli 10 batang Kayu @ 10.000 dengan Batch B-001 ke Rak A1
    const buyKayu = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-02-01",
        unit_kode: "TKS",
        contact_id: vendor,
        warehouse_id: whBin,
        lines: [{ product_id: pKayu, qty_milli: 10_000, harga: sen(10_000), batch_no: "B-001" }],
      },
    });
    assert.equal(buyKayu.status, 200);

    // Simpan BoM & Biaya Standar
    const bomRes = await call(ctx.env, deps, "POST", "/boms", {
      body: {
        nama: "BoM Meja",
        kode: "BOM-MJ",
        kategori: "penyusunan",
        metode_biaya: "biaya_standar",
        output_product_id: pMeja,
        output_qty_milli: 1_000,
        components: [{ product_id: pKayu, qty_milli: 2_000 }],
        overhead_costs: [{ account_kode: "5-50401", nama: "Tenaga Kerja Tukang", jumlah: sen(5_000) }],
      },
    });
    assert.equal(bomRes.status, 200);

    // Perintah Kerja Penyusunan: 2 batang Kayu (20.000) + Overhead (5.000) = Aktual 25.000 -> Output 1 Meja biaya standar 22.000 -> Selisih 3.000 ke 5-50402
    const wo = await call(ctx.env, deps, "POST", "/work-orders", {
      body: {
        tanggal: "2026-02-03",
        unit_kode: "TKS",
        warehouse_id: whBin,
        kategori: "penyusunan",
        bom_id: bomRes.data.bom.id,
        inputs: [{ product_id: pKayu, qty_milli: 2_000, batch_no: "B-001" }],
        overhead_costs: [{ account_kode: "5-50401", nama: "Tukang", jumlah: sen(5_000) }],
        outputs: [{ product_id: pMeja, qty_milli: 1_000, biaya_standar: sen(22_000), serial_no: "SN-MJ-001" }],
      },
    });
    assert.equal(wo.status, 200);
    assert.ok(wo.data.journal.some((j) => j.account_kode === "5-50402" && j.debit === sen(3_000)));

    const repProd = await call(ctx.env, deps, "GET", "/reports/produksi/daftar");
    assert.equal(repProd.data.rows.length, 1);
    const mejaDetail = await call(ctx.env, deps, "GET", `/products/${pMeja}`);
    assert.equal(mejaDetail.data.product.stok_milli, 1_000);
    assert.equal(mejaDetail.data.serials.length, 1);
  });

  test("Multi mata uang (USD): faktur kurs 15.000 -> bayar kurs 15.500 -> laba selisih kurs terealisasi Rp 50.000", async () => {
    await call(ctx.env, deps, "POST", "/currencies", { body: { kode: "USD", nama: "US Dollar", simbol: "$" } });
    // Kurs Rp 15.000 (15_000 * 1_000_000 micro) & Rp 15.500
    await call(ctx.env, deps, "POST", "/exchange-rates", { body: { currency_kode: "USD", tanggal: "2026-02-01", kurs: 15_000_000_000 } });
    await call(ctx.env, deps, "POST", "/exchange-rates", { body: { currency_kode: "USD", tanggal: "2026-02-10", kurs: 15_500_000_000 } });

    const cust = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "pelanggan", nama_tampilan: "Global Buyer" } })).data.contact.id;

    // Faktur $100 (10_000 sen USD) pada kurs 15.000 (skala 1_000_000 = 15.000_000_000 -> nilai IDR = Rp 1.500.000 = 150.000.000 sen)
    const inv = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-02-01",
        unit_kode: "TKS",
        contact_id: cust,
        currency: "USD",
        kurs: 15_000_000_000, // Rp 15.000/USD -> $100 (10_000 sen) * 15_000_000_000 / 1_000_000 = 150.000.000 sen = Rp 1.500.000
        lines: [{ deskripsi: "Lisensi USD", qty_milli: 1_000, harga: sen(100) }],
      },
    });
    assert.equal(inv.status, 200);
    const arLine = inv.data.journal.find((j) => j.account_kode === "1-10100");
    assert.equal(arLine.debit, sen(1_500_000));

    // Pembayaran $100 pada kurs 15.500 (15_500_000_000 mikro) -> Kas masuk Rp 1.550.000, Piutang tutup Rp 1.500.000, Laba Kurs 8-80200 Kredit Rp 50.000
    const pay = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_payment",
        tanggal: "2026-02-10",
        unit_kode: "TKS",
        contact_id: cust,
        setor_ke: "1-10010",
        currency: "USD",
        kurs: 15_500_000_000,
        allocations: [{ document_id: inv.data.document.id, amount: sen(100) }],
      },
    });
    assert.equal(pay.status, 200);
    const fxLine = pay.data.journal.find((j) => j.account_kode === "8-80200");
    assert.equal(fxLine.kredit, sen(50_000));

    const fxReport = await call(ctx.env, deps, "GET", "/reports/kurs/realisasi");
    assert.equal(fxReport.data.rows.length, 1);

    const neraca = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-28");
    assert.equal(neraca.data.seimbang, true);
    assert.equal((await call(ctx.env, deps, "GET", "/work-orders", { token: "developer" })).status, 403);
  });
});
