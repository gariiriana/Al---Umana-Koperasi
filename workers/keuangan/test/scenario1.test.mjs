// Skenario 1: Kas & Bank, BKU, Laba Rugi, Neraca, Perubahan Modal, Arus Kas (Langsung & Tidak Langsung), Hapus & Audit Log.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Skenario 1: Kas & Bank dan Semua Laporan Inti (Rilis 1)", () => {
  let ctx;
  const deps = fakeDeps();
  let doc2Id;

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10011", nama: "BSI TKS", kategori: 3, unit_kode: "TKS", bank_nama: "BSI" } });

    // Saldo awal 31 Des 2025: Kas 10.000.000 / Modal Saham 10.000.000
    const ob = await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2025-12-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10010", debit: sen(10_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(10_000_000) },
        ],
      },
    });
    assert.equal(ob.status, 200);

    // 1. Penjualan tunai 5.000.000
    const d1 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-05",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        memo: "Penjualan tunai",
        lines: [{ account_kode: "4-40000", deskripsi: "Penjualan", jumlah: sen(5_000_000) }],
      },
    });
    assert.equal(d1.status, 200);

    // 2. Gaji 2.000.000
    const d2 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        bayar_dari: "1-10010",
        memo: "Gaji",
        lines: [{ account_kode: "6-60200", deskripsi: "Gaji pegawai", jumlah: sen(2_000_000) }],
      },
    });
    assert.equal(d2.status, 200);
    doc2Id = d2.data.document.id;

    // 3. Beli etalase 3.000.000
    const d3 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-01-15",
        unit_kode: "TKS",
        bayar_dari: "1-10010",
        memo: "Beli etalase",
        lines: [{ account_kode: "1-10704", deskripsi: "Etalase", jumlah: sen(3_000_000) }],
      },
    });
    assert.equal(d3.status, 200);

    // 4. Setor ke bank 1.000.000
    const d4 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "transfer_money",
        tanggal: "2026-01-20",
        transfer_dari: "1-10010",
        setor_ke: "1-10011",
        jumlah: sen(1_000_000),
        memo: "Setor ke bank",
      },
    });
    assert.equal(d4.status, 200);
  });

  after(async () => {
    await ctx.dispose();
  });

  it("memenuhi angka Laba Rugi, Neraca, Perubahan Modal, Arus Kas (Langsung & Tidak Langsung), dan BKU", async () => {
    const lr = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lr.data.summary.pendapatan, sen(5_000_000));
    assert.equal(lr.data.summary.biayaOperasional, sen(2_000_000));
    assert.equal(lr.data.summary.pendapatanBersih, sen(3_000_000));

    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.totals[0].totalAset, sen(13_000_000));
    assert.equal(nr.data.totals[0].totalModal, sen(13_000_000));

    const pm = await call(ctx.env, deps, "GET", "/reports/perubahan-modal?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    const rowModal = pm.data.blocks[0].rows.find((r) => r.kode_akun === "3-30000");
    assert.equal(rowModal.permulaan, sen(10_000_000));
    assert.equal(rowModal.saldo_akhir, sen(10_000_000));
    assert.equal(pm.data.blocks[0].pergerakan, 0);
    assert.match(pm.data.blocks[0].catatan, /3\.000\.000.*belum ditutup buku/i);

    const akDirect = await call(ctx.env, deps, "GET", "/reports/arus-kas?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS&metode=langsung");
    assert.equal(akDirect.data.cocok, true);
    assert.equal(akDirect.data.data[0].operasional.total, sen(3_000_000));
    assert.equal(akDirect.data.data[0].investasi.total, -sen(3_000_000));
    assert.equal(akDirect.data.data[0].pendanaan.total, 0);
    assert.equal(akDirect.data.data[0].kenaikanKas, 0);
    assert.equal(akDirect.data.data[0].saldoAkhir, sen(10_000_000));

    const akIndirect = await call(ctx.env, deps, "GET", "/reports/arus-kas?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS&metode=tidak_langsung");
    assert.equal(akIndirect.data.cocok, true);
    assert.equal(akIndirect.data.data[0].operasional.total, sen(3_000_000));
    assert.equal(akIndirect.data.data[0].saldoAkhir, sen(10_000_000));

    const bku = await call(ctx.env, deps, "GET", "/kas-bank/1-10010/bku?dari=2026-01-01&sampai=2026-01-31");
    assert.equal(bku.data.ringkasan.saldoAwal, sen(10_000_000));
    assert.deepEqual(
      bku.data.rows.map((r) => r.saldo),
      [sen(15_000_000), sen(13_000_000), sen(10_000_000), sen(9_000_000)],
    );

    const ns = await call(ctx.env, deps, "GET", "/reports/neraca-saldo?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(ns.data.totals.awal_debit, ns.data.totals.awal_kredit);
    assert.equal(ns.data.totals.gerak_debit, ns.data.totals.gerak_kredit);
    assert.equal(ns.data.totals.akhir_debit, ns.data.totals.akhir_kredit);
  });

  it("menghapus dokumen #2 memperbarui semua laporan dan mencatat audit log", async () => {
    const del = await call(ctx.env, deps, "DELETE", `/documents/${doc2Id}`);
    assert.equal(del.status, 200);

    const lr = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lr.data.summary.pendapatanBersih, sen(5_000_000));

    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.totals[0].totalAset, sen(15_000_000));

    const audit = await call(ctx.env, deps, "GET", `/audit?entity=document&entity_id=${doc2Id}`);
    assert.ok(audit.data.logs.some((l) => l.action === "delete"));
  });
});
