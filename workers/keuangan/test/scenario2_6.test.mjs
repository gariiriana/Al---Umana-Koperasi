// Skenario 2 & Skenario 6: 11 transaksi Januari 2026 + Tutup Buku, Kunci Periode, dan Batalkan Tutup Buku.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Skenario 2 & 6: Angka Mockup, Perubahan Modal (Format Jurnal) & Tutup Buku", () => {
  let ctx;
  const deps = fakeDeps();
  let closingId;

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10011", nama: "BSI TKS", kategori: 3, unit_kode: "TKS", bank_nama: "BSI" } });

    // Saldo awal 31 Des 2025: Kas 10jt + BSI 15jt + Peralatan 20jt / Modal Saham 45jt
    await call(ctx.env, deps, "PUT", "/opening-balance", {
      body: {
        unit_kode: "TKS",
        tanggal: "2025-12-31",
        status: "selesai",
        lines: [
          { account_kode: "1-10010", debit: sen(10_000_000), kredit: 0 },
          { account_kode: "1-10011", debit: sen(15_000_000), kredit: 0 },
          { account_kode: "1-10704", debit: sen(20_000_000), kredit: 0 },
          { account_kode: "3-30000", debit: 0, kredit: sen(45_000_000) },
        ],
      },
    });

    // 11 Transaksi Januari 2026:
    const txs = [
      { type: "receive_money", tanggal: "2026-01-02", setor_ke: "1-10011", lines: [{ account_kode: "3-30001", deskripsi: "Tambahan modal", jumlah: sen(5_000_000) }] },
      { type: "receive_money", tanggal: "2026-01-04", setor_ke: "1-10010", lines: [{ account_kode: "4-40000", deskripsi: "Penjualan pagi", jumlah: sen(4_200_000) }] },
      { type: "receive_money", tanggal: "2026-01-06", setor_ke: "1-10010", lines: [{ account_kode: "4-40000", deskripsi: "Penjualan siang", jumlah: sen(3_800_000) }] },
      { type: "receive_money", tanggal: "2026-01-08", setor_ke: "1-10011", lines: [{ account_kode: "4-40000", deskripsi: "Penjualan QRIS", jumlah: sen(2_500_000) }] },
      { type: "send_money", tanggal: "2026-01-10", bayar_dari: "1-10010", lines: [{ account_kode: "5-50000", deskripsi: "Bahan baku", jumlah: sen(3_100_000) }] },
      { type: "send_money", tanggal: "2026-01-12", bayar_dari: "1-10011", lines: [{ account_kode: "5-50000", deskripsi: "Kemasan", jumlah: sen(1_440_000) }] },
      { type: "send_money", tanggal: "2026-01-15", bayar_dari: "1-10011", lines: [{ account_kode: "6-60200", deskripsi: "Gaji", jumlah: sen(2_800_000) }] },
      { type: "send_money", tanggal: "2026-01-18", bayar_dari: "1-10010", lines: [{ account_kode: "6-60202", deskripsi: "Listrik & Air", jumlah: sen(850_000) }] },
      { type: "send_money", tanggal: "2026-01-20", bayar_dari: "1-10010", lines: [{ account_kode: "6-60207", deskripsi: "Transport", jumlah: sen(550_000) }] },
      { type: "send_money", tanggal: "2026-01-22", bayar_dari: "1-10011", lines: [{ account_kode: "1-10705", deskripsi: "Beli kulkas", jumlah: sen(3_500_000) }] },
      { type: "transfer_money", tanggal: "2026-01-25", transfer_dari: "1-10011", setor_ke: "1-10010", jumlah: sen(1_700_000) },
    ];
    for (const body of txs) {
      const res = await call(ctx.env, deps, "POST", "/documents", { body: { ...body, unit_kode: "TKS" } });
      assert.equal(res.status, 200);
    }
  });

  after(async () => {
    await ctx.dispose();
  });

  it("Skenario 2: verifikasi laba bersih, neraca, saldo kas/bank, dan Perubahan Modal (format Jurnal)", async () => {
    const lr = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lr.data.summary.pendapatanBersih, sen(1_760_000));

    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.totals[0].totalAset, sen(51_760_000));
    assert.equal(nr.data.totals[0].totalModal, sen(51_760_000));

    const kb = await call(ctx.env, deps, "GET", "/kas-bank?unit_kode=TKS");
    const kas = kb.data.accounts.find((a) => a.kode === "1-10010");
    const bsi = kb.data.accounts.find((a) => a.kode === "1-10011");
    assert.equal(kas.saldo_jurnal, sen(15_200_000));
    assert.equal(bsi.saldo_jurnal, sen(13_060_000));

    const ak = await call(ctx.env, deps, "GET", "/reports/arus-kas?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(ak.data.cocok, true);
    assert.equal(ak.data.data[0].kenaikanKas, sen(3_260_000));
    assert.equal(ak.data.data[0].saldoAwal, sen(25_000_000));
    assert.equal(ak.data.data[0].saldoAkhir, sen(28_260_000));

    const pm = await call(ctx.env, deps, "GET", "/reports/perubahan-modal?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    const b = pm.data.blocks[0];
    assert.equal(b.rows.find((r) => r.kode_akun === "3-30000").permulaan, sen(45_000_000));
    assert.equal(b.rows.find((r) => r.kode_akun === "3-30001").kredit, sen(5_000_000));
    assert.equal(b.total.saldo_akhir, sen(50_000_000));
    assert.equal(b.pergerakan, sen(5_000_000));
  });

  it("Skenario 6: Tutup Buku 31 Jan 2026 memindahkan laba ke Laba Ditahan, mengunci Januari, dan dapat dibatalkan", async () => {
    const close = await call(ctx.env, deps, "POST", "/period-closings", {
      body: { tipe: "tutup", sampai: "2026-01-31", akun_laba_ditahan: "3-30100", memo: "Tutup buku Jan 2026" },
    });
    assert.equal(close.status, 200);
    closingId = close.data.closing.id;

    // Neraca 31 Jan tetap 51.760.000, Laba Ditahan = 1.760.000, Pendapatan periode ini = 0
    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.totals[0].totalAset, sen(51_760_000));
    const ldRow = nr.data.sections.modal.rows.find((r) => r.kode === "3-30100");
    const pendPeriodeRow = nr.data.sections.modal.rows.find((r) => r.nama === "Pendapatan periode ini");
    assert.equal(ldRow.values[0], sen(1_760_000));
    assert.equal(pendPeriodeRow.values[0], 0);

    // Perubahan Modal Januari: 3-30100 Kredit 1.760.000, Total Saldo Akhir 51.760.000
    const pm = await call(ctx.env, deps, "GET", "/reports/perubahan-modal?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    const b = pm.data.blocks[0];
    assert.equal(b.rows.find((r) => r.kode_akun === "3-30100").kredit, sen(1_760_000));
    assert.equal(b.total.saldo_akhir, sen(51_760_000));
    assert.equal(b.labaBelumDitutup, 0);

    // Laba Rugi Januari TETAP menampilkan 1.760.000
    const lr = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lr.data.summary.pendapatanBersih, sen(1_760_000));

    // Membuat dokumen bertanggal Januari ditolak dengan pesan tepat
    const blocked = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-31",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", jumlah: sen(100_000) }],
      },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.data.error.message, "Periode sampai 31/01/2026 sudah dikunci.");

    // Membatalkan tutup buku menghapus jurnal penutup dan membuka periode lagi
    const cancel = await call(ctx.env, deps, "POST", `/period-closings/${closingId}/cancel`, {
      body: { alasan: "Koreksi input Januari" },
    });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.closing.status, "batal");

    const pmAfter = await call(ctx.env, deps, "GET", "/reports/perubahan-modal?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(pmAfter.data.blocks[0].total.saldo_akhir, sen(50_000_000));
    assert.equal(pmAfter.data.blocks[0].labaBelumDitutup, sen(1_760_000));

    const allowedAgain = await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-31",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", jumlah: sen(100_000) }],
      },
    });
    assert.equal(allowedAgain.status, 200);
  });
});
