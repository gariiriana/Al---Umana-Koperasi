// Handler Rilis 4: Produksi (Bill of Materials, Biaya Standar, Perintah Kerja Penyusunan & Pemisahan, Tab Laporan Produksi).
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import {
  allocateDocNumber,
  assertNotLocked,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { buildReversalsForDocumentChange } from "../lib/openingReversal.js";
import { buildStockAndMonthlyStatements, computeAvgUnitCostAsOf, estimateOutCost, roundDivPositive } from "../lib/inventoryEngine.js";
import { cleanText, invalid, isInt, newId, requireIsoDate, requireUnitKode, todayWib } from "../lib/validate.js";

// ─── Bill of Materials (BoM) & Biaya Standar ──────────────────────────────────

export async function listBoms(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM bom WHERE arsip = 0 ORDER BY nama").all();
  return { boms: results.map((b) => ({ ...b, config: JSON.parse(b.config_json || "{}") })) };
}

export async function saveBom(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 120);
  const kode = cleanText(body.kode, 60);
  if (!nama || !kode) throw invalid("nama", "Nama dan kode BoM wajib diisi.");
  const kategori = ["penyusunan", "pemisahan"].includes(body.kategori) ? body.kategori : "penyusunan";
  const metodeBiaya = ["biaya_standar", "rata_rata"].includes(body.metode_biaya) ? body.metode_biaya : "rata_rata";
  const config = {
    output_product_id: body.output_product_id || null,
    output_qty_milli: Number(body.output_qty_milli || 1000),
    warehouse_id: body.warehouse_id || null,
    unit_kode: body.unit_kode || "",
    components: Array.isArray(body.components) ? body.components : [], // [{ product_id, qty_milli }]
    outputs: Array.isArray(body.outputs) ? body.outputs : [], // khusus pemisahan [{ product_id, qty_milli, ratio_bp }]
    overhead_costs: Array.isArray(body.overhead_costs) ? body.overhead_costs : [], // [{ account_kode, nama, jumlah }]
  };
  const id = body.id ? String(body.id) : newId();

  await db
    .prepare(
      `INSERT INTO bom (id, nama, kode, kategori, metode_biaya, config_json, arsip, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, kode = excluded.kode, kategori = excluded.kategori, metode_biaya = excluded.metode_biaya, config_json = excluded.config_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(id, nama, kode, kategori, metodeBiaya, JSON.stringify(config), now, actor.uid, now, actor.uid)
    .run();

  return { bom: await db.prepare("SELECT * FROM bom WHERE id = ?").bind(id).first() };
}

export async function deleteBom(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("UPDATE bom SET arsip = 1 WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function listStandardCosts(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB
    .prepare("SELECT sc.*, p.nama AS product_nama, p.sku FROM standard_costs sc JOIN products p ON p.id = sc.product_id ORDER BY p.nama")
    .all();
  return { standard_costs: results.map((r) => ({ ...r, items: JSON.parse(r.items_json || "[]") })) };
}

export async function saveStandardCost(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const productId = String(body.product_id || "");
  if (!productId) throw invalid("product_id", "Produk wajib dipilih.");
  const items = Array.isArray(body.items) ? body.items : [];
  const totalBiaya = items.reduce((s, x) => s + Math.trunc(Number(x.jumlah || 0)), 0);
  await db
    .prepare(
      `INSERT INTO standard_costs (product_id, items_json, total_biaya, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET items_json = excluded.items_json, total_biaya = excluded.total_biaya, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(productId, JSON.stringify(items), totalBiaya, now, actor.uid)
    .run();
  return { ok: true, total_biaya: totalBiaya };
}

// ─── Perintah Kerja Produksi (`work_order`) ───────────────────────────────────

export async function listWorkOrders(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare("SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'work_order' ORDER BY tanggal DESC, created_at DESC")
    .all();
  return { work_orders: results.map((r) => ({ ...r, data: JSON.parse(r.data_json || "{}") })) };
}

/**
 * Mengeksekusi Perintah Kerja Produksi (Penyusunan N->1 atau Pemisahan 1->N, mendukung biaya overhead & selisih biaya standar).
 */
export async function createWorkOrder(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  await assertNotLocked(db, [tanggal]);
  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const whId = String(body.warehouse_id || "");
  const wh = await db.prepare("SELECT * FROM warehouses WHERE id = ? AND unit_kode = ?").bind(whId, unitKode).first();
  if (!wh) throw invalid("warehouse_id", "Gudang produksi untuk unit ini wajib dipilih.");

  const kategori = body.kategori === "pemisahan" ? "pemisahan" : "penyusunan";
  const [{ results: mapRows }, { results: settingRows }] = await Promise.all([
    db.prepare("SELECT key, account_kode FROM account_mapping").all(),
    db.prepare("SELECT key, value_json FROM settings WHERE key = 'produk'").all(),
  ]);
  const mapObj = Object.fromEntries(mapRows.map((m) => [m.key, m.account_kode]));
  const produkCfg = JSON.parse(settingRows[0]?.value_json || "{}");
  const allowNeg = Boolean(produkCfg.izinkan_stok_negatif);
  const invDefault = mapObj.persediaan || "1-10200";
  const ohAccDefault = mapObj.overhead_produksi || "5-50401";
  const varAccDefault = mapObj.selisih_produksi || "5-50402";

  const inputs = Array.isArray(body.inputs) ? body.inputs : [];
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];
  const overheads = Array.isArray(body.overhead_costs) ? body.overhead_costs : [];
  if (inputs.length === 0 || outputs.length === 0) {
    throw invalid("inputs", "Minimal harus ada 1 bahan baku (input) dan 1 hasil produksi (output).");
  }

  const docId = newId();
  const alloc = await allocateDocNumber(db, "work_order", unitKode, tanggal, now, actor);
  const stockMoves = [];
  const journalRaw = [];
  const docLines = [];

  // 1. Keluarkan bahan baku (Input -> Kredit Persediaan)
  let totalInputCost = 0;
  for (const [idx, inp] of inputs.entries()) {
    const prod = await db.prepare("SELECT * FROM products WHERE id = ?").bind(inp.product_id).first();
    if (!prod || !prod.monitor_stok) throw invalid("inputs", `Input ${idx + 1}: produk berstok tidak valid.`);
    const qtyMilli = Number(inp.qty_milli);
    if (!isInt(qtyMilli, { min: 1 })) throw invalid("inputs", `Input ${idx + 1}: qty harus > 0.`);
    const val = await estimateOutCost(db, prod.id, tanggal, qtyMilli, null, stockMoves, prod.harga_beli || 0, allowNeg, wh.id);
    totalInputCost += val;
    const invAcc = prod.akun_persediaan || invDefault;
    const lid = newId();
    docLines.push({ id: lid, seq: docLines.length + 1, product_id: prod.id, account_kode: invAcc, qty_milli: -qtyMilli, harga: val, jumlah: -val, deskripsi: `Bahan baku ${prod.nama}` });
    stockMoves.push({ line_id: lid, tanggal, seq: stockMoves.length + 1, product_id: prod.id, warehouse_id: wh.id, qty_milli: -qtyMilli, nilai: -val, batch_no: inp.batch_no || null, serial_no: inp.serial_no || null });
    journalRaw.push({ tanggal, unit_kode: unitKode, account_kode: invAcc, debit: 0, kredit: val, keterangan: `Pemakaian bahan ${prod.nama}` });
  }

  // 2. Biaya Overhead Produksi (Kredit akun overhead produksi)
  let totalOverhead = 0;
  for (const oh of overheads) {
    const amt = Math.trunc(Number(oh.jumlah || 0));
    if (amt <= 0) continue;
    totalOverhead += amt;
    journalRaw.push({
      tanggal,
      unit_kode: unitKode,
      account_kode: oh.account_kode || ohAccDefault,
      debit: 0,
      kredit: amt,
      keterangan: cleanText(oh.nama || "Overhead produksi", 200),
    });
  }

  const totalActualCost = totalInputCost + totalOverhead;

  // 3. Masukkan produk jadi (Output -> Debit Persediaan)
  let totalOutputBooked = 0;
  for (const [idx, out] of outputs.entries()) {
    const prod = await db.prepare("SELECT * FROM products WHERE id = ?").bind(out.product_id).first();
    if (!prod || !prod.monitor_stok) throw invalid("outputs", `Output ${idx + 1}: produk berstok tidak valid.`);
    const qtyMilli = Number(out.qty_milli);
    if (!isInt(qtyMilli, { min: 1 })) throw invalid("outputs", `Output ${idx + 1}: qty harus > 0.`);

    let outVal = 0;
    if (out.biaya_standar !== undefined && out.biaya_standar !== null) {
      outVal = Math.trunc(Number(out.biaya_standar));
    } else if (outputs.length === 1) {
      outVal = totalActualCost;
    } else if (idx === outputs.length - 1) {
      outVal = Math.max(0, totalActualCost - totalOutputBooked);
    } else {
      const ratioBp = Number(out.ratio_bp || Math.round(10_000 / outputs.length));
      outVal = Math.round((totalActualCost * ratioBp) / 10_000);
    }

    totalOutputBooked += outVal;
    const invAcc = prod.akun_persediaan || invDefault;
    const lid = newId();
    docLines.push({ id: lid, seq: docLines.length + 1, product_id: prod.id, account_kode: invAcc, qty_milli: qtyMilli, harga: roundDivPositive(outVal * 1000, qtyMilli), jumlah: outVal, deskripsi: `Hasil produksi ${prod.nama}` });
    stockMoves.push({ line_id: lid, tanggal, seq: stockMoves.length + 1, product_id: prod.id, warehouse_id: wh.id, qty_milli: qtyMilli, nilai: outVal, batch_no: out.batch_no || null, serial_no: out.serial_no || null });
    journalRaw.push({ tanggal, unit_kode: unitKode, account_kode: invAcc, debit: outVal, kredit: 0, keterangan: `Hasil produksi ${prod.nama}` });
  }

  // Selisih biaya standar vs aktual (jika memakai biaya standar)
  const variance = totalActualCost - totalOutputBooked;
  if (variance !== 0) {
    journalRaw.push({
      tanggal,
      unit_kode: unitKode,
      account_kode: varAccDefault,
      debit: variance > 0 ? variance : 0,
      kredit: variance < 0 ? Math.abs(variance) : 0,
      keterangan: "Selisih biaya produksi",
    });
  }

  const balanced = normalizeAndCheckBalance(journalRaw);
  const dataJson = { kategori, bom_id: body.bom_id || null, total_input: totalInputCost, total_overhead: totalOverhead, total_output: totalOutputBooked, variance };

  const stmts = [
    alloc.updateStmt,
    db
      .prepare(
        `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, warehouse_id, subtotal, total, memo, data_json, created_at, created_by, updated_at, updated_by)
         VALUES (?, 'work_order', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(docId, alloc.no, tanggal, unitKode, wh.id, totalActualCost, totalActualCost, cleanText(body.memo, 400), JSON.stringify(dataJson), now, actor.uid, now, actor.uid),
  ];

  for (const dl of docLines) {
    stmts.push(
      db
        .prepare("INSERT INTO document_lines (id, document_id, seq, product_id, account_kode, deskripsi, qty_milli, harga, jumlah, unit_kode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(dl.id, docId, dl.seq, dl.product_id, dl.account_kode, dl.deskripsi, dl.qty_milli, dl.harga, dl.jumlah, unitKode),
    );
  }
  stmts.push(...(await buildStockAndMonthlyStatements(db, docId, stockMoves, now)));
  for (const m of stockMoves) {
    if (m.batch_no) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO product_batches (id, product_id, warehouse_id, batch_no, qty_milli, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(product_id, warehouse_id, batch_no) DO UPDATE SET qty_milli = product_batches.qty_milli + excluded.qty_milli, updated_at = excluded.updated_at`,
          )
          .bind(newId(), m.product_id, m.warehouse_id || "_UNASSIGNED_", m.batch_no, m.qty_milli, now),
      );
    }
    if (m.serial_no) {
      if (m.qty_milli > 0) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO product_serials (id, product_id, warehouse_id, serial_no, status, source_document_id, updated_at)
               VALUES (?, ?, ?, ?, 'tersedia', ?, ?)
               ON CONFLICT(product_id, serial_no) DO UPDATE SET warehouse_id = excluded.warehouse_id, status = 'tersedia', source_document_id = excluded.source_document_id, updated_at = excluded.updated_at`,
            )
            .bind(newId(), m.product_id, m.warehouse_id || null, m.serial_no, docId, now),
        );
      } else if (m.qty_milli < 0) {
        stmts.push(
          db
            .prepare("UPDATE product_serials SET status = 'keluar', out_document_id = ?, updated_at = ? WHERE product_id = ? AND serial_no = ?")
            .bind(docId, now, m.product_id, m.serial_no),
        );
      }
    }
  }
  stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balanced)));
  stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: [], newLines: balanced, now, actor })));
  stmts.push(buildAuditStatement(db, { entity: "document", entityId: docId, action: "create", after: { type: "work_order", no: alloc.no, total: totalActualCost }, actor, now }));

  await db.batch(stmts);
  return { work_order: await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first(), journal: balanced, stock_moves: stockMoves };
}

export async function reportProduksiDaftar(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare("SELECT id, no, tanggal, unit_kode, total, memo, data_json FROM documents WHERE deleted_at IS NULL AND type = 'work_order' ORDER BY tanggal DESC")
    .all();
  return { rows: results.map((r) => ({ ...r, ...JSON.parse(r.data_json || "{}") })) };
}
