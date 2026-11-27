// Cron `*/5 * * * *` Worker Keuangan (Sisa Rilis 1 + Rilis 2-4):
// 1. Proses antrean rekalkulasi HPP (`recalc_queue`)
// 2. Jalankan transaksi berulang (`recurring`)
// 3. Notifikasi faktur/tagihan jatuh tempo, stok minimum, aset siap susut, dan ringkasan bulanan
import { processRecalcQueueBatch } from "./lib/inventoryEngine.js";
import { processDueRecurringBatch } from "./handlers/recurring.js";
import { addDays, newId, todayWib } from "./lib/validate.js";

async function createDueNotifications(db, now) {
  const today = todayWib(now);
  const bulan = today.slice(0, 7);

  // 1. Faktur/Tagihan jatuh tempo dalam 3 hari atau lewat
  const { results: dueDocs } = await db
    .prepare(
      `SELECT id, type, no, tanggal, jatuh_tempo, sisa
       FROM documents
       WHERE deleted_at IS NULL AND type IN ('sales_invoice', 'purchase_invoice', 'expense')
         AND sisa > 0 AND jatuh_tempo IS NOT NULL AND jatuh_tempo <= ?
       LIMIT 20`,
    )
    .bind(addDays(today, 3))
    .all();

  for (const d of dueDocs) {
    const exists = await db
      .prepare("SELECT 1 FROM notifications WHERE kind = 'jatuh_tempo' AND json_extract(payload_json, '$.doc_id') = ? AND json_extract(payload_json, '$.tanggal') = ? LIMIT 1")
      .bind(d.id, today)
      .first();
    if (!exists) {
      await db
        .prepare("INSERT INTO notifications (id, kind, payload_json, read_by_json, at) VALUES (?, 'jatuh_tempo', ?, '[]', ?)")
        .bind(newId(), JSON.stringify({ doc_id: d.id, no: d.no, type: d.type, tanggal: today, jatuh_tempo: d.jatuh_tempo, sisa: d.sisa, title: `${d.no} jatuh tempo ${d.jatuh_tempo}` }), now)
        .run();
    }
  }

  // 2. Stok minimum
  const { results: lowStock } = await db
    .prepare(
      `SELECT p.id, p.nama, p.batas_min, IFNULL(pc.qty_milli, 0) AS qty_milli
       FROM products p
       LEFT JOIN product_cost pc ON pc.product_id = p.id
       WHERE p.arsip = 0 AND p.monitor_stok = 1 AND p.batas_min > 0 AND IFNULL(pc.qty_milli, 0) <= p.batas_min
       LIMIT 20`,
    )
    .all();
  for (const p of lowStock) {
    const exists = await db
      .prepare("SELECT 1 FROM notifications WHERE kind = 'stok_minimum' AND json_extract(payload_json, '$.product_id') = ? AND json_extract(payload_json, '$.tanggal') = ? LIMIT 1")
      .bind(p.id, today)
      .first();
    if (!exists) {
      await db
        .prepare("INSERT INTO notifications (id, kind, payload_json, read_by_json, at) VALUES (?, 'stok_minimum', ?, '[]', ?)")
        .bind(newId(), JSON.stringify({ product_id: p.id, nama: p.nama, tanggal: today, qty_milli: p.qty_milli, title: `Stok ${p.nama} mencapai batas minimum` }), now)
        .run();
    }
  }

  // 3. Jadwal penyusutan aset bulan ini yang belum diterapkan
  const { results: dueDep } = await db
    .prepare("SELECT ds.asset_id, ds.bulan, a.nama FROM depreciation_schedule ds JOIN assets a ON a.id = ds.asset_id WHERE ds.bulan <= ? AND ds.document_id IS NULL LIMIT 20")
    .bind(bulan)
    .all();
  if (dueDep.length > 0) {
    const exists = await db
      .prepare("SELECT 1 FROM notifications WHERE kind = 'penyusutan_siap' AND json_extract(payload_json, '$.periode') = ? LIMIT 1")
      .bind(bulan)
      .first();
    if (!exists) {
      await db
        .prepare("INSERT INTO notifications (id, kind, payload_json, read_by_json, at) VALUES (?, 'penyusutan_siap', ?, '[]', ?)")
        .bind(newId(), JSON.stringify({ periode: bulan, count: dueDep.length, title: `${dueDep.length} jadwal penyusutan aset siap diterapkan` }), now)
        .run();
    }
  }
}

export async function runScheduledTasks(env, { now = Date.now() } = {}) {
  const db = env?.DB;
  if (!db) return { ok: false };
  const actor = { uid: "cron", name: "Cron Keuangan" };
  const recalc = await processRecalcQueueBatch(db, { now, actor, maxProducts: 5 });
  const recurring = await processDueRecurringBatch(db, { now, actor, maxItems: 5 });
  await createDueNotifications(db, now);
  return { ok: true, recalc, recurring };
}
