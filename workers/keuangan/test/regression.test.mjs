// Regresi hasil review Rilis 1: Tutup Buku setelah Kunci Periode, pembalik Saldo Awal untuk transaksi
// yang dibuat belakangan, filter unit laporan (SQL), dan memo internal di tautan publik.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

const deps = fakeDeps();

const pnlBalance = async (db, sampai) =>
  (
    await db
      .prepare(
        `SELECT COALESCE(SUM(jl.kredit - jl.debit), 0) AS s FROM journal_lines jl
         JOIN accounts a ON a.kode = jl.account_kode WHERE a.kategori BETWEEN 13 AND 17 AND jl.tanggal <= ?`,
      )
      .bind(sampai)
      .first()
  ).s;

const kasBalance = async (db, sampai) =>
  (await db.prepare("SELECT COALESCE(SUM(debit - kredit), 0) AS s FROM journal_lines WHERE account_kode = '1-10010' AND tanggal <= ?").bind(sampai).first()).s;

const terima = (tanggal, jumlah) => ({
  type: "receive_money",
  tanggal,
  unit_kode: "TKS",
  setor_ke: "1-10010",
  memo: "Catatan internal",
  lines: [{ account_kode: "4-40000", deskripsi: "Penjualan", jumlah }],
});

describe("Regresi review Rilis 1", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
  });
  afterEach(async () => {
    await ctx.dispose();
  });

  it("Tutup Buku setelah Kunci Periode ikut menutup laba bulan yang hanya dikunci", async () => {
    await call(ctx.env, deps, "POST", "/documents", { body: terima("2026-01-10", sen(1_000_000)) });
    const kunci = await call(ctx.env, deps, "POST", "/period-closings", { body: { tipe: "kunci", sampai: "2026-01-31" } });
    assert.equal(kunci.status, 200);
    await call(ctx.env, deps, "POST", "/documents", { body: terima("2026-02-05", sen(500_000)) });

    const tutup = await call(ctx.env, deps, "POST", "/period-closings", {
      body: { tipe: "tutup", sampai: "2026-02-14", akun_laba_ditahan: "3-30100" },
    });
    assert.equal(tutup.status, 200);
    assert.equal(await pnlBalance(ctx.env.DB, "2026-02-14"), 0);

    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-14&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.sections.modal.rows.find((r) => r.kode === "3-30100").values[0], sen(1_500_000));

    // Tutup buku kedua tidak menutup ulang laba yang sudah ditutup
    const preview = await call(ctx.env, deps, "GET", "/period-closings/preview?sampai=2026-02-15");
    assert.equal(preview.data.netProfit, 0);
  });

  it("Transaksi sebelum tanggal konversi yang dibuat/diubah/dihapus setelah Saldo Awal tetap dibalik otomatis", async () => {
    const ob = await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2026-01-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10010", debit: sen(10_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(10_000_000) },
        ],
      },
    });
    assert.equal(ob.status, 200);

    const d = await call(ctx.env, deps, "POST", "/documents", { body: terima("2026-01-10", sen(1_000_000)) });
    assert.equal(d.status, 200);
    assert.equal(await kasBalance(ctx.env.DB, "2026-01-31"), sen(10_000_000));
    assert.equal(await kasBalance(ctx.env.DB, "2026-01-30"), sen(1_000_000));

    const docId = d.data.document.id;
    const upd = await call(ctx.env, deps, "PUT", `/documents/${docId}`, { body: terima("2026-01-12", sen(2_500_000)) });
    assert.equal(upd.status, 200);
    assert.equal(await kasBalance(ctx.env.DB, "2026-01-31"), sen(10_000_000));

    // Dipindah ke setelah tanggal konversi: pembalik hilang, transaksi menambah kas
    const moved = await call(ctx.env, deps, "PUT", `/documents/${docId}`, { body: terima("2026-02-02", sen(2_500_000)) });
    assert.equal(moved.status, 200);
    assert.equal(await kasBalance(ctx.env.DB, "2026-01-31"), sen(10_000_000));
    assert.equal(await kasBalance(ctx.env.DB, "2026-02-02"), sen(12_500_000));
    const rev = await ctx.env.DB.prepare("SELECT id FROM documents WHERE id = 'obrev_TKS'").first();
    assert.equal(rev, null);

    const d2 = await call(ctx.env, deps, "POST", "/documents", { body: terima("2026-01-05", sen(700_000)) });
    const del = await call(ctx.env, deps, "DELETE", `/documents/${d2.data.document.id}`);
    assert.equal(del.status, 200);
    assert.equal(await kasBalance(ctx.env.DB, "2026-01-31"), sen(10_000_000));
    assert.equal(await ctx.env.DB.prepare("SELECT id FROM documents WHERE id = 'obrev_TKS'").first(), null);

    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
  });

  it("Filter unit laporan menolak kode tidak valid (tidak disisipkan ke SQL)", async () => {
    const bad = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-14&unit_kode=TKS'");
    assert.equal(bad.status, 400);
    const bad2 = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-02-14&unit_kode=TKS%27))--");
    assert.equal(bad2.status, 400);
    const ok = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-02-14&unit_kode=TKS");
    assert.equal(ok.status, 200);
  });

  it("Tautan publik tidak memuat memo internal", async () => {
    const d = await call(ctx.env, deps, "POST", "/documents", { body: terima("2026-02-05", sen(500_000)) });
    const link = await call(ctx.env, deps, "POST", "/public-links", { body: { document_id: d.data.document.id } });
    assert.equal(link.status, 200);
    const pub = await call(ctx.env, deps, "GET", `/public/${link.data.link.token}`, { token: null });
    assert.equal(pub.status, 200);
    assert.equal("memo" in pub.data.document, false);
    assert.equal("data_json" in pub.data.document, false);
  });
});
