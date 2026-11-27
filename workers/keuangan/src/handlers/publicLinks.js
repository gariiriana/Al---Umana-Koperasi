// Tautan publik dokumen (/f/:token) untuk bagikan via WhatsApp, tanpa login, read-only.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createOrGetPublicLink(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const docId = String(body.document_id || "");
  if (!docId) throw new KeuanganError("VALIDATION_ERROR", 400, "document_id wajib diisi.");

  const doc = await db.prepare("SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL").bind(docId).first();
  if (!doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");

  const existing = await db
    .prepare("SELECT * FROM public_links WHERE document_id = ? AND dicabut = 0 ORDER BY created_at DESC LIMIT 1")
    .bind(docId)
    .first();
  if (existing) return { link: existing };

  const token = randomToken();
  await db
    .prepare("INSERT INTO public_links (token, document_id, dicabut, created_at, created_by) VALUES (?, ?, 0, ?, ?)")
    .bind(token, docId, now, actor.uid)
    .run();
  return { link: await db.prepare("SELECT * FROM public_links WHERE token = ?").bind(token).first() };
}

export async function revokePublicLink(ctx) {
  await requireKeuangan(ctx);
  const token = ctx.params[0];
  await ctx.env.DB.prepare("UPDATE public_links SET dicabut = 1 WHERE token = ?").bind(token).run();
  return { ok: true };
}

export async function getPublicDocument(ctx) {
  const db = ctx.env.DB;
  const token = ctx.params[0];
  const link = await db.prepare("SELECT * FROM public_links WHERE token = ? AND dicabut = 0").bind(token).first();
  if (!link) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Tautan dokumen tidak valid atau sudah dicabut.");

  const doc = await db
    .prepare(
      `SELECT d.id, d.type, d.no, d.tanggal, d.unit_kode, d.status, d.subtotal, d.pajak, d.pemotongan, d.total, d.pesan,
         u.nama AS unit_nama, u.alamat AS unit_alamat, u.telepon AS unit_telepon, u.npwp AS unit_npwp, u.pj_nama, u.pj_jabatan,
         c.nama_tampilan AS contact_nama, c.alamat_tagih AS contact_alamat
       FROM documents d
       LEFT JOIN units u ON u.kode = d.unit_kode
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
    )
    .bind(link.document_id)
    .first();
  if (!doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");

  const { results: lines } = await db
    .prepare(
      `SELECT dl.seq, dl.account_kode, a.nama AS account_nama, dl.deskripsi, dl.jumlah, dl.tax_amount, dl.unit_kode
       FROM document_lines dl
       LEFT JOIN accounts a ON a.kode = dl.account_kode
       WHERE dl.document_id = ?
       ORDER BY dl.seq`,
    )
    .bind(doc.id)
    .all();

  const companyRow = await db.prepare("SELECT value_json FROM settings WHERE key = 'perusahaan'").first();
  let company = {};
  try {
    company = JSON.parse(companyRow?.value_json || "{}");
  } catch {
    company = {};
  }

  return { document: doc, lines, company };
}
