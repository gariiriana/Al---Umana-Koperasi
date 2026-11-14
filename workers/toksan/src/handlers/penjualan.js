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
  const products = new Map();
  const productOf = async (id) => {
    if (!products.has(id)) products.set(id, await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first());
    return products.get(id);
  };

  const key = (r) => `${r.productId ?? r.product_id}|${r.sesi}|${r.pihak}`;
  const updatedIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const taken = new Set([...stored.values()].filter((r) => !deleted.has(r.id) && !updatedIds.has(r.id)).map(key));

  const writes = [];
  for (const [i, row] of rows.entries()) {
    let base;
    if (row.id) {
      base = stored.get(row.id);
      if (!base || deleted.has(row.id)) throw new ToksanError("BARIS_TIDAK_ADA", 404, { row: i });
      row.productId = base.product_id;
    } else {
      const product = await productOf(row.productId);
      if (!product) throw new ToksanError("PRODUK_TIDAK_ADA", 400, { row: i });
      if (product.active !== 1) throw new ToksanError("PRODUK_NONAKTIF", 400, { row: i });
      base = { id: newId(), product_name: product.name, dapur: product.dapur, harga: product.harga, created_at: now, created_by: staff.uid };
    }
    if (taken.has(key(row))) throw new ToksanError("DUPLIKAT", 409, { row: i });
    taken.add(key(row));
    writes.push({ ...base, row });
  }

  // Changed rows are deleted and re-inserted with the same id, so swapping sesi/pihak between rows never trips UNIQUE.
  const removeIds = [...deleted, ...updatedIds].filter((id) => stored.has(id));
  const statements = removeIds.map((id) => db.prepare("DELETE FROM sales WHERE id = ?").bind(id));
  for (const w of writes) {
    statements.push(db.prepare(
      "INSERT INTO sales (id, tanggal, product_id, product_name, dapur, harga, sesi, pihak, jumlah, retur, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(w.id, tanggal, w.row.productId, w.product_name, w.dapur, w.harga, w.row.sesi, w.row.pihak, w.row.jumlah, w.row.retur, w.created_at, w.created_by, now, staff.uid));
  }
  if (statements.length) await db.batch(statements);
  return { tanggal, rows: (await rowsOf(db, tanggal)).map(penjualanView) };
}
