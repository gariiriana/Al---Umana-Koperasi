// Engine Buku Besar, Keseimbangan per Unit, Saldo Bulanan, Penomoran, dan Kunci Periode.
import { KeuanganError } from "../http.js";
import { formatDmy, newId } from "./validate.js";

export async function getMaxLockedDate(db) {
  const row = await db.prepare("SELECT MAX(sampai) AS max_date FROM period_closings WHERE status = 'selesai'").first();
  return row?.max_date || null;
}

export async function assertNotLocked(db, dates) {
  const maxLocked = await getMaxLockedDate(db);
  if (!maxLocked) return;
  for (const d of dates) {
    if (d && d <= maxLocked) {
      throw new KeuanganError("PERIODE_TERKUNCI", 400, `Periode sampai ${formatDmy(maxLocked)} sudah dikunci.`);
    }
  }
}

/**
 * Memastikan baris jurnal seimbang total DAN seimbang per anak perusahaan (unit_kode).
 * Mengembalikan baris bersih (tanpa debit=0 & kredit=0).
 */
export function normalizeAndCheckBalance(rawLines) {
  const lines = rawLines
    .filter((l) => (l.debit || 0) !== 0 || (l.kredit || 0) !== 0)
    .map((l) => ({
      id: l.id || newId(),
      tanggal: l.tanggal,
      unit_kode: l.unit_kode,
      account_kode: l.account_kode,
      debit: Math.trunc(l.debit || 0),
      kredit: Math.trunc(l.kredit || 0),
      contact_id: l.contact_id ?? null,
      keterangan: l.keterangan ?? "",
      currency: l.currency || "IDR",
      amount_fc: Math.trunc(l.amount_fc || 0),
    }));

  if (lines.length === 0) return [];

  const byUnit = new Map();
  let totalDebit = 0;
  let totalKredit = 0;
  for (const l of lines) {
    if (l.debit < 0 || l.kredit < 0 || (l.debit > 0 && l.kredit > 0)) {
      throw new KeuanganError("VALIDATION_ERROR", 400, "Setiap baris jurnal hanya boleh memiliki Debit atau Kredit bernilai positif.");
    }
    if (!l.unit_kode) {
      throw new KeuanganError("VALIDATION_ERROR", 400, "Setiap baris jurnal harus memiliki kode anak perusahaan.");
    }
    totalDebit += l.debit;
    totalKredit += l.kredit;
    const u = byUnit.get(l.unit_kode) || { debit: 0, kredit: 0 };
    u.debit += l.debit;
    u.kredit += l.kredit;
    byUnit.set(l.unit_kode, u);
  }

  for (const [unit, tot] of byUnit.entries()) {
    if (tot.debit !== tot.kredit) {
      throw new KeuanganError(
        "TIDAK_SEIMBANG",
        400,
        `Dokumen tidak seimbang untuk unit ${unit}: Debit ${tot.debit} ≠ Kredit ${tot.kredit}.`,
      );
    }
  }

  if (totalDebit !== totalKredit) {
    throw new KeuanganError("TIDAK_SEIMBANG", 400, "Total Debit dan Kredit dokumen harus sama.");
  }

  return lines;
}

/**
 * Menghitung statement SQL untuk menghapus/menambah `journal_lines` dan memperbarui `saldo_bulanan` dalam satu batch D1.
 */
export async function buildJournalAndMonthlyStatements(db, documentId, newLines) {
  const deltaMap = new Map();
  const addDelta = (unitKode, accountKode, bulan, dDebit, dKredit) => {
    const key = `${unitKode}|${accountKode}|${bulan}`;
    const cur = deltaMap.get(key) || { unit_kode: unitKode, account_kode: accountKode, bulan, debit: 0, kredit: 0 };
    cur.debit += dDebit;
    cur.kredit += dKredit;
    deltaMap.set(key, cur);
  };

  if (documentId) {
    const { results: oldLines } = await db
      .prepare("SELECT unit_kode, account_kode, substr(tanggal, 1, 7) AS bulan, debit, kredit FROM journal_lines WHERE document_id = ?")
      .bind(documentId)
      .all();
    for (const old of oldLines) {
      addDelta(old.unit_kode, old.account_kode, old.bulan, -old.debit, -old.kredit);
    }
  }

  for (const line of newLines) {
    addDelta(line.unit_kode, line.account_kode, line.tanggal.slice(0, 7), line.debit, line.kredit);
  }

  const stmts = [];
  if (documentId) {
    stmts.push(db.prepare("DELETE FROM journal_lines WHERE document_id = ?").bind(documentId));
  }

  if (newLines.length > 0) {
    const col = (c) => `json_extract(value, '$.${c}')`;
    stmts.push(
      db
        .prepare(
          `INSERT INTO journal_lines (id, document_id, tanggal, unit_kode, account_kode, debit, kredit, contact_id, keterangan, currency, amount_fc)
           SELECT ${col("id")}, ?, ${col("tanggal")}, ${col("unit_kode")}, ${col("account_kode")}, ${col("debit")}, ${col("kredit")},
                  ${col("contact_id")}, ${col("keterangan")}, ${col("currency")}, ${col("amount_fc")}
           FROM json_each(?)`,
        )
        .bind(documentId, JSON.stringify(newLines)),
    );
  }

  const deltas = [...deltaMap.values()].filter((d) => d.debit !== 0 || d.kredit !== 0);
  if (deltas.length > 0) {
    const col = (c) => `json_extract(value, '$.${c}')`;
    stmts.push(
      db
        .prepare(
          `INSERT INTO saldo_bulanan (unit_kode, account_kode, bulan, debit, kredit)
           SELECT ${col("unit_kode")}, ${col("account_kode")}, ${col("bulan")}, ${col("debit")}, ${col("kredit")}
           FROM json_each(?) WHERE 1
           ON CONFLICT(unit_kode, account_kode, bulan) DO UPDATE SET
             debit = saldo_bulanan.debit + excluded.debit,
             kredit = saldo_bulanan.kredit + excluded.kredit`,
        )
        .bind(JSON.stringify(deltas)),
    );
  }

  return stmts;
}

export function buildAuditStatement(db, { entity, entityId, action, before = null, after = null, actor, now }) {
  return db
    .prepare(
      "INSERT INTO audit_log (id, entity, entity_id, action, before_json, after_json, by, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      newId(),
      entity,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      actor.uid,
      actor.name || actor.uid,
      now,
    );
}

/** Mengambil dan memajukan nomor transaksi berikutnya berdasarkan tabel `numbering`. */
export async function allocateDocNumber(db, docType, unitKode, tanggal, now, actor) {
  const cfg = (await db.prepare("SELECT * FROM numbering WHERE doc_type = ?").bind(docType).first()) || {
    doc_type: docType,
    format: "{NO}",
    digits: 5,
    start_no: 10001,
    reset: "tidak",
    last_json: "{}",
  };
  let lastMap = {};
  try {
    lastMap = JSON.parse(cfg.last_json || "{}");
  } catch {
    lastMap = {};
  }
  const [year, month] = tanggal.split("-");
  const bucketKey = cfg.reset === "bulan" ? `${year}-${month}` : cfg.reset === "tahun" ? year : "global";
  const current = Number(lastMap[bucketKey] || cfg.start_no - 1);
  let seq = current + 1;

  // Pastikan nomor tidak bentrok jika user pernah menginput manual
  let formatted = "";
  for (let tries = 0; tries < 100; tries++) {
    const padded = String(seq).padStart(cfg.digits || 5, "0");
    formatted = (cfg.format || "{NO}")
      .replaceAll("{UNIT}", unitKode || "")
      .replaceAll("{YYYY}", year)
      .replaceAll("{MM}", month)
      .replaceAll("{NO}", padded);
    const exists = await db.prepare("SELECT 1 FROM documents WHERE type = ? AND no = ?").bind(docType, formatted).first();
    if (!exists) break;
    seq += 1;
  }

  lastMap[bucketKey] = seq;
  const updateStmt = db
    .prepare(
      `INSERT INTO numbering (doc_type, format, digits, start_no, reset, last_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc_type) DO UPDATE SET last_json = excluded.last_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(docType, cfg.format, cfg.digits, cfg.start_no, cfg.reset, JSON.stringify(lastMap), now, actor.uid);

  return { no: formatted, updateStmt };
}
