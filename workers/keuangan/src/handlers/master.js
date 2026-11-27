// Handler master data Rilis 1: Anak Perusahaan, Daftar Akun (COA), Pemetaan Akun, Kontak, Tag, Pajak, Syarat & Cara Bayar, Penomoran, Pengaturan, Audit.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { applyDefaultSeed, ensureSeeded } from "../lib/seed.js";
import { ACCOUNT_CATEGORIES, CATEGORY_BY_ID, MAPPING_DEFINITIONS } from "../lib/seedData.js";
import { buildAuditStatement } from "../lib/ledger.js";
import { cleanText, invalid, isInt, newId, requireUnitKode } from "../lib/validate.js";

// ─── Anak Perusahaan (Units) ──────────────────────────────────────────────────

export async function listUnits(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const includeInactive = ctx.url.searchParams.get("all") === "1";
  const sql = includeInactive
    ? "SELECT * FROM units ORDER BY kode"
    : "SELECT * FROM units WHERE aktif = 1 ORDER BY kode";
  const { results } = await ctx.env.DB.prepare(sql).all();
  return { units: results };
}

export async function createUnit(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const kode = requireUnitKode(body.kode, "kode");
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama anak perusahaan wajib diisi.");

  const existing = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(kode).first();
  if (existing) throw new KeuanganError("DUPLIKAT", 409, `Kode anak perusahaan ${kode} sudah ada.`);

  const unit = {
    kode,
    nama,
    alamat: cleanText(body.alamat, 500),
    npwp: cleanText(body.npwp, 40),
    telepon: cleanText(body.telepon, 40),
    pj_nama: cleanText(body.pj_nama, 120),
    pj_jabatan: cleanText(body.pj_jabatan, 120),
    logo_attachment_id: body.logo_attachment_id ? String(body.logo_attachment_id) : null,
    bank_nama: cleanText(body.bank_nama, 100),
    bank_cabang: cleanText(body.bank_cabang, 100),
    bank_alamat: cleanText(body.bank_alamat, 250),
    bank_no_rekening: cleanText(body.bank_no_rekening, 60),
    bank_pemilik: cleanText(body.bank_pemilik, 120),
    bank_swift: cleanText(body.bank_swift, 30),
    aktif: body.aktif === false || body.aktif === 0 ? 0 : 1,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO units (kode, nama, alamat, npwp, telepon, pj_nama, pj_jabatan, logo_attachment_id,
          bank_nama, bank_cabang, bank_alamat, bank_no_rekening, bank_pemilik, bank_swift, aktif,
          created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        unit.kode, unit.nama, unit.alamat, unit.npwp, unit.telepon, unit.pj_nama, unit.pj_jabatan, unit.logo_attachment_id,
        unit.bank_nama, unit.bank_cabang, unit.bank_alamat, unit.bank_no_rekening, unit.bank_pemilik, unit.bank_swift, unit.aktif,
        now, actor.uid, now, actor.uid,
      ),
    // Gudang utama default per unit (sesuai PRD 05)
    db
      .prepare(
        "INSERT INTO warehouses (id, nama, kode, alamat, deskripsi, unit_kode, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(newId(), `Gudang Utama ${unit.kode}`, `GDG-${unit.kode}`, unit.alamat, "Gudang default unit", unit.kode, now, actor.uid, now, actor.uid),
    buildAuditStatement(db, { entity: "unit", entityId: unit.kode, action: "create", after: unit, actor, now }),
  ]);

  return { unit: await db.prepare("SELECT * FROM units WHERE kode = ?").bind(kode).first() };
}

export async function updateUnit(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const kode = requireUnitKode(ctx.params[0], "kode");
  const prev = await db.prepare("SELECT * FROM units WHERE kode = ?").bind(kode).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Anak perusahaan tidak ditemukan.");

  const body = await readJson(ctx.request);
  const nama = body.nama !== undefined ? cleanText(body.nama, 120) : prev.nama;
  if (!nama) throw invalid("nama", "Nama anak perusahaan wajib diisi.");

  const next = {
    nama,
    alamat: body.alamat !== undefined ? cleanText(body.alamat, 500) : prev.alamat,
    npwp: body.npwp !== undefined ? cleanText(body.npwp, 40) : prev.npwp,
    telepon: body.telepon !== undefined ? cleanText(body.telepon, 40) : prev.telepon,
    pj_nama: body.pj_nama !== undefined ? cleanText(body.pj_nama, 120) : prev.pj_nama,
    pj_jabatan: body.pj_jabatan !== undefined ? cleanText(body.pj_jabatan, 120) : prev.pj_jabatan,
    logo_attachment_id: body.logo_attachment_id !== undefined ? body.logo_attachment_id : prev.logo_attachment_id,
    bank_nama: body.bank_nama !== undefined ? cleanText(body.bank_nama, 100) : prev.bank_nama,
    bank_cabang: body.bank_cabang !== undefined ? cleanText(body.bank_cabang, 100) : prev.bank_cabang,
    bank_alamat: body.bank_alamat !== undefined ? cleanText(body.bank_alamat, 250) : prev.bank_alamat,
    bank_no_rekening: body.bank_no_rekening !== undefined ? cleanText(body.bank_no_rekening, 60) : prev.bank_no_rekening,
    bank_pemilik: body.bank_pemilik !== undefined ? cleanText(body.bank_pemilik, 120) : prev.bank_pemilik,
    bank_swift: body.bank_swift !== undefined ? cleanText(body.bank_swift, 30) : prev.bank_swift,
    aktif: body.aktif !== undefined ? (body.aktif ? 1 : 0) : prev.aktif,
  };

  await db.batch([
    db
      .prepare(
        `UPDATE units SET nama = ?, alamat = ?, npwp = ?, telepon = ?, pj_nama = ?, pj_jabatan = ?,
          logo_attachment_id = ?, bank_nama = ?, bank_cabang = ?, bank_alamat = ?, bank_no_rekening = ?,
          bank_pemilik = ?, bank_swift = ?, aktif = ?, updated_at = ?, updated_by = ? WHERE kode = ?`,
      )
      .bind(
        next.nama, next.alamat, next.npwp, next.telepon, next.pj_nama, next.pj_jabatan, next.logo_attachment_id,
        next.bank_nama, next.bank_cabang, next.bank_alamat, next.bank_no_rekening, next.bank_pemilik, next.bank_swift,
        next.aktif, now, actor.uid, kode,
      ),
    buildAuditStatement(db, { entity: "unit", entityId: kode, action: "update", before: prev, after: next, actor, now }),
  ]);

  return { unit: await db.prepare("SELECT * FROM units WHERE kode = ?").bind(kode).first() };
}

// ─── Daftar Akun (COA) ────────────────────────────────────────────────────────

export async function listAccounts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const includeArsip = ctx.url.searchParams.get("arsip") === "1";

  const { results: accounts } = await db
    .prepare(
      `SELECT a.*,
         (SELECT COUNT(*) FROM journal_lines jl WHERE jl.account_kode = a.kode) AS tx_count,
         (SELECT COUNT(*) FROM account_mapping am WHERE am.account_kode = a.kode) AS map_count
       FROM accounts a
       ${includeArsip ? "" : "WHERE a.arsip = 0"}
       ORDER BY a.kode`,
    )
    .all();

  const balQuery = unitKode
    ? db.prepare("SELECT account_kode, SUM(debit) AS d, SUM(kredit) AS k FROM saldo_bulanan WHERE unit_kode = ? GROUP BY account_kode").bind(unitKode)
    : db.prepare("SELECT account_kode, SUM(debit) AS d, SUM(kredit) AS k FROM saldo_bulanan GROUP BY account_kode");
  const { results: balRows } = await balQuery.all();
  const balMap = new Map(balRows.map((b) => [b.account_kode, { d: b.d || 0, k: b.k || 0 }]));

  const mapped = accounts.map((a) => {
    const cat = CATEGORY_BY_ID[a.kategori];
    const b = balMap.get(a.kode) || { d: 0, k: 0 };
    const saldo = cat?.normal === "debit" ? b.d - b.k : b.k - b.d;
    return {
      ...a,
      kategori_nama: cat?.nama || "",
      saldo_normal: cat?.normal || "debit",
      locked: (a.tx_count || 0) > 0,
      locked_mapping: (a.map_count || 0) > 0 || a.sistem === 1,
      saldo,
    };
  });

  // Rollup saldo akun header = jumlah sub-akunnya
  const childrenSum = new Map();
  for (const a of mapped) {
    if (a.header_kode) {
      childrenSum.set(a.header_kode, (childrenSum.get(a.header_kode) || 0) + a.saldo);
    }
  }
  for (const a of mapped) {
    if (a.is_header) {
      a.saldo = childrenSum.get(a.kode) || 0;
    }
  }

  return { accounts: mapped, categories: ACCOUNT_CATEGORIES };
}

export async function createAccount(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 150);
  if (!nama) throw invalid("nama", "Nama akun wajib diisi.");
  const kategori = Number(body.kategori);
  if (!CATEGORY_BY_ID[kategori]) throw invalid("kategori", "Kategori akun tidak valid (1-17).");

  let kode = cleanText(body.kode, 30);
  if (!kode) {
    const prefix = CATEGORY_BY_ID[kategori].kodeAwal;
    const { results: sameCat } = await db.prepare("SELECT kode FROM accounts WHERE kategori = ? ORDER BY kode DESC").bind(kategori).all();
    let maxNum = Number(prefix) * 10000;
    for (const r of sameCat) {
      const m = /(\d+)$/.exec(r.kode);
      if (m && Number(m[1]) > maxNum) maxNum = Number(m[1]);
    }
    kode = `${prefix}-${maxNum + 1}`;
  }

  const dupKode = await db.prepare("SELECT kode FROM accounts WHERE kode = ?").bind(kode).first();
  if (dupKode) throw new KeuanganError("DUPLIKAT", 409, `Kode akun ${kode} sudah dipakai.`);
  const dupNama = await db.prepare("SELECT kode FROM accounts WHERE LOWER(nama) = LOWER(?)").bind(nama).first();
  if (dupNama) throw new KeuanganError("DUPLIKAT", 409, `Nama akun "${nama}" sudah dipakai.`);

  let headerKode = body.header_kode ? cleanText(body.header_kode, 30) : null;
  if (headerKode) {
    const hdr = await db.prepare("SELECT * FROM accounts WHERE kode = ?").bind(headerKode).first();
    if (!hdr) throw invalid("header_kode", "Akun header tidak ditemukan.");
    if (hdr.kategori !== kategori) throw invalid("header_kode", "Akun header harus dari kategori yang sama.");
  }

  const isHeader = body.is_header ? 1 : 0;
  let unitKode = body.unit_kode ? requireUnitKode(body.unit_kode, "unit_kode") : null;
  if (unitKode) {
    const u = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(unitKode).first();
    if (!u) throw invalid("unit_kode", `Unit ${unitKode} tidak ditemukan.`);
  }

  const acc = {
    kode,
    nama,
    kategori,
    header_kode: headerKode,
    is_header: isHeader,
    deskripsi: cleanText(body.deskripsi, 500),
    tax_id: body.tax_id ? String(body.tax_id) : null,
    bank_nama: body.bank_nama ? cleanText(body.bank_nama, 100) : null,
    no_rekening: body.no_rekening ? cleanText(body.no_rekening, 60) : null,
    unit_kode: unitKode,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO accounts (kode, nama, kategori, header_kode, is_header, deskripsi, tax_id, bank_nama, no_rekening, unit_kode, sistem, arsip, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      )
      .bind(
        acc.kode, acc.nama, acc.kategori, acc.header_kode, acc.is_header, acc.deskripsi,
        acc.tax_id, acc.bank_nama, acc.no_rekening, acc.unit_kode, now, actor.uid, now, actor.uid,
      ),
    buildAuditStatement(db, { entity: "account", entityId: acc.kode, action: "create", after: acc, actor, now }),
  ]);

  return { account: await db.prepare("SELECT * FROM accounts WHERE kode = ?").bind(acc.kode).first() };
}

export async function updateAccount(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const kode = decodeURIComponent(ctx.params[0]);
  const prev = await db.prepare("SELECT * FROM accounts WHERE kode = ?").bind(kode).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Akun tidak ditemukan.");
  if (prev.sistem === 1) throw new KeuanganError("FORBIDDEN", 403, "Akun sistem antar unit tidak bisa diubah.");

  const body = await readJson(ctx.request);
  const nama = body.nama !== undefined ? cleanText(body.nama, 150) : prev.nama;
  if (!nama) throw invalid("nama", "Nama akun wajib diisi.");

  const txUsed = await db.prepare("SELECT 1 FROM journal_lines WHERE account_kode = ? LIMIT 1").bind(kode).first();
  const newKat = body.kategori !== undefined ? Number(body.kategori) : prev.kategori;
  if (txUsed && newKat !== prev.kategori) {
    throw new KeuanganError("AKUN_TERPAKAI", 400, "Kategori akun yang sudah memiliki transaksi tidak dapat diubah.");
  }

  const next = {
    nama,
    kategori: newKat,
    deskripsi: body.deskripsi !== undefined ? cleanText(body.deskripsi, 500) : prev.deskripsi,
    tax_id: body.tax_id !== undefined ? body.tax_id : prev.tax_id,
    bank_nama: body.bank_nama !== undefined ? cleanText(body.bank_nama, 100) : prev.bank_nama,
    no_rekening: body.no_rekening !== undefined ? cleanText(body.no_rekening, 60) : prev.no_rekening,
    unit_kode: body.unit_kode !== undefined ? (body.unit_kode ? requireUnitKode(body.unit_kode) : null) : prev.unit_kode,
    arsip: body.arsip !== undefined ? (body.arsip ? 1 : 0) : prev.arsip,
  };

  await db.batch([
    db
      .prepare(
        `UPDATE accounts SET nama = ?, kategori = ?, deskripsi = ?, tax_id = ?, bank_nama = ?, no_rekening = ?, unit_kode = ?, arsip = ?, updated_at = ?, updated_by = ?
         WHERE kode = ?`,
      )
      .bind(next.nama, next.kategori, next.deskripsi, next.tax_id, next.bank_nama, next.no_rekening, next.unit_kode, next.arsip, now, actor.uid, kode),
    buildAuditStatement(db, { entity: "account", entityId: kode, action: "update", before: prev, after: next, actor, now }),
  ]);

  return { account: await db.prepare("SELECT * FROM accounts WHERE kode = ?").bind(kode).first() };
}

export async function deleteAccount(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const kode = decodeURIComponent(ctx.params[0]);
  const prev = await db.prepare("SELECT * FROM accounts WHERE kode = ?").bind(kode).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Akun tidak ditemukan.");
  if (prev.sistem === 1) throw new KeuanganError("AKUN_SISTEM", 400, "Akun sistem antar unit tidak bisa dihapus.");

  const usedTx = await db.prepare("SELECT 1 FROM journal_lines WHERE account_kode = ? LIMIT 1").bind(kode).first();
  if (usedTx) throw new KeuanganError("AKUN_TERPAKAI", 400, "Akun yang sudah punya transaksi tidak bisa dihapus (hanya bisa diarsipkan).");

  const usedMap = await db.prepare("SELECT 1 FROM account_mapping WHERE account_kode = ? LIMIT 1").bind(kode).first();
  if (usedMap) throw new KeuanganError("AKUN_PEMETAAN", 400, "Akun yang dipakai Pemetaan Akun tidak bisa dihapus.");

  const hasChild = await db.prepare("SELECT 1 FROM accounts WHERE header_kode = ? LIMIT 1").bind(kode).first();
  if (hasChild) throw new KeuanganError("AKUN_HEADER", 400, "Hapus atau pindahkan sub-akun terlebih dahulu.");

  await db.batch([
    db.prepare("DELETE FROM accounts WHERE kode = ?").bind(kode),
    buildAuditStatement(db, { entity: "account", entityId: kode, action: "delete", before: prev, actor, now }),
  ]);
  return { ok: true };
}

export async function importAccounts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw invalid("rows", "Minimal satu baris akun untuk diimpor.");

  const stmts = [];
  for (const [i, row] of rows.entries()) {
    const nama = cleanText(row.nama, 150);
    const kode = cleanText(row.kode, 30);
    const kategori = Number(row.kategori);
    if (!nama || !kode || !CATEGORY_BY_ID[kategori]) {
      throw invalid("rows", `Baris ${i + 1}: kode, nama, dan kategori (1-17) wajib valid.`, i);
    }
    stmts.push(
      db
        .prepare(
          `INSERT INTO accounts (kode, nama, kategori, header_kode, is_header, deskripsi, sistem, arsip, created_at, created_by, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
           ON CONFLICT(kode) DO UPDATE SET nama = excluded.nama, kategori = excluded.kategori, deskripsi = excluded.deskripsi, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .bind(kode, nama, kategori, row.header_kode || null, row.is_header ? 1 : 0, cleanText(row.deskripsi, 500), now, actor.uid, now, actor.uid),
    );
  }
  stmts.push(buildAuditStatement(db, { entity: "account", entityId: "import", action: "import", after: { count: rows.length }, actor, now }));
  await db.batch(stmts);
  return { imported: rows.length };
}

export async function resetAccounts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const tx = await db.prepare("SELECT 1 FROM journal_lines LIMIT 1").first();
  if (tx) throw new KeuanganError("SUDAH_ADA_TRANSAKSI", 400, "Reset daftar akun hanya bisa dilakukan sebelum ada transaksi.");

  await db.batch([
    db.prepare("DELETE FROM account_mapping"),
    db.prepare("DELETE FROM taxes"),
    db.prepare("DELETE FROM accounts"),
  ]);
  await applyDefaultSeed(db, now, actor.uid);
  await db.batch([buildAuditStatement(db, { entity: "account", entityId: "reset", action: "reset", actor, now })]);
  return { ok: true };
}

// ─── Pemetaan Akun ────────────────────────────────────────────────────────────

export async function getAccountMapping(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const { results } = await db
    .prepare("SELECT am.*, a.nama AS account_nama, a.kategori AS account_kategori FROM account_mapping am LEFT JOIN accounts a ON a.kode = am.account_kode")
    .all();
  const byKey = new Map(results.map((r) => [r.key, r]));
  const items = MAPPING_DEFINITIONS.map((def) => {
    const saved = byKey.get(def.key);
    return {
      ...def,
      account_kode: saved?.account_kode || def.defaultKode,
      account_nama: saved?.account_nama || "",
    };
  });
  return { mapping: items };
}

export async function updateAccountMapping(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const updates = body.mapping;
  if (!updates || typeof updates !== "object") throw invalid("mapping", "Data pemetaan wajib diisi.");

  const defByKey = new Map(MAPPING_DEFINITIONS.map((d) => [d.key, d]));
  const stmts = [];
  for (const [key, accountKode] of Object.entries(updates)) {
    const def = defByKey.get(key);
    if (!def) continue;
    if (def.locked) continue;
    const acc = await db.prepare("SELECT kode, kategori, is_header FROM accounts WHERE kode = ?").bind(accountKode).first();
    if (!acc || acc.is_header) throw invalid(key, `Akun ${accountKode} tidak valid untuk ${def.label}.`);
    if (!def.allowedCategories.includes(acc.kategori)) {
      throw invalid(key, `Akun ${accountKode} tidak masuk kategori yang diizinkan untuk ${def.label}.`);
    }
    stmts.push(
      db
        .prepare("INSERT INTO account_mapping (key, account_kode, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET account_kode = excluded.account_kode, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
        .bind(key, accountKode, now, actor.uid),
    );
  }
  stmts.push(buildAuditStatement(db, { entity: "account_mapping", entityId: "mapping", action: "update", after: updates, actor, now }));
  if (stmts.length) await db.batch(stmts);
  return getAccountMapping(ctx);
}

// ─── Kontak & Grup Kontak ─────────────────────────────────────────────────────

export async function listContactGroups(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM contact_groups ORDER BY nama").all();
  return { groups: results };
}

export async function saveContactGroup(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 100);
  if (!nama) throw invalid("nama", "Nama grup kontak wajib diisi.");
  const id = body.id ? String(body.id) : newId();
  await db.batch([
    db
      .prepare(
        "INSERT INTO contact_groups (id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      )
      .bind(id, nama, now, actor.uid, now, actor.uid),
  ]);
  return { group: await db.prepare("SELECT * FROM contact_groups WHERE id = ?").bind(id).first() };
}

export async function deleteContactGroup(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM contact_groups WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function listContacts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const tipe = ctx.url.searchParams.get("tipe") || "";
  const includeArsip = ctx.url.searchParams.get("arsip") === "1";
  const { results } = await db
    .prepare(
      `SELECT c.*, g.nama AS grup_nama,
         (SELECT COUNT(*) FROM journal_lines jl WHERE jl.contact_id = c.id) AS tx_count
       FROM contacts c
       LEFT JOIN contact_groups g ON g.id = c.grup_id
       ${includeArsip ? "" : "WHERE c.arsip = 0"}
       ORDER BY c.nama_tampilan COLLATE NOCASE`,
    )
    .all();

  const contacts = results
    .map((c) => ({ ...c, tipe: safeParseJson(c.tipe_flags, []) }))
    .filter((c) => !tipe || tipe === "semua" || c.tipe.includes(tipe));

  return { contacts };
}

export async function getContact(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const id = ctx.params[0];
  const contact = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
  if (!contact) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Kontak tidak ditemukan.");
  const { results: banks } = await db.prepare("SELECT * FROM contact_banks WHERE contact_id = ?").bind(id).all();
  const { results: documents } = await db
    .prepare("SELECT id, type, no, tanggal, unit_kode, total, sisa, status, memo FROM documents WHERE contact_id = ? AND deleted_at IS NULL ORDER BY tanggal DESC, created_at DESC LIMIT 100")
    .bind(id)
    .all();
  return { contact: { ...contact, tipe: safeParseJson(contact.tipe_flags, []), banks }, transactions: documents };
}

export async function createContact(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const namaTampilan = cleanText(body.nama_tampilan, 150);
  if (!namaTampilan) throw invalid("nama_tampilan", "Nama tampilan kontak wajib diisi.");
  const tipe = Array.isArray(body.tipe) && body.tipe.length ? body.tipe : ["lainnya"];

  const id = newId();
  const maps = await db.prepare("SELECT key, account_kode FROM account_mapping WHERE key IN ('piutang_usaha', 'hutang_usaha')").all();
  const mapObj = Object.fromEntries(maps.results.map((r) => [r.key, r.account_kode]));

  const stmts = [
    db
      .prepare(
        `INSERT INTO contacts (id, nama_tampilan, tipe_flags, grup_id, nama_lengkap, identitas_jenis, identitas_no, email, perusahaan,
          hp, telepon, fax, npwp, nitku, kewarganegaraan, alamat_tagih, alamat_kirim, info, akun_piutang, akun_hutang,
          batas_piutang, batas_hutang, term_id, arsip, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .bind(
        id, namaTampilan, JSON.stringify(tipe), body.grup_id || null, cleanText(body.nama_lengkap, 150),
        cleanText(body.identitas_jenis, 30), cleanText(body.identitas_no, 50), cleanText(body.email, 120),
        cleanText(body.perusahaan, 150), cleanText(body.hp, 40), cleanText(body.telepon, 40), cleanText(body.fax, 40),
        cleanText(body.npwp, 40), cleanText(body.nitku, 40), cleanText(body.kewarganegaraan || "WNI", 20),
        cleanText(body.alamat_tagih, 500), cleanText(body.alamat_kirim, 500), cleanText(body.info, 500),
        body.akun_piutang || mapObj.piutang_usaha || "1-10100",
        body.akun_hutang || mapObj.hutang_usaha || "2-20100",
        isInt(body.batas_piutang, { min: 0 }) ? body.batas_piutang : null,
        isInt(body.batas_hutang, { min: 0 }) ? body.batas_hutang : null,
        body.term_id || null,
        now, actor.uid, now, actor.uid,
      ),
  ];

  if (Array.isArray(body.banks)) {
    for (const b of body.banks) {
      if (!b.bank || !b.no_rekening) continue;
      stmts.push(
        db
          .prepare("INSERT INTO contact_banks (id, contact_id, bank, cabang, pemegang, no_rekening, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(newId(), id, cleanText(b.bank, 80), cleanText(b.cabang, 80), cleanText(b.pemegang, 100), cleanText(b.no_rekening, 60), now, actor.uid, now, actor.uid),
      );
    }
  }
  stmts.push(buildAuditStatement(db, { entity: "contact", entityId: id, action: "create", after: { nama_tampilan: namaTampilan, tipe }, actor, now }));
  await db.batch(stmts);
  return getContact({ ...ctx, params: [id] });
}

export async function updateContact(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Kontak tidak ditemukan.");

  const body = await readJson(ctx.request);
  const namaTampilan = body.nama_tampilan !== undefined ? cleanText(body.nama_tampilan, 150) : prev.nama_tampilan;
  if (!namaTampilan) throw invalid("nama_tampilan", "Nama tampilan kontak wajib diisi.");

  const tipe = Array.isArray(body.tipe) ? JSON.stringify(body.tipe) : prev.tipe_flags;
  const stmts = [
    db
      .prepare(
        `UPDATE contacts SET nama_tampilan = ?, tipe_flags = ?, grup_id = ?, nama_lengkap = ?, identitas_jenis = ?, identitas_no = ?,
          email = ?, perusahaan = ?, hp = ?, telepon = ?, fax = ?, npwp = ?, nitku = ?, kewarganegaraan = ?, alamat_tagih = ?,
          alamat_kirim = ?, info = ?, akun_piutang = ?, akun_hutang = ?, batas_piutang = ?, batas_hutang = ?, term_id = ?, arsip = ?,
          updated_at = ?, updated_by = ? WHERE id = ?`,
      )
      .bind(
        namaTampilan, tipe, body.grup_id !== undefined ? body.grup_id : prev.grup_id,
        body.nama_lengkap !== undefined ? cleanText(body.nama_lengkap, 150) : prev.nama_lengkap,
        body.identitas_jenis !== undefined ? cleanText(body.identitas_jenis, 30) : prev.identitas_jenis,
        body.identitas_no !== undefined ? cleanText(body.identitas_no, 50) : prev.identitas_no,
        body.email !== undefined ? cleanText(body.email, 120) : prev.email,
        body.perusahaan !== undefined ? cleanText(body.perusahaan, 150) : prev.perusahaan,
        body.hp !== undefined ? cleanText(body.hp, 40) : prev.hp,
        body.telepon !== undefined ? cleanText(body.telepon, 40) : prev.telepon,
        body.fax !== undefined ? cleanText(body.fax, 40) : prev.fax,
        body.npwp !== undefined ? cleanText(body.npwp, 40) : prev.npwp,
        body.nitku !== undefined ? cleanText(body.nitku, 40) : prev.nitku,
        body.kewarganegaraan !== undefined ? cleanText(body.kewarganegaraan, 20) : prev.kewarganegaraan,
        body.alamat_tagih !== undefined ? cleanText(body.alamat_tagih, 500) : prev.alamat_tagih,
        body.alamat_kirim !== undefined ? cleanText(body.alamat_kirim, 500) : prev.alamat_kirim,
        body.info !== undefined ? cleanText(body.info, 500) : prev.info,
        body.akun_piutang !== undefined ? body.akun_piutang : prev.akun_piutang,
        body.akun_hutang !== undefined ? body.akun_hutang : prev.akun_hutang,
        body.batas_piutang !== undefined ? body.batas_piutang : prev.batas_piutang,
        body.batas_hutang !== undefined ? body.batas_hutang : prev.batas_hutang,
        body.term_id !== undefined ? body.term_id : prev.term_id,
        body.arsip !== undefined ? (body.arsip ? 1 : 0) : prev.arsip,
        now, actor.uid, id,
      ),
  ];

  if (Array.isArray(body.banks)) {
    stmts.push(db.prepare("DELETE FROM contact_banks WHERE contact_id = ?").bind(id));
    for (const b of body.banks) {
      if (!b.bank || !b.no_rekening) continue;
      stmts.push(
        db
          .prepare("INSERT INTO contact_banks (id, contact_id, bank, cabang, pemegang, no_rekening, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(newId(), id, cleanText(b.bank, 80), cleanText(b.cabang, 80), cleanText(b.pemegang, 100), cleanText(b.no_rekening, 60), now, actor.uid, now, actor.uid),
      );
    }
  }
  stmts.push(buildAuditStatement(db, { entity: "contact", entityId: id, action: "update", before: prev, after: { nama_tampilan: namaTampilan }, actor, now }));
  await db.batch(stmts);
  return getContact({ ...ctx, params: [id] });
}

export async function deleteContact(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Kontak tidak ditemukan.");

  const used = await db.prepare("SELECT 1 FROM documents WHERE contact_id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first();
  if (used) throw new KeuanganError("KONTAK_TERPAKAI", 400, "Kontak yang sudah punya transaksi tidak dapat dihapus (gunakan Arsipkan).");

  await db.batch([
    db.prepare("DELETE FROM contacts WHERE id = ?").bind(id),
    buildAuditStatement(db, { entity: "contact", entityId: id, action: "delete", before: prev, actor, now }),
  ]);
  return { ok: true };
}

// ─── Tag & Kategori Tag ───────────────────────────────────────────────────────

export async function listTags(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const [{ results: tags }, { results: categories }] = await Promise.all([
    db.prepare("SELECT t.*, tc.nama AS kategori_nama FROM tags t LEFT JOIN tag_categories tc ON tc.id = t.kategori_id ORDER BY t.nama").all(),
    db.prepare("SELECT * FROM tag_categories ORDER BY nama").all(),
  ]);
  return { tags, categories };
}

export async function createTagCategory(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 80);
  if (!nama) throw invalid("nama", "Nama kategori tag wajib diisi.");
  const id = newId();
  await db.prepare("INSERT INTO tag_categories (id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, nama, now, actor.uid, now, actor.uid)
    .run();
  return { category: await db.prepare("SELECT * FROM tag_categories WHERE id = ?").bind(id).first() };
}

export async function deleteTagCategory(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("UPDATE tags SET kategori_id = NULL WHERE kategori_id = ?").bind(ctx.params[0]).run();
  await ctx.env.DB.prepare("DELETE FROM tag_categories WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function createTag(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 80);
  if (!nama) throw invalid("nama", "Nama tag wajib diisi.");
  const existing = await db.prepare("SELECT * FROM tags WHERE LOWER(nama) = LOWER(?)").bind(nama).first();
  if (existing) return { tag: existing };
  const id = newId();
  await db.prepare("INSERT INTO tags (id, kategori_id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, body.kategori_id || null, nama, now, actor.uid, now, actor.uid)
    .run();
  return { tag: await db.prepare("SELECT * FROM tags WHERE id = ?").bind(id).first() };
}

export async function deleteTag(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

// ─── Pajak ────────────────────────────────────────────────────────────────────

export async function loadTaxesWithItems(db) {
  const [{ results: taxes }, { results: groupItems }] = await Promise.all([
    db.prepare("SELECT * FROM taxes ORDER BY tipe, nama").all(),
    db.prepare("SELECT gi.group_id, gi.urutan, t.* FROM tax_group_items gi JOIN taxes t ON t.id = gi.tax_id ORDER BY gi.group_id, gi.urutan").all(),
  ]);
  const byGroup = new Map();
  for (const item of groupItems) {
    const arr = byGroup.get(item.group_id) || [];
    arr.push(item);
    byGroup.set(item.group_id, arr);
  }
  return taxes.map((t) => ({ ...t, items: t.tipe === "grup" ? byGroup.get(t.id) || [] : [] }));
}

export async function listTaxes(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);
  return { taxes: await loadTaxesWithItems(db) };
}

export async function createTax(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 100);
  if (!nama) throw invalid("nama", "Nama pajak wajib diisi.");
  const dup = await db.prepare("SELECT id FROM taxes WHERE LOWER(nama) = LOWER(?)").bind(nama).first();
  if (dup) throw new KeuanganError("DUPLIKAT", 409, `Nama pajak "${nama}" sudah ada.`);

  const tipe = body.tipe === "grup" ? "grup" : "satu";
  const id = newId();

  if (tipe === "satu") {
    const persenBp = Number(body.persen_bp);
    if (!isInt(persenBp, { min: 0, max: 10_000 })) throw invalid("persen_bp", "Persentase pajak harus valid (0 - 100%).");
    const pengali1112 = body.pengali_11_12 ? 1 : 0;
    const pemotongan = body.pemotongan ? 1 : 0;
    if (pengali1112 && pemotongan) throw invalid("pengali_11_12", "Pengali 11/12 tidak bisa digabung dengan pajak pemotongan.");
    if (!body.akun_jual || !body.akun_beli) throw invalid("akun_jual", "Akun Pajak Penjualan dan Pembelian wajib diisi.");

    await db.batch([
      db
        .prepare(
          "INSERT INTO taxes (id, nama, tipe, persen_bp, pengali_11_12, pemotongan, akun_jual, akun_beli, majemuk, aktif, created_at, created_by, updated_at, updated_by) VALUES (?, ?, 'satu', ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)",
        )
        .bind(id, nama, persenBp, pengali1112, pemotongan, body.akun_jual, body.akun_beli, now, actor.uid, now, actor.uid),
      buildAuditStatement(db, { entity: "tax", entityId: id, action: "create", after: { nama, tipe, persenBp }, actor, now }),
    ]);
  } else {
    const itemIds = Array.isArray(body.item_ids) ? body.item_ids : [];
    if (itemIds.length < 2) throw invalid("item_ids", "Pajak grup minimal berisi 2 pajak satuan.");
    const majemuk = body.majemuk ? 1 : 0;
    const { results: items } = await db
      .prepare("SELECT * FROM taxes WHERE id IN (SELECT value FROM json_each(?)) AND tipe = 'satu'")
      .bind(JSON.stringify(itemIds))
      .all();
    const byId = new Map(items.map((x) => [x.id, x]));
    const ordered = itemIds.map((x) => byId.get(x)).filter(Boolean);
    if (ordered.length !== itemIds.length) throw invalid("item_ids", "Semua item dalam grup harus pajak satuan yang valid.");
    if (majemuk && ordered.some((x) => x.pengali_11_12)) {
      throw invalid("majemuk", "Grup majemuk tidak boleh berisi pajak berpengali 11/12.");
    }

    // Hitung persen efektif gabungan
    let eff = 0;
    if (majemuk) {
      let factor = 1;
      for (const it of ordered) {
        const rate = (it.pemotongan ? -1 : 1) * (it.persen_bp / 10_000);
        factor *= 1 + rate;
      }
      eff = Math.round((factor - 1) * 10_000);
    } else {
      for (const it of ordered) {
        const rateBp = it.pengali_11_12 ? Math.round((it.persen_bp * 11) / 12) : it.persen_bp;
        eff += it.pemotongan ? -rateBp : rateBp;
      }
    }

    const stmts = [
      db
        .prepare(
          "INSERT INTO taxes (id, nama, tipe, persen_bp, pengali_11_12, pemotongan, akun_jual, akun_beli, majemuk, aktif, created_at, created_by, updated_at, updated_by) VALUES (?, ?, 'grup', ?, 0, 0, NULL, NULL, ?, 1, ?, ?, ?, ?)",
        )
        .bind(id, nama, eff, majemuk, now, actor.uid, now, actor.uid),
    ];
    ordered.forEach((it, idx) => {
      stmts.push(db.prepare("INSERT INTO tax_group_items (group_id, tax_id, urutan) VALUES (?, ?, ?)").bind(id, it.id, idx + 1));
    });
    stmts.push(buildAuditStatement(db, { entity: "tax", entityId: id, action: "create", after: { nama, tipe, itemIds, majemuk }, actor, now }));
    await db.batch(stmts);
  }

  const all = await loadTaxesWithItems(db);
  return { tax: all.find((t) => t.id === id) };
}

export async function updateTax(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM taxes WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Pajak tidak ditemukan.");
  const body = await readJson(ctx.request);
  const nama = body.nama !== undefined ? cleanText(body.nama, 100) : prev.nama;
  if (!nama) throw invalid("nama", "Nama pajak wajib diisi.");
  await db.batch([
    db.prepare("UPDATE taxes SET nama = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(nama, now, actor.uid, id),
    buildAuditStatement(db, { entity: "tax", entityId: id, action: "update", before: prev, after: { nama }, actor, now }),
  ]);
  const all = await loadTaxesWithItems(db);
  return { tax: all.find((t) => t.id === id) };
}

export async function deleteTax(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM taxes WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Pajak tidak ditemukan.");
  const usedLine = await db.prepare("SELECT 1 FROM document_lines WHERE tax_id = ? LIMIT 1").bind(id).first();
  if (usedLine) throw new KeuanganError("PAJAK_TERPAKAI", 400, "Pajak yang sudah dipakai di transaksi tidak bisa dihapus.");
  const usedGrp = await db.prepare("SELECT 1 FROM tax_group_items WHERE tax_id = ? LIMIT 1").bind(id).first();
  if (usedGrp) throw new KeuanganError("PAJAK_TERPAKAI", 400, "Pajak dipakai di grup pajak.");
  await db.batch([
    db.prepare("DELETE FROM taxes WHERE id = ?").bind(id),
    buildAuditStatement(db, { entity: "tax", entityId: id, action: "delete", before: prev, actor, now }),
  ]);
  return { ok: true };
}

// ─── Syarat Pembayaran, Cara Pembayaran, Penomoran, Pengaturan, Audit ─────────

export async function listPaymentTerms(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM payment_terms ORDER BY hari, nama").all();
  return { terms: results };
}

export async function savePaymentTerm(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 80);
  const hari = Number(body.hari ?? 0);
  if (!nama) throw invalid("nama", "Nama syarat pembayaran wajib diisi.");
  if (!isInt(hari, { min: 0, max: 3650 })) throw invalid("hari", "Jumlah hari harus angka bulat ≥ 0.");
  const id = body.id ? String(body.id) : newId();
  await db
    .prepare(
      "INSERT INTO payment_terms (id, nama, hari, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, hari = excluded.hari, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(id, nama, hari, now, actor.uid, now, actor.uid)
    .run();
  return { term: await db.prepare("SELECT * FROM payment_terms WHERE id = ?").bind(id).first() };
}

export async function deletePaymentTerm(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM payment_terms WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function listPaymentMethods(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM payment_methods ORDER BY nama").all();
  return { methods: results };
}

export async function savePaymentMethod(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 80);
  if (!nama) throw invalid("nama", "Nama cara pembayaran wajib diisi.");
  const id = body.id ? String(body.id) : newId();
  await db
    .prepare(
      "INSERT INTO payment_methods (id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(id, nama, now, actor.uid, now, actor.uid)
    .run();
  return { method: await db.prepare("SELECT * FROM payment_methods WHERE id = ?").bind(id).first() };
}

export async function deletePaymentMethod(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM payment_methods WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function getNumbering(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM numbering ORDER BY doc_type").all();
  return { numbering: results };
}

export async function updateNumbering(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const items = Array.isArray(body.numbering) ? body.numbering : [];
  const stmts = [];
  for (const item of items) {
    if (!item.doc_type) continue;
    const format = cleanText(item.format || "{NO}", 60);
    const digits = isInt(Number(item.digits), { min: 1, max: 10 }) ? Number(item.digits) : 5;
    const startNo = isInt(Number(item.start_no), { min: 1, max: 1_000_000 }) ? Number(item.start_no) : 10001;
    const reset = ["tidak", "tahun", "bulan"].includes(item.reset) ? item.reset : "tidak";
    stmts.push(
      db
        .prepare(
          `INSERT INTO numbering (doc_type, format, digits, start_no, reset, last_json, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
           ON CONFLICT(doc_type) DO UPDATE SET format = excluded.format, digits = excluded.digits, start_no = excluded.start_no, reset = excluded.reset, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .bind(item.doc_type, format, digits, startNo, reset, now, actor.uid),
    );
  }
  if (stmts.length) await db.batch(stmts);
  return getNumbering(ctx);
}

export async function getSettings(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT key, value_json FROM settings").all();
  const settings = Object.fromEntries(results.map((r) => [r.key, safeParseJson(r.value_json, {})]));
  const { results: lampiranDbs } = await ctx.env.DB.prepare("SELECT * FROM lampiran_db ORDER BY db_index").all();
  return { settings, lampiranDbs };
}

export async function updateSettings(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const stmts = [];
  for (const key of ["perusahaan", "penjualan", "pembelian", "produk", "custom_fields", "print_templates"]) {
    if (body[key] && typeof body[key] === "object") {
      stmts.push(
        db
          .prepare("INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
          .bind(key, JSON.stringify(body[key]), now, actor.uid),
      );
    }
  }
  stmts.push(buildAuditStatement(db, { entity: "settings", entityId: "settings", action: "update", after: body, actor, now }));
  if (stmts.length) await db.batch(stmts);
  return getSettings(ctx);
}

export async function listAudit(ctx) {
  await requireKeuangan(ctx);
  const entity = ctx.url.searchParams.get("entity") || "";
  const entityId = ctx.url.searchParams.get("entity_id") || "";
  const limit = Math.min(200, Math.max(10, Number(ctx.url.searchParams.get("limit") || 50)));
  const sql = entity && entityId
    ? "SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY at DESC LIMIT ?"
    : "SELECT * FROM audit_log ORDER BY at DESC LIMIT ?";
  const stmt = entity && entityId
    ? ctx.env.DB.prepare(sql).bind(entity, entityId, limit)
    : ctx.env.DB.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return { logs: results };
}

export async function listExportsLog(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM exports_log ORDER BY at DESC LIMIT 100").all();
  return { exports: results };
}

export async function recordExportLog(ctx) {
  const actor = await requireKeuangan(ctx);
  const body = await readJson(ctx.request);
  const id = newId();
  await ctx.env.DB
    .prepare("INSERT INTO exports_log (id, laporan, format, filter_json, by, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, cleanText(body.laporan, 80), cleanText(body.format, 20), JSON.stringify(body.filter || {}), actor.uid, actor.name, ctx.deps.now())
    .run();
  return { id };
}

function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
