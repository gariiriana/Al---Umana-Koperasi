// Tes Sisa Rilis 1: Tutup Buku dengan akun_beban_pajak, Template Laporan kustom, dan Bandingkan by Tag/Periode.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

const deps = fakeDeps();

describe("Sisa Rilis 1: Pajak Tutup Buku, Template Laporan & Perbandingan", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
    await call(ctx.env, deps, "PUT", "/opening-balance", {
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
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("Tutup Buku dengan jumlah_pajak menjurnal akun_beban_pajak & akun_hutang_pajak lalu menutup ke Laba Ditahan", async () => {
    // Pendapatan 5jt - Beban 2jt = Laba sebelum pajak 3jt
    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        lines: [{ account_kode: "4-40000", deskripsi: "Penjualan", jumlah: sen(5_000_000) }],
      },
    });
    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-01-12",
        unit_kode: "TKS",
        bayar_dari: "1-10010",
        lines: [{ account_kode: "6-60200", deskripsi: "Gaji", jumlah: sen(2_000_000) }],
      },
    });

    // Tutup buku Jan 2026 dengan beban pajak 300.000 -> Laba setelah pajak = 2.700.000 ke Laba Ditahan
    const tutup = await call(ctx.env, deps, "POST", "/period-closings", {
      body: {
        tipe: "tutup",
        sampai: "2026-01-31",
        akun_laba_ditahan: "3-30100",
        akun_beban_pajak: "9-90000",
        akun_hutang_pajak: "2-20503",
        jumlah_pajak: sen(300_000),
      },
    });
    assert.equal(tutup.status, 200);

    // 1. Laba Rugi Jan menampilkan beban pajak 300.000 & Pendapatan Bersih 2.700.000
    const lr = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lr.data.summary.biayaLainnya, sen(300_000));
    assert.equal(lr.data.summary.pendapatanBersih, sen(2_700_000));

    // 2. Neraca 31 Jan seimbang: Kas 13jt = Modal 10jt + Laba Ditahan 2.7jt + Hutang PPh29 300rb
    const nr = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31&unit_kode=TKS");
    assert.equal(nr.data.seimbang, true);
    assert.equal(nr.data.totals[0].totalAset, sen(13_000_000));
    const ldRow = nr.data.sections.modal.rows.find((r) => r.kode === "3-30100");
    const hpRow = nr.data.sections.liabilitas[0].rows.find((r) => r.kode === "2-20503");
    const pendPeriode = nr.data.sections.modal.rows.find((r) => r.nama === "Pendapatan periode ini");
    assert.equal(ldRow.values[0], sen(2_700_000));
    assert.equal(hpRow.values[0], sen(300_000));
    assert.equal(pendPeriode.values[0], 0);

    // 3. Perubahan Modal: 3-30100 Kredit 2.700.000, labaBelumDitutup 0
    const pm = await call(ctx.env, deps, "GET", "/reports/perubahan-modal?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(pm.data.blocks[0].rows.find((r) => r.kode_akun === "3-30100").kredit, sen(2_700_000));
    assert.equal(pm.data.blocks[0].labaBelumDitutup, 0);

    // 4. Batalkan tutup buku menghapus kedua dokumen (closing & closing_tax)
    const cancel = await call(ctx.env, deps, "POST", `/period-closings/${tutup.data.closing.id}/cancel`, {
      body: { alasan: "Koreksi pajak" },
    });
    assert.equal(cancel.status, 200);
    const lrAfter = await call(ctx.env, deps, "GET", "/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&unit_kode=TKS");
    assert.equal(lrAfter.data.summary.biayaLainnya, 0);
    assert.equal(lrAfter.data.summary.pendapatanBersih, sen(3_000_000));
  });

  it("Template Laba Rugi kustom & perbandingan Tag bekerja akurat", async () => {
    const tagRes = await call(ctx.env, deps, "POST", "/tags", { body: { nama: "Ramadan" } });
    const tagId = tagRes.data.tag.id;

    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-10",
        unit_kode: "TKS",
        setor_ke: "1-10010",
        tags: [tagId],
        lines: [{ account_kode: "4-40000", deskripsi: "Event Ramadan", jumlah: sen(1_200_000) }],
      },
    });
    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "send_money",
        tanggal: "2026-01-11",
        unit_kode: "TKS",
        bayar_dari: "1-10010",
        tags: [tagId],
        lines: [{ account_kode: "6-60200", deskripsi: "Panitia", jumlah: sen(400_000) }],
      },
    });

    const tpl = await call(ctx.env, deps, "POST", "/report-templates", {
      body: {
        laporan: "laba_rugi",
        nama: "Ringkas Kustom",
        config: {
          sections: [
            { id: "s1", nama: "Pemasukan Khusus", tipe: "kategori", accountKodes: ["4-40000"] },
            { id: "s2", nama: "Beban Gaji", tipe: "kategori", accountKodes: ["6-60200"] },
            { id: "s3", nama: "Surplus Kustom", tipe: "rumus", add: ["s1"], sub: ["s2"] },
          ],
        },
      },
    });
    assert.equal(tpl.status, 200);

    const lrTpl = await call(
      ctx.env,
      deps,
      "GET",
      `/reports/laba-rugi?dari=2026-01-01&sampai=2026-01-31&template_id=${tpl.data.template.id}&banding_dengan=tag`,
    );
    assert.equal(lrTpl.status, 200);
    assert.equal(lrTpl.data.columns[0], "#Ramadan");
    assert.equal(lrTpl.data.customSections.find((s) => s.id === "s3").totals[0], sen(800_000));
  });
});
