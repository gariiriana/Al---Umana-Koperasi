// Inisialisasi data bawaan Modul Keuangan (COA, pemetaan, pajak, syarat/cara bayar, penomoran, pengaturan).
// Anak Perusahaan sengaja dibiarkan kosong sesuai PRD 01-dasar.md.
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_NUMBERING,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_SETTINGS,
  DEFAULT_TAXES,
  MAPPING_DEFINITIONS,
} from "./seedData.js";

let seededInIsolate = false;

export function resetSeedCacheForTests() {
  seededInIsolate = false;
}

export async function ensureSeeded(db, now = Date.now(), actor = "system") {
  if (seededInIsolate) return;
  const row = await db.prepare("SELECT COUNT(*) AS cnt FROM accounts").first();
  if ((row?.cnt ?? 0) > 0) {
    seededInIsolate = true;
    return;
  }
  await applyDefaultSeed(db, now, actor);
  seededInIsolate = true;
}

export async function applyDefaultSeed(db, now = Date.now(), actor = "system") {
  const stmts = [
    db.prepare(
      `INSERT OR IGNORE INTO accounts (kode, nama, kategori, header_kode, is_header, deskripsi, sistem, arsip, created_at, created_by, updated_at, updated_by)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), NULL, 0, '', json_extract(value, '$[3]'), 0, ?, ?, ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, now, actor, JSON.stringify(DEFAULT_ACCOUNTS)),
    db.prepare(
      `INSERT OR IGNORE INTO account_mapping (key, account_kode, updated_at, updated_by)
       SELECT json_extract(value, '$.key'), json_extract(value, '$.defaultKode'), ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, JSON.stringify(MAPPING_DEFINITIONS)),
    db.prepare(
      `INSERT OR IGNORE INTO taxes (id, nama, tipe, persen_bp, pengali_11_12, pemotongan, akun_jual, akun_beli, majemuk, aktif, created_at, created_by, updated_at, updated_by)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.nama'), json_extract(value, '$.tipe'), json_extract(value, '$.persen_bp'),
              json_extract(value, '$.pengali_11_12'), json_extract(value, '$.pemotongan'), json_extract(value, '$.akun_jual'), json_extract(value, '$.akun_beli'),
              json_extract(value, '$.majemuk'), 1, ?, ?, ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, now, actor, JSON.stringify(DEFAULT_TAXES)),
    db.prepare(
      `INSERT OR IGNORE INTO payment_terms (id, nama, hari, created_at, created_by, updated_at, updated_by)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.nama'), json_extract(value, '$.hari'), ?, ?, ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, now, actor, JSON.stringify(DEFAULT_PAYMENT_TERMS)),
    db.prepare(
      `INSERT OR IGNORE INTO payment_methods (id, nama, created_at, created_by, updated_at, updated_by)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.nama'), ?, ?, ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, now, actor, JSON.stringify(DEFAULT_PAYMENT_METHODS)),
    db.prepare(
      `INSERT OR IGNORE INTO numbering (doc_type, format, digits, start_no, reset, last_json, updated_at, updated_by)
       SELECT json_extract(value, '$.doc_type'), json_extract(value, '$.format'), json_extract(value, '$.digits'),
              json_extract(value, '$.start_no'), json_extract(value, '$.reset'), '{}', ?, ?
       FROM json_each(?)`,
    ).bind(now, actor, JSON.stringify(DEFAULT_NUMBERING)),
    db.prepare(
      `INSERT OR IGNORE INTO settings (key, value_json, updated_at, updated_by)
       SELECT key, value, ?, ? FROM json_each(?)`,
    ).bind(
      now,
      actor,
      JSON.stringify(Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, JSON.stringify(v)]))),
    ),
    db.prepare("INSERT OR IGNORE INTO lampiran_db (db_index, bytes, aktif) VALUES (1, 0, 1)"),
  ];
  await db.batch(stmts);
}
