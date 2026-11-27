// Lampiran terkompresi di D1 (keuangan_lampiran_1, _2). Foto maks 80 KB, PDF maks 300 KB.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { cleanText, invalid, newId } from "../lib/validate.js";

const MAX_PHOTO_BYTES = 80 * 1024;
const MAX_PDF_BYTES = 300 * 1024;
const DB_SOFT_CAP = 450 * 1024 * 1024;

function getAttachDb(env, dbIndex) {
  if (dbIndex === 2 && env.ATTACH_DB_2) return env.ATTACH_DB_2;
  return env.ATTACH_DB_1 || env.DB; // fallback bila unit test hanya mengonfigurasi DB
}

export async function uploadAttachment(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();

  const body = await readJson(ctx.request, 600_000);
  const mime = String(body.mime || "");
  const filename = cleanText(body.filename || "lampiran", 120);
  const base64 = String(body.data_base64 || "");
  if (!base64) throw invalid("data_base64", "Isi file lampiran wajib dikirim.");

  const allowedPhoto = mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
  const allowedPdf = mime === "application/pdf";
  if (!allowedPhoto && !allowedPdf) {
    throw invalid("mime", "Hanya foto (JPEG/PNG/WebP) atau PDF yang didukung.");
  }

  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  if (allowedPhoto && bytes.length > MAX_PHOTO_BYTES) {
    throw invalid("size", `Ukuran foto ${Math.round(bytes.length / 1024)} KB melebihi batas 80 KB setelah kompresi.`);
  }
  if (allowedPdf && bytes.length > MAX_PDF_BYTES) {
    throw invalid("size", "Ukuran PDF melebihi 300 KB. Foto saja halaman notanya agar lebih kecil.");
  }

  // Pilih D1 lampiran aktif yang masih < 450 MB
  const { results: dbRows } = await db.prepare("SELECT * FROM lampiran_db WHERE aktif = 1 ORDER BY db_index").all();
  let chosen = dbRows.find((r) => (r.bytes || 0) + bytes.length < DB_SOFT_CAP);
  if (!chosen) chosen = { db_index: dbRows[0]?.db_index || 1 };

  const targetDb = getAttachDb(ctx.env, chosen.db_index);
  const id = newId();

  await targetDb
    .prepare("INSERT INTO attachment_blobs (id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, mime, bytes, bytes.length, now)
    .run();

  await db.batch([
    db
      .prepare(
        "INSERT INTO attachments (id, document_id, owner_type, filename, mime, size, db_index, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, body.document_id || null, cleanText(body.owner_type || "document", 40), filename, mime, bytes.length, chosen.db_index, now, actor.uid),
    db
      .prepare("INSERT INTO lampiran_db (db_index, bytes, aktif) VALUES (?, ?, 1) ON CONFLICT(db_index) DO UPDATE SET bytes = lampiran_db.bytes + excluded.bytes")
      .bind(chosen.db_index, bytes.length),
  ]);

  return {
    attachment: { id, filename, mime, size: bytes.length, db_index: chosen.db_index },
  };
}

export async function downloadAttachment(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const id = ctx.params[0];
  const meta = await db.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first();
  if (!meta) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Lampiran tidak ditemukan.");

  const targetDb = getAttachDb(ctx.env, meta.db_index);
  const blobRow = await targetDb.prepare("SELECT mime, data FROM attachment_blobs WHERE id = ?").bind(id).first();
  if (!blobRow) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Isi lampiran tidak ditemukan.");

  return new Response(new Uint8Array(blobRow.data), {
    status: 200,
    headers: {
      "content-type": blobRow.mime || meta.mime,
      "content-disposition": `inline; filename="${meta.filename}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}

export async function deleteAttachment(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const id = ctx.params[0];
  const meta = await db.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first();
  if (!meta) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Lampiran tidak ditemukan.");

  const targetDb = getAttachDb(ctx.env, meta.db_index);
  await targetDb.prepare("DELETE FROM attachment_blobs WHERE id = ?").bind(id).run();
  await db.batch([
    db.prepare("DELETE FROM attachments WHERE id = ?").bind(id),
    db.prepare("UPDATE lampiran_db SET bytes = MAX(0, bytes - ?) WHERE db_index = ?").bind(meta.size, meta.db_index),
  ]);
  return { ok: true };
}
