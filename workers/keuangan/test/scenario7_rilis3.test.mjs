import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { call, fakeDeps, makeEnv, sen } from "./helpers.mjs";

describe("Rilis 3 — Skenario 7 Aset Tetap, Rekonsiliasi Bank, Anggaran, Approval & Pajak", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
    await call(ctx.env, deps, "POST", "/units", { body: { kode: "TKS", nama: "Toko Santri" } });
    await call(ctx.env, deps, "POST", "/accounts", { body: { kode: "1-10010", nama: "Kas TKS", kategori: 3, unit_kode: "TKS" } });
  });

  after(async () => {
    await ctx.dispose();
  });

  test("Skenario 7 exact: Laptop 6jt, 60 bln garis lurus -> 100rb/bln -> 12 bln nilai buku 4.8jt -> dijual 5jt = laba 200rb", async () => {
    // Modal awal Rp 10.000.000 di 1-10010
    await call(ctx.env, deps, "POST", "/documents", {
      body: {
        type: "receive_money",
        tanggal: "2026-01-01",
        setor_ke: "1-10010",
        lines: [{ account_kode: "3-30000", deskripsi: "Modal", jumlah: sen(10_000_000) }],
      },
    });

    // 1. Akuisisi Laptop Rp 6.000.000 tgl 2026-01-01, garis lurus 60 bulan
    const created = await call(ctx.env, deps, "POST", "/assets", {
      body: {
        unit_kode: "TKS",
        nama: "Laptop Kantor",
        tgl_akuisisi: "2026-01-01",
        biaya: sen(6_000_000),
        akun_aset: "1-10704",
        akun_kredit: "1-10010",
        metode: "garis_lurus",
        masa_bulan: 60,
        akun_beban: "6-60303",
        akun_akumulasi: "1-10754",
      },
    });
    assert.equal(created.status, 200);
    const assetId = created.data.asset.id;
    assert.equal(created.data.schedule.length, 60);
    assert.equal(created.data.schedule[0].nilai, sen(100_000)); // 6.000.000 / 60 = 100.000/bulan

    // 2. Terapkan penyusutan 12 bulan (2026-01 .. 2026-12) -> total akumulasi = 1.200.000, nilai buku = 4.800.000
    const dep = await call(ctx.env, deps, "POST", "/assets/depreciate", {
      body: { sampai_bulan: "2026-12", asset_id: assetId },
    });
    assert.equal(dep.status, 200);
    assert.equal(dep.data.appliedCount, 12);

    const detailMid = await call(ctx.env, deps, "GET", `/assets/${assetId}`);
    assert.equal(detailMid.data.asset.total_akumulasi, sen(1_200_000));
    assert.equal(detailMid.data.asset.nilai_buku, sen(4_800_000));

    // 3. Dijual 2027-01-01 seharga Rp 5.000.000 -> laba pelepasan Rp 200.000 (Kredit 8-80002)
    const disp = await call(ctx.env, deps, "POST", `/assets/${assetId}/dispose`, {
      body: { tanggal: "2027-01-01", harga_jual: sen(5_000_000), setor_ke: "1-10010", akun_selisih: "8-80002" },
    });
    assert.equal(disp.status, 200);
    assert.equal(disp.data.nilai_buku, sen(4_800_000));
    assert.equal(disp.data.laba_rugi, sen(200_000));
    assert.ok(disp.data.journal.some((j) => j.account_kode === "8-80002" && j.kredit === sen(200_000)));

    const neraca = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2027-01-31");
    assert.equal(neraca.data.seimbang, true);
  });

  test("Rekonsiliasi bank (impor CSV, aturan otomatis, blokir edit dokumen cocok), Anggaran, Approval & Laporan Pajak", async () => {
    const cust = (await call(ctx.env, deps, "POST", "/contacts", { body: { tipe: "pelanggan", nama_tampilan: "Mitra A", npwp: "01.234.567.8-999.000" } })).data.contact.id;

    // 1. Impor mutasi bank CSV + cegah duplikat
    const csv = "Tanggal,Keterangan,Masuk,Keluar\n2026-02-05,Bunga Giro Feb,25000,0\n2026-02-06,Biaya Admin Bank,0,10000\n";
    const imp1 = await call(ctx.env, deps, "POST", "/bank-statements/import", {
      body: { account_kode: "1-10010", preset: "jurnal", csv },
    });
    assert.equal(imp1.status, 200);
    assert.equal(imp1.data.inserted, 2);

    const impDup = await call(ctx.env, deps, "POST", "/bank-statements/import", {
      body: { account_kode: "1-10010", preset: "jurnal", csv },
    });
    assert.equal(impDup.data.inserted, 0);
    assert.equal(impDup.data.skippedDuplicate, 2);

    // 2. Aturan rekonsiliasi otomatis -> buat transaksi Biaya Admin Bank otomatis
    await call(ctx.env, deps, "POST", "/recon-rules", {
      body: {
        nama: "Auto Biaya Admin",
        account_kode: "1-10010",
        arah: "keluar",
        kondisi: { mengandung: "biaya admin" },
        aksi: { buat_transaksi: true, account_kode: "8-80001", unit_kode: "TKS" },
      },
    });
    const appliedRules = await call(ctx.env, deps, "POST", "/recon-rules/apply", { body: {} });
    assert.equal(appliedRules.data.matchedCount, 1);

    // 3. Cocokkan mutasi kedua via create-tx & cek dokumen cocok tidak boleh diubah/dihapus
    const stList = (await call(ctx.env, deps, "GET", "/bank-statements?account_kode=1-10010")).data.statements;
    const matchedSt = stList.find((s) => s.matched === 1);
    const editMatchedDoc = await call(ctx.env, deps, "DELETE", `/documents/${matchedSt.matched_doc_id}`);
    assert.equal(editMatchedDoc.status, 400);

    // 4. Anggaran & Anggaran Laba Rugi
    const bud = await call(ctx.env, deps, "POST", "/budgets", {
      body: {
        nama: "RAPB TKS 2026",
        unit_kode: "TKS",
        mulai: "2026-01",
        jumlah_periode: 3,
        lines: [{ account_kode: "8-80001", bulan: "2026-02", nilai: sen(50_000) }],
      },
    });
    assert.equal(bud.status, 200);
    const alr = await call(ctx.env, deps, "GET", `/reports/anggaran-laba-rugi?budget_id=${bud.data.budget.id}`);
    assert.equal(alr.status, 200);
    const admRow = alr.data.rows.find((r) => r.kode === "8-80001");
    assert.equal(admRow.anggaran, sen(50_000));
    assert.equal(admRow.aktual, sen(10_000)); // dari biaya admin bank di atas!

    // 5. Approval default MATI -> aktifkan aturan 2 tahap (Tahap 1: semua [keuangan2, keuangan3]; Tahap 2: cukup satu [keuangan4])
    const multiDeps = fakeDeps({
      getUserProfile: async (uid) => {
        const profiles = {
          keuangan1: { role: "keuangan", name: "Pembuat" },
          keuangan2: { role: "keuangan", name: "Penyetuju 1A" },
          keuangan3: { role: "keuangan", name: "Penyetuju 1B" },
          keuangan4: { role: "keuangan", name: "Penyetuju 2" },
        };
        return profiles[uid] ?? null;
      },
    });

    // Penolakan > 4 tahap
    const badRule = await call(ctx.env, multiDeps, "POST", "/approval-rules", {
      body: {
        tipe: "sales_invoice",
        tahap: [
          { approver_uids: ["keuangan2"] },
          { approver_uids: ["keuangan2"] },
          { approver_uids: ["keuangan2"] },
          { approver_uids: ["keuangan2"] },
          { approver_uids: ["keuangan2"] },
        ],
      },
    });
    assert.equal(badRule.status, 400);

    await call(ctx.env, multiDeps, "POST", "/approval-rules", {
      body: {
        tipe: "sales_invoice",
        kriteria: { unit_kode: "TKS", min_total: sen(50_000) },
        tahap: [
          { nama: "Verifikasi Akunting", tipe: "semua", approver_uids: ["keuangan2", "keuangan3"] },
          { nama: "Persetujuan Bendahara", tipe: "satu", approver_uids: ["keuangan4"] },
        ],
      },
    });
    const sRes = await call(ctx.env, multiDeps, "GET", "/settings");
    const curCompany = sRes.data.settings.perusahaan;
    await call(ctx.env, multiDeps, "PUT", "/settings", { body: { perusahaan: { ...curCompany, approval_aktif: true } } });

    // Security test: request body mengirim is_executing_approval: true saat approval aktif -> TETAP harus "pending"!
    const pendingInv = await call(ctx.env, multiDeps, "POST", "/transactions", {
      body: {
        type: "sales_invoice",
        tanggal: "2026-02-10",
        unit_kode: "TKS",
        contact_id: cust,
        no_faktur_pajak: "010.000-26.00000001",
        is_executing_approval: true,
        forceApproved: true,
        lines: [{ deskripsi: "Jasa Konsultasi", qty_milli: 1_000, harga: sen(100_000), tax_id: "tax_ppn_11" }],
      },
    });
    assert.equal(pendingInv.status, 200);
    assert.equal(pendingInv.data.document.approval_state, "pending");
    assert.equal(pendingInv.data.journal.length, 0);

    // Pembuat (keuangan1) menyetujui dokumennya sendiri -> DITOLAK 403
    const selfApr = await call(ctx.env, multiDeps, "POST", `/approvals/${pendingInv.data.document.id}/decide`, {
      token: "keuangan1",
      body: { keputusan: "approve" },
    });
    assert.equal(selfApr.status, 403);

    // User tahap 2 (keuangan4) mencoba approve saat masih tahap 1 -> DITOLAK 403
    const wrongStage = await call(ctx.env, multiDeps, "POST", `/approvals/${pendingInv.data.document.id}/decide`, {
      token: "keuangan4",
      body: { keputusan: "approve" },
    });
    assert.equal(wrongStage.status, 403);

    // Tahap 1 butuh SEMUA: keuangan2 setuju -> masih pending di tahap 1
    const v1a = await call(ctx.env, multiDeps, "POST", `/approvals/${pendingInv.data.document.id}/decide`, {
      token: "keuangan2",
      body: { keputusan: "approve" },
    });
    assert.equal(v1a.status, 200);
    assert.equal(v1a.data.approval_state, "pending");
    assert.equal(v1a.data.current_stage, 1);

    // keuangan3 setuju -> tahap 1 selesai, lanjut tahap 2 (dokumen tetap pending & belum terposting)
    const v1b = await call(ctx.env, multiDeps, "POST", `/approvals/${pendingInv.data.document.id}/decide`, {
      token: "keuangan3",
      body: { keputusan: "approve" },
    });
    assert.equal(v1b.status, 200);
    assert.equal(v1b.data.approval_state, "pending");
    assert.equal(v1b.data.current_stage, 2);

    // Tahap 2 (tahap akhir): keuangan4 setuju -> barulah dokumen terbit & jurnal diposting!
    const dec = await call(ctx.env, multiDeps, "POST", `/approvals/${pendingInv.data.document.id}/decide`, {
      token: "keuangan4",
      body: { keputusan: "approve", alasan: "Disetujui" },
    });
    assert.equal(dec.status, 200);
    assert.equal(dec.data.document.approval_state, "approved");
    assert.ok(dec.data.journal.length >= 3);

    // 6. Laporan Pajak Penjualan
    const taxRep = await call(ctx.env, deps, "GET", "/reports/pajak/faktur?dari=2026-02-01&sampai=2026-02-28&jenis=penjualan");
    assert.equal(taxRep.status, 200);
    assert.equal(taxRep.data.rows.length, 1);
    assert.equal(taxRep.data.rows[0].pajak, sen(11_000));

    // Role guard check
    assert.equal((await call(ctx.env, deps, "GET", "/assets", { token: "super_admin" })).status, 403);
  });
});
