// Handler Rilis 2: Transaksi Berulang (`recurring`) & helper jadwal berikutnya.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { addDays, cleanText, invalid, isInt, newId, requireIsoDate, todayWib } from "../lib/validate.js";
import { upsertTransactionDoc } from "./salesPurchase.js";

export function computeNextOccurrence(isoDate, intervalN, intervalUnit) {
  const n = Math.max(1, Number(intervalN) || 1);
  if (intervalUnit === "hari") return addDays(isoDate, n);
  if (intervalUnit === "minggu") return addDays(isoDate, n * 7);
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (intervalUnit === "bulan") dt.setUTCMonth(dt.getUTCMonth() + n);
  else if (intervalUnit === "tahun") dt.setUTCFullYear(dt.getUTCFullYear() + n);
  else return addDays(isoDate, n * 30);
  return dt.toISOString().slice(0, 10);
}

export async function listRecurring(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT r.*, d.type, d.no, d.unit_kode, d.contact_id, d.total, d.memo, c.nama_tampilan AS contact_nama
       FROM recurring r
       JOIN documents d ON d.id = r.template_document_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       ORDER BY r.aktif DESC, r.berikut ASC`,
    )
    .all();
  return { recurring: results };
}

export async function saveRecurring(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const templateId = String(body.template_document_id || "");
  const doc = await db.prepare("SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL").bind(templateId).first();
  if (!doc) throw invalid("template_document_id", "Dokumen template tidak ditemukan.");

  const intervalN = Number(body.interval_n || 1);
  if (!isInt(intervalN, { min: 1 })) throw invalid("interval_n", "Interval harus >= 1.");
  const intervalUnit = ["hari", "minggu", "bulan", "tahun"].includes(body.interval_unit) ? body.interval_unit : "bulan";
  const akhirTipe = ["tidak_pernah", "tanggal", "jumlah"].includes(body.akhir_tipe) ? body.akhir_tipe : "tidak_pernah";
  const berikut = requireIsoDate(body.berikut || todayWib(now), "berikut");
  const id = body.id ? String(body.id) : newId();

  await db
    .prepare(
      `INSERT INTO recurring (id, template_document_id, interval_n, interval_unit, akhir_tipe, akhir_nilai, berikut, aktif, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET interval_n = excluded.interval_n, interval_unit = excluded.interval_unit, akhir_tipe = excluded.akhir_tipe, akhir_nilai = excluded.akhir_nilai, berikut = excluded.berikut, aktif = excluded.aktif, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(id, templateId, intervalN, intervalUnit, akhirTipe, cleanText(body.akhir_nilai || "", 40), berikut, body.aktif === 0 ? 0 : 1, now, actor.uid, now, actor.uid)
    .run();

  return { recurring: await db.prepare("SELECT * FROM recurring WHERE id = ?").bind(id).first() };
}

export async function deleteRecurring(ctx) {
  await requireKeuangan(ctx);
  const res = await ctx.env.DB.prepare("DELETE FROM recurring WHERE id = ?").bind(ctx.params[0]).run();
  if (!res.meta?.changes) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Jadwal berulang tidak ditemukan.");
  return { ok: true };
}

/**
 * Mengeksekusi transaksi berulang yang sudah jatuh tempo (dipanggil cron atau tombol manual).
 */
export async function processDueRecurringBatch(db, { now = Date.now(), actor = { uid: "cron", name: "Cron Berulang" }, maxItems = 10 } = {}) {
  const today = todayWib(now);
  const { results: due } = await db
    .prepare("SELECT * FROM recurring WHERE aktif = 1 AND berikut <= ? ORDER BY berikut ASC LIMIT ?")
    .bind(today, maxItems)
    .all();

  let generated = 0;
  for (const r of due) {
    const tpl = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(r.template_document_id).first();
    if (!tpl) {
      await db.prepare("UPDATE recurring SET aktif = 0 WHERE id = ?").bind(r.id).run();
      continue;
    }
    const { results: lines } = await db.prepare("SELECT * FROM document_lines WHERE document_id = ? ORDER BY seq").bind(tpl.id).all();
    const { results: tags } = await db.prepare("SELECT tag_id FROM document_tags WHERE document_id = ?").bind(tpl.id).all();
    const tplData = JSON.parse(tpl.data_json || "{}");

    try {
      await upsertTransactionDoc(db, {
        body: {
          type: tpl.type,
          tanggal: r.berikut,
          unit_kode: tpl.unit_kode,
          contact_id: tpl.contact_id,
          term_id: tpl.term_id,
          warehouse_id: tpl.warehouse_id,
          currency: tpl.currency,
          kurs: tpl.kurs,
          harga_termasuk_pajak: tpl.harga_termasuk_pajak,
          bayar_dari: tplData.bayar_dari,
          bayar_nanti: tplData.bayar_nanti,
          memo: tpl.memo ? `[Berulang] ${tpl.memo}` : `Transaksi berulang dari ${tpl.no}`,
          tags: tags.map((t) => t.tag_id),
          lines: lines.map((l) => ({
            product_id: l.product_id,
            account_kode: l.account_kode,
            deskripsi: l.deskripsi,
            qty_milli: l.qty_milli,
            satuan: l.satuan,
            harga: l.harga,
            diskon_bp: l.diskon_bp,
            tax_id: l.tax_id,
            jumlah: l.jumlah,
          })),
        },
        existingDoc: null,
        actor,
        now,
      });
      generated += 1;
    } catch {
      // Tetap lanjut agar item lain tidak terblokir (misal periode terkunci)
    }

    const nextDate = computeNextOccurrence(r.berikut, r.interval_n, r.interval_unit);
    let stillActive = 1;
    let nextVal = r.akhir_nilai;
    if (r.akhir_tipe === "tanggal" && r.akhir_nilai && nextDate > r.akhir_nilai) {
      stillActive = 0;
    } else if (r.akhir_tipe === "jumlah") {
      const rem = Math.max(0, Number(r.akhir_nilai || 0) - 1);
      nextVal = String(rem);
      if (rem <= 0) stillActive = 0;
    }

    await db
      .prepare("UPDATE recurring SET berikut = ?, aktif = ?, akhir_nilai = ?, updated_at = ? WHERE id = ?")
      .bind(nextDate, stillActive, nextVal, now, r.id)
      .run();
  }
  return { generated };
}
