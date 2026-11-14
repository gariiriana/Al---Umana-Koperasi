// Penjualan harian: satu baris = produk × sesi × pihak per tanggal. Harga disalin saat baris dibuat.
import { ToksanError, readJson } from "../http.js";
import { requireStaff } from "../session.js";
import { PIHAK, SESI, checkBatch, checkTanggal, invalid, isWholeNumber, newId } from "../validate.js";

const MAX_QTY = 100_000;

export function penjualanView(row) {
  return {
    id: row.id,
    tanggal: row.tanggal,
    productId: row.product_id,
    productName: row.product_name,
    dapur: row.dapur,
    harga: row.harga,
    sesi: row.sesi,
    pihak: row.pihak,
    jumlah: row.jumlah,
    retur: row.retur,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function rowsOf(db, tanggal) {
  const { results } = await db.prepare(
    "SELECT * FROM sales WHERE tanggal = ? ORDER BY CASE dapur WHEN 'bakery' THEN 0 WHEN 'hangat_saji' THEN 1 ELSE 2 END, product_name COLLATE NOCASE, CASE sesi WHEN 'pagi' THEN 0 WHEN 'siang' THEN 1 ELSE 2 END, pihak",
  ).bind(tanggal).all();
  return results;
}

function checkRow(row, i) {
  if (typeof row.productId !== "string" || !row.productId) throw invalid("productId", i);
  if (!SESI.includes(row.sesi)) throw invalid("sesi", i);
  if (!PIHAK.includes(row.pihak)) throw invalid("pihak", i);
  if (!isWholeNumber(row.jumlah, { max: MAX_QTY })) throw invalid("jumlah", i);
  if (!isWholeNumber(row.retur, { max: MAX_QTY })) throw invalid("retur", i);
  if (row.retur > row.jumlah) throw invalid("retur", i);
}

export async function getPenjualan(ctx) {
  await requireStaff(ctx);
  const tanggal = checkTanggal(ctx.url.searchParams.get("tanggal"), ctx.deps.now());
  return { tanggal, rows: (await rowsOf(ctx.env.DB, tanggal)).map(penjualanView) };
}

export async function putPenjualan(ctx) {
  const staff = await requireStaff(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const { tanggal, rows, hapus } = checkBatch(await readJson(ctx.request), now);
  rows.forEach(checkRow);

  const stored = new Map((await rowsOf(db, tanggal)).map((r) => [r.id, r]));
  const deleted = new Set(hapus);
  const products = await productsById(db, rows.filter((r) => !r.id).map((r) => r.productId));

  const key = (r) => `${r.productId ?? r.product_id}|${r.sesi}|${r.pihak}`;
  const referenced = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const taken = new Set([...stored.values()].filter((r) => !deleted.has(r.id) && !referenced.has(r.id)).map(key));

  const changedIds = [];
  const writes = [];
  for (const [i, row] of rows.entries()) {
    let base;
    if (row.id) {
      base = stored.get(row.id);
      if (!base || deleted.has(row.id)) throw new ToksanError("BARIS_TIDAK_ADA", 404, { row: i });
      row.productId = base.product_id;
    } else {
      const product = products.get(row.productId);
      if (!product) throw new ToksanError("PRODUK_TIDAK_ADA", 400, { row: i });
      if (product.active !== 1) throw new ToksanError("PRODUK_NONAKTIF", 400, { row: i });
      base = { id: newId(), product_name: product.name, dapur: product.dapur, harga: product.harga, created_at: now, created_by: staff.uid };
    }
    if (taken.has(key(row))) throw new ToksanError("DUPLIKAT", 409, { row: i });
    taken.add(key(row));
    // An untouched row keeps its updated_at/updated_by: who last changed it stays true.
    if (row.id && base.sesi === row.sesi && base.pihak === row.pihak && base.jumlah === row.jumlah && base.retur === row.retur) continue;
    if (row.id) changedIds.push(row.id);
    writes.push({
      id: base.id, product_id: row.productId, product_name: base.product_name, dapur: base.dapur, harga: base.harga,
      sesi: row.sesi, pihak: row.pihak, jumlah: row.jumlah, retur: row.retur, created_at: base.created_at, created_by: base.created_by,
    });
  }

  // Changed rows are deleted and re-inserted with the same id, so swapping sesi/pihak between rows never trips UNIQUE.
  // One DELETE and one INSERT for the whole day (json_each), whatever the row count: D1 caps queries per request.
  const removeIds = [...[...deleted].filter((id) => stored.has(id)), ...changedIds];
  const statements = [];
  if (removeIds.length) {
    statements.push(db.prepare("DELETE FROM sales WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(removeIds)));
  }
  if (writes.length) {
    const col = (name) => `json_extract(value, '$.${name}')`;
    statements.push(db.prepare(
      `INSERT INTO sales (id, tanggal, product_id, product_name, dapur, harga, sesi, pihak, jumlah, retur, created_at, created_by, updated_at, updated_by)
       SELECT ${col("id")}, ?, ${col("product_id")}, ${col("product_name")}, ${col("dapur")}, ${col("harga")}, ${col("sesi")}, ${col("pihak")},
              ${col("jumlah")}, ${col("retur")}, ${col("created_at")}, ${col("created_by")}, ?, ? FROM json_each(?)`,
    ).bind(tanggal, now, staff.uid, JSON.stringify(writes)));
  }
  if (statements.length) await db.batch(statements);
  return { tanggal, rows: (await rowsOf(db, tanggal)).map(penjualanView) };
}

async function productsById(db, ids) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { results } = await db.prepare("SELECT * FROM products WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(unique)).all();
  return new Map(results.map((p) => [p.id, p]));
}
