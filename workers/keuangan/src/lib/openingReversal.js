// Jurnal pembalik otomatis Saldo Awal (01-dasar.md, "Saldo Awal"): transaksi bertanggal SEBELUM tanggal
// konversi suatu anak perusahaan dibalik pada tanggal konversi, agar saldo per tanggal konversi tetap sama
// dengan Saldo Awal. Berlaku juga untuk transaksi yang dibuat/diubah/dihapus setelah Saldo Awal diterbitkan.
import { buildJournalAndMonthlyStatements, normalizeAndCheckBalance } from "./ledger.js";

const OB_TYPES = "('opening_balance', 'opening_balance_reversal')";

export const reversalDocId = (unitKode) => `obrev_${unitKode}`;

/** Saldo Awal yang sudah diterbitkan per unit: Map<unit_kode, { id, tanggal }>. */
export async function loadPublishedOpenings(db, unitKodes) {
  const kodes = [...new Set(unitKodes.filter(Boolean))];
  if (kodes.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT id, unit_kode, tanggal FROM documents
       WHERE type = 'opening_balance' AND status = 'selesai' AND deleted_at IS NULL
         AND unit_kode IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(kodes))
    .all();
  return new Map(results.map((r) => [r.unit_kode, { id: r.id, tanggal: r.tanggal }]));
}

/**
 * Statement D1 untuk menyusun ulang dokumen pembalik `obrev_{unit}`.
 * - `opening`: Saldo Awal yang berlaku ({ id, tanggal }) atau null bila tidak ada / masih draf (pembalik dihapus).
 * - `excludeDocId` + `extraLines`: dipakai saat dokumen sedang disimpan/dihapus dalam batch yang sama, karena
 *   baris jurnal barunya belum ada di database. Baris lama dokumen itu diabaikan, `extraLines` dipakai sebagai gantinya.
 */
export async function buildOpeningReversalStatements(db, unitKode, { opening, excludeDocId = null, extraLines = [], now, actor }) {
  const revId = reversalDocId(unitKode);
  const existingRev = await db.prepare("SELECT id FROM documents WHERE id = ?").bind(revId).first();
  const stmts = [];

  const dropRev = async () => {
    if (!existingRev) return [];
    return [
      ...(await buildJournalAndMonthlyStatements(db, revId, [])),
      db.prepare("DELETE FROM documents WHERE id = ?").bind(revId),
    ];
  };

  if (!opening) return dropRev();

  const { results: priorTotals } = await db
    .prepare(
      `SELECT jl.account_kode, SUM(jl.debit) AS d, SUM(jl.kredit) AS k
       FROM journal_lines jl
       JOIN documents d ON d.id = jl.document_id
       WHERE jl.unit_kode = ? AND jl.tanggal < ? AND d.type NOT IN ${OB_TYPES} AND jl.document_id != ?
       GROUP BY jl.account_kode`,
    )
    .bind(unitKode, opening.tanggal, excludeDocId || "")
    .all();

  const net = new Map();
  for (const pt of priorTotals) net.set(pt.account_kode, (pt.d || 0) - (pt.k || 0));
  for (const l of extraLines) {
    if (l.unit_kode !== unitKode || !(l.tanggal < opening.tanggal)) continue;
    net.set(l.account_kode, (net.get(l.account_kode) || 0) + (l.debit || 0) - (l.kredit || 0));
  }

  const revLines = [];
  for (const [accountKode, n] of net.entries()) {
    if (n === 0) continue;
    revLines.push({
      tanggal: opening.tanggal,
      unit_kode: unitKode,
      account_kode: accountKode,
      debit: n < 0 ? Math.abs(n) : 0,
      kredit: n > 0 ? n : 0,
      keterangan: `Pembalik otomatis transaksi sebelum saldo awal ${opening.tanggal}`,
    });
  }

  if (revLines.length === 0) return dropRev();

  const balancedRev = normalizeAndCheckBalance(revLines);
  if (!existingRev) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, parent_id, memo, created_at, created_by, updated_at, updated_by)
           VALUES (?, 'opening_balance_reversal', ?, ?, ?, 'selesai', ?, 'Jurnal pembalik otomatis sebelum tanggal konversi', ?, ?, ?, ?)`,
        )
        .bind(revId, `SAREV-${unitKode}`, opening.tanggal, unitKode, opening.id, now, actor.uid, now, actor.uid),
    );
  } else {
    stmts.push(
      db
        .prepare("UPDATE documents SET tanggal = ?, parent_id = ?, updated_at = ?, updated_by = ? WHERE id = ?")
        .bind(opening.tanggal, opening.id, now, actor.uid, revId),
    );
  }
  stmts.push(...(await buildJournalAndMonthlyStatements(db, revId, balancedRev)));
  return stmts;
}

/**
 * Untuk dokumen transaksi biasa: susun ulang pembalik pada setiap unit yang punya Saldo Awal terbit
 * dan tersentuh baris (lama atau baru) bertanggal sebelum tanggal konversinya.
 */
export async function buildReversalsForDocumentChange(db, { docId, oldLines, newLines, now, actor }) {
  const all = [...oldLines, ...newLines];
  const openings = await loadPublishedOpenings(db, all.map((l) => l.unit_kode));
  const stmts = [];
  for (const [unitKode, opening] of openings.entries()) {
    const touches = all.some((l) => l.unit_kode === unitKode && l.tanggal < opening.tanggal);
    if (!touches) continue;
    stmts.push(...(await buildOpeningReversalStatements(db, unitKode, { opening, excludeDocId: docId, extraLines: newLines, now, actor })));
  }
  return stmts;
}
