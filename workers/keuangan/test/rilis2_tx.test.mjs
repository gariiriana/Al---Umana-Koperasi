import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import worker from "../src/worker.js";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Rilis 2 — Siklus Penjualan, Pembelian, Biaya, Gudang, Bundle, Berulang & Laporan", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "PST", nama: "Pusat Yayasan" } });
  });

  after(async () => {
    await ctx.dispose();
  });

  test("stok opname, transfer gudang antar unit, konversi satuan, bundle & laporan Rilis 2", async () => {
    const whTks = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "WH-TKS", nama: "Gudang TKS", unit_kode: "TKS" } })).data.warehouse.id;
    const whPst = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "WH-PST", nama: "Gudang Pusat", unit_kode: "PST" } })).data.warehouse.id;

    const pGula = (
      await call(ctx.env, deps, "POST", "/products", {
        body: {
          nama: "Gula Pasir",
          sku: "GL-01",
          satuan: "kg",
          monitor_stok: 1,
          dibeli: 1,
          harga_beli: sen(15_000),
          dijual: 1,
          harga_jual: sen(18_000),
          batas_min: 5_000,
          units: [{ satuan: "karung", faktor_milli: 25_000, harga_jual: sen(425_000), harga_beli: sen(360_000) }],
        },
      })
    ).data.product.id;

    // Bundle paket 2 kg Gula Pasir
    const pPaket = (
      await call(ctx.env, deps, "POST", "/products", {
        body: {
          nama: "Paket Sembako Gula",
          sku: "PKT-GL",
          satuan: "paket",
          tipe: "bundle",
          monitor_stok: 0,
          dijual: 1,
          harga_jual: sen(35_000),
          bundle_items: [{ product_id: pGula, qty_milli: 2_000 }],
        },
      })
    ).data.product.id;

    // Penyesuaian stok masuk 20 kg @ 15.000 = 300.000
    const adj = await call(ctx.env, deps, "POST", "/stock-adjustments", {
      body: {
        tanggal: "2026-02-01",
        unit_kode: "TKS",
        warehouse_id: whTks,
        account_kode: "8-80100",
        lines: [{ product_id: pGula, qty_selisih_milli: 20_000, harga_satuan: sen(15_000) }],
      },
    });
    assert.equal(adj.status, 200);

    // Transfer 4 kg TKS -> PST -> 4 baris jurnal antar unit (1-10150 & 2-20150), eliminasi di konsolidasi
    const trf = await call(ctx.env, deps, "POST", "/warehouse-transfers", {
      body: {
        tanggal: "2026-02-02",
        dari_warehouse_id: whTks,
        ke_warehouse_id: whPst,
        lines: [{ product_id: pGula, qty_milli: 4_000 }],
      },
    });
    assert.equal(trf.status, 200);
    assert.equal(trf.data.journal.length, 4);
    assert.ok(trf.data.journal.some((j) => j.account_kode === "1-10150" && j.debit === sen(60_000)));
    assert.ok(trf.data.journal.some((j) => j.account_kode === "2-20150" && j.kredit === sen(60_000)));

    const neracaGab = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-05");
    assert.equal(neracaGab.data.seimbang, true);
    assert.equal(neracaGab.data.konsolidasi, true);

    // Penjualan 2 Paket Sembako Gula (diskon bertingkat "10+5") -> potong stok komponen 4 kg Gula @ 15.000 = HPP 60.000
    const cust = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "pelanggan", nama_tampilan: "Koperasi Unit" } })).data.contact.id;
    const saleBundle = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-02-03",
        unit_kode: "TKS",
        contact_id: cust,
        warehouse_id: whTks,
        lines: [{ product_id: pPaket, qty_milli: 2_000, harga: sen(35_000), diskon: "10+5" }],
      },
    });
    assert.equal(saleBundle.status, 200);
    // 2 * 35.000 = 70.000, diskon 10% lalu 5% = 14.5% -> 10.150 -> neto 59.850
    assert.equal(saleBundle.data.document.subtotal, sen(59_850));
    assert.equal(saleBundle.data.stock_moves.length, 1);
    assert.equal(saleBundle.data.stock_moves[0].product_id, pGula);
    assert.equal(saleBundle.data.stock_moves[0].qty_milli, -4_000);
    assert.equal(saleBundle.data.stock_moves[0].nilai, -sen(60_000));

    // Laporan Tab Produk & Tab Penjualan & Beranda
    const rPersediaan = await call(ctx.env, deps, "GET", "/reports/produk/ringkasan-persediaan?dari=2026-02-01&sampai=2026-02-28");
    assert.equal(rPersediaan.status, 200);
    const gRow = rPersediaan.data.rows.find((r) => r.id === pGula);
    assert.equal(gRow.qty_akhir, 16_000); // 20 - 4(trf) + 4(trf) - 4(bundle) = 16 kg total

    const rSalesProd = await call(ctx.env, deps, "GET", "/reports/penjualan/per-produk?dari=2026-02-01&sampai=2026-02-28");
    assert.equal(rSalesProd.status, 200);
    assert.equal(rSalesProd.data.rows.length, 1);

    const beranda = await call(ctx.env, deps, "GET", "/beranda");
    assert.equal(beranda.status, 200);
    assert.equal(beranda.data.kpi.piutang_terbuka, sen(59_850));
  });

  test("siklus order->deposit->delivery->invoice, biaya bayar nanti & recurring", async () => {
    const whTks = (await call(ctx.env, deps, "POST", "/warehouses", { body: { kode: "WH-2", nama: "Gudang 2", unit_kode: "TKS" } })).data.warehouse.id;
    const prod = (
      await call(ctx.env, deps, "POST", "/products", {
        body: { nama: "Seragam Santri", sku: "SRG-1", satuan: "pcs", monitor_stok: 1, dibeli: 1, harga_beli: sen(50_000), dijual: 1, harga_jual: sen(90_000) },
      })
    ).data.product.id;
    const cust = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "pelanggan", nama_tampilan: "Wali Santri" } })).data.contact.id;
    const vendor = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "vendor", nama_tampilan: "Penjahit Mitra" } })).data.contact.id;

    // 1. Purchase delivery -> invoice -> payment
    const po = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_order",
        tanggal: "2026-02-01",
        unit_kode: "TKS",
        contact_id: vendor,
        lines: [{ product_id: prod, qty_milli: 10_000, harga: sen(50_000) }],
      },
    });
    assert.equal(po.data.journal.length, 0);

    const pDel = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_delivery",
        tanggal: "2026-02-02",
        unit_kode: "TKS",
        contact_id: vendor,
        warehouse_id: whTks,
        parent_id: po.data.document.id,
        lines: [{ product_id: prod, qty_milli: 10_000, harga: sen(50_000), source_line_id: po.data.lines[0].id }],
      },
    });
    assert.equal(pDel.status, 200);
    assert.ok(pDel.data.journal.some((j) => j.account_kode === "2-20101" && j.kredit === sen(500_000)));

    const pInv = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "purchase_invoice",
        tanggal: "2026-02-03",
        unit_kode: "TKS",
        contact_id: vendor,
        parent_id: pDel.data.document.id,
        delivery_ids: [pDel.data.document.id],
        lines: [{ product_id: prod, qty_milli: 10_000, harga: sen(50_000), source_line_id: pDel.data.lines[0].id }],
      },
    });
    assert.equal(pInv.status, 200);
    // Tidak menduplikasi stock_moves saat konversi dari purchase_delivery!
    assert.equal(pInv.data.stock_moves.length, 0);
    assert.ok(pInv.data.journal.some((j) => j.account_kode === "2-20101" && j.debit === sen(500_000)));
    assert.ok(pInv.data.journal.some((j) => j.account_kode === "2-20100" && j.kredit === sen(500_000)));

    // 2. Sales Order -> Order Deposit -> Sales Delivery -> Sales Invoice (memakai uang muka!)
    const so = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_order",
        tanggal: "2026-02-04",
        unit_kode: "TKS",
        contact_id: cust,
        lines: [{ product_id: prod, qty_milli: 5_000, harga: sen(90_000) }],
      },
    });
    const dep = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "order_deposit",
        tanggal: "2026-02-04",
        unit_kode: "TKS",
        parent_id: so.data.document.id,
        setor_ke: "1-10002",
        jumlah: sen(150_000),
      },
    });
    assert.equal(dep.status, 200);
    assert.ok(dep.data.journal.some((j) => j.account_kode === "2-20109" && j.kredit === sen(150_000)));

    const sDel = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_delivery",
        tanggal: "2026-02-05",
        unit_kode: "TKS",
        contact_id: cust,
        warehouse_id: whTks,
        parent_id: so.data.document.id,
        lines: [{ product_id: prod, qty_milli: 5_000, harga: sen(90_000), source_line_id: so.data.lines[0].id }],
      },
    });
    assert.equal(sDel.status, 200);
    assert.ok(sDel.data.journal.some((j) => j.account_kode === "5-50000" && j.debit === sen(250_000)));

    const sInv = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-02-06",
        unit_kode: "TKS",
        contact_id: cust,
        parent_id: so.data.document.id,
        delivery_ids: [sDel.data.document.id],
        uang_muka: sen(150_000),
        lines: [{ product_id: prod, qty_milli: 5_000, harga: sen(90_000) }],
      },
    });
    assert.equal(sInv.status, 200);
    assert.equal(sInv.data.document.sisa, sen(300_000)); // 450.000 - 150.000 DP
    assert.ok(sInv.data.journal.some((j) => j.account_kode === "2-20109" && j.debit === sen(150_000)));

    // 3. Biaya bayar nanti -> dilunasi via Kirim Uang (Mode Pengeluaran)
    const exp = await call(ctx.env, deps, "POST", "/transactions", {
      body: {
        type: "expense",
        tanggal: "2026-02-07",
        unit_kode: "TKS",
        contact_id: vendor,
        bayar_nanti: true,
        lines: [{ account_kode: "6-60900", deskripsi: "Listrik Asrama", jumlah: sen(200_000) }],
      },
    });
    assert.equal(exp.status, 200);
    assert.equal(exp.data.document.sisa, sen(200_000));

    const payExp = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-02-08",
        unit_kode: "TKS",
        bayar_dari: "1-10002",
        expense_allocations: [{ document_id: exp.data.document.id, amount: sen(200_000) }],
      },
    });
    assert.equal(payExp.status, 200);
    const expAfter = await call(ctx.env, deps, "GET", `/transactions/${exp.data.document.id}`);
    assert.equal(expAfter.data.document.sisa, 0);
    assert.equal(expAfter.data.document.status, "lunas");

    // 4. Transaksi berulang diproses cron
    const rec = await call(ctx.env, deps, "POST", "/recurring", {
      body: {
        template_document_id: exp.data.document.id,
        interval_n: 1,
        interval_unit: "bulan",
        akhir_tipe: "jumlah",
        akhir_nilai: "2",
        berikut: "2026-02-15",
      },
    });
    assert.equal(rec.status, 200);
    await worker.scheduled({}, ctx.env, null);
    const listExp = await call(ctx.env, deps, "GET", "/transactions?family=expense");
    assert.ok(listExp.data.documents.length >= 2);

    // 5. Guards: hapus pInv yang masih punya link/tidak valid ditolak jika dilindungi, role bukan keuangan 403
    const forbidden = await call(ctx.env, deps, "GET", "/transactions", { token: "super_admin" });
    assert.equal(forbidden.status, 403);

    const neraca = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-28");
    assert.equal(neraca.data.seimbang, true);
  });
});
