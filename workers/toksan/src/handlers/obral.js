// Obral: produk dari dapur mana pun dijual lagi dengan harga yang diketik admin.
import { ToksanError, readJson } from "../http.js";
import { requireStaff } from "../session.js";
import { checkBatch, checkTanggal, invalid, isWholeNumber, newId } from "../validate.js";

export function obralView(row) {
  return {
    id: row.id,
    tanggal: row.tanggal,
    productId: row.product_id,
    productName: row.product_name,
    dapur: row.dapur,
    hargaNormal: row.harga_normal,
    hargaObral: row.harga_obral,
    jumlah: row.jumlah,
    catatan: row.catatan,
  };
}

async function rowsOf(db, tanggal) {
  const { results } = await db.prepare("SELECT * FROM obral WHERE tanggal = ? ORDER BY created_at, id").bind(tanggal).all();
  return results;
}

function checkRow(row, i) {
  if (typeof row.productId !== "string" || !row.productId) throw invalid("productId", i);
  if (!isWholeNumber(row.hargaObral, { max: 10_000_000 })) throw invalid("hargaObral", i);
  if (!isWholeNumber(row.jumlah, { min: 1, max: 100_000 })) throw invalid("jumlah", i);
  if (row.catatan !== undefined && row.catatan !== null && (typeof row.catatan !== "string" || row.catatan.length > 200)) {
    throw invalid("catatan", i);
  }
}

export async function getObral(ctx) {
  await requireStaff(ctx);
  const tanggal = checkTanggal(ctx.url.searchParams.get("tanggal"), ctx.deps.now());
  return { tanggal, rows: (await rowsOf(ctx.env.DB, tanggal)).map(obralView) };
}

export async function putObral(ctx) {
  const staff = await requireStaff(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const { tanggal, rows, hapus } = checkBatch(await readJson(ctx.request), now);
  rows.forEach(checkRow);

  const stored = new Map((await rowsOf(db, tanggal)).map((r) => [r.id, r]));
  const statements = hapus.filter((id) => stored.has(id)).map((id) => db.prepare("DELETE FROM obral WHERE id = ?").bind(id));
  for (const [i, row] of rows.entries()) {
    const catatan = row.catatan?.trim() || null;
    if (row.id) {
      if (!stored.has(row.id) || hapus.includes(row.id)) throw new ToksanError("BARIS_TIDAK_ADA", 404, { row: i });
      statements.push(db.prepare("UPDATE obral SET harga_obral = ?, jumlah = ?, catatan = ?, updated_at = ?, updated_by = ? WHERE id = ?")
        .bind(row.hargaObral, row.jumlah, catatan, now, staff.uid, row.id));
      continue;
    }
    const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(row.productId).first();
    if (!product) throw new ToksanError("PRODUK_TIDAK_ADA", 400, { row: i });
    statements.push(db.prepare(
      "INSERT INTO obral (id, tanggal, product_id, product_name, dapur, harga_normal, harga_obral, jumlah, catatan, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(newId(), tanggal, product.id, product.name, product.dapur, product.harga, row.hargaObral, row.jumlah, catatan, now, staff.uid, now, staff.uid));
  }
  if (statements.length) await db.batch(statements);
  return { tanggal, rows: (await rowsOf(db, tanggal)).map(obralView) };
}
