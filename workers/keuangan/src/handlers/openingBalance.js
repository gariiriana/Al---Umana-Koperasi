// Saldo Awal per anak perusahaan & tanggal konversi (sesuai 01-dasar.md).
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import {
  assertNotLocked,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { buildOpeningReversalStatements } from "../lib/openingReversal.js";
import { invalid, isInt, newId, requireIsoDate, requireUnitKode, todayWib } from "../lib/validate.js";

export async function getOpeningBalance(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const doc = unitKode
    ? await db
        .prepare("SELECT * FROM documents WHERE type = 'opening_balance' AND unit_kode = ? AND deleted_at IS NULL")
        .bind(requireUnitKode(unitKode))
        .first()
    : await db
        .prepare("SELECT * FROM documents WHERE type = 'opening_balance' AND deleted_at IS NULL ORDER BY tanggal DESC LIMIT 1")
        .first();

  if (!doc) return { openingBalance: null, lines: [] };

  const { results: lines } = await db
    .prepare("SELECT dl.*, a.nama AS account_nama, a.kategori FROM document_lines dl JOIN accounts a ON a.kode = dl.account_kode WHERE dl.document_id = ? ORDER BY dl.seq")
    .bind(doc.id)
    .all();

  return { openingBalance: doc, lines };
}

export async function putOpeningBalance(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const tanggal = requireIsoDate(body.tanggal, "tanggal");
  if (tanggal > todayWib(now)) throw invalid("tanggal", "Tanggal konversi tidak boleh melewati hari ini.");
  const status = body.status === "draf" ? "draf" : "selesai";

  const unit = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(unitKode).first();
  if (!unit) throw invalid("unit_kode", `Anak perusahaan ${unitKode} tidak ditemukan.`);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const cleanLines = [];
  for (const [i, l] of rawLines.entries()) {
    const debit = Number(l.debit ?? 0);
    const kredit = Number(l.kredit ?? 0);
    if (debit === 0 && kredit === 0) continue;
    if (!isInt(debit, { min: 0 }) || !isInt(kredit, { min: 0 }) || (debit > 0 && kredit > 0)) {
      throw invalid("lines", `Baris ${i + 1}: isi Debit atau Kredit dengan angka sen positif.`, i);
    }
    const acc = await db.prepare("SELECT kode, is_header, kategori FROM accounts WHERE kode = ?").bind(l.account_kode).first();
    if (!acc || acc.is_header) throw invalid("lines", `Baris ${i + 1}: akun ${l.account_kode} tidak valid.`, i);
    cleanLines.push({ account_kode: acc.kode, debit, kredit, deskripsi: l.deskripsi || "Saldo Awal" });
  }

  // Cek kunci periode pada tanggal baru maupun tanggal lama (jika sudah pernah diterbitkan)
  const existing = await db
    .prepare("SELECT * FROM documents WHERE type = 'opening_balance' AND unit_kode = ? AND deleted_at IS NULL")
    .bind(unitKode)
    .first();
  await assertNotLocked(db, [tanggal, existing?.tanggal]);

  const docId = existing?.id || newId();
  const docNo = existing?.no || `SA-${unitKode}`;

  // Jika diterbitkan dan Debit != Kredit, selisih otomatis masuk ke Ekuitas Saldo Awal (3-30999)
  let totalDebit = cleanLines.reduce((s, l) => s + l.debit, 0);
  let totalKredit = cleanLines.reduce((s, l) => s + l.kredit, 0);
  const postedInputLines = [...cleanLines];

  if (status === "selesai" && totalDebit !== totalKredit) {
    const mapRow = await db.prepare("SELECT account_kode FROM account_mapping WHERE key = 'ekuitas_saldo_awal'").first();
    const eqCode = mapRow?.account_kode || "3-30999";
    const diff = totalDebit - totalKredit;
    postedInputLines.push({
      account_kode: eqCode,
      debit: diff < 0 ? Math.abs(diff) : 0,
      kredit: diff > 0 ? diff : 0,
      deskripsi: "Penyeimbang Ekuitas Saldo Awal",
      autoBalance: true,
    });
    totalDebit = postedInputLines.reduce((s, l) => s + l.debit, 0);
    totalKredit = postedInputLines.reduce((s, l) => s + l.kredit, 0);
  }

  const journalRows =
    status === "selesai"
      ? normalizeAndCheckBalance(
          postedInputLines.map((l) => ({
            tanggal,
            unit_kode: unitKode,
            account_kode: l.account_kode,
            debit: l.debit,
            kredit: l.kredit,
            keterangan: l.deskripsi || "Saldo Awal",
          })),
        )
      : [];

  const stmts = [];
  if (existing) {
    stmts.push(
      db
        .prepare("UPDATE documents SET tanggal = ?, status = ?, subtotal = ?, total = ?, memo = ?, updated_at = ?, updated_by = ? WHERE id = ?")
        .bind(tanggal, status, totalDebit, totalDebit, body.memo || "", now, actor.uid, docId),
      db.prepare("DELETE FROM document_lines WHERE document_id = ?").bind(docId),
    );
  } else {
    stmts.push(
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, subtotal, total, memo, created_at, created_by, updated_at, updated_by)
           VALUES (?, 'opening_balance', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(docId, docNo, tanggal, unitKode, status, totalDebit, totalDebit, body.memo || "", now, actor.uid, now, actor.uid),
    );
  }

  // Simpan baris input user (tanpa baris auto-balance agar form tetap menampilkan nilai inputan user, kecuali disetujui)
  for (const [idx, l] of postedInputLines.entries()) {
    const val = l.debit > 0 ? l.debit : -l.kredit;
    stmts.push(
      db
        .prepare(
          "INSERT INTO document_lines (id, document_id, seq, account_kode, deskripsi, qty_milli, harga, jumlah, unit_kode) VALUES (?, ?, ?, ?, ?, 1000, ?, ?, ?)",
        )
        .bind(newId(), docId, idx + 1, l.account_kode, l.deskripsi || "", val, val, unitKode),
    );
  }

  stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, journalRows)));

  // Jurnal pembalik otomatis jika sudah ada transaksi bertanggal sebelum tanggal konversi (01-dasar.md).
  // Dihitung ulang juga setiap kali transaksi sebelum tanggal konversi dibuat/diubah/dihapus (documents.js).
  stmts.push(
    ...(await buildOpeningReversalStatements(db, unitKode, {
      opening: status === "selesai" ? { id: docId, tanggal } : null,
      now,
      actor,
    })),
  );

  stmts.push(
    buildAuditStatement(db, {
      entity: "opening_balance",
      entityId: docId,
      action: existing ? "update" : "create",
      after: { unit_kode: unitKode, tanggal, status, totalDebit, totalKredit },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return getOpeningBalance({ ...ctx, url: new URL(`http://localhost/api/keuangan/opening-balance?unit_kode=${unitKode}`) });
}
