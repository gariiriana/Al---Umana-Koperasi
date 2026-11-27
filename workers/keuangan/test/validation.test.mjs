// Tes validasi keras di Worker Keuangan: keseimbangan per unit, akun sistem, kas/bank terikat unit, lampiran, dan saldo awal.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Validasi & Aturan Akuntansi Worker Keuangan", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "PST", nama: "Pusat" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
  });
  after(async () => {
    await ctx.dispose();
  });

  it("menolak Jurnal Umum jika total seimbang tetapi tidak seimbang per anak perusahaan", async () => {
    const res = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "journal",
        tanggal: "2026-01-10",
        lines: [
          { account_kode: "6-60200", unit_kode: "TKS", debit: sen(100_000), kredit: 0 },
          { account_kode: "1-10001", unit_kode: "PST", debit: 0, kredit: sen(100_000) },
        ],
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, "TIDAK_SEIMBANG");
  });

  it("menolak pemilihan manual akun antar unit 1-10150 / 2-20150", async () => {
    const res = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "1-10150", jumlah: sen(50_000) }],
      },
    });
    assert.equal(res.status, 400);
  });

  it("menolak akun Kas & Bank sebagai akun lawan Terima/Kirim Uang (harus Transfer)", async () => {
    const res = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        bayar_dari: "1-10010",
        lines: [{ account_kode: "1-10002", jumlah: sen(50_000) }],
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error.message, /Transfer Uang/i);
  });

  it("menolak akun kas milik unit TKS dipakai oleh dokumen unit PST", async () => {
    const res = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "PST",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", jumlah: sen(50_000) }],
      },
    });
    assert.equal(res.status, 400);
  });

  it("Saldo Awal dengan selisih otomatis menyeimbangkan ke 3-30999 Ekuitas Saldo Awal dan membuat reversal untuk transaksi sebelumnya", async () => {
    // Transaksi historis sebelum tanggal konversi
    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2025-12-01",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", jumlah: sen(300_000) }],
      },
    });

    // Terbitkan Saldo Awal per 2025-12-31 hanya Kas TKS 1.000.000 (selisih masuk Ekuitas Saldo Awal)
    const ob = await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2025-12-31",
        status: "selesai",
        lines: [{ account_kode: "1-10010", debit: sen(1_000_000), kredit: 0 }],
      },
    });
    assert.equal(ob.status, 200);

    // Neraca per 2025-12-31 harus menunjukkan Kas TKS pas 1.000.000 dan tetap seimbang (karena transaksi 2025-12-01 dibalik)
    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2025-12-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    const kasRow = nr.data.sections.aset[0].rows.find((r) => r.kode === "1-10010");
    assert.equal(kasRow.values[0], sen(1_000_000));
  });

  it("Lampiran menolak file di atas batas ukuran (>80 KB foto / >300 KB PDF)", async () => {
    const big = Buffer.alloc(90 * 1024, 65).toString("base64");
    const res = await call(ctx.env, deps, "POST", "/attachments", {
      body: { filename: "nota.jpg", mime: "image/jpeg", data_base64: big },
    });
    assert.equal(res.status, 400);

    const small = Buffer.alloc(1024, 65).toString("base64");
    const ok = await call(ctx.env, deps, "POST", "/attachments", {
      body: { filename: "nota.jpg", mime: "image/jpeg", data_base64: small },
    });
    assert.equal(ok.status, 200);
    const dl = await call(ctx.env, deps, "GET", `/attachments/${ok.data.attachment.id}`);
    assert.equal(dl.status, 200);
  });
});
