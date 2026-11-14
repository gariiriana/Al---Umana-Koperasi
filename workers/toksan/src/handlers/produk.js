// Master produk Toksan: nama, dapur, kategori, harga reseller.
import { ToksanError, readJson } from "../http.js";
import { requireStaff } from "../session.js";
import { DAPUR, KATEGORI, cleanName, invalid, isWholeNumber, nameKey, newId } from "../validate.js";

const MAX_HARGA = 10_000_000;

export function produkView(row) {
  return {
    id: row.id,
    name: row.name,
    dapur: row.dapur,
    kategori: row.kategori,
    harga: row.harga,
    active: row.active === 1,
    updatedAt: row.updated_at,
  };
}

function checkFields(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name || name.length > 80) throw invalid("name");
    out.name = name;
  }
  if (!partial || body.dapur !== undefined) {
    if (!DAPUR.includes(body.dapur)) throw invalid("dapur");
    out.dapur = body.dapur;
  }
  if (!partial || body.kategori !== undefined) {
    if (!KATEGORI.includes(body.kategori)) throw invalid("kategori");
    out.kategori = body.kategori;
  }
  if (!partial || body.harga !== undefined) {
    if (!isWholeNumber(body.harga, { max: MAX_HARGA })) throw invalid("harga");
    out.harga = body.harga;
  }
  if (partial && body.active !== undefined) {
    if (typeof body.active !== "boolean") throw invalid("active");
    out.active = body.active ? 1 : 0;
  }
  return out;
}

async function assertNameFree(db, name, exceptId = "") {
  const clash = await db.prepare("SELECT id FROM products WHERE name_key = ? AND id != ?").bind(nameKey(name), exceptId).first();
  if (clash) throw new ToksanError("NAMA_SUDAH_ADA", 409);
}

export async function getProduct(db, id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
}

export async function listProduk(ctx) {
  await requireStaff(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM products ORDER BY CASE dapur WHEN 'bakery' THEN 0 WHEN 'hangat_saji' THEN 1 ELSE 2 END, name COLLATE NOCASE").all();
  return { produk: results.map(produkView) };
}

export async function createProduk(ctx) {
  const staff = await requireStaff(ctx);
  const fields = checkFields(await readJson(ctx.request), { partial: false });
  await assertNameFree(ctx.env.DB, fields.name);
  const now = ctx.deps.now();
  const id = newId();
  await ctx.env.DB.prepare(
    "INSERT INTO products (id, name, name_key, dapur, kategori, harga, active, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).bind(id, fields.name, nameKey(fields.name), fields.dapur, fields.kategori, fields.harga, now, now, staff.uid).run();
  return { produk: produkView(await getProduct(ctx.env.DB, id)) };
}

export async function patchProduk(ctx) {
  const staff = await requireStaff(ctx);
  const [id] = ctx.params;
  const fields = checkFields(await readJson(ctx.request), { partial: true });
  const current = await getProduct(ctx.env.DB, id);
  if (!current) throw new ToksanError("PRODUK_TIDAK_ADA", 404);
  if (fields.name !== undefined) {
    await assertNameFree(ctx.env.DB, fields.name, id);
    fields.name_key = nameKey(fields.name);
  }
  const columns = Object.keys(fields);
  if (columns.length) {
    await ctx.env.DB.prepare(
      `UPDATE products SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`,
    ).bind(...columns.map((c) => fields[c]), ctx.deps.now(), staff.uid, id).run();
  }
  return { produk: produkView(await getProduct(ctx.env.DB, id)) };
}
