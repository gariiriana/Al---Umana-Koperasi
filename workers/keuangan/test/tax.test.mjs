// Skenario 5: Pajak (PPN 12% pengali 11/12 + PPh 23, pajak grup majemuk vs tidak, dan harga termasuk PPN 11%).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { calculateLineTaxes } from "../src/lib/tax.js";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Skenario 5: Mesin Pajak & Integrasi Dokumen", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", {
      body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" },
    });
  });
  after(async () => {
    await ctx.dispose();
  });

  it("Rp100.000 dengan PPN 12% pengali 11/12 dan PPh 23 2% menghasilkan total 109.000", () => {
    const ppn12 = { id: "ppn12", nama: "PPN 12%", tipe: "satu", persen_bp: 1200, pengali_11_12: 1, pemotongan: 0, akun_jual: "2-20500", akun_beli: "1-10500" };
    const pph23 = { id: "pph23", nama: "PPh 23 2%", tipe: "satu", persen_bp: 200, pengali_11_12: 0, pemotongan: 1, akun_jual: "1-10502", akun_beli: "2-20502" };
    const res = calculateLineTaxes({ rawAmount: sen(100_000), taxes: [ppn12, pph23], hargaTermasukPajak: false });
    assert.equal(res.dpp, sen(100_000));
    assert.equal(res.dppNilaiLain, 9_166_667); // 91.666,67
    assert.equal(res.taxTotal, sen(9_000)); // +11.000 - 2.000
    assert.equal(res.dpp + res.taxTotal, sen(109_000));
  });

  it("Rp100.000 dengan Service 5% lalu PB1 10% majemuk = 115.500, tanpa majemuk = 115.000", async () => {
    const svc = await call(ctx.env, deps, "POST", "/taxes", {
      body: { nama: "Service 5%", tipe: "satu", persen_bp: 500, akun_jual: "2-20500", akun_beli: "1-10500" },
    });
    const pb1 = await call(ctx.env, deps, "POST", "/taxes", {
      body: { nama: "PB1 10%", tipe: "satu", persen_bp: 1000, akun_jual: "2-20500", akun_beli: "1-10500" },
    });
    assert.equal(svc.status, 200);
    assert.equal(pb1.status, 200);

    const grupMajemuk = await call(ctx.env, deps, "POST", "/taxes", {
      body: { nama: "Service + PB1 Majemuk", tipe: "grup", item_ids: [svc.data.tax.id, pb1.data.tax.id], majemuk: true },
    });
    const grupBiasa = await call(ctx.env, deps, "POST", "/taxes", {
      body: { nama: "Service + PB1 Non-Majemuk", tipe: "grup", item_ids: [svc.data.tax.id, pb1.data.tax.id], majemuk: false },
    });
    assert.equal(grupMajemuk.status, 200);
    assert.equal(grupBiasa.status, 200);

    const doc1 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", deskripsi: "Majemuk", jumlah: sen(100_000), tax_id: grupMajemuk.data.tax.id }],
      },
    });
    assert.equal(doc1.status, 200);
    assert.equal(doc1.data.document.total, sen(115_500));

    const doc2 = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", deskripsi: "Biasa", jumlah: sen(100_000), tax_id: grupBiasa.data.tax.id }],
      },
    });
    assert.equal(doc2.status, 200);
    assert.equal(doc2.data.document.total, sen(115_000));
  });

  it("Rp100.000 termasuk PPN 11% menghasilkan DPP 90.090,09 dan PPN 9.909,91", async () => {
    const doc = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-11",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        harga_termasuk_pajak: true,
        lines: [{ account_kode: "4-40000", deskripsi: "Inklusif", jumlah: sen(100_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(doc.status, 200);
    assert.equal(doc.data.document.subtotal, 9_009_009); // 90.090,09
    assert.equal(doc.data.document.pajak, 990_991); // 9.909,91
    assert.equal(doc.data.document.total, sen(100_000));
  });
});
