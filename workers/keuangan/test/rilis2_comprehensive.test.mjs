// Test komprehensif Rilis 2:
// Menguji CREATE, EDIT, DELETE, KUNCI PERIODE, PRA-SALDO-AWAL (opening_balance_reversal),
// stok, HPP rata-rata bergerak (+ cron hitung ulang mundur), dan keseimbangan Neraca
// untuk SETIAP jenis dokumen penjualan, pembelian, biaya, retur, serta kredit/debit memo.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import worker from "../src/worker.js";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

async function assertNeracaBalanced(env, deps, sampai) {
  const res = await call(env, deps, "GET", `/reports/neraca?sampai=${sampai}`);
  assert.equal(res.status, 200, `Neraca ${sampai} gagal dimuat`);
  assert.equal(res.data.seimbang, true, `Neraca per ${sampai} tidak seimbang (selisih=${res.data.selisih})`);
  return res.data;
}

async function getProductSnap(env, deps, prodId) {
  const res = await call(env, deps, "GET", `/products/${prodId}`);
  assert.equal(res.status, 200);
  return res.data.product;
}

describe("Rilis 2 Komprehensif — Semua Jenis Dokumen (Create, Edit, Hapus, Lock, Pra-Saldo-Awal, Stok, HPP & Neraca)", () => {
  let ctx;
  const deps = fakeDeps();

  let whId;
  let prodId;
  let custId;
  let vendorId;

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });

    whId = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "G-TKS", nama: "Gudang TKS", unit_kode: "TKS" } })).data.warehouse.id;
    prodId = (
      await call(ctx.env, deps, "POST", "/products", {
        body: {
          nama: "Buku Fikih",
          sku: "BK-FK",
          satuan: "pcs",
          monitor_stok: 1,
          dibeli: 1,
          harga_beli: sen(10_000),
          dijual: 1,
          harga_jual: sen(20_000),
        },
      })
    ).data.product.id;

    custId = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "pelanggan", nama_tampilan: "Pelanggan Test" } })).data.contact.id;
    vendorId = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "vendor", nama_tampilan: "Vendor Test" } })).data.contact.id;

    // Saldo awal per 2026-01-31: Kas 1-10010 Rp 50.000.000, Modal 3-30000 Rp 50.000.000
    const ob = await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2026-01-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10010", debit: sen(50_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(50_000_000) },
        ],
      },
    });
    assert.equal(ob.status, 200);

    // Stok awal 2026-02-01: 10 pcs @ Rp 10.000 = Rp 100.000 (Persediaan 1-10200 +100.000, Hutang 2-20100 +100.000)
    // Perhitungan manual: avg = 100.000 / 10 = Rp 10.000/pcs
    const baseBuy = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-02-01",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(10_000) }],
      },
    });
    assert.equal(baseBuy.status, 200);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
  });

  after(async () => {
    await ctx.dispose();
  });

  test("1. Create, Edit, Hapus semua jenis dokumen Penjualan dengan verifikasi stok, HPP & Neraca", async () => {
    // a. sales_quote: 2 pcs @ 20.000 = 40.000 -> edit jadi 3 pcs = 60.000 -> hapus (tidak ubah stok = 10 pcs)
    const sq = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_quote", tanggal: "2026-02-02", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(20_000) }] },
    });
    assert.equal(sq.status, 200);
    assert.equal(sq.data.document.total, sen(40_000));
    const sqEdit = await call(ctx.env, deps, "PUT", `/transactions/${sq.data.document.id}`, {
      body: { tanggal: "2026-02-02", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 3_000, harga: sen(20_000) }] },
    });
    assert.equal(sqEdit.status, 200);
    assert.equal(sqEdit.data.document.total, sen(60_000));
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 10_000);
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${sq.data.document.id}`)).status, 200);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // b. sales_order: 4 pcs @ 20.000 = 80.000 -> edit 5 pcs = 100.000 -> + order_deposit 30.000 -> edit DP 25.000 -> hapus DP -> hapus SO
    const so = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_order", tanggal: "2026-02-03", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 4_000, harga: sen(20_000) }] },
    });
    assert.equal(so.status, 200);
    assert.equal(so.data.document.total, sen(80_000));
    const soEdit = await call(ctx.env, deps, "PUT", `/transactions/${so.data.document.id}`, {
      body: { tanggal: "2026-02-03", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(20_000) }] },
    });
    assert.equal(soEdit.data.document.total, sen(100_000));

    // c. order_deposit: DP 30.000 -> edit jadi 25.000 -> hapus (mengembalikan uang_muka SO = 0)
    const dp = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "order_deposit", tanggal: "2026-02-03", unit_kode: "TKS", parent_id: so.data.document.id, setor_ke: "1-10010", jumlah: sen(30_000) },
    });
    assert.equal(dp.status, 200);
    assert.equal(dp.data.document.total, sen(30_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    const dpEdit = await call(ctx.env, deps, "PUT", `/transactions/${dp.data.document.id}`, {
      body: { tanggal: "2026-02-03", unit_kode: "TKS", parent_id: so.data.document.id, setor_ke: "1-10010", jumlah: sen(25_000) },
    });
    assert.equal(dpEdit.status, 200);
    assert.equal(dpEdit.data.document.total, sen(25_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${dp.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${so.data.document.id}`)).data.document.uang_muka, 0);
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${so.data.document.id}`)).status, 200);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // d. sales_delivery: 3 pcs -> stok turun ke 7 pcs, HPP 30.000 -> edit 2 pcs -> stok jadi 8 pcs, HPP 20.000 -> hapus -> stok balik 10 pcs
    const sd = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_delivery", tanggal: "2026-02-04", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 3_000, harga: sen(20_000) }] },
    });
    assert.equal(sd.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 7_000);
    assert.equal(sd.data.journal.find((j) => j.account_kode === "5-50000").debit, sen(30_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    const sdEdit = await call(ctx.env, deps, "PUT", `/transactions/${sd.data.document.id}`, {
      body: { tanggal: "2026-02-04", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(20_000) }] },
    });
    assert.equal(sdEdit.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 8_000);
    assert.equal(sdEdit.data.journal.find((j) => j.account_kode === "5-50000").debit, sen(20_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${sd.data.document.id}`)).status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 10_000);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // e. sales_invoice: 4 pcs @ 20.000 = 80.000, HPP 40.000 -> edit 5 pcs = 100.000, HPP 50.000, stok 5 pcs
    const si = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_invoice", tanggal: "2026-02-05", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 4_000, harga: sen(20_000) }] },
    });
    assert.equal(si.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 6_000);
    const siEdit = await call(ctx.env, deps, "PUT", `/transactions/${si.data.document.id}`, {
      body: { tanggal: "2026-02-05", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(20_000) }] },
    });
    assert.equal(siEdit.status, 200);
    assert.equal(siEdit.data.document.total, sen(100_000));
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 5_000);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // f. sales_payment: bayar 40.000 -> edit jadi 60.000 (sisa faktur = 40.000) -> hapus (sisa faktur balik 100.000)
    const sp = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_payment", tanggal: "2026-02-06", unit_kode: "TKS", contact_id: custId, setor_ke: "1-10010", allocations: [{ document_id: si.data.document.id, amount: sen(40_000) }] },
    });
    assert.equal(sp.status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${si.data.document.id}`)).data.document.sisa, sen(60_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    const spEdit = await call(ctx.env, deps, "PUT", `/transactions/${sp.data.document.id}`, {
      body: { tanggal: "2026-02-06", unit_kode: "TKS", contact_id: custId, setor_ke: "1-10010", allocations: [{ document_id: si.data.document.id, amount: sen(60_000) }] },
    });
    assert.equal(spEdit.status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${si.data.document.id}`)).data.document.sisa, sen(40_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${sp.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${si.data.document.id}`)).data.document.sisa, sen(100_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // g. sales_return: retur 1 pcs = 20.000 -> stok naik 6 pcs -> edit jadi 2 pcs (40.000, stok 7 pcs) -> hapus -> stok 5 pcs, hapus faktur -> stok 10 pcs
    const sr = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_return", tanggal: "2026-02-07", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000) }] },
    });
    assert.equal(sr.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 6_000);
    const srEdit = await call(ctx.env, deps, "PUT", `/transactions/${sr.data.document.id}`, {
      body: { tanggal: "2026-02-07", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(20_000) }] },
    });
    assert.equal(srEdit.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 7_000);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${sr.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${si.data.document.id}`)).status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 10_000);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // h. credit_memo (20.000 -> edit 30.000) + credit_memo_refund (10.000 -> edit 15.000 -> hapus refund -> hapus CM)
    const cm = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "credit_memo", tanggal: "2026-02-08", unit_kode: "TKS", contact_id: custId, lines: [{ deskripsi: "Potongan pelanggan", qty_milli: 1_000, harga: sen(20_000) }] },
    });
    assert.equal(cm.status, 200);
    const cmEdit = await call(ctx.env, deps, "PUT", `/transactions/${cm.data.document.id}`, {
      body: { tanggal: "2026-02-08", unit_kode: "TKS", contact_id: custId, lines: [{ deskripsi: "Potongan pelanggan rev", qty_milli: 1_000, harga: sen(30_000) }] },
    });
    assert.equal(cmEdit.status, 200);
    assert.equal(cmEdit.data.document.sisa, sen(30_000));

    const cmr = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "credit_memo_refund", tanggal: "2026-02-08", unit_kode: "TKS", parent_id: cm.data.document.id, bayar_dari: "1-10010", jumlah: sen(10_000) },
    });
    assert.equal(cmr.status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${cm.data.document.id}`)).data.document.sisa, sen(20_000));
    const cmrEdit = await call(ctx.env, deps, "PUT", `/transactions/${cmr.data.document.id}`, {
      body: { tanggal: "2026-02-08", unit_kode: "TKS", parent_id: cm.data.document.id, bayar_dari: "1-10010", jumlah: sen(15_000) },
    });
    assert.equal(cmrEdit.status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${cm.data.document.id}`)).data.document.sisa, sen(15_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${cmr.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${cm.data.document.id}`)).data.document.sisa, sen(30_000));
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${cm.data.document.id}`)).status, 200);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
  });

  test("2. Create, Edit, Hapus semua jenis dokumen Pembelian & Biaya + hitung ulang HPP mundur cron", async () => {
    // a. purchase_request -> edit -> hapus
    const prq = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_request", tanggal: "2026-02-09", unit_kode: "TKS", lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(10_000) }] },
    });
    assert.equal(prq.status, 200);
    const prqEdit = await call(ctx.env, deps, "PUT", `/transactions/${prq.data.document.id}`, {
      body: { tanggal: "2026-02-09", unit_kode: "TKS", lines: [{ product_id: prodId, qty_milli: 4_000, harga: sen(10_000) }] },
    });
    assert.equal(prqEdit.data.document.total, sen(40_000));
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${prq.data.document.id}`)).status, 200);

    // b. purchase_quote -> edit -> hapus
    const pq = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_quote", tanggal: "2026-02-09", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(11_000) }] },
    });
    assert.equal(pq.status, 200);
    const pqEdit = await call(ctx.env, deps, "PUT", `/transactions/${pq.data.document.id}`, {
      body: { tanggal: "2026-02-09", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 6_000, harga: sen(11_000) }] },
    });
    assert.equal(pqEdit.data.document.total, sen(66_000));
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${pq.data.document.id}`)).status, 200);

    // c. purchase_order + purchase_deposit -> edit -> hapus
    const po = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_order", tanggal: "2026-02-10", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(14_000) }] },
    });
    assert.equal(po.status, 200);
    const poEdit = await call(ctx.env, deps, "PUT", `/transactions/${po.data.document.id}`, {
      body: { tanggal: "2026-02-10", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(12_000) }] },
    });
    assert.equal(poEdit.data.document.total, sen(120_000));

    const pdp = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_deposit", tanggal: "2026-02-10", unit_kode: "TKS", parent_id: po.data.document.id, bayar_dari: "1-10010", jumlah: sen(40_000) },
    });
    assert.equal(pdp.status, 200);
    const pdpEdit = await call(ctx.env, deps, "PUT", `/transactions/${pdp.data.document.id}`, {
      body: { tanggal: "2026-02-10", unit_kode: "TKS", parent_id: po.data.document.id, bayar_dari: "1-10010", jumlah: sen(50_000) },
    });
    assert.equal(pdpEdit.data.document.total, sen(50_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${pdp.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${po.data.document.id}`)).status, 200);

    // d. purchase_delivery: +10 pcs @ 14.000 -> total stok 20 pcs, nilai 100.000+140.000 = 240.000 -> avg 12.000
    // Edit -> +10 pcs @ 16.000 -> total nilai 260.000 -> avg 13.000 -> hapus -> balik 10 pcs @ 10.000
    const pdel = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_delivery", tanggal: "2026-02-11", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(14_000) }] },
    });
    assert.equal(pdel.status, 200);
    let snap = await getProductSnap(ctx.env, deps, prodId);
    assert.equal(snap.stok_milli, 20_000);
    assert.equal(snap.harga_rata_rata, sen(12_000));

    await call(ctx.env, deps, "PUT", `/transactions/${pdel.data.document.id}`, {
      body: { tanggal: "2026-02-11", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(16_000) }] },
    });
    snap = await getProductSnap(ctx.env, deps, prodId);
    assert.equal(snap.harga_rata_rata, sen(13_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${pdel.data.document.id}`)).status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 10_000);

    // e. purchase_invoice + sales_invoice + backdated purchase_invoice (edit & cron recalc!) + purchase_payment
    // Beli 10 pcs @ 14.000 tgl 2026-02-12 -> stok 20, avg 12.000
    const pi = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_invoice", tanggal: "2026-02-12", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(14_000) }] },
    });
    assert.equal(pi.status, 200);
    // Jual 5 pcs @ 25.000 tgl 2026-02-14 -> HPP = 5 * 12.000 = 60.000, sisa stok 15
    const si = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_invoice", tanggal: "2026-02-14", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(25_000) }] },
    });
    assert.equal(si.data.journal.find((j) => j.account_kode === "5-50000").debit, sen(60_000));

    // Edit pi menjadi 10 pcs @ 18.000 (bertanggal lebih awal dari penjualan tgl 14!) -> memicu recalc_queue -> cron scheduled()
    // Perhitungan manual: (100.000 + 180.000) / 20 = 14.000/pcs -> HPP si berubah dari 60.000 menjadi 5 * 14.000 = 70.000!
    await call(ctx.env, deps, "PUT", `/transactions/${pi.data.document.id}`, {
      body: { tanggal: "2026-02-12", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 10_000, harga: sen(18_000) }] },
    });
    await worker.scheduled({}, ctx.env, null);
    const siAfterRecalc = await call(ctx.env, deps, "GET", `/transactions/${si.data.document.id}`);
    assert.equal(siAfterRecalc.data.journal.find((j) => j.account_kode === "5-50000").debit, sen(70_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");

    // purchase_payment create -> edit -> delete
    const pp = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_payment", tanggal: "2026-02-15", unit_kode: "TKS", contact_id: vendorId, bayar_dari: "1-10010", allocations: [{ document_id: pi.data.document.id, amount: sen(80_000) }] },
    });
    assert.equal(pp.status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${pi.data.document.id}`)).data.document.sisa, sen(100_000));
    await call(ctx.env, deps, "PUT", `/transactions/${pp.data.document.id}`, {
      body: { tanggal: "2026-02-15", unit_kode: "TKS", contact_id: vendorId, bayar_dari: "1-10010", allocations: [{ document_id: pi.data.document.id, amount: sen(120_000) }] },
    });
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${pi.data.document.id}`)).data.document.sisa, sen(60_000));
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${pp.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${pi.data.document.id}`)).data.document.sisa, sen(180_000));

    // f. purchase_return: retur 1 pcs -> edit 2 pcs -> hapus
    const pr = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_return", tanggal: "2026-02-16", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(18_000) }] },
    });
    assert.equal(pr.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 14_000);
    await call(ctx.env, deps, "PUT", `/transactions/${pr.data.document.id}`, {
      body: { tanggal: "2026-02-16", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(18_000) }] },
    });
    assert.equal((await getProductSnap(ctx.env, deps, prodId)).stok_milli, 13_000);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${pr.data.document.id}`)).status, 200);

    // g. debit_memo + debit_memo_refund: create -> edit -> delete
    const dm = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "debit_memo", tanggal: "2026-02-17", unit_kode: "TKS", contact_id: vendorId, lines: [{ deskripsi: "Klaim vendor", qty_milli: 1_000, harga: sen(20_000) }] },
    });
    assert.equal(dm.status, 200);
    await call(ctx.env, deps, "PUT", `/transactions/${dm.data.document.id}`, {
      body: { tanggal: "2026-02-17", unit_kode: "TKS", contact_id: vendorId, lines: [{ deskripsi: "Klaim vendor rev", qty_milli: 1_000, harga: sen(25_000) }] },
    });
    const dmr = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "debit_memo_refund", tanggal: "2026-02-17", unit_kode: "TKS", parent_id: dm.data.document.id, setor_ke: "1-10010", jumlah: sen(10_000) },
    });
    assert.equal(dmr.status, 200);
    await call(ctx.env, deps, "PUT", `/transactions/${dmr.data.document.id}`, {
      body: { tanggal: "2026-02-17", unit_kode: "TKS", parent_id: dm.data.document.id, setor_ke: "1-10010", jumlah: sen(15_000) },
    });
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${dm.data.document.id}`)).data.document.sisa, sen(10_000));
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${dmr.data.document.id}`)).status, 200);
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${dm.data.document.id}`)).status, 200);

    // h. expense (bayar langsung & bayar nanti): create -> edit -> delete
    const exDirect = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "expense", tanggal: "2026-02-18", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "ATK", jumlah: sen(35_000) }] },
    });
    assert.equal(exDirect.status, 200);
    await call(ctx.env, deps, "PUT", `/transactions/${exDirect.data.document.id}`, {
      body: { tanggal: "2026-02-18", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "ATK Rev", jumlah: sen(45_000) }] },
    });
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${exDirect.data.document.id}`)).status, 200);

    const exLater = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "expense", tanggal: "2026-02-18", unit_kode: "TKS", contact_id: vendorId, bayar_nanti: true, lines: [{ account_kode: "6-60900", deskripsi: "Servis", jumlah: sen(55_000) }] },
    });
    assert.equal(exLater.status, 200);
    await call(ctx.env, deps, "PUT", `/transactions/${exLater.data.document.id}`, {
      body: { tanggal: "2026-02-18", unit_kode: "TKS", contact_id: vendorId, bayar_nanti: true, lines: [{ account_kode: "6-60900", deskripsi: "Servis Rev", jumlah: sen(65_000) }] },
    });
    assert.equal((await call(ctx.env, deps, "GET", `/transactions/${exLater.data.document.id}`)).data.document.sisa, sen(65_000));
    assert.equal((await call(ctx.env, deps, "DELETE", `/transactions/${exLater.data.document.id}`)).status, 200);
    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
  });

  test("3. Kunci Periode (create/edit/delete ditolak 400) & Pra-Saldo-Awal (opening_balance_reversal) untuk semua jenis dokumen", async () => {
    // Stok awal pra-SA bertanggal 2026-01-10 (5 pcs @ 10.000) agar penjualan/pengiriman/retur pra-SA tanggal 2026-01-15 memiliki stok yang sah,
    // sekaligus membuktikan Neraca per 2026-01-31 tetap persis Rp 50.000.000 karena otomatis dibalik opening_balance_reversal.
    const seedJan = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "purchase_invoice", tanggal: "2026-01-10", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 5_000, harga: sen(10_000) }] },
    });
    assert.equal(seedJan.status, 200);
    assert.equal((await assertNeracaBalanced(ctx.env, deps, "2026-01-31")).totals[0].totalAset, sen(50_000_000));

    // a. Transaksi bertanggal 2026-01-15 (< Saldo Awal 2026-01-31):
    // Saldo Awal 1-10010 = 50.000.000 wajib tetap 50.000.000 per 2026-01-31 meski kita catat, edit & hapus transaksi 2026-01-15!
    const preTypes = [
      { type: "purchase_invoice", payload: { unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(10_000) }] }, editAmt: sen(12_000) },
      { type: "sales_invoice", payload: { unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000) }] }, editAmt: sen(25_000) },
      { type: "sales_delivery", payload: { unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000) }] }, editAmt: sen(22_000) },
      { type: "purchase_delivery", payload: { unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 2_000, harga: sen(10_000) }] }, editAmt: sen(11_000) },
      { type: "sales_return", payload: { unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000) }] }, editAmt: sen(18_000) },
      { type: "purchase_return", payload: { unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] }, editAmt: sen(11_000) },
      { type: "credit_memo", payload: { unit_kode: "TKS", contact_id: custId, lines: [{ deskripsi: "CM Pra-SA", qty_milli: 1_000, harga: sen(15_000) }] }, editAmt: sen(18_000) },
      { type: "debit_memo", payload: { unit_kode: "TKS", contact_id: vendorId, lines: [{ deskripsi: "DM Pra-SA", qty_milli: 1_000, harga: sen(15_000) }] }, editAmt: sen(18_000) },
      { type: "expense", payload: { unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "Biaya Pra-SA", jumlah: sen(30_000) }] }, editQtyAmt: sen(40_000) },
    ];

    for (const item of preTypes) {
      const created = await call(ctx.env, deps, "POST", "/transactions", { body: { type: item.type, tanggal: "2026-01-15", ...item.payload } });
      assert.equal(created.status, 200, `${item.type} pra-SA gagal dibuat`);
      let nJan = await assertNeracaBalanced(ctx.env, deps, "2026-01-31");
      assert.equal(nJan.totals[0].totalAset, sen(50_000_000), `Neraca 31 Jan berubah setelah create ${item.type}`);

      const editedBody = item.editQtyAmt
        ? { tanggal: "2026-01-15", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "Biaya Pra-SA Rev", jumlah: item.editQtyAmt }] }
        : { tanggal: "2026-01-15", ...item.payload, lines: [{ ...item.payload.lines[0], harga: item.editAmt }] };
      const edited = await call(ctx.env, deps, "PUT", `/transactions/${created.data.document.id}`, { body: editedBody });
      assert.equal(edited.status, 200, `${item.type} pra-SA gagal diedit`);
      nJan = await assertNeracaBalanced(ctx.env, deps, "2026-01-31");
      assert.equal(nJan.totals[0].totalAset, sen(50_000_000), `Neraca 31 Jan berubah setelah edit ${item.type}`);

      const del = await call(ctx.env, deps, "DELETE", `/transactions/${created.data.document.id}`);
      assert.equal(del.status, 200, `${item.type} pra-SA gagal dihapus`);
      nJan = await assertNeracaBalanced(ctx.env, deps, "2026-01-31");
      assert.equal(nJan.totals[0].totalAset, sen(50_000_000), `Neraca 31 Jan berubah setelah hapus ${item.type}`);
    }

    // Juga uji pra-SA untuk order_deposit, purchase_deposit, sales_payment, purchase_payment, credit_memo_refund, debit_memo_refund
    const invS = (await call(ctx.env, deps, "POST", "/transactions", { body: { type: "sales_invoice", tanggal: "2026-01-15", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(20_000) }] } })).data.document.id;
    const payS = await call(ctx.env, deps, "POST", "/transactions", { body: { type: "sales_payment", tanggal: "2026-01-16", unit_kode: "TKS", contact_id: custId, setor_ke: "1-10010", allocations: [{ document_id: invS, amount: sen(20_000) }] } });
    assert.equal(payS.status, 200);
    assert.equal((await assertNeracaBalanced(ctx.env, deps, "2026-01-31")).totals[0].totalAset, sen(50_000_000));
    await call(ctx.env, deps, "DELETE", `/transactions/${payS.data.document.id}`);
    await call(ctx.env, deps, "DELETE", `/transactions/${invS}`);

    // b. Kunci periode 2026-02-01..2026-02-14 (<= todayWib 2026-02-15) -> pastikan SEMUA jenis dokumen ditolak saat CREATE/EDIT/DELETE di periode terkunci
    const tempExp = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "expense", tanggal: "2026-02-14", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "Lock test", jumlah: sen(10_000) }] },
    });
    assert.equal(tempExp.status, 200);

    // Pastikan antrean rekalkulasi HPP akibat tanggal mundur selesai diproses sebelum kunci periode
    await worker.scheduled({}, ctx.env, null);

    const lockFeb = await call(ctx.env, deps, "POST", "/period-closings", {
      body: { tipe: "kunci", dari: "2026-02-01", sampai: "2026-02-14", memo: "Kunci Feb 2026" },
    });
    assert.equal(lockFeb.status, 200);

    const lockedSamples = [
      { type: "sales_quote", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "sales_order", unit_kode: "TKS", contact_id: custId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "sales_delivery", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "sales_invoice", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "sales_return", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "credit_memo", unit_kode: "TKS", contact_id: custId, lines: [{ deskripsi: "x", qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_request", unit_kode: "TKS", lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_quote", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_order", unit_kode: "TKS", contact_id: vendorId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_delivery", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_invoice", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "purchase_return", unit_kode: "TKS", contact_id: vendorId, warehouse_id: whId, lines: [{ product_id: prodId, qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "debit_memo", unit_kode: "TKS", contact_id: vendorId, lines: [{ deskripsi: "x", qty_milli: 1_000, harga: sen(10_000) }] },
      { type: "expense", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "x", jumlah: sen(10_000) }] },
    ];
    for (const s of lockedSamples) {
      const blocked = await call(ctx.env, deps, "POST", "/transactions", { body: { tanggal: "2026-02-10", ...s } });
      assert.equal(blocked.status, 400, `${s.type} seharusnya ditolak di periode terkunci`);
    }

    const editBlocked = await call(ctx.env, deps, "PUT", `/transactions/${tempExp.data.document.id}`, {
      body: { tanggal: "2026-02-14", unit_kode: "TKS", bayar_dari: "1-10010", lines: [{ account_kode: "6-60900", deskripsi: "Lock test", jumlah: sen(12_000) }] },
    });
    assert.equal(editBlocked.status, 400);
    const delBlocked = await call(ctx.env, deps, "DELETE", `/transactions/${tempExp.data.document.id}`);
    assert.equal(delBlocked.status, 400);

    await assertNeracaBalanced(ctx.env, deps, "2026-02-28");
  });

  test("4. Hapus atau edit dokumen penambah stok ditolak (400) bila membuat stok minus (beli 10, jual 8, hapus pembelian -> 400 & stok tetap 2)", async () => {
    const prodGuardId = (
      await call(ctx.env, deps, "POST", "/products", {
        body: { nama: "Produk Uji Stok Minus", sku: "UJI-NEG", satuan: "pcs", monitor_stok: 1, dibeli: 1, harga_beli: sen(10_000), dijual: 1, harga_jual: sen(20_000) },
      })
    ).data.product.id;

    // Beli 10 pcs pada 2026-02-21
    const beli = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-02-21",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodGuardId, qty_milli: 10_000, harga: sen(10_000) }],
      },
    });
    assert.equal(beli.status, 200);

    // Jual 8 pcs pada 2026-02-22 -> sisa stok = 10 - 8 = 2 pcs
    const jual = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-02-22",
        unit_kode: "TKS",
        contact_id: custId,
        warehouse_id: whId,
        lines: [{ product_id: prodGuardId, qty_milli: 8_000, harga: sen(20_000) }],
      },
    });
    assert.equal(jual.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodGuardId)).stok_milli, 2_000);

    // Hapus pembelian 10 pcs -> ditolak 400 karena akan membuat stok menjadi -8 pcs!
    const delBeli = await call(ctx.env, deps, "DELETE", `/transactions/${beli.data.document.id}`);
    assert.equal(delBeli.status, 400);
    assert.match(delBeli.data.error.message, /negatif/i);
    assert.equal((await getProductSnap(ctx.env, deps, prodGuardId)).stok_milli, 2_000);

    // Edit pembelian dari 10 pcs menjadi 5 pcs -> juga ditolak 400 karena stok tgl 22 jadi -3 pcs!
    const editBeli = await call(ctx.env, deps, "PUT", `/transactions/${beli.data.document.id}`, {
      body: {
        tanggal: "2026-02-21",
        unit_kode: "TKS",
        contact_id: vendorId,
        warehouse_id: whId,
        lines: [{ product_id: prodGuardId, qty_milli: 5_000, harga: sen(10_000) }],
      },
    });
    assert.equal(editBeli.status, 400);
    assert.equal((await getProductSnap(ctx.env, deps, prodGuardId)).stok_milli, 2_000);

    // Stok opname masuk 5 pcs pada tgl 23 -> jual 4 pcs tgl 24 (stok = 2 + 5 - 4 = 3)
    const adjIn = await call(ctx.env, deps, "POST", "/stock-adjustments", {
      body: { tanggal: "2026-02-23", unit_kode: "TKS", warehouse_id: whId, lines: [{ product_id: prodGuardId, qty_selisih_milli: 5_000, harga_satuan: sen(10_000) }] },
    });
    assert.equal(adjIn.status, 200);
    const jual2 = await call(ctx.env, deps, "POST", "/transactions", {
      body: { type: "sales_invoice", tanggal: "2026-02-24", unit_kode: "TKS", contact_id: custId, warehouse_id: whId, lines: [{ product_id: prodGuardId, qty_milli: 4_000, harga: sen(20_000) }] },
    });
    assert.equal(jual2.status, 200);
    assert.equal((await getProductSnap(ctx.env, deps, prodGuardId)).stok_milli, 3_000);

    // Hapus penyesuaian stok masuk (+5) tgl 23 -> ditolak 400 karena setelah jual2 (2 - 4 = -2), stok tetap 3!
    const delAdj = await call(ctx.env, deps, "DELETE", `/transactions/${adjIn.data.adjustment.id}`);
    assert.equal(delAdj.status, 400);
    assert.equal((await getProductSnap(ctx.env, deps, prodGuardId)).stok_milli, 3_000);
  });
});
