// Handler Rilis 3: Impor Mutasi Rekening (BCA, Mandiri, BRI, BNI, Danamon, OCBC, BSI, Jurnal CSV),
// Rekonsiliasi Bank, Aturan Rekonsiliasi (`recon_rules`), dan Tab Laporan Bank.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { cleanText, invalid, isInt, newId, requireIsoDate } from "../lib/validate.js";
import { upsertDocument } from "./documents.js";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseAmountSen(raw) {
  if (typeof raw === "number") return Math.round(raw * 100);
  const clean = String(raw || "").trim().replace(/[^0-9.,-]/g, "");
  if (!clean) return 0;
  // Deteksi pemisah desimal
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let norm = clean;
  if (lastComma > lastDot) {
    norm = clean.replaceAll(".", "").replace(",", ".");
  } else if (lastDot > lastComma && clean.length - lastDot <= 3) {
    norm = clean.replaceAll(",", "");
  } else {
    norm = clean.replaceAll(",", "").replaceAll(".", "");
  }
  const num = Number(norm);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function normalizeDateFlexible(s) {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

/**
 * Mengurai teks CSV mutasi bank dengan dukungan format Jurnal standar maupun 7 bank Indonesia.
 */
export function parseBankCsvText(csvText, preset = "jurnal") {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const splitCsvLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if ((ch === "," || ch === ";") && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const rows = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const cols = splitCsvLine(lines[idx]);
    if (cols.length < 3) continue;
    const tanggal = normalizeDateFlexible(cols[0]);
    if (!tanggal) continue; // lewati header
    const deskripsi = cleanText(cols[1], 300);

    let masuk = 0;
    let keluar = 0;
    if (cols.length >= 4 && (preset === "jurnal" || preset === "mandiri" || preset === "bri" || preset === "bsi" || preset === "ocbc")) {
      const c2 = parseAmountSen(cols[2]);
      const c3 = parseAmountSen(cols[3]);
      if (c2 > 0 || c3 > 0) {
        masuk = Math.max(0, c2);
        keluar = Math.max(0, c3);
      }
    } else {
      // Format BCA/BNI/Danamon: Tanggal, Keterangan, Jumlah, CR/DB (atau bertanda +/-)
      const amt = parseAmountSen(cols[2]);
      const flag = String(cols[3] || "").toUpperCase();
      if (flag.includes("DB") || flag.includes("DEBET") || amt < 0) keluar = Math.abs(amt);
      else masuk = Math.abs(amt);
    }

    if (masuk === 0 && keluar === 0) continue;
    rows.push({ tanggal, deskripsi, masuk, keluar });
  }
  return rows;
}

export async function listBankStatements(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const accountKode = ctx.url.searchParams.get("account_kode") || "";
  const matched = ctx.url.searchParams.get("matched");
  const conds = [];
  const params = [];
  if (accountKode) {
    conds.push("bs.account_kode = ?");
    params.push(accountKode);
  }
  if (matched === "0" || matched === "1") {
    conds.push("bs.matched = ?");
    params.push(Number(matched));
  }

  const { results } = await db
    .prepare(
      `SELECT bs.*,
              (SELECT d.no FROM reconciliation_matches rm JOIN documents d ON d.id = rm.document_id WHERE rm.statement_id = bs.id LIMIT 1) AS matched_doc_no,
              (SELECT rm.document_id FROM reconciliation_matches rm WHERE rm.statement_id = bs.id LIMIT 1) AS matched_doc_id
       FROM bank_statements bs
       ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
       ORDER BY bs.tanggal DESC, bs.created_at DESC`,
    )
    .bind(...params)
    .all();

  return { statements: results };
}

export async function importBankStatements(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const accountKode = String(body.account_kode || "");
  const acc = await db.prepare("SELECT * FROM accounts WHERE kode = ? AND kategori IN (3, 9) AND is_header = 0").bind(accountKode).first();
  if (!acc) throw invalid("account_kode", "Akun Kas & Bank tidak valid.");

  const rawRows = Array.isArray(body.rows) ? body.rows : parseBankCsvText(body.csv || "", body.preset || "jurnal");
  if (rawRows.length === 0) throw invalid("rows", "Tidak ada baris mutasi yang valid untuk diimpor.");

  let inserted = 0;
  let skippedDuplicate = 0;

  for (const r of rawRows) {
    const tanggal = requireIsoDate(r.tanggal, "tanggal");
    const deskripsi = cleanText(r.deskripsi, 300);
    const masuk = Math.max(0, Math.trunc(r.masuk || 0));
    const keluar = Math.max(0, Math.trunc(r.keluar || 0));
    if (masuk === 0 && keluar === 0) continue;

    const hash = await sha256Hex(`${accountKode}|${tanggal}|${deskripsi}|${masuk}|${keluar}`);
    const exists = await db.prepare("SELECT id FROM bank_statements WHERE hash = ?").bind(hash).first();
    if (exists) {
      skippedDuplicate += 1;
      continue;
    }
    await db
      .prepare(
        "INSERT INTO bank_statements (id, account_kode, tanggal, deskripsi, masuk, keluar, hash, matched, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
      )
      .bind(newId(), accountKode, tanggal, deskripsi, masuk, keluar, hash, now, actor.uid)
      .run();
    inserted += 1;
  }

  return { inserted, skippedDuplicate };
}

export async function deleteBankStatement(ctx) {
  await requireKeuangan(ctx);
  const id = ctx.params[0];
  const st = await ctx.env.DB.prepare("SELECT matched FROM bank_statements WHERE id = ?").bind(id).first();
  if (!st) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Mutasi bank tidak ditemukan.");
  if (st.matched) throw new KeuanganError("SUDAH_DIREKONSILIASI", 400, "Mutasi yang sudah cocok harus dibatalkan rekonsiliasinya terlebih dahulu.");
  await ctx.env.DB.prepare("DELETE FROM bank_statements WHERE id = ?").bind(id).run();
  return { ok: true };
}

export async function reconcileMatch(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const statementId = String(body.statement_id || "");
  const documentId = String(body.document_id || "");
  if (!statementId || !documentId) throw invalid("statement_id", "Mutasi bank dan dokumen wajib dipilih.");

  const st = await db.prepare("SELECT * FROM bank_statements WHERE id = ?").bind(statementId).first();
  const doc = await db.prepare("SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL").bind(documentId).first();
  if (!st || !doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Mutasi atau dokumen tidak ditemukan.");

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO reconciliation_matches (statement_id, document_id) VALUES (?, ?)").bind(statementId, documentId),
    db.prepare("UPDATE bank_statements SET matched = 1 WHERE id = ?").bind(statementId),
    db
      .prepare("INSERT INTO audit_log (id, entity, entity_id, action, after_json, by, by_name, at) VALUES (?, 'reconciliation', ?, 'match', ?, ?, ?, ?)")
      .bind(newId(), statementId, JSON.stringify({ document_id: documentId }), actor.uid, actor.name, now),
  ]);
  return { ok: true };
}

export async function unmatchReconciliation(ctx) {
  await requireKeuangan(ctx);
  const body = await readJson(ctx.request);
  const statementId = String(body.statement_id || "");
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("DELETE FROM reconciliation_matches WHERE statement_id = ?").bind(statementId),
    ctx.env.DB.prepare("UPDATE bank_statements SET matched = 0 WHERE id = ?").bind(statementId),
  ]);
  return { ok: true };
}

export async function createTxFromStatement(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const st = await db.prepare("SELECT * FROM bank_statements WHERE id = ?").bind(body.statement_id).first();
  if (!st) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Mutasi bank tidak ditemukan.");
  if (st.matched) throw invalid("statement_id", "Mutasi ini sudah direkonsiliasi.");

  const isReceive = st.masuk > 0;
  const amt = isReceive ? st.masuk : st.keluar;
  const counterAcc = String(body.account_kode || (isReceive ? "7-70000" : "8-80001"));

  const created = await upsertDocument(db, {
    body: {
      type: isReceive ? "receive_money" : "send_money",
      tanggal: st.tanggal,
      unit_kode: body.unit_kode,
      [isReceive ? "setor_ke" : "bayar_dari"]: st.account_kode,
      memo: cleanText(body.memo || st.deskripsi, 300),
      lines: [{ account_kode: counterAcc, deskripsi: st.deskripsi, jumlah: amt }],
    },
    existingDoc: null,
    actor,
    now,
  });

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO reconciliation_matches (statement_id, document_id) VALUES (?, ?)").bind(st.id, created.document.id),
    db.prepare("UPDATE bank_statements SET matched = 1 WHERE id = ?").bind(st.id),
  ]);

  return { ok: true, document: created.document };
}

// ─── Aturan Rekonsiliasi Bank (`recon_rules`) ────────────────────────────────

export async function listReconRules(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM recon_rules ORDER BY nama").all();
  return { rules: results.map((r) => ({ ...r, kondisi: JSON.parse(r.kondisi_json || "{}"), aksi: JSON.parse(r.aksi_json || "{}") })) };
}

export async function saveReconRule(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama aturan rekonsiliasi wajib diisi.");
  const id = body.id ? String(body.id) : newId();

  await db
    .prepare(
      `INSERT INTO recon_rules (id, nama, account_kode, arah, kondisi_json, aksi_json, aktif, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, account_kode = excluded.account_kode, arah = excluded.arah, kondisi_json = excluded.kondisi_json, aksi_json = excluded.aksi_json, aktif = excluded.aktif, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(
      id, nama, body.account_kode || null, body.arah === "keluar" ? "keluar" : "masuk",
      JSON.stringify(body.kondisi || {}), JSON.stringify(body.aksi || {}),
      body.aktif === 0 ? 0 : 1, now, actor.uid, now, actor.uid,
    )
    .run();
  return { rule: await db.prepare("SELECT * FROM recon_rules WHERE id = ?").bind(id).first() };
}

export async function deleteReconRule(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM recon_rules WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function applyReconRules(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const [{ results: rules }, { results: unmatched }] = await Promise.all([
    db.prepare("SELECT * FROM recon_rules WHERE aktif = 1").all(),
    db.prepare("SELECT * FROM bank_statements WHERE matched = 0 ORDER BY tanggal ASC LIMIT 50").all(),
  ]);

  let matchedCount = 0;
  for (const st of unmatched) {
    const dir = st.masuk > 0 ? "masuk" : "keluar";
    const amt = st.masuk > 0 ? st.masuk : st.keluar;
    for (const r of rules) {
      if (r.arah !== dir) continue;
      if (r.account_kode && r.account_kode !== st.account_kode) continue;
      const cond = JSON.parse(r.kondisi_json || "{}");
      const aksi = JSON.parse(r.aksi_json || "{}");
      const contains = String(cond.mengandung || "").toLowerCase();
      if (contains && !st.deskripsi.toLowerCase().includes(contains)) continue;
      if (aksi.buat_transaksi && aksi.account_kode && aksi.unit_kode) {
        const created = await upsertDocument(db, {
          body: {
            type: dir === "masuk" ? "receive_money" : "send_money",
            tanggal: st.tanggal,
            unit_kode: aksi.unit_kode,
            [dir === "masuk" ? "setor_ke" : "bayar_dari"]: st.account_kode,
            memo: st.deskripsi,
            lines: [{ account_kode: aksi.account_kode, deskripsi: st.deskripsi, jumlah: amt }],
          },
          existingDoc: null,
          actor,
          now,
        });
        await db.batch([
          db.prepare("INSERT OR IGNORE INTO reconciliation_matches (statement_id, document_id) VALUES (?, ?)").bind(st.id, created.document.id),
          db.prepare("UPDATE bank_statements SET matched = 1 WHERE id = ?").bind(st.id),
        ]);
        matchedCount += 1;
        break;
      }
    }
  }
  return { matchedCount };
}

export async function reportBankRekonsiliasi(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const accountKode = ctx.url.searchParams.get("account_kode") || "";
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT a.kode, a.nama, a.unit_kode,
              IFNULL((SELECT SUM(sb.debit - sb.kredit) FROM saldo_bulanan sb WHERE sb.account_kode = a.kode), 0) AS saldo_buku,
              IFNULL((SELECT SUM(bs.masuk - bs.keluar) FROM bank_statements bs WHERE bs.account_kode = a.kode), 0) AS saldo_rekening,
              (SELECT COUNT(*) FROM bank_statements bs WHERE bs.account_kode = a.kode AND bs.matched = 0) AS belum_cocok
       FROM accounts a
       WHERE a.kategori = 3 AND a.is_header = 0 ${accountKode ? "AND a.kode = ?" : ""}
       ORDER BY a.kode`,
    )
    .bind(...(accountKode ? [accountKode] : []))
    .all();
  return { rows: results };
}
