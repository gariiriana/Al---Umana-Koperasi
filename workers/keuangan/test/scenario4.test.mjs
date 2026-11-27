import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import worker from "../src/worker.js";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Skenario 4 — Penjualan, HPP Rata-Rata Bergerak, Pajak, Cron Rekalkulasi Mundur & Retur", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
  });

  after(async () => {
    await ctx.dispose();
  });

  test("alur lengkap Skenario 4 sesuai angka exact 09-teknis.md", async () => {
    // Seed gudang TKS, produk "Kitab A" berstok PPN 11%, dan kontak Pelanggan + Vendor
    const { data: whRes } = await call(ctx.env, deps, "POST", "/warehouses", {
      body: { kode: "GUD-TKS", nama: "Gudang TKS", unit_kode: "TKS" },
    });
    const whId = whRes.warehouse.id;

    const { data: prodRes } = await call(ctx.env, deps, "POST", "/products", {
      body: {
        nama: "Kitab A",
        sku: "KTB-A",
        satuan: "pcs",
        monitor_stok: 1,
        dibeli: 1,
        harga_beli: sen(10_000),
        pajak_beli: "tax_ppn_11",
        dijual: 1,
        harga_jual: sen(20_000),
        pajak_jual: "tax_ppn_11",
      },
    });
    const prodId = prodRes.product.id;

    const { data: vRes } = await call(ctx.env, deps, "POST", "/contacts", {
      body: { tipe: "vendor", nama_tampilan: "Penerbit Pustaka" },
    });
    const vendorId = vRes.contact.id;

    const { data: cRes } = await call(ctx.env, deps, "POST", "/contacts", {
      body: { tipe: "pelanggan", nama_tampilan: "Santri Putra" },
    });
    const custId = cRes.contact.id;

    // 1. Faktur pembelian 10 pcs @10.000 -> Persediaan 100.000, PPN Masukan 11.000, Hutang 111.000
    const buy1 = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(10_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(buy1.status, 200);
    assert.equal(buy1.data.document.subtotal, sen(100_000));
    assert.equal(buy1.data.document.pajak, sen(11_000));
    assert.equal(buy1.data.document.total, sen(111_000));

    // 2. Faktur pembelian 10 pcs @12.000 -> harga rata-rata 11.000
    const buy2 = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-01-15",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(12_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(buy2.status, 200);
    const pMid = await call(ctx.env, deps, "GET", `/products/${prodId}`);
    assert.equal(pMid.data.product.harga_rata_rata, sen(11_000));

    // 3. Faktur penjualan 5 pcs @20.000 -> Pendapatan 100.000, PPN Keluaran 11.000, Piutang 111.000, HPP 55.000
    const sale1 = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-01-20",
        unit_kode: "TKS",
        contact_id: custId,
        warehouse_id: whId,
        lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(20_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(sale1.status, 200);
    assert.equal(sale1.data.document.total, sen(111_000));
    const hppRow = sale1.data.journal.find((j) => j.account_kode === "5-50000" && j.debit > 0);
    assert.equal(hppRow.debit, sen(55_000));

    // 4. Terima pembayaran 104.500 dengan pemotongan 6.500 ke 8-80001 Administrasi Bank -> Piutang lunas
    const pay1 = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_payment",
        tanggal: "2026-01-21",
        unit_kode: "TKS",
        contact_id: custId,
        setor_ke: "1-10002",
        allocations: [{ document_id: sale1.data.document.id, amount: sen(111_000) }],
        withholdings: [{ account_kode: "8-80001", mode: "nominal", nilai: sen(6_500) }],
      },
    });
    assert.equal(pay1.status, 200);
    const bankDebit = pay1.data.journal.find((j) => j.account_kode === "1-10002");
    assert.equal(bankDebit.debit, sen(104_500));

    const saleAfterPay = await call(ctx.env, deps, "GET", `/transactions/${sale1.data.document.id}`);
    assert.equal(saleAfterPay.data.document.sisa, 0);
    assert.equal(saleAfterPay.data.document.status, "lunas");

    // 5. Laba bersih = 100.000 - 55.000 - 6.500 = 38.500
    const lrBefore = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lrBefore.status, 200);
    assert.equal(lrBefore.data.summary.pendapatanBersih, sen(38_500));

    // 6. Faktur pembelian bertanggal mundur (sebelum penjualan) 10 pcs @8.000 -> antrean recalc -> cron hitung ulang
    const buyBack = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-01-05",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(8_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(buyBack.status, 200);

    const queueBefore = await call(ctx.env, deps, "GET", "/recalc-hpp");
    assert.equal(queueBefore.data.queue.length, 1);

    // Tutup buku wajib ditolak saat recalc_queue belum kosong
    const blockedClose = await call(ctx.env, deps, "POST", "/period-closings", {
      body: { tipe: "tutup", dari: "2026-01-01", sampai: "2026-01-31" },
    });
    assert.equal(blockedClose.status, 400);

    // Jalankan cron scheduled() -> memproses recalc_queue!
    await worker.scheduled({}, ctx.env, null);

    const queueAfter = await call(ctx.env, deps, "GET", "/recalc-hpp");
    assert.equal(queueAfter.data.queue.length, 0);

    // Setelah hitung ulang: rata-rata saat jual = 300.000 / 30 = 10.000, HPP = 50.000, laba bersih = 43.500
    const saleRecalc = await call(ctx.env, deps, "GET", `/transactions/${sale1.data.document.id}`);
    const hppRecalc = saleRecalc.data.journal.find((j) => j.account_kode === "5-50000" && j.debit > 0);
    assert.equal(hppRecalc.debit, sen(50_000));

    const lrAfter = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lrAfter.data.summary.pendapatanBersih, sen(43_500));

    // 7. Retur 1 pcs dari faktur penjualan -> Retur Penjualan 20.000, PPN Keluaran -2.200, Persediaan +10.000, HPP -10.000, kredit memo 22.200
    const ret1 = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_return",
        tanggal: "2026-01-22",
        unit_kode: "TKS",
        contact_id: custId,
        warehouse_id: whId,
        parent_id: sale1.data.document.id,
        lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(ret1.status, 200);
    assert.equal(ret1.data.document.total, sen(22_200));
    assert.equal(ret1.data.document.sisa, sen(22_200));
    const retInv = ret1.data.journal.find((j) => j.account_kode === "1-10200");
    assert.equal(retInv.debit, sen(10_000));
    const retSales = ret1.data.journal.find((j) => j.account_kode === "4-40200");
    assert.equal(retSales.debit, sen(20_000));
    const retTax = ret1.data.journal.find((j) => j.account_kode === "2-20500");
    assert.equal(retTax.debit, sen(2_200));

    const neraca = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31");
    assert.equal(neraca.status, 200);
    assert.equal(neraca.data.seimbang, true);
  });
});
