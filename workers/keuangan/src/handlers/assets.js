// Handler Rilis 3: Aset Tetap, Aset Tertunda, Penyusutan (Garis Lurus & Saldo Menurun), Pelepasan/Penjualan & Tab Laporan Aset.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import {
  allocateDocNumber,
  assertNotLocked,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { buildReversalsForDocumentChange } from "../lib/openingReversal.js";
import { cleanText, invalid, isInt, newId, requireIsoDate, requireUnitKode, todayWib } from "../lib/validate.js";

function addMonthsYm(ym, offset) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + offset, 1));
  return dt.toISOString().slice(0, 7);
}

function generateSchedule(asset) {
  if (asset.non_depresiasi || !asset.masa_bulan || asset.masa_bulan <= 0) return [];
  const startYm = asset.tgl_akuisisi.slice(0, 7);
  const depreciable = Math.max(0, (asset.biaya || 0) - (asset.akum_awal || 0));
  if (depreciable === 0) return [];

  const rows = [];
  if (asset.metode === "saldo_menurun") {
    const rateBp = asset.tarif_bp > 0 ? asset.tarif_bp : Math.round((2 * 12 * 10_000) / asset.masa_bulan);
    let rem = depreciable;
    for (let i = 0; i < asset.masa_bulan && rem > 0; i++) {
      const mVal =
        i === asset.masa_bulan - 1
          ? rem
          : Math.min(rem, Math.round((rem * rateBp) / (12 * 10_000)));
      if (mVal > 0) {
        rows.push({ bulan: addMonthsYm(startYm, i), nilai: mVal });
        rem -= mVal;
      }
    }
    return rows;
  }

  // Garis lurus: bagi merata per bulan, sisa pembulatan di bulan terakhir
  const base = Math.floor(depreciable / asset.masa_bulan);
  let acc = 0;
  for (let i = 0; i < asset.masa_bulan; i++) {
    const val = i === asset.masa_bulan - 1 ? depreciable - acc : base;
    acc += val;
    if (val > 0) rows.push({ bulan: addMonthsYm(startYm, i), nilai: val });
  }
  return rows;
}

export async function listAssets(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const status = ctx.url.searchParams.get("status") || "";
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const conds = [];
  const params = [];
  if (status) {
    conds.push("a.status = ?");
    params.push(status);
  }
  if (unitKode) {
    conds.push("a.unit_kode = ?");
    params.push(unitKode);
  }

  const { results } = await db
    .prepare(
      `SELECT a.*, acc.nama AS akun_aset_nama,
              IFNULL((SELECT SUM(ds.nilai) FROM depreciation_schedule ds WHERE ds.asset_id = a.id AND ds.document_id IS NOT NULL), 0) AS akum_tercatat
       FROM assets a
       LEFT JOIN accounts acc ON acc.kode = a.akun_aset
       ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
       ORDER BY a.tgl_akuisisi DESC, a.no DESC`,
    )
    .bind(...params)
    .all();

  return {
    assets: results.map((r) => {
      const totalAkum = (r.akum_awal || 0) + (r.akum_tercatat || 0);
      return {
        ...r,
        total_akumulasi: totalAkum,
        nilai_buku: r.status === "dilepas" ? 0 : Math.max(0, r.biaya - totalAkum),
      };
    }),
  };
}

export async function getAsset(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const id = ctx.params[0];
  const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
  if (!asset) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Aset tetap tidak ditemukan.");
  const { results: schedule } = await db
    .prepare("SELECT * FROM depreciation_schedule WHERE asset_id = ? ORDER BY bulan ASC")
    .bind(id)
    .all();
  const applied = schedule.filter((s) => s.document_id).reduce((sum, s) => sum + s.nilai, 0);
  const totalAkum = (asset.akum_awal || 0) + applied;
  return {
    asset: { ...asset, total_akumulasi: totalAkum, nilai_buku: asset.status === "dilepas" ? 0 : Math.max(0, asset.biaya - totalAkum) },
    schedule,
  };
}

export async function createAsset(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const u = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(unitKode).first();
  if (!u) throw invalid("unit_kode", `Anak perusahaan ${unitKode} tidak ditemukan.`);

  const nama = cleanText(body.nama, 200);
  if (!nama) throw invalid("nama", "Nama aset wajib diisi.");
  const tglAkuisisi = requireIsoDate(body.tgl_akuisisi || todayWib(now), "tgl_akuisisi");
  const biaya = Number(body.biaya);
  if (!isInt(biaya, { min: 1 })) throw invalid("biaya", "Biaya perolehan aset wajib > 0.");

  const akunAsetKode = String(body.akun_aset || "1-10701");
  const akunKreditKode = String(body.akun_kredit || "1-10002");
  const [accAset, accKredit] = await Promise.all([
    db.prepare("SELECT * FROM accounts WHERE kode = ? AND is_header = 0").bind(akunAsetKode).first(),
    db.prepare("SELECT * FROM accounts WHERE kode = ? AND is_header = 0").bind(akunKreditKode).first(),
  ]);
  if (!accAset || accAset.kategori !== 5) throw invalid("akun_aset", "Akun aset harus kategori Aset Tetap (5).");
  if (!accKredit) throw invalid("akun_kredit", "Akun pengkredit perolehan aset tidak ditemukan.");

  const nonDepresiasi = body.non_depresiasi ? 1 : 0;
  const metode = body.metode === "saldo_menurun" ? "saldo_menurun" : "garis_lurus";
  const masaBulan = nonDepresiasi ? null : Number(body.masa_bulan || 60);
  const tarifBp = Number(body.tarif_bp || 0) || null;
  const akunBeban = nonDepresiasi ? null : String(body.akun_beban || "6-60303");
  const akunAkumulasi = nonDepresiasi ? null : String(body.akun_akumulasi || "1-10754");
  const akumAwal = Math.max(0, Math.trunc(body.akum_awal || 0));

  const id = newId();
  const allocAsset = await allocateDocNumber(db, "asset_acquire", unitKode, tglAkuisisi, now, actor);
  const no = cleanText(body.no, 60) || allocAsset.no;

  const stmts = [allocAsset.updateStmt];
  let sourceDocId = null;

  // Catat jurnal akuisisi jika aset baru (bukan migrasi saldo historis tanpa jurnal)
  if (!body.tanpa_jurnal_perolehan) {
    await assertNotLocked(db, [tglAkuisisi]);
    sourceDocId = newId();
    const docNo = no;
    const journal = normalizeAndCheckBalance([
      { tanggal: tglAkuisisi, unit_kode: unitKode, account_kode: akunAsetKode, debit: biaya, kredit: 0, keterangan: `Perolehan aset ${nama}` },
      { tanggal: tglAkuisisi, unit_kode: unitKode, account_kode: akunKreditKode, debit: 0, kredit: biaya, keterangan: `Perolehan aset ${nama}` },
    ]);
    stmts.push(
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
           VALUES (?, 'asset_acquire', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(sourceDocId, docNo, tglAkuisisi, unitKode, biaya, biaya, `Perolehan aset ${nama}`, JSON.stringify({ asset_id: id }), now, actor.uid, now, actor.uid),
      ...(await buildJournalAndMonthlyStatements(db, sourceDocId, journal)),
      ...(await buildReversalsForDocumentChange(db, { docId: sourceDocId, oldLines: [], newLines: journal, now, actor })),
    );
  }

  stmts.push(
    db
      .prepare(
        `INSERT INTO assets (id, unit_kode, no, nama, akun_aset, deskripsi, tgl_akuisisi, biaya, akun_kredit, non_depresiasi,
           metode, masa_bulan, tarif_bp, akun_beban, akun_akumulasi, akum_awal, akum_awal_tgl, status, source_document_id,
           created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, unitKode, no, nama, akunAsetKode, cleanText(body.deskripsi, 400), tglAkuisisi, biaya, akunKreditKode,
        nonDepresiasi, nonDepresiasi ? null : metode, masaBulan, tarifBp, akunBeban, akunAkumulasi, akumAwal,
        body.akum_awal_tgl || null, sourceDocId, now, actor.uid, now, actor.uid,
      ),
  );

  const schedule = generateSchedule({ non_depresiasi: nonDepresiasi, tgl_akuisisi: tglAkuisisi, biaya, akum_awal: akumAwal, metode, masa_bulan: masaBulan, tarif_bp: tarifBp });
  for (const s of schedule) {
    stmts.push(
      db.prepare("INSERT INTO depreciation_schedule (asset_id, bulan, nilai, document_id) VALUES (?, ?, ?, NULL)").bind(id, s.bulan, s.nilai),
    );
  }
  stmts.push(buildAuditStatement(db, { entity: "asset", entityId: id, action: "create", after: { no, nama, biaya }, actor, now }));

  await db.batch(stmts);
  return getAsset({ ...ctx, params: [id] });
}

export async function activatePendingAsset(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
  if (!asset || asset.status !== "tertunda") throw invalid("id", "Aset tertunda tidak ditemukan.");

  const body = await readJson(ctx.request);
  const nonDepresiasi = body.non_depresiasi ? 1 : 0;
  const metode = body.metode === "saldo_menurun" ? "saldo_menurun" : "garis_lurus";
  const masaBulan = nonDepresiasi ? null : Number(body.masa_bulan || 60);
  const tarifBp = Number(body.tarif_bp || 0) || null;
  const akunBeban = nonDepresiasi ? null : String(body.akun_beban || "6-60303");
  const akunAkumulasi = nonDepresiasi ? null : String(body.akun_akumulasi || "1-10754");

  const schedule = generateSchedule({ non_depresiasi: nonDepresiasi, tgl_akuisisi: asset.tgl_akuisisi, biaya: asset.biaya, akum_awal: 0, metode, masa_bulan: masaBulan, tarif_bp: tarifBp });
  const stmts = [
    db
      .prepare(
        `UPDATE assets SET non_depresiasi = ?, metode = ?, masa_bulan = ?, tarif_bp = ?, akun_beban = ?, akun_akumulasi = ?,
           status = 'aktif', updated_at = ?, updated_by = ? WHERE id = ?`,
      )
      .bind(nonDepresiasi, nonDepresiasi ? null : metode, masaBulan, tarifBp, akunBeban, akunAkumulasi, now, actor.uid, id),
    db.prepare("DELETE FROM depreciation_schedule WHERE asset_id = ? AND document_id IS NULL").bind(id),
  ];
  for (const s of schedule) {
    stmts.push(db.prepare("INSERT INTO depreciation_schedule (asset_id, bulan, nilai, document_id) VALUES (?, ?, ?, NULL)").bind(id, s.bulan, s.nilai));
  }
  await db.batch(stmts);
  return getAsset({ ...ctx, params: [id] });
}

/**
 * Menerapkan penyusutan aset tetap untuk semua jadwal jatuh tempo s.d. `sampai_bulan` (`YYYY-MM`).
 */
export async function applyDepreciation(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const sampaiBulan = String(body.sampai_bulan || todayWib(now).slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(sampaiBulan)) throw invalid("sampai_bulan", "Format bulan harus YYYY-MM.");

  const assetFilter = body.asset_id ? "AND ds.asset_id = ?" : "";
  const { results: due } = await db
    .prepare(
      `SELECT ds.*, a.unit_kode, a.nama, a.no, a.akun_beban, a.akun_akumulasi
       FROM depreciation_schedule ds
       JOIN assets a ON a.id = ds.asset_id
       WHERE a.status = 'aktif' AND ds.document_id IS NULL AND ds.bulan <= ? ${assetFilter}
       ORDER BY ds.bulan ASC, a.no ASC`,
    )
    .bind(...(body.asset_id ? [sampaiBulan, body.asset_id] : [sampaiBulan]))
    .all();

  if (due.length === 0) return { appliedCount: 0, documents: [] };

  // Kelompokkan per (unit_kode, bulan) agar jurnal rapi dan hemat baris D1
  const groups = new Map();
  for (const r of due) {
    const key = `${r.unit_kode}|${r.bulan}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }

  const createdDocs = [];
  for (const [key, items] of groups.entries()) {
    const [unitKode, bulan] = key.split("|");
    const [yy, mm] = bulan.split("-").map(Number);
    const lastDay = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    await assertNotLocked(db, [lastDay]);

    const docId = newId();
    const alloc = await allocateDocNumber(db, "depreciation", unitKode, lastDay, now, actor);
    let total = 0;
    const journalRaw = [];
    for (const it of items) {
      total += it.nilai;
      journalRaw.push(
        { tanggal: lastDay, unit_kode: unitKode, account_kode: it.akun_beban || "6-60303", debit: it.nilai, kredit: 0, keterangan: `Penyusutan ${it.nama} (${bulan})` },
        { tanggal: lastDay, unit_kode: unitKode, account_kode: it.akun_akumulasi || "1-10754", debit: 0, kredit: it.nilai, keterangan: `Akumulasi penyusutan ${it.nama} (${bulan})` },
      );
    }

    const balanced = normalizeAndCheckBalance(journalRaw);
    const stmts = [
      alloc.updateStmt,
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
           VALUES (?, 'depreciation', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(docId, alloc.no, lastDay, unitKode, total, total, `Penyusutan aset periode ${bulan}`, JSON.stringify({ bulan }), now, actor.uid, now, actor.uid),
      ...(await buildJournalAndMonthlyStatements(db, docId, balanced)),
      ...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: balanced, now, actor })),
    ];

    for (const it of items) {
      stmts.push(
        db
          .prepare("UPDATE depreciation_schedule SET document_id = ?, applied_at = ? WHERE asset_id = ? AND bulan = ?")
          .bind(docId, now, it.asset_id, it.bulan),
      );
    }
    stmts.push(buildAuditStatement(db, { entity: "document", entityId: docId, action: "create", after: { type: "depreciation", no: alloc.no, total }, actor, now }));
    await db.batch(stmts);
    createdDocs.push({ id: docId, no: alloc.no, tanggal: lastDay, total });
  }

  return { appliedCount: due.length, documents: createdDocs };
}

export async function disposeAsset(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const id = ctx.params[0];
  const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
  if (!asset || asset.status !== "aktif") throw invalid("id", "Hanya aset aktif yang dapat dilepas/dijual.");

  const body = await readJson(ctx.request);
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  await assertNotLocked(db, [tanggal]);

  const hargaJual = Math.max(0, Math.trunc(body.harga_jual || 0));
  const setorKe = hargaJual > 0 ? String(body.setor_ke || "1-10002") : null;
  const gainLossKode = String(body.akun_selisih || "8-80002");

  const appliedRow = await db
    .prepare("SELECT IFNULL(SUM(nilai), 0) AS s FROM depreciation_schedule WHERE asset_id = ? AND document_id IS NOT NULL")
    .bind(id)
    .first();
  const totalAkum = (asset.akum_awal || 0) + (appliedRow?.s || 0);
  const nilaiBuku = Math.max(0, asset.biaya - totalAkum);
  const selisih = hargaJual - nilaiBuku; // positif = laba pelepasan (Kredit), negatif = rugi pelepasan (Debit)

  const journalRaw = [];
  if (hargaJual > 0) {
    journalRaw.push({ tanggal, unit_kode: asset.unit_kode, account_kode: setorKe, debit: hargaJual, kredit: 0, keterangan: `Penjualan aset ${asset.nama}` });
  }
  if (totalAkum > 0) {
    journalRaw.push({ tanggal, unit_kode: asset.unit_kode, account_kode: asset.akun_akumulasi || "1-10754", debit: totalAkum, kredit: 0, keterangan: `Hapus akumulasi ${asset.nama}` });
  }
  journalRaw.push({ tanggal, unit_kode: asset.unit_kode, account_kode: asset.akun_aset, debit: 0, kredit: asset.biaya, keterangan: `Pelepasan aset ${asset.nama}` });
  if (selisih !== 0) {
    journalRaw.push({
      tanggal,
      unit_kode: asset.unit_kode,
      account_kode: gainLossKode,
      debit: selisih < 0 ? Math.abs(selisih) : 0,
      kredit: selisih > 0 ? selisih : 0,
      keterangan: `${selisih > 0 ? "Laba" : "Rugi"} pelepasan ${asset.nama}`,
    });
  }

  const balanced = normalizeAndCheckBalance(journalRaw);
  const docId = newId();
  const alloc = await allocateDocNumber(db, "asset_disposal", asset.unit_kode, tanggal, now, actor);

  const stmts = [
    alloc.updateStmt,
    db
      .prepare(
        `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
         VALUES (?, 'asset_disposal', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(docId, alloc.no, tanggal, asset.unit_kode, hargaJual, hargaJual, `Pelepasan aset ${asset.nama}`, JSON.stringify({ asset_id: id, nilai_buku: nilaiBuku, laba_rugi: selisih }), now, actor.uid, now, actor.uid),
    db.prepare("UPDATE assets SET status = 'dilepas', updated_at = ?, updated_by = ? WHERE id = ?").bind(now, actor.uid, id),
    db.prepare("DELETE FROM depreciation_schedule WHERE asset_id = ? AND document_id IS NULL").bind(id),
    ...(await buildJournalAndMonthlyStatements(db, docId, balanced)),
    ...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: balanced, now, actor })),
    buildAuditStatement(db, { entity: "asset", entityId: id, action: "dispose", after: { harga_jual: hargaJual, nilai_buku: nilaiBuku, laba_rugi: selisih }, actor, now }),
  ];
  await db.batch(stmts);
  return { ok: true, doc_id: docId, no: alloc.no, nilai_buku: nilaiBuku, laba_rugi: selisih, journal: balanced };
}

export async function reportAsetDaftar(ctx) {
  return { rows: (await listAssets(ctx)).assets };
}

export async function reportAsetPenyusutan(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT ds.bulan, a.no, a.nama, a.unit_kode, ds.nilai, CASE WHEN ds.document_id IS NOT NULL THEN 'Diterapkan' ELSE 'Terjadwal' END AS status
       FROM depreciation_schedule ds
       JOIN assets a ON a.id = ds.asset_id
       ORDER BY ds.bulan DESC, a.no`,
    )
    .all();
  return { rows: results };
}
