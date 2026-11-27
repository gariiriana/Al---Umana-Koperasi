// Skenario 3: Transfer Antar Unit (4 baris jurnal, neraca per unit seimbang, eliminasi di laporan gabungan).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Skenario 3: Transfer Antar Unit", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "PST", nama: "Pusat" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10020", nama: "BSI PST", kategori: 3, unit_kode: "PST", bank_nama: "BSI" } });

    await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2025-12-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10010", debit: sen(2_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(2_000_000) },
        ],
      },
    });
    await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "PST",
        tanggal: "2025-12-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10020", debit: sen(5_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(5_000_000) },
        ],
      },
    });

    // TKS transfer 500.000 dari Kas TKS ke BSI PST
    const trf = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "transfer_money",
        tanggal: "2026-01-10",
        transfer_dari: "1-10010",
        setor_ke: "1-10020",
        jumlah: sen(500_000),
        memo: "Setoran unit TKS ke Pusat",
      },
    });
    assert.equal(trf.status, 200);
    assert.equal(trf.data.journal.length, 4);
  });

  after(async () => {
    await ctx.dispose();
  });

  it("Neraca per unit seimbang dengan 1-10150/2-20150, sementara Gabungan mengeliminasi antar unit", async () => {
    const nrTks = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nrTks.data.seimbang, true);
    const kasTks = nrTks.data.sections.aset[0].rows.find((r) => r.kode === "1-10010");
    const piutangAu = nrTks.data.sections.aset[0].rows.find((r) => r.kode === "1-10150");
    assert.equal(kasTks.values[0], sen(1_500_000));
    assert.equal(piutangAu.values[0], sen(500_000));

    const nrPst = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=PST");
    assert.equal(nrPst.data.seimbang, true);
    const bsiPst = nrPst.data.sections.aset[0].rows.find((r) => r.kode === "1-10020");
    const hutangAu = nrPst.data.sections.liabilitas[0].rows.find((r) => r.kode === "2-20150");
    assert.equal(bsiPst.values[0], sen(5_500_000));
    assert.equal(hutangAu.values[0], sen(500_000));

    const nrAll = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31");
    assert.equal(nrAll.data.seimbang, true);
    assert.equal(nrAll.data.totals[0].totalAset, sen(7_000_000));
    assert.equal(nrAll.data.sections.aset[0].rows.some((r) => r.kode === "1-10150"), false);
    assert.equal(nrAll.data.sections.liabilitas[0].rows.some((r) => r.kode === "2-20150"), false);
  });

  it("Arus Kas TKS menampilkan Transfer antar unit -500.000 di pendanaan; Arus Kas gabungan bersih 0", async () => {
    const akTks = await call(ctx.env, deps, "GET", "/reports/arus-kas?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(akTks.data.cocok, true);
    const lineAu = akTks.data.data[0].pendanaan.items.find((i) => i.key === "fin_antar_unit");
    assert.equal(lineAu.nilai, -sen(500_000));

    const akAll = await call(ctx.env, deps, "GET", "/reports/arus-kas?dari=2026-01-01&sampai=2026-01-31");
    assert.equal(akAll.data.cocok, true);
    assert.equal(akAll.data.data[0].pendanaan.items.some((i) => i.key === "fin_antar_unit"), false);
    assert.equal(akAll.data.data[0].kenaikanKas, 0);
    assert.equal(akAll.data.data[0].saldoAkhir, sen(7_000_000));
  });
});
