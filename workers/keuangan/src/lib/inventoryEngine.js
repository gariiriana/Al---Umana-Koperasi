// Engine Stok, Harga Pokok Rata-Rata Bergerak (Moving Average), stock_bulanan, dan Rekalkulasi HPP Mundur (Rilis 2-4).
import { KeuanganError } from "../http.js";
import { INTER_UNIT_ACCOUNTS } from "./seedData.js";
import { buildJournalAndMonthlyStatements, normalizeAndCheckBalance } from "./ledger.js";
import { buildReversalsForDocumentChange } from "./openingReversal.js";
import { cleanText, newId } from "./validate.js";

/**
 * Pembagian bulat dengan pembulatan setengah ke atas (aman hingga angka sangat besar menggunakan BigInt).
 * num >= 0, den > 0.
 */
export function roundDivPositive(num, den) {
  if (den <= 0) return 0;
  const n = BigInt(Math.round(num));
  const d = BigInt(Math.round(den));
  if (n <= 0n) return 0;
  return Number((n + d / 2n) / d);
}

/** Hitung jumlah stok fisik produk per tanggal pada gudang tertentu (atau semua gudang jika warehouseId null). */
export async function getProductStockAsOf(db, productId, warehouseId = null, asOfDate = "9999-12-31", excludeDocId = null) {
  const conds = ["product_id = ?", "tanggal <= ?"];
  const params = [productId, asOfDate];
  if (warehouseId) {
    conds.push("warehouse_id = ?");
    params.push(warehouseId);
  }
  if (excludeDocId) {
    conds.push("document_id != ?");
    params.push(excludeDocId);
  }
  const row = await db
    .prepare(`SELECT COALESCE(SUM(qty_milli), 0) AS qty FROM stock_moves WHERE ${conds.join(" AND ")}`)
    .bind(...params)
    .first();
  return row?.qty ?? 0;
}

/**
 * Menghitung harga rata-rata bergerak per unit (sen per 1.000 milli = 1 satuan dasar) per tanggal tertentu,
 * dengan menyimulasikan semua mutasi `productId` hingga `(asOfDate, seq)` yang ada di database.
 */
export async function computeAvgUnitCostAsOf(db, productId, asOfDate = "9999-12-31", excludeDocId = null, fallbackUnitCost = 0) {
  const { results } = await db
    .prepare(
      `SELECT document_id, qty_milli, nilai FROM stock_moves
       WHERE product_id = ? AND tanggal <= ? ${excludeDocId ? "AND document_id != ?" : ""}
       ORDER BY tanggal ASC, seq ASC, rowid ASC`,
    )
    .bind(...(excludeDocId ? [productId, asOfDate, excludeDocId] : [productId, asOfDate]))
    .all();

  let runQty = 0;
  let runVal = 0;
  let lastAvg = fallbackUnitCost || 0;

  for (const m of results) {
    if (m.qty_milli > 0) {
      runQty += m.qty_milli;
      runVal += m.nilai;
      if (runQty > 0) lastAvg = roundDivPositive(Math.max(0, runVal) * 1000, runQty);
    } else if (m.qty_milli < 0) {
      const outQty = Math.abs(m.qty_milli);
      const outVal = runQty > 0 ? roundDivPositive(outQty * Math.max(0, runVal), runQty) : Math.round((outQty * lastAvg) / 1000);
      runQty -= outQty;
      runVal -= outVal;
      if (runQty > 0) lastAvg = roundDivPositive(Math.max(0, runVal) * 1000, runQty);
    }
  }
  return { qty_milli: runQty, nilai: runVal, avg_unit_cost: lastAvg };
}

/**
 * Mengambil biaya keluar (sen, positif) untuk `outQtyMilli` barang keluar per tanggal tertentu,
 * sekaligus memperhitungkan mutasi lain yang sudah ada di batch dokumen yang sama.
 */
export async function estimateOutCost(db, productId, tanggal, outQtyMilli, excludeDocId, pendingInBatch = [], fallbackCost = 0, allowNegative = false, warehouseId = null) {
  const { qty_milli: curQty, nilai: curVal, avg_unit_cost } = await computeAvgUnitCostAsOf(db, productId, tanggal, excludeDocId, fallbackCost);

  let availQty = curQty;
  let availVal = curVal;
  for (const p of pendingInBatch) {
    if (p.product_id === productId) {
      availQty += p.qty_milli;
      availVal += p.nilai;
    }
  }

  if (warehouseId && !allowNegative) {
    const whQty = await getProductStockAsOf(db, productId, warehouseId, tanggal, excludeDocId);
    const pendingWh = pendingInBatch.filter((p) => p.product_id === productId && p.warehouse_id === warehouseId).reduce((s, p) => s + p.qty_milli, 0);
    if (whQty + pendingWh < outQtyMilli) {
      throw new KeuanganError("STOK_TIDAK_CUKUP", 400, "Stok produk di gudang ini tidak mencukupi untuk transaksi ini.");
    }
  } else if (!allowNegative && availQty < outQtyMilli) {
    throw new KeuanganError("STOK_TIDAK_CUKUP", 400, "Stok produk tidak mencukupi.");
  }

  if (availQty >= outQtyMilli && availQty > 0 && availVal >= 0) {
    return roundDivPositive(outQtyMilli * availVal, availQty);
  }
  const unitAvg = availQty > 0 && availVal > 0 ? roundDivPositive(availVal * 1000, availQty) : avg_unit_cost || fallbackCost;
  return roundDivPositive(outQtyMilli * unitAvg, 1000);
}

/**
 * Menghasilkan statements D1 untuk:
 * 1) Menghapus stock_moves lama dokumen & menyisipkan stock_moves baru
 * 2) Memperbarui stock_bulanan dalam delta atomik
 * 3) Mengantrekan produk yang terpengaruh ke `recalc_queue` bila ada mutasi sesudah tanggal terawal perubahan.
 */
export async function buildStockAndMonthlyStatements(db, documentId, newMoves, now) {
  const { results: oldMoves } = documentId
    ? await db.prepare("SELECT product_id, warehouse_id, tanggal, qty_milli, nilai FROM stock_moves WHERE document_id = ?").bind(documentId).all()
    : { results: [] };

  const deltaMap = new Map();
  const minDateByProd = new Map();

  const noteProdDate = (pid, tgl) => {
    if (!pid || !tgl) return;
    const prev = minDateByProd.get(pid);
    if (!prev || tgl < prev) minDateByProd.set(pid, tgl);
  };

  const addDelta = (pid, wh, bulan, dqm, dqk, dvm, dvk) => {
    const wid = wh || "_UNASSIGNED_";
    const key = `${pid}|${wid}|${bulan}`;
    const cur = deltaMap.get(key) || {
      product_id: pid,
      warehouse_id: wid,
      bulan,
      qty_masuk: 0,
      qty_keluar: 0,
      nilai_masuk: 0,
      nilai_keluar: 0,
    };
    cur.qty_masuk += dqm;
    cur.qty_keluar += dqk;
    cur.nilai_masuk += dvm;
    cur.nilai_keluar += dvk;
    deltaMap.set(key, cur);
  };

  for (const o of oldMoves) {
    noteProdDate(o.product_id, o.tanggal);
    const b = o.tanggal.slice(0, 7);
    if (o.qty_milli >= 0) addDelta(o.product_id, o.warehouse_id, b, -o.qty_milli, 0, -o.nilai, 0);
    else addDelta(o.product_id, o.warehouse_id, b, 0, -Math.abs(o.qty_milli), 0, -Math.abs(o.nilai));
  }

  const { results: prodSettingRow } = await db.prepare("SELECT value_json FROM settings WHERE key = 'produk'").all();
  let allowNegative = false;
  try {
    allowNegative = Boolean(JSON.parse(prodSettingRow[0]?.value_json || "{}").izinkan_stok_negatif);
  } catch {
    allowNegative = false;
  }

  const normalizedMoves = newMoves.map((m, idx) => {
    noteProdDate(m.product_id, m.tanggal);
    const qm = Math.trunc(m.qty_milli);
    const val = Math.trunc(m.nilai);
    const b = m.tanggal.slice(0, 7);
    if (qm >= 0) addDelta(m.product_id, m.warehouse_id, b, qm, 0, val, 0);
    else addDelta(m.product_id, m.warehouse_id, b, 0, Math.abs(qm), 0, Math.abs(val));
    return {
      id: m.id || newId(),
      line_id: m.line_id || null,
      tanggal: m.tanggal,
      seq: m.seq ?? idx + 1,
      product_id: m.product_id,
      warehouse_id: m.warehouse_id || null,
      qty_milli: qm,
      nilai: val,
      batch_no: m.batch_no || null,
      serial_no: m.serial_no || null,
    };
  });

  // Validasi kronologis seluruh timeline: ubah/hapus transaksi penambah stok tidak boleh membuat stok minus pada tanggal mana pun
  if (!allowNegative && minDateByProd.size > 0) {
    for (const pid of minDateByProd.keys()) {
      const prod = await db.prepare("SELECT nama, satuan, monitor_stok FROM products WHERE id = ?").bind(pid).first();
      if (!prod || !prod.monitor_stok) continue;
      const { results: otherMoves } = await db
        .prepare("SELECT tanggal, seq, rowid, warehouse_id, qty_milli FROM stock_moves WHERE product_id = ? AND document_id != ? ORDER BY tanggal ASC, seq ASC, rowid ASC")
        .bind(pid, documentId || "")
        .all();
      const combined = [
        ...otherMoves.map((m) => ({ tanggal: m.tanggal, seq: m.seq || 0, rowid: m.rowid || 0, warehouse_id: m.warehouse_id || "_UNASSIGNED_", qty_milli: m.qty_milli })),
        ...normalizedMoves.filter((m) => m.product_id === pid).map((m, i) => ({ tanggal: m.tanggal, seq: m.seq || 0, rowid: 9_999_999 + i, warehouse_id: m.warehouse_id || "_UNASSIGNED_", qty_milli: m.qty_milli })),
      ].sort((a, b) => (a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? -1 : 1) : a.seq !== b.seq ? a.seq - b.seq : a.rowid - b.rowid));

      let totalRun = 0;
      const whRun = new Map();
      for (const mv of combined) {
        totalRun += mv.qty_milli;
        const wQty = (whRun.get(mv.warehouse_id) || 0) + mv.qty_milli;
        whRun.set(mv.warehouse_id, wQty);
        if (wQty < 0 || totalRun < 0) {
          const negVal = wQty < 0 ? wQty : totalRun;
          throw new KeuanganError(
            "STOK_NEGATIF",
            400,
            `Operasi ditolak: perubahan atau penghapusan transaksi ini menyebabkan stok ${prod.nama} menjadi negatif (${negVal / 1000} ${prod.satuan}) pada tanggal ${mv.tanggal}.`,
          );
        }
      }
    }
  }

  const stmts = [];
  if (documentId) {
    stmts.push(db.prepare("DELETE FROM stock_moves WHERE document_id = ?").bind(documentId));
  }

  if (normalizedMoves.length > 0) {
    const col = (c) => `json_extract(value, '$.${c}')`;
    stmts.push(
      db
        .prepare(
          `INSERT INTO stock_moves (id, document_id, line_id, tanggal, seq, product_id, warehouse_id, qty_milli, nilai, batch_no, serial_no)
           SELECT ${col("id")}, ?, ${col("line_id")}, ${col("tanggal")}, ${col("seq")}, ${col("product_id")}, ${col("warehouse_id")},
                  ${col("qty_milli")}, ${col("nilai")}, ${col("batch_no")}, ${col("serial_no")}
           FROM json_each(?)`,
        )
        .bind(documentId, JSON.stringify(normalizedMoves)),
    );
  }

  const deltas = [...deltaMap.values()].filter(
    (d) => d.qty_masuk !== 0 || d.qty_keluar !== 0 || d.nilai_masuk !== 0 || d.nilai_keluar !== 0,
  );
  if (deltas.length > 0) {
    const col = (c) => `json_extract(value, '$.${c}')`;
    stmts.push(
      db
        .prepare(
          `INSERT INTO stock_bulanan (product_id, warehouse_id, bulan, qty_masuk, qty_keluar, nilai_masuk, nilai_keluar)
           SELECT ${col("product_id")}, ${col("warehouse_id")}, ${col("bulan")}, ${col("qty_masuk")}, ${col("qty_keluar")}, ${col("nilai_masuk")}, ${col("nilai_keluar")}
           FROM json_each(?) WHERE 1
           ON CONFLICT(product_id, warehouse_id, bulan) DO UPDATE SET
             qty_masuk = stock_bulanan.qty_masuk + excluded.qty_masuk,
             qty_keluar = stock_bulanan.qty_keluar + excluded.qty_keluar,
             nilai_masuk = stock_bulanan.nilai_masuk + excluded.nilai_masuk,
             nilai_keluar = stock_bulanan.nilai_keluar + excluded.nilai_keluar`,
        )
        .bind(JSON.stringify(deltas)),
    );
  }

  // Periksa apakah produk punya mutasi sesudah minDate -> masukkan recalc_queue; sekaligus segarkan cache product_cost bila tidak perlu antrean mundur
  for (const [pid, minTgl] of minDateByProd.entries()) {
    const later = await db
      .prepare("SELECT 1 FROM stock_moves WHERE product_id = ? AND document_id != ? AND tanggal > ? LIMIT 1")
      .bind(pid, documentId || "", minTgl)
      .first();
    // Jika perubahan adalah pada transaksi yang memiliki mutasi sesudahnya (misal pembelian bertanggal mundur atau edit/hapus), antrekan HPP recalc
    const touchesExistingAfter = later || (oldMoves.some((o) => o.product_id === pid) && (await db.prepare("SELECT 1 FROM stock_moves WHERE product_id = ? AND tanggal >= ? AND document_id != ? AND qty_milli < 0 LIMIT 1").bind(pid, minTgl, documentId || "").first()));
    if (touchesExistingAfter) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO recalc_queue (product_id, dari_tanggal, status, updated_at)
             VALUES (?, ?, 'pending', ?)
             ON CONFLICT(product_id) DO UPDATE SET
               dari_tanggal = CASE WHEN excluded.dari_tanggal < recalc_queue.dari_tanggal THEN excluded.dari_tanggal ELSE recalc_queue.dari_tanggal END,
               status = 'pending',
               updated_at = excluded.updated_at`,
          )
          .bind(pid, minTgl, now),
      );
    } else {
      // Hitung langsung cache total qty & nilai produk
      const existingAll = await computeAvgUnitCostAsOf(db, pid, "9999-12-31", documentId);
      let finalQty = existingAll.qty_milli;
      let finalVal = existingAll.nilai;
      for (const nm of normalizedMoves.filter((x) => x.product_id === pid)) {
        finalQty += nm.qty_milli;
        finalVal += nm.nilai;
      }
      stmts.push(
        db
          .prepare(
            `INSERT INTO product_cost (product_id, qty_milli, nilai, dihitung_sampai) VALUES (?, ?, ?, ?)
             ON CONFLICT(product_id) DO UPDATE SET qty_milli = excluded.qty_milli, nilai = excluded.nilai, dihitung_sampai = excluded.dihitung_sampai`,
          )
          .bind(pid, finalQty, finalVal, minTgl),
      );
    }
  }

  return stmts;
}

/**
 * Memproses antrean hitung ulang HPP (`recalc_queue`) secara bertahap (aman untuk batas CPU cron Cloudflare).
 * Menghitung ulang rata-rata bergerak dari awal sejarah mutasi produk, memperbarui nilai `stock_moves`, `stock_bulanan`,
 * baris jurnal HPP/Persediaan di dokumen yang berubah, serta `product_cost`.
 */
export async function processRecalcQueueBatch(db, { now = Date.now(), actor = { uid: "cron", name: "Cron HPP" }, maxProducts = 5 } = {}) {
  const { results: queue } = await db
    .prepare("SELECT rq.*, p.nama AS product_nama, p.harga_beli, p.akun_persediaan, p.akun_beli FROM recalc_queue rq JOIN products p ON p.id = rq.product_id ORDER BY rq.dari_tanggal ASC LIMIT ?")
    .bind(maxProducts)
    .all();

  if (queue.length === 0) return { processedProducts: 0, updatedDocs: 0 };

  const { results: maps } = await db.prepare("SELECT key, account_kode FROM account_mapping").all();
  const mapObj = Object.fromEntries(maps.map((m) => [m.key, m.account_kode]));

  let processedProducts = 0;
  let updatedDocs = 0;

  for (const item of queue) {
    const pid = item.product_id;
    const { results: moves } = await db
      .prepare(
        `SELECT sm.*, d.type AS doc_type, d.unit_kode AS doc_unit, d.parent_id AS doc_parent_id, d.data_json AS doc_data_json
         FROM stock_moves sm
         JOIN documents d ON d.id = sm.document_id
         WHERE sm.product_id = ?
         ORDER BY sm.tanggal ASC, sm.seq ASC, sm.rowid ASC`,
      )
      .bind(pid)
      .all();

    let runQty = 0;
    let runVal = 0;
    let lastAvg = item.harga_beli || 0;

    const changedMoves = [];
    const affectedDocIds = new Set();

    for (const m of moves) {
      if (m.qty_milli > 0) {
        runQty += m.qty_milli;
        runVal += m.nilai;
        if (runQty > 0) lastAvg = roundDivPositive(Math.max(0, runVal) * 1000, runQty);
      } else if (m.qty_milli < 0) {
        const outQty = Math.abs(m.qty_milli);
        const newOutVal = runQty > 0 ? roundDivPositive(outQty * Math.max(0, runVal), runQty) : roundDivPositive(outQty * lastAvg, 1000);
        const expectedSigned = -newOutVal;
        if (m.nilai !== expectedSigned) {
          changedMoves.push({ move: m, oldNilai: m.nilai, newNilai: expectedSigned, oldAbs: Math.abs(m.nilai), newAbs: newOutVal });
          affectedDocIds.add(m.document_id);
        }
        runQty -= outQty;
        runVal -= newOutVal;
        if (runQty > 0) lastAvg = roundDivPositive(Math.max(0, runVal) * 1000, runQty);
      }
    }

    const stmts = [];
    if (changedMoves.length > 0) {
      const sbDeltas = new Map();
      for (const cm of changedMoves) {
        stmts.push(db.prepare("UPDATE stock_moves SET nilai = ? WHERE id = ?").bind(cm.newNilai, cm.move.id));
        const wid = cm.move.warehouse_id || "_UNASSIGNED_";
        const bulan = cm.move.tanggal.slice(0, 7);
        const key = `${wid}|${bulan}`;
        sbDeltas.set(key, {
          warehouse_id: wid,
          bulan,
          delta: (sbDeltas.get(key)?.delta || 0) + (cm.newAbs - cm.oldAbs),
        });
      }
      for (const d of sbDeltas.values()) {
        if (d.delta === 0) continue;
        stmts.push(
          db
            .prepare("UPDATE stock_bulanan SET nilai_keluar = nilai_keluar + ? WHERE product_id = ? AND warehouse_id = ? AND bulan = ?")
            .bind(d.delta, pid, d.warehouse_id, d.bulan),
        );
      }

      // Perbarui baris jurnal HPP/Persediaan di setiap dokumen yang nilai keluarnya berubah
      for (const docId of affectedDocIds) {
        const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first();
        if (!doc) continue;
        const invAcc = item.akun_persediaan || mapObj.persediaan || "1-10200";
        const cogsAcc = item.akun_beli || mapObj.pembelian_cogs || "5-50000";

        const docChanges = changedMoves.filter((c) => c.move.document_id === docId);
        const netDelta = docChanges.reduce((s, c) => s + (c.newAbs - c.oldAbs), 0);
        if (netDelta === 0) continue;

        const { results: curJournal } = await db.prepare("SELECT * FROM journal_lines WHERE document_id = ?").bind(docId).all();
        const oldJournalSnapshot = curJournal.map((j) => ({ ...j }));

        if (doc.type === "sales_invoice" || doc.type === "sales_delivery") {
          // Tambah/kurang baris Debit cogsAcc & Kredit invAcc sebesar netDelta
          let adjustedD = false;
          let adjustedK = false;
          for (const jl of curJournal) {
            if (!adjustedD && jl.account_kode === cogsAcc && jl.debit > 0) {
              jl.debit += netDelta;
              adjustedD = true;
            } else if (!adjustedK && jl.account_kode === invAcc && jl.kredit > 0) {
              jl.kredit += netDelta;
              adjustedK = true;
            }
          }
          if (!adjustedD || !adjustedK) {
            curJournal.push(
              { tanggal: doc.tanggal, unit_kode: doc.unit_kode, account_kode: cogsAcc, debit: Math.max(0, netDelta), kredit: Math.max(0, -netDelta), contact_id: doc.contact_id, keterangan: "Penyesuaian HPP" },
              { tanggal: doc.tanggal, unit_kode: doc.unit_kode, account_kode: invAcc, debit: Math.max(0, -netDelta), kredit: Math.max(0, netDelta), contact_id: doc.contact_id, keterangan: "Penyesuaian Persediaan HPP" },
            );
          }
        } else if (doc.type === "warehouse_transfer") {
          const dataJson = JSON.parse(doc.data_json || "{}");
          if (dataJson.antar_unit) {
            const uAsal = dataJson.unit_asal;
            const uTujuan = dataJson.unit_tujuan;
            for (const jl of curJournal) {
              if (jl.unit_kode === uAsal && jl.account_kode === INTER_UNIT_ACCOUNTS.PIUTANG) jl.debit += netDelta;
              if (jl.unit_kode === uAsal && jl.account_kode === invAcc && jl.kredit > 0) jl.kredit += netDelta;
              if (jl.unit_kode === uTujuan && jl.account_kode === invAcc && jl.debit > 0) jl.debit += netDelta;
              if (jl.unit_kode === uTujuan && jl.account_kode === INTER_UNIT_ACCOUNTS.HUTANG) jl.kredit += netDelta;
            }
          }
        }

        const balanced = normalizeAndCheckBalance(curJournal);
        stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balanced)));
        stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: oldJournalSnapshot, newLines: balanced, now, actor })));
        updatedDocs += 1;
      }
    }

    const lastDate = moves.length > 0 ? moves[moves.length - 1].tanggal : item.dari_tanggal;
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_cost (product_id, qty_milli, nilai, dihitung_sampai) VALUES (?, ?, ?, ?)
           ON CONFLICT(product_id) DO UPDATE SET qty_milli = excluded.qty_milli, nilai = excluded.nilai, dihitung_sampai = excluded.dihitung_sampai`,
        )
        .bind(pid, runQty, runVal, lastDate),
      db.prepare("DELETE FROM recalc_queue WHERE product_id = ?").bind(pid),
      db
        .prepare("INSERT INTO notifications (id, kind, payload_json, read_by_json, at) VALUES (?, 'hpp_recalc', ?, '[]', ?)")
        .bind(newId(), JSON.stringify({ product_id: pid, title: `Rekalkulasi ${item.product_nama} selesai`, message: `Hitung ulang HPP untuk ${cleanText(item.product_nama, 80)} selesai.` }), now),
    );

    await db.batch(stmts);
    processedProducts += 1;
  }

  return { processedProducts, updatedDocs };
}
