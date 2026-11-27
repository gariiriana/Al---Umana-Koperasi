// Handler Rilis 2-4: Produk, Satuan, Kategori Produk, Gudang (+ Bertingkat), Stok Opname, Transfer Gudang, Konversi Produk, Aturan Harga, Rekalkulasi HPP.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { INTER_UNIT_ACCOUNTS } from "../lib/seedData.js";
import {
  allocateDocNumber,
  assertNotLocked,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { buildReversalsForDocumentChange } from "../lib/openingReversal.js";
import {
  buildStockAndMonthlyStatements,
  computeAvgUnitCostAsOf,
  estimateOutCost,
  getProductStockAsOf,
  processRecalcQueueBatch,
  roundDivPositive,
} from "../lib/inventoryEngine.js";
import { cleanText, invalid, isInt, newId, requireIsoDate, requireUnitKode, todayWib } from "../lib/validate.js";

function assertWithin24Months(tanggal, nowMs) {
  const minDate = new Date(nowMs + 7 * 3_600_000);
  minDate.setUTCMonth(minDate.getUTCMonth() - 24);
  const cutoff = minDate.toISOString().slice(0, 10);
  if (tanggal < cutoff) {
    throw invalid("tanggal", `Tanggal transaksi berstok maksimal 24 bulan ke belakang (batas ${cutoff}).`);
  }
}

async function getProdukSettings(db) {
  const row = await db.prepare("SELECT value_json FROM settings WHERE key = 'produk'").first();
  try {
    return JSON.parse(row?.value_json || "{}");
  } catch {
    return {};
  }
}

// ─── Satuan Produk (Units of Measure) ─────────────────────────────────────────

export async function listUnitsOfMeasure(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM units_of_measure ORDER BY nama COLLATE NOCASE").all();
  return { units: results };
}

export async function saveUnitOfMeasure(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 40);
  if (!nama) throw invalid("nama", "Nama satuan wajib diisi.");
  const id = body.id ? String(body.id) : newId();
  await db
    .prepare(
      "INSERT INTO units_of_measure (id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(id, nama, now, actor.uid, now, actor.uid)
    .run();
  return { unit: await db.prepare("SELECT * FROM units_of_measure WHERE id = ?").bind(id).first() };
}

export async function deleteUnitOfMeasure(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM units_of_measure WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

// ─── Kategori Produk ──────────────────────────────────────────────────────────

export async function listProductCategories(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM product_categories ORDER BY nama COLLATE NOCASE").all();
  return { categories: results };
}

export async function saveProductCategory(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 80);
  if (!nama) throw invalid("nama", "Nama kategori produk wajib diisi.");
  const existing = await db.prepare("SELECT * FROM product_categories WHERE LOWER(nama) = LOWER(?)").bind(nama).first();
  if (existing && !body.id) return { category: existing };
  const id = body.id ? String(body.id) : newId();
  await db
    .prepare(
      "INSERT INTO product_categories (id, nama, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    )
    .bind(id, nama, now, actor.uid, now, actor.uid)
    .run();
  return { category: await db.prepare("SELECT * FROM product_categories WHERE id = ?").bind(id).first() };
}

export async function deleteProductCategory(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM product_categories WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

// ─── Gudang (+ Gudang Bertingkat) ─────────────────────────────────────────────

export async function listWarehouses(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const conds = [];
  const params = [];
  if (unitKode) {
    conds.push("w.unit_kode = ?");
    params.push(requireUnitKode(unitKode));
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT w.*, u.nama AS unit_nama, p.nama AS induk_nama,
         COALESCE((SELECT SUM(sb.qty_masuk - sb.qty_keluar) FROM stock_bulanan sb WHERE sb.warehouse_id = w.id), 0) AS total_qty_milli
       FROM warehouses w
       LEFT JOIN units u ON u.kode = w.unit_kode
       LEFT JOIN warehouses p ON p.id = w.induk_id
       ${where}
       ORDER BY w.unit_kode, CASE WHEN w.induk_id IS NULL THEN 0 ELSE 1 END, w.nama`,
    )
    .bind(...params)
    .all();
  return { warehouses: results };
}

export async function createWarehouse(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama gudang wajib diisi.");
  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const u = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(unitKode).first();
  if (!u) throw invalid("unit_kode", `Anak perusahaan ${unitKode} tidak ditemukan.`);

  let indukId = body.induk_id ? String(body.induk_id) : null;
  if (indukId) {
    const parent = await db.prepare("SELECT id, unit_kode FROM warehouses WHERE id = ?").bind(indukId).first();
    if (!parent) throw invalid("induk_id", "Gudang induk tidak ditemukan.");
    if (parent.unit_kode !== unitKode) throw invalid("induk_id", "Lokasi bertingkat harus dari anak perusahaan yang sama.");
  }

  const kode = cleanText(body.kode, 40) || `GDG-${unitKode}-${Date.now().toString().slice(-4)}`;
  const id = newId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO warehouses (id, nama, kode, alamat, deskripsi, unit_kode, induk_id, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, nama, kode, cleanText(body.alamat, 300), cleanText(body.deskripsi, 300), unitKode, indukId, now, actor.uid, now, actor.uid),
    buildAuditStatement(db, { entity: "warehouse", entityId: id, action: "create", after: { nama, kode, unit_kode: unitKode }, actor, now }),
  ]);
  return { warehouse: await db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(id).first() };
}

export async function updateWarehouse(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Gudang tidak ditemukan.");

  const body = await readJson(ctx.request);
  const nama = body.nama !== undefined ? cleanText(body.nama, 120) : prev.nama;
  if (!nama) throw invalid("nama", "Nama gudang wajib diisi.");
  await db.batch([
    db
      .prepare("UPDATE warehouses SET nama = ?, kode = ?, alamat = ?, deskripsi = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(
        nama,
        body.kode !== undefined ? cleanText(body.kode, 40) : prev.kode,
        body.alamat !== undefined ? cleanText(body.alamat, 300) : prev.alamat,
        body.deskripsi !== undefined ? cleanText(body.deskripsi, 300) : prev.deskripsi,
        now,
        actor.uid,
        id,
      ),
    buildAuditStatement(db, { entity: "warehouse", entityId: id, action: "update", before: prev, after: { nama }, actor, now }),
  ]);
  return { warehouse: await db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(id).first() };
}

export async function deleteWarehouse(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Gudang tidak ditemukan.");
  const used = await db.prepare("SELECT 1 FROM stock_moves WHERE warehouse_id = ? LIMIT 1").bind(id).first();
  if (used) throw new KeuanganError("GUDANG_TERPAKAI", 400, "Gudang yang sudah memiliki mutasi stok tidak dapat dihapus.");
  const hasChild = await db.prepare("SELECT 1 FROM warehouses WHERE induk_id = ? LIMIT 1").bind(id).first();
  if (hasChild) throw new KeuanganError("GUDANG_PUNYA_LOKASI", 400, "Hapus sub-lokasi di dalam gudang ini terlebih dahulu.");

  await db.batch([
    db.prepare("DELETE FROM warehouses WHERE id = ?").bind(id),
    buildAuditStatement(db, { entity: "warehouse", entityId: id, action: "delete", before: prev, actor, now }),
  ]);
  return { ok: true };
}

// ─── Produk (+ Multi Satuan, Bundle, Barcode, Riwayat) ────────────────────────

export async function listProducts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const includeArsip = ctx.url.searchParams.get("arsip") === "1";
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const warehouseId = ctx.url.searchParams.get("warehouse_id") || "";
  const q = cleanText(ctx.url.searchParams.get("q") || "", 100).toLowerCase();

  const { results: prods } = await db
    .prepare(
      `SELECT p.*, pc.qty_milli AS cached_qty_milli, pc.nilai AS cached_nilai,
         (SELECT COUNT(*) FROM recalc_queue rq WHERE rq.product_id = p.id) AS recalc_pending,
         (SELECT COUNT(*) FROM document_lines dl WHERE dl.product_id = p.id) AS tx_count
       FROM products p
       LEFT JOIN product_cost pc ON pc.product_id = p.id
       ${includeArsip ? "" : "WHERE p.arsip = 0"}
       ORDER BY p.nama COLLATE NOCASE`,
    )
    .all();

  const { results: sbRows } = await db
    .prepare(
      `SELECT sb.product_id, sb.warehouse_id, w.unit_kode, SUM(sb.qty_masuk - sb.qty_keluar) AS qty_milli
       FROM stock_bulanan sb
       LEFT JOIN warehouses w ON w.id = sb.warehouse_id
       GROUP BY sb.product_id, sb.warehouse_id`,
    )
    .all();

  const [{ results: catLinks }, { results: unitsList }, { results: bundleList }] = await Promise.all([
    db.prepare("SELECT pcl.product_id, pc.id AS cat_id, pc.nama FROM product_category_links pcl JOIN product_categories pc ON pc.id = pcl.category_id").all(),
    db.prepare("SELECT * FROM product_units ORDER BY product_id, faktor_milli").all(),
    db.prepare("SELECT bi.*, p.nama AS item_nama, p.satuan AS item_satuan FROM bundle_items bi JOIN products p ON p.id = bi.product_id").all(),
  ]);

  const catsByProd = new Map();
  for (const c of catLinks) {
    const arr = catsByProd.get(c.product_id) || [];
    arr.push({ id: c.cat_id, nama: c.nama });
    catsByProd.set(c.product_id, arr);
  }
  const unitsByProd = new Map();
  for (const u of unitsList) {
    const arr = unitsByProd.get(u.product_id) || [];
    arr.push(u);
    unitsByProd.set(u.product_id, arr);
  }
  const bundleByProd = new Map();
  for (const b of bundleList) {
    const arr = bundleByProd.get(b.bundle_id) || [];
    arr.push(b);
    bundleByProd.set(b.bundle_id, arr);
  }

  const stockByProd = new Map();
  for (const s of sbRows) {
    if (warehouseId && s.warehouse_id !== warehouseId) continue;
    if (unitKode && s.unit_kode !== unitKode) continue;
    stockByProd.set(s.product_id, (stockByProd.get(s.product_id) || 0) + (s.qty_milli || 0));
  }

  let available = 0;
  let lowStock = 0;
  let outOfStock = 0;

  const list = prods
    .map((p) => {
      const qtyMilli = stockByProd.get(p.id) || 0;
      const totQtyAll = p.cached_qty_milli || 0;
      const avgCost = totQtyAll > 0 ? roundDivPositive(Math.max(0, p.cached_nilai || 0) * 1000, totQtyAll) : p.harga_beli || 0;
      if (p.monitor_stok) {
        if (qtyMilli <= 0) outOfStock += 1;
        else if (p.batas_min > 0 && qtyMilli <= p.batas_min * 1000) lowStock += 1;
        else available += 1;
      }
      return {
        ...p,
        stok_milli: qtyMilli,
        harga_rata_rata: avgCost,
        categories: catsByProd.get(p.id) || [],
        units: unitsByProd.get(p.id) || [],
        bundle_items: bundleByProd.get(p.id) || [],
        recalc_running: (p.recalc_pending || 0) > 0,
      };
    })
    .filter((p) => {
      if (!q) return true;
      return (
        p.nama.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q)
      );
    });

  return {
    summary: { available, lowStock, outOfStock },
    products: list,
  };
}

export async function getProduct(ctx) {
  await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const id = ctx.params[0];
  const p = await db
    .prepare(
      `SELECT p.*, pc.qty_milli AS cached_qty_milli, pc.nilai AS cached_nilai,
         (SELECT COUNT(*) FROM recalc_queue rq WHERE rq.product_id = p.id) AS recalc_pending
       FROM products p LEFT JOIN product_cost pc ON pc.product_id = p.id WHERE p.id = ?`,
    )
    .bind(id)
    .first();
  if (!p) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Produk tidak ditemukan.");

  const [{ results: perWarehouse }, { results: moves }, { results: units }, { results: bundleItems }, { results: batches }, { results: serials }] =
    await Promise.all([
      db
        .prepare(
          `SELECT sb.warehouse_id, COALESCE(w.nama, 'Gudang Belum Ditetapkan') AS warehouse_nama, w.unit_kode,
             SUM(sb.qty_masuk - sb.qty_keluar) AS qty_milli
           FROM stock_bulanan sb LEFT JOIN warehouses w ON w.id = sb.warehouse_id
           WHERE sb.product_id = ? GROUP BY sb.warehouse_id`,
        )
        .bind(id)
        .all(),
      db
        .prepare(
          `SELECT sm.*, d.type AS doc_type, d.no AS doc_no, d.unit_kode, COALESCE(w.nama, '') AS warehouse_nama
           FROM stock_moves sm
           JOIN documents d ON d.id = sm.document_id
           LEFT JOIN warehouses w ON w.id = sm.warehouse_id
           WHERE sm.product_id = ?
           ORDER BY sm.tanggal ASC, sm.seq ASC, sm.rowid ASC`,
        )
        .bind(id)
        .all(),
      db.prepare("SELECT * FROM product_units WHERE product_id = ? ORDER BY faktor_milli").bind(id).all(),
      db.prepare("SELECT bi.*, pr.nama AS item_nama, pr.satuan AS item_satuan FROM bundle_items bi JOIN products pr ON pr.id = bi.product_id WHERE bi.bundle_id = ?").bind(id).all(),
      db.prepare("SELECT pb.*, w.nama AS warehouse_nama FROM product_batches pb LEFT JOIN warehouses w ON w.id = pb.warehouse_id WHERE pb.product_id = ? AND pb.qty_milli != 0").bind(id).all(),
      db.prepare("SELECT ps.*, w.nama AS warehouse_nama FROM product_serials ps LEFT JOIN warehouses w ON w.id = ps.warehouse_id WHERE ps.product_id = ? AND ps.status = 'tersedia'").bind(id).all(),
    ]);

  let runningQty = 0;
  let runningVal = 0;
  const history = moves.map((m) => {
    runningQty += m.qty_milli;
    runningVal += m.nilai;
    const avg = runningQty > 0 ? roundDivPositive(Math.max(0, runningVal) * 1000, runningQty) : 0;
    return { ...m, running_qty_milli: runningQty, avg_unit_cost: avg };
  });

  return {
    product: {
      ...p,
      stok_milli: runningQty,
      harga_rata_rata: runningQty > 0 ? roundDivPositive(Math.max(0, runningVal) * 1000, runningQty) : p.harga_beli || 0,
      recalc_running: (p.recalc_pending || 0) > 0,
      units,
      bundle_items: bundleItems,
    },
    perWarehouse,
    history,
    batches,
    serials,
  };
}

export async function createProduct(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 255);
  if (!nama) throw invalid("nama", "Nama produk wajib diisi.");
  const dupNama = await db.prepare("SELECT id FROM products WHERE LOWER(nama) = LOWER(?)").bind(nama).first();
  if (dupNama) throw new KeuanganError("DUPLIKAT", 409, `Produk "${nama}" sudah ada.`);

  const sku = body.sku ? cleanText(body.sku, 80) : null;
  if (sku && (await db.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first())) {
    throw new KeuanganError("DUPLIKAT", 409, `SKU "${sku}" sudah digunakan produk lain.`);
  }
  const barcode = body.barcode ? cleanText(body.barcode, 80) : null;
  if (barcode && (await db.prepare("SELECT id FROM products WHERE barcode = ?").bind(barcode).first())) {
    throw new KeuanganError("DUPLIKAT", 409, `Barcode "${barcode}" sudah digunakan produk lain.`);
  }

  const tipe = body.tipe === "bundle" ? "bundle" : "single";
  const pelacakan = ["qty", "batch", "serial"].includes(body.pelacakan) ? body.pelacakan : "qty";
  const monitorStok = tipe === "bundle" ? 0 : body.monitor_stok ? 1 : 0;
  const { results: maps } = await db.prepare("SELECT key, account_kode FROM account_mapping").all();
  const mapObj = Object.fromEntries(maps.map((m) => [m.key, m.account_kode]));

  const id = newId();
  const stmts = [
    db
      .prepare(
        `INSERT INTO products (id, nama, sku, barcode, satuan, deskripsi, tipe, monitor_stok, batas_min, akun_persediaan, pelacakan,
           dibeli, harga_beli, akun_beli, pajak_beli, dijual, harga_jual, akun_jual, pajak_jual, akun_diskon, gambar_attachment_id,
           arsip, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        nama,
        sku,
        barcode,
        cleanText(body.satuan || "pcs", 30) || "pcs",
        cleanText(body.deskripsi, 6000),
        tipe,
        monitorStok,
        Math.max(0, Number(body.batas_min || 0)),
        body.akun_persediaan || mapObj.persediaan || "1-10200",
        pelacakan,
        body.dibeli === false || body.dibeli === 0 ? 0 : 1,
        Math.max(0, Math.trunc(body.harga_beli || 0)),
        body.akun_beli || mapObj.pembelian_cogs || "5-50000",
        body.pajak_beli || null,
        body.dijual === false || body.dijual === 0 ? 0 : 1,
        Math.max(0, Math.trunc(body.harga_jual || 0)),
        body.akun_jual || mapObj.pendapatan_penjualan || "4-40000",
        body.pajak_jual || null,
        body.akun_diskon || null,
        body.gambar_attachment_id || null,
        now,
        actor.uid,
        now,
        actor.uid,
      ),
  ];

  if (Array.isArray(body.category_ids)) {
    for (const cid of [...new Set(body.category_ids.filter(Boolean))]) {
      stmts.push(db.prepare("INSERT OR IGNORE INTO product_category_links (product_id, category_id) VALUES (?, ?)").bind(id, cid));
    }
  }
  if (Array.isArray(body.units)) {
    for (const u of body.units) {
      if (!u.satuan || !isInt(Number(u.faktor_milli), { min: 1 })) continue;
      stmts.push(
        db
          .prepare("INSERT INTO product_units (product_id, satuan, faktor_milli, harga_jual, harga_beli) VALUES (?, ?, ?, ?, ?)")
          .bind(id, cleanText(u.satuan, 30), Number(u.faktor_milli), Math.trunc(u.harga_jual || 0), Math.trunc(u.harga_beli || 0)),
      );
    }
  }
  if (tipe === "bundle") {
    const items = Array.isArray(body.bundle_items) ? body.bundle_items : [];
    if (items.length === 0) throw invalid("bundle_items", "Produk bundle minimal memiliki 1 produk komponen.");
    for (const bi of items) {
      if (!bi.product_id || !isInt(Number(bi.qty_milli), { min: 1 })) throw invalid("bundle_items", "Komponen bundle wajib valid.");
      stmts.push(db.prepare("INSERT INTO bundle_items (bundle_id, product_id, qty_milli) VALUES (?, ?, ?)").bind(id, bi.product_id, Number(bi.qty_milli)));
    }
  }

  stmts.push(buildAuditStatement(db, { entity: "product", entityId: id, action: "create", after: { nama, sku, tipe, pelacakan }, actor, now }));
  await db.batch(stmts);
  return getProduct({ ...ctx, params: [id] });
}

export async function updateProduct(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Produk tidak ditemukan.");

  const body = await readJson(ctx.request);
  const nama = body.nama !== undefined ? cleanText(body.nama, 255) : prev.nama;
  if (!nama) throw invalid("nama", "Nama produk wajib diisi.");

  // Pelacakan batch tidak bisa diubah setelah produk dibuat (PRD 05)
  if (body.pelacakan !== undefined && body.pelacakan !== prev.pelacakan) {
    throw invalid("pelacakan", "Jenis pelacakan (Batch/Nomor Seri/Qty) tidak bisa diubah setelah produk dibuat.");
  }

  const stmts = [
    db
      .prepare(
        `UPDATE products SET nama = ?, sku = ?, barcode = ?, satuan = ?, deskripsi = ?, monitor_stok = ?, batas_min = ?, akun_persediaan = ?,
           dibeli = ?, harga_beli = ?, akun_beli = ?, pajak_beli = ?, dijual = ?, harga_jual = ?, akun_jual = ?, pajak_jual = ?, akun_diskon = ?,
           gambar_attachment_id = ?, arsip = ?, updated_at = ?, updated_by = ?
         WHERE id = ?`,
      )
      .bind(
        nama,
        body.sku !== undefined ? cleanText(body.sku, 80) || null : prev.sku,
        body.barcode !== undefined ? cleanText(body.barcode, 80) || null : prev.barcode,
        body.satuan !== undefined ? cleanText(body.satuan, 30) : prev.satuan,
        body.deskripsi !== undefined ? cleanText(body.deskripsi, 6000) : prev.deskripsi,
        body.monitor_stok !== undefined ? (body.monitor_stok ? 1 : 0) : prev.monitor_stok,
        body.batas_min !== undefined ? Math.max(0, Number(body.batas_min)) : prev.batas_min,
        body.akun_persediaan !== undefined ? body.akun_persediaan : prev.akun_persediaan,
        body.dibeli !== undefined ? (body.dibeli ? 1 : 0) : prev.dibeli,
        body.harga_beli !== undefined ? Math.max(0, Math.trunc(body.harga_beli)) : prev.harga_beli,
        body.akun_beli !== undefined ? body.akun_beli : prev.akun_beli,
        body.pajak_beli !== undefined ? body.pajak_beli : prev.pajak_beli,
        body.dijual !== undefined ? (body.dijual ? 1 : 0) : prev.dijual,
        body.harga_jual !== undefined ? Math.max(0, Math.trunc(body.harga_jual)) : prev.harga_jual,
        body.akun_jual !== undefined ? body.akun_jual : prev.akun_jual,
        body.pajak_jual !== undefined ? body.pajak_jual : prev.pajak_jual,
        body.akun_diskon !== undefined ? body.akun_diskon : prev.akun_diskon,
        body.gambar_attachment_id !== undefined ? body.gambar_attachment_id : prev.gambar_attachment_id,
        body.arsip !== undefined ? (body.arsip ? 1 : 0) : prev.arsip,
        now,
        actor.uid,
        id,
      ),
  ];

  if (Array.isArray(body.category_ids)) {
    stmts.push(db.prepare("DELETE FROM product_category_links WHERE product_id = ?").bind(id));
    for (const cid of [...new Set(body.category_ids.filter(Boolean))]) {
      stmts.push(db.prepare("INSERT OR IGNORE INTO product_category_links (product_id, category_id) VALUES (?, ?)").bind(id, cid));
    }
  }
  if (Array.isArray(body.units)) {
    stmts.push(db.prepare("DELETE FROM product_units WHERE product_id = ?").bind(id));
    for (const u of body.units) {
      if (!u.satuan || !isInt(Number(u.faktor_milli), { min: 1 })) continue;
      stmts.push(
        db
          .prepare("INSERT INTO product_units (product_id, satuan, faktor_milli, harga_jual, harga_beli) VALUES (?, ?, ?, ?, ?)")
          .bind(id, cleanText(u.satuan, 30), Number(u.faktor_milli), Math.trunc(u.harga_jual || 0), Math.trunc(u.harga_beli || 0)),
      );
    }
  }
  if (Array.isArray(body.bundle_items) && prev.tipe === "bundle") {
    stmts.push(db.prepare("DELETE FROM bundle_items WHERE bundle_id = ?").bind(id));
    for (const bi of body.bundle_items) {
      stmts.push(db.prepare("INSERT INTO bundle_items (bundle_id, product_id, qty_milli) VALUES (?, ?, ?)").bind(id, bi.product_id, Number(bi.qty_milli)));
    }
  }

  stmts.push(buildAuditStatement(db, { entity: "product", entityId: id, action: "update", before: prev, after: { nama }, actor, now }));
  await db.batch(stmts);
  return getProduct({ ...ctx, params: [id] });
}

export async function deleteProduct(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];
  const prev = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!prev) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Produk tidak ditemukan.");

  const used = await db.prepare("SELECT 1 FROM document_lines WHERE product_id = ? LIMIT 1").bind(id).first();
  const usedStock = await db.prepare("SELECT 1 FROM stock_moves WHERE product_id = ? LIMIT 1").bind(id).first();
  if (used || usedStock) {
    throw new KeuanganError("PRODUK_TERPAKAI", 400, "Produk yang sudah dipakai di transaksi tidak bisa dihapus (hanya bisa diarsipkan).");
  }
  await db.batch([
    db.prepare("DELETE FROM products WHERE id = ?").bind(id),
    buildAuditStatement(db, { entity: "product", entityId: id, action: "delete", before: prev, actor, now }),
  ]);
  return { ok: true };
}

export async function importProducts(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) throw invalid("rows", "Minimal satu baris produk untuk diimpor.");

  const { results: maps } = await db.prepare("SELECT key, account_kode FROM account_mapping").all();
  const mapObj = Object.fromEntries(maps.map((m) => [m.key, m.account_kode]));

  const stmts = [];
  for (const [i, r] of rows.entries()) {
    const nama = cleanText(r.nama, 255);
    if (!nama) throw invalid("rows", `Baris ${i + 1}: nama produk wajib diisi.`, i);
    const id = newId();
    stmts.push(
      db
        .prepare(
          `INSERT INTO products (id, nama, sku, barcode, satuan, deskripsi, tipe, monitor_stok, batas_min, akun_persediaan, pelacakan,
             dibeli, harga_beli, akun_beli, dijual, harga_jual, akun_jual, arsip, created_at, created_by, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 'single', ?, ?, ?, 'qty', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
           ON CONFLICT(nama) DO UPDATE SET harga_beli = excluded.harga_beli, harga_jual = excluded.harga_jual, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .bind(
          id,
          nama,
          r.sku ? cleanText(r.sku, 80) : null,
          r.barcode ? cleanText(r.barcode, 80) : null,
          cleanText(r.satuan || "pcs", 30),
          cleanText(r.deskripsi, 1000),
          r.monitor_stok ? 1 : 0,
          Math.max(0, Number(r.batas_min || 0)),
          r.akun_persediaan || mapObj.persediaan || "1-10200",
          r.dibeli === false ? 0 : 1,
          Math.max(0, Math.trunc(r.harga_beli || 0)),
          r.akun_beli || mapObj.pembelian_cogs || "5-50000",
          r.dijual === false ? 0 : 1,
          Math.max(0, Math.trunc(r.harga_jual || 0)),
          r.akun_jual || mapObj.pendapatan_penjualan || "4-40000",
          now,
          actor.uid,
          now,
          actor.uid,
        ),
    );
  }
  await db.batch(stmts);
  return { imported: rows.length };
}

// ─── Penyesuaian Stok (Stok Opname) ──────────────────────────────────────────

export async function listStockAdjustments(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.*, u.nama AS unit_nama, w.nama AS warehouse_nama
       FROM documents d
       LEFT JOIN units u ON u.kode = d.unit_kode
       LEFT JOIN warehouses w ON w.id = d.warehouse_id
       WHERE d.type = 'stock_adjustment' AND d.deleted_at IS NULL
       ORDER BY d.tanggal DESC, d.created_at DESC LIMIT 100`,
    )
    .all();
  return { adjustments: results };
}

export async function createStockAdjustment(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  assertWithin24Months(tanggal, now);
  await assertNotLocked(db, [tanggal]);

  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const u = await db.prepare("SELECT kode FROM units WHERE kode = ?").bind(unitKode).first();
  if (!u) throw invalid("unit_kode", `Unit ${unitKode} tidak ditemukan.`);

  const warehouseId = body.warehouse_id ? String(body.warehouse_id) : null;
  if (warehouseId) {
    const wh = await db.prepare("SELECT id, unit_kode FROM warehouses WHERE id = ?").bind(warehouseId).first();
    if (!wh) throw invalid("warehouse_id", "Gudang tidak ditemukan.");
    if (wh.unit_kode !== unitKode) throw invalid("warehouse_id", "Gudang bukan milik anak perusahaan ini.");
  }

  const kategori = ["umum", "rusak", "produksi", "awal"].includes(body.kategori) ? body.kategori : "umum";
  const tipe = body.tipe === "hitung" ? "hitung" : "selisih";

  const { results: maps } = await db.prepare("SELECT key, account_kode FROM account_mapping").all();
  const mapObj = Object.fromEntries(maps.map((m) => [m.key, m.account_kode]));
  const defaultAdjAcc =
    kategori === "rusak"
      ? mapObj.persediaan_rusak || "6-60100"
      : kategori === "produksi"
        ? mapObj.persediaan_produksi || "5-50400"
        : kategori === "awal"
          ? mapObj.ekuitas_saldo_awal || "3-30999"
          : mapObj.persediaan_umum || "8-80099";

  const adjAccountKode = body.account_kode || defaultAdjAcc;
  const adjAcc = await db.prepare("SELECT kode, is_header, sistem FROM accounts WHERE kode = ?").bind(adjAccountKode).first();
  if (!adjAcc || adjAcc.is_header || adjAcc.sistem === 1) throw invalid("account_kode", "Akun penyesuaian tidak valid.");

  const produkSettings = await getProdukSettings(db);
  const allowNeg = Boolean(produkSettings.izinkan_stok_negatif);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) throw invalid("lines", "Minimal satu produk untuk penyesuaian stok.");

  const docId = newId();
  const alloc = await allocateDocNumber(db, "stock_adjustment", unitKode, tanggal, now, actor);
  const stockMoves = [];
  const docLines = [];
  const journalRaw = [];
  let totalAbsVal = 0;

  for (const [idx, row] of rawLines.entries()) {
    const prod = await db.prepare("SELECT * FROM products WHERE id = ?").bind(row.product_id).first();
    if (!prod || !prod.monitor_stok) throw invalid("lines", `Baris ${idx + 1}: produk berstok tidak valid.`, idx);

    let diffMilli = 0;
    if (tipe === "hitung") {
      const actualMilli = Number(row.qty_aktual_milli ?? 0);
      if (!isInt(actualMilli, { min: 0 })) throw invalid("lines", `Baris ${idx + 1}: jumlah sebenarnya tidak valid.`, idx);
      const recordedMilli = await getProductStockAsOf(db, prod.id, warehouseId, tanggal);
      diffMilli = actualMilli - recordedMilli;
    } else {
      diffMilli = Number(row.qty_selisih_milli ?? 0);
      if (!isInt(diffMilli)) throw invalid("lines", `Baris ${idx + 1}: perubahan stok harus angka milli bulat.`, idx);
    }
    if (diffMilli === 0) continue;

    const invAcc = prod.akun_persediaan || mapObj.persediaan || "1-10200";
    let moveVal = 0;
    if (diffMilli > 0) {
      const customPrice = row.harga_satuan !== undefined && row.harga_satuan !== null ? Math.trunc(Number(row.harga_satuan)) : null;
      let unitPrice = customPrice;
      if (unitPrice === null) {
        const avg = await computeAvgUnitCostAsOf(db, prod.id, tanggal);
        unitPrice = avg.avg_unit_cost || prod.harga_beli || 0;
      }
      moveVal = roundDivPositive(diffMilli * unitPrice, 1000);
      journalRaw.push(
        { tanggal, unit_kode: unitKode, account_kode: invAcc, debit: moveVal, kredit: 0, keterangan: `Penyesuaian stok masuk ${prod.nama}` },
        { tanggal, unit_kode: unitKode, account_kode: adjAccountKode, debit: 0, kredit: moveVal, keterangan: `Penyesuaian stok (${kategori}) ${prod.nama}` },
      );
    } else {
      const outQty = Math.abs(diffMilli);
      const outVal = await estimateOutCost(db, prod.id, tanggal, outQty, null, stockMoves, prod.harga_beli || 0, allowNeg, warehouseId);
      moveVal = -outVal;
      journalRaw.push(
        { tanggal, unit_kode: unitKode, account_kode: adjAccountKode, debit: outVal, kredit: 0, keterangan: `Penyesuaian stok (${kategori}) ${prod.nama}` },
        { tanggal, unit_kode: unitKode, account_kode: invAcc, debit: 0, kredit: outVal, keterangan: `Penyesuaian stok keluar ${prod.nama}` },
      );
    }

    totalAbsVal += Math.abs(moveVal);
    const lid = newId();
    docLines.push({ id: lid, seq: idx + 1, product_id: prod.id, account_kode: invAcc, qty_milli: diffMilli, harga: Math.abs(moveVal), jumlah: moveVal, deskripsi: cleanText(row.deskripsi, 200) });
    stockMoves.push({
      line_id: lid,
      tanggal,
      seq: idx + 1,
      product_id: prod.id,
      warehouse_id: warehouseId,
      qty_milli: diffMilli,
      nilai: moveVal,
      batch_no: row.batch_no || null,
      serial_no: row.serial_no || null,
    });
  }

  if (stockMoves.length === 0) throw invalid("lines", "Tidak ada selisih kuantitas pada penyesuaian stok ini.");

  const balanced = normalizeAndCheckBalance(journalRaw);
  const memo = cleanText(body.memo, 500);

  const stmts = [
    alloc.updateStmt,
    db
      .prepare(
        `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, warehouse_id, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
         VALUES (?, 'stock_adjustment', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(docId, alloc.no, tanggal, unitKode, warehouseId, totalAbsVal, totalAbsVal, memo, JSON.stringify({ kategori, tipe, account_kode: adjAccountKode }), now, actor.uid, now, actor.uid),
  ];

  for (const dl of docLines) {
    stmts.push(
      db
        .prepare("INSERT INTO document_lines (id, document_id, seq, product_id, account_kode, deskripsi, qty_milli, harga, jumlah, unit_kode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(dl.id, docId, dl.seq, dl.product_id, dl.account_kode, dl.deskripsi, dl.qty_milli, dl.harga, dl.jumlah, unitKode),
    );
  }

  stmts.push(...(await buildStockAndMonthlyStatements(db, docId, stockMoves, now)));
  stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balanced)));
  stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: balanced, now, actor })));
  stmts.push(buildAuditStatement(db, { entity: "document", entityId: docId, action: "create", after: { type: "stock_adjustment", no: alloc.no, totalAbsVal }, actor, now }));

  await db.batch(stmts);
  return { adjustment: await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first(), journal: balanced };
}

// ─── Transfer Gudang (Se-unit tanpa jurnal, Antar-unit dengan jurnal 4 baris) ────

export async function listWarehouseTransfers(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB
    .prepare("SELECT * FROM documents WHERE type = 'warehouse_transfer' AND deleted_at IS NULL ORDER BY tanggal DESC, created_at DESC LIMIT 100")
    .all();
  return { transfers: results };
}

export async function createWarehouseTransfer(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  assertWithin24Months(tanggal, now);
  await assertNotLocked(db, [tanggal]);

  const fromWhId = String(body.dari_warehouse_id || "");
  const toWhId = String(body.ke_warehouse_id || "");
  if (!fromWhId || !toWhId || fromWhId === toWhId) throw invalid("ke_warehouse_id", "Gudang asal dan gudang tujuan harus dipilih dan berbeda.");

  const [fromWh, toWh] = await Promise.all([
    db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(fromWhId).first(),
    db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(toWhId).first(),
  ]);
  if (!fromWh || !toWh) throw invalid("dari_warehouse_id", "Gudang asal atau tujuan tidak ditemukan.");

  const antarUnit = fromWh.unit_kode !== toWh.unit_kode;
  const produkSettings = await getProdukSettings(db);
  const allowNeg = Boolean(produkSettings.izinkan_stok_negatif);
  const { results: maps } = await db.prepare("SELECT key, account_kode FROM account_mapping").all();
  const mapObj = Object.fromEntries(maps.map((m) => [m.key, m.account_kode]));

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) throw invalid("lines", "Minimal 1 produk untuk ditransfer.");

  const docId = newId();
  const alloc = await allocateDocNumber(db, "warehouse_transfer", fromWh.unit_kode, tanggal, now, actor);
  const stockMoves = [];
  const docLines = [];
  const journalRaw = [];
  let totalVal = 0;

  for (const [idx, r] of rawLines.entries()) {
    const prod = await db.prepare("SELECT * FROM products WHERE id = ?").bind(r.product_id).first();
    if (!prod || !prod.monitor_stok) throw invalid("lines", `Baris ${idx + 1}: produk berstok tidak valid.`, idx);
    const qtyMilli = Number(r.qty_milli);
    if (!isInt(qtyMilli, { min: 1 })) throw invalid("lines", `Baris ${idx + 1}: kuantitas transfer wajib > 0.`, idx);

    const outVal = await estimateOutCost(db, prod.id, tanggal, qtyMilli, null, stockMoves, prod.harga_beli || 0, allowNeg, fromWh.id);
    totalVal += outVal;
    const invAcc = prod.akun_persediaan || mapObj.persediaan || "1-10200";
    const lid = newId();
    docLines.push({ id: lid, seq: idx + 1, product_id: prod.id, account_kode: invAcc, qty_milli: qtyMilli, harga: outVal, jumlah: outVal });

    // Keluar dari gudang asal dulu, lalu masuk gudang tujuan (seq berurutan!)
    stockMoves.push(
      { line_id: lid, tanggal, seq: idx * 2 + 1, product_id: prod.id, warehouse_id: fromWh.id, qty_milli: -qtyMilli, nilai: -outVal, batch_no: r.batch_no || null, serial_no: r.serial_no || null },
      { line_id: lid, tanggal, seq: idx * 2 + 2, product_id: prod.id, warehouse_id: toWh.id, qty_milli: qtyMilli, nilai: outVal, batch_no: r.batch_no || null, serial_no: r.serial_no || null },
    );

    if (antarUnit) {
      journalRaw.push(
        { tanggal, unit_kode: fromWh.unit_kode, account_kode: INTER_UNIT_ACCOUNTS.PIUTANG, debit: outVal, kredit: 0, keterangan: `Transfer gudang antar unit ${prod.nama}` },
        { tanggal, unit_kode: fromWh.unit_kode, account_kode: invAcc, debit: 0, kredit: outVal, keterangan: `Transfer gudang keluar ${prod.nama}` },
        { tanggal, unit_kode: toWh.unit_kode, account_kode: invAcc, debit: outVal, kredit: 0, keterangan: `Transfer gudang masuk ${prod.nama}` },
        { tanggal, unit_kode: toWh.unit_kode, account_kode: INTER_UNIT_ACCOUNTS.HUTANG, debit: 0, kredit: outVal, keterangan: `Transfer gudang antar unit ${prod.nama}` },
      );
    }
  }

  const balanced = antarUnit ? normalizeAndCheckBalance(journalRaw) : [];
  const memo = cleanText(body.memo, 500) || `Transfer ${fromWh.nama} → ${toWh.nama}`;

  const stmts = [
    alloc.updateStmt,
    db
      .prepare(
        `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, warehouse_id, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
         VALUES (?, 'warehouse_transfer', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        docId,
        alloc.no,
        tanggal,
        fromWh.unit_kode,
        fromWh.id,
        totalVal,
        totalVal,
        memo,
        JSON.stringify({ dari_warehouse_id: fromWh.id, ke_warehouse_id: toWh.id, unit_asal: fromWh.unit_kode, unit_tujuan: toWh.unit_kode, antar_unit: antarUnit }),
        now,
        actor.uid,
        now,
        actor.uid,
      ),
  ];

  for (const dl of docLines) {
    stmts.push(
      db
        .prepare("INSERT INTO document_lines (id, document_id, seq, product_id, account_kode, qty_milli, harga, jumlah, unit_kode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(dl.id, docId, dl.seq, dl.product_id, dl.account_kode, dl.qty_milli, dl.harga, dl.jumlah, fromWh.unit_kode),
    );
  }

  stmts.push(...(await buildStockAndMonthlyStatements(db, docId, stockMoves, now)));
  if (balanced.length > 0) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balanced)));
    stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: balanced, now, actor })));
  }
  stmts.push(buildAuditStatement(db, { entity: "document", entityId: docId, action: "create", after: { type: "warehouse_transfer", no: alloc.no, antarUnit }, actor, now }));

  await db.batch(stmts);
  return { transfer: await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first(), journal: balanced };
}

// ─── Konversi Produk (Rilis 3, mis. 1 karung 25 kg -> 25 bungkus 1 kg) ────────

export async function createProductConversion(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  assertWithin24Months(tanggal, now);
  await assertNotLocked(db, [tanggal]);

  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const whId = String(body.warehouse_id || "");
  const wh = await db.prepare("SELECT * FROM warehouses WHERE id = ? AND unit_kode = ?").bind(whId, unitKode).first();
  if (!wh) throw invalid("warehouse_id", "Gudang tidak ditemukan untuk unit ini.");

  const srcProd = await db.prepare("SELECT * FROM products WHERE id = ?").bind(body.source_product_id).first();
  const dstProd = await db.prepare("SELECT * FROM products WHERE id = ?").bind(body.target_product_id).first();
  if (!srcProd || !dstProd || !srcProd.monitor_stok || !dstProd.monitor_stok || srcProd.id === dstProd.id) {
    throw invalid("target_product_id", "Produk asal dan tujuan harus berbeda dan sama-sama dimonitor stoknya.");
  }

  const srcQty = Number(body.source_qty_milli);
  const dstQty = Number(body.target_qty_milli);
  if (!isInt(srcQty, { min: 1 }) || !isInt(dstQty, { min: 1 })) {
    throw invalid("source_qty_milli", "Kuantitas asal dan hasil konversi harus > 0.");
  }

  const produkSettings = await getProdukSettings(db);
  const outVal = await estimateOutCost(db, srcProd.id, tanggal, srcQty, null, [], srcProd.harga_beli || 0, Boolean(produkSettings.izinkan_stok_negatif), wh.id);

  const docId = newId();
  const alloc = await allocateDocNumber(db, "product_conversion", unitKode, tanggal, now, actor);
  const moves = [
    { tanggal, seq: 1, product_id: srcProd.id, warehouse_id: wh.id, qty_milli: -srcQty, nilai: -outVal },
    { tanggal, seq: 2, product_id: dstProd.id, warehouse_id: wh.id, qty_milli: dstQty, nilai: outVal },
  ];

  const srcAcc = srcProd.akun_persediaan || "1-10200";
  const dstAcc = dstProd.akun_persediaan || "1-10200";
  const journal =
    srcAcc === dstAcc
      ? []
      : normalizeAndCheckBalance([
          { tanggal, unit_kode: unitKode, account_kode: dstAcc, debit: outVal, kredit: 0, keterangan: `Konversi produk ${srcProd.nama} → ${dstProd.nama}` },
          { tanggal, unit_kode: unitKode, account_kode: srcAcc, debit: 0, kredit: outVal, keterangan: `Konversi produk ${srcProd.nama} → ${dstProd.nama}` },
        ]);

  const stmts = [
    alloc.updateStmt,
    db
      .prepare(
        "INSERT INTO documents (id, type, no, tanggal, unit_kode, status, warehouse_id, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by) VALUES (?, 'product_conversion', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(docId, alloc.no, tanggal, unitKode, wh.id, outVal, outVal, cleanText(body.memo, 500), JSON.stringify({ srcProd: srcProd.id, dstProd: dstProd.id, srcQty, dstQty }), now, actor.uid, now, actor.uid),
    ...(await buildStockAndMonthlyStatements(db, docId, moves, now)),
  ];
  if (journal.length > 0) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, journal)));
    stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: journal, now, actor })));
  }
  stmts.push(buildAuditStatement(db, { entity: "document", entityId: docId, action: "create", after: { type: "product_conversion", no: alloc.no }, actor, now }));
  await db.batch(stmts);
  return { conversion: await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first() };
}

// ─── Aturan Harga (Rilis 3) ───────────────────────────────────────────────────

export async function listPriceRules(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM price_rules ORDER BY mulai DESC, nama").all();
  return { rules: results.map((r) => ({ ...r, config: JSON.parse(r.config_json || "{}") })) };
}

export async function savePriceRule(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama aturan harga wajib diisi.");
  const mulai = requireIsoDate(body.mulai, "mulai");
  const selesai = requireIsoDate(body.selesai, "selesai");
  const jenis = ["diskon_persen", "diskon_nominal", "diskon_subtotal", "diskon_bertingkat", "harga_akhir"].includes(body.jenis)
    ? body.jenis
    : "diskon_persen";
  const id = body.id ? String(body.id) : newId();

  await db
    .prepare(
      `INSERT INTO price_rules (id, nama, mulai, selesai, jenis, config_json, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, mulai = excluded.mulai, selesai = excluded.selesai, jenis = excluded.jenis, config_json = excluded.config_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(id, nama, mulai, selesai, jenis, JSON.stringify(body.config || {}), now, actor.uid, now, actor.uid)
    .run();
  return { rule: await db.prepare("SELECT * FROM price_rules WHERE id = ?").bind(id).first() };
}

export async function deletePriceRule(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM price_rules WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

// ─── Rekalkulasi HPP Queue Trigger/Status ─────────────────────────────────────

export async function getRecalcStatus(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT rq.*, p.nama FROM recalc_queue rq JOIN products p ON p.id = rq.product_id ORDER BY rq.dari_tanggal").all();
  return { queue: results };
}

export async function runRecalcNow(ctx) {
  const actor = await requireKeuangan(ctx);
  const result = await processRecalcQueueBatch(ctx.env.DB, { now: ctx.deps.now(), actor, maxProducts: 10 });
  return result;
}
