// Handler Rilis 2 (plus hook Rilis 3 & 4): Penjualan, Pembelian, Biaya, Tukar Faktur, Retur, Kredit/Debit Memo, Multi-Mata Uang, Approval Hook.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { loadTaxesWithItems } from "./master.js";
import { calculateLineTaxes } from "../lib/tax.js";
import {
  allocateDocNumber,
  assertNotLocked,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  getMaxLockedDate,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { buildReversalsForDocumentChange } from "../lib/openingReversal.js";
import {
  buildStockAndMonthlyStatements,
  computeAvgUnitCostAsOf,
  estimateOutCost,
  roundDivPositive,
} from "../lib/inventoryEngine.js";
import {
  addDays,
  cleanText,
  invalid,
  isInt,
  newId,
  requireIsoDate,
  requireUnitKode,
  todayWib,
} from "../lib/validate.js";

export const ALL_TX_DOC_TYPES = new Set([
  "sales_quote",
  "sales_order",
  "order_deposit",
  "sales_delivery",
  "sales_invoice",
  "sales_payment",
  "sales_return",
  "credit_memo",
  "credit_memo_refund",
  "sales_join",
  "proforma",
  "purchase_request",
  "purchase_quote",
  "purchase_order",
  "purchase_deposit",
  "purchase_delivery",
  "purchase_invoice",
  "purchase_payment",
  "purchase_return",
  "debit_memo",
  "debit_memo_refund",
  "purchase_join",
  "expense",
]);

const NO_JOURNAL_DOC_TYPES = new Set([
  "sales_quote",
  "sales_order",
  "proforma",
  "sales_join",
  "purchase_request",
  "purchase_quote",
  "purchase_order",
  "purchase_join",
]);

function assertWithin24Months(tanggal, nowMs) {
  const minDate = new Date(nowMs + 7 * 3_600_000);
  minDate.setUTCMonth(minDate.getUTCMonth() - 24);
  const cutoff = minDate.toISOString().slice(0, 10);
  if (tanggal < cutoff) {
    throw invalid("tanggal", `Tanggal transaksi berstok maksimal 24 bulan ke belakang (batas ${cutoff}).`);
  }
}

/**
 * Menghitung nominal diskon baris dari angka persen (`10`), diskon bertingkat (`"50+20"`), atau basis poin (`diskon_bp`).
 */
export function computeLineAmountWithDiscount(qtyMilli, hargaSen, { diskonSpec = "", diskonBp = 0, diskonNominal = 0 } = {}) {
  const grossBig = (BigInt(qtyMilli) * BigInt(hargaSen)) / 1000n;
  const gross = Number(grossBig);
  if (gross <= 0) return { gross: 0, discount: 0, net: 0, effectiveBp: 0 };

  if (diskonNominal && isInt(Number(diskonNominal), { min: 1 })) {
    const disc = Math.min(gross, Number(diskonNominal));
    const bp = Math.round((disc * 10_000) / gross);
    return { gross, discount: disc, net: gross - disc, effectiveBp: bp };
  }

  let factorScale = 1_000_000n; // 1.000000
  const spec = String(diskonSpec || "").trim();
  if (spec) {
    const parts = spec.split("+").map((p) => Number(p.trim())).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 100);
    for (const pct of parts) {
      const bp = BigInt(Math.round(pct * 100));
      factorScale = (factorScale * (10_000n - bp)) / 10_000n;
    }
  } else if (Number(diskonBp) > 0) {
    const bp = BigInt(Math.min(10_000, Math.max(0, Math.round(Number(diskonBp)))));
    factorScale = (factorScale * (10_000n - bp)) / 10_000n;
  }

  const net = Number((BigInt(gross) * factorScale + 500_000n) / 1_000_000n);
  const discount = Math.max(0, gross - net);
  const effectiveBp = Math.round((discount * 10_000) / gross);
  return { gross, discount, net, effectiveBp };
}

/**
 * Mengonversi nilai mata uang asing ke IDR (sen) memakai `kurs` (skala 1.000.000 = 1 IDR).
 */
export function convertFcToIdr(amountFc, kursMicro = 1_000_000) {
  if (!amountFc) return 0;
  if (kursMicro === 1_000_000) return Math.trunc(amountFc);
  const neg = amountFc < 0;
  const abs = BigInt(Math.abs(Math.trunc(amountFc)));
  const scaled = Number((abs * BigInt(kursMicro) + 500_000n) / 1_000_000n);
  return neg ? -scaled : scaled;
}

async function loadMappingAndSettings(db) {
  const [{ results: mapRows }, { results: settingRows }, { results: accRows }, { results: whRows }, taxes] = await Promise.all([
    db.prepare("SELECT key, account_kode FROM account_mapping").all(),
    db.prepare("SELECT key, value_json FROM settings").all(),
    db.prepare("SELECT * FROM accounts").all(),
    db.prepare("SELECT * FROM warehouses ORDER BY nama").all(),
    loadTaxesWithItems(db),
  ]);
  const map = Object.fromEntries(mapRows.map((m) => [m.key, m.account_kode]));
  const settings = {};
  for (const s of settingRows) {
    try {
      settings[s.key] = JSON.parse(s.value_json || "{}");
    } catch {
      settings[s.key] = {};
    }
  }
  const accountsByKode = new Map(accRows.map((a) => [a.kode, a]));
  const taxesById = new Map(taxes.map((t) => [t.id, t]));
  return { map, settings, accountsByKode, warehouses: whRows, taxesById };
}

async function resolveDefaultWarehouseId(db, unitKode, explicitWhId, warehouses) {
  if (explicitWhId) {
    const wh = await db.prepare("SELECT * FROM warehouses WHERE id = ?").bind(explicitWhId).first();
    if (!wh) throw invalid("warehouse_id", "Gudang tidak ditemukan.");
    if (wh.unit_kode !== unitKode) {
      throw invalid("warehouse_id", `Gudang ${wh.nama} berada di unit ${wh.unit_kode}, bukan ${unitKode}.`);
    }
    return wh.id;
  }
  const match = warehouses.find((w) => w.unit_kode === unitKode && !w.induk_id) || warehouses.find((w) => w.unit_kode === unitKode);
  return match ? match.id : null;
}

async function checkContactLimits(db, { contact, docType, netDeltaReceivable = 0, netDeltaPayable = 0, excludeDocId = null }) {
  if (!contact) return;
  if (docType === "sales_invoice" && (contact.batas_piutang || 0) > 0 && netDeltaReceivable > 0) {
    const row = await db
      .prepare("SELECT IFNULL(SUM(sisa), 0) AS open_ar FROM documents WHERE contact_id = ? AND type = 'sales_invoice' AND deleted_at IS NULL AND id != ?")
      .bind(contact.id, excludeDocId || "")
      .first();
    const totalAr = (row?.open_ar || 0) + netDeltaReceivable;
    if (totalAr > contact.batas_piutang) {
      throw new KeuanganError(
        "MELEBIHI_BATAS_KREDIT",
        400,
        `Total piutang ${contact.nama_tampilan} melebihi batas piutang yang ditetapkan.`,
      );
    }
  }
  if (docType === "purchase_invoice" && contact.batas_hutang > 0 && netDeltaPayable > 0) {
    const row = await db
      .prepare("SELECT IFNULL(SUM(sisa), 0) AS open_ap FROM documents WHERE contact_id = ? AND type = 'purchase_invoice' AND deleted_at IS NULL AND id != ?")
      .bind(contact.id, excludeDocId || "")
      .first();
    const totalAp = (row?.open_ap || 0) + netDeltaPayable;
    if (totalAp > contact.batas_hutang) {
      throw new KeuanganError(
        "MELEBIHI_BATAS_HUTANG",
        400,
        `Total hutang ke ${contact.nama_tampilan} melebihi batas hutang yang ditetapkan.`,
      );
    }
  }
}

async function determineApprovalState(db, { type, unitKode, total, settings, actorUid, forceApproved = false }) {
  if (forceApproved) return { state: "approved", ruleId: null };
  if (!settings?.perusahaan?.approval_aktif) return { state: null, ruleId: null };
  if (NO_JOURNAL_DOC_TYPES.has(type)) return { state: null, ruleId: null };
  const { results: rules } = await db
    .prepare("SELECT * FROM approval_rules WHERE tipe = ? AND aktif = 1")
    .bind(type)
    .all();
  let bestRule = null;
  let bestThreshold = -1;
  for (const r of rules) {
    try {
      const k = JSON.parse(r.kriteria_json || "{}");
      const minTotal = Number(k.min_total || 0);
      const unitOk = !k.unit_kode || k.unit_kode === unitKode;
      const creatorOk = !Array.isArray(k.creator_uids) || k.creator_uids.length === 0 || k.creator_uids.includes(actorUid);
      if (unitOk && creatorOk && total >= minTotal && minTotal >= bestThreshold) {
        bestRule = r;
        bestThreshold = minTotal;
      }
    } catch {
      // ignore malformed rule
    }
  }
  return bestRule ? { state: "pending", ruleId: bestRule.id } : { state: null, ruleId: null };
}

async function getProductWithDetails(db, productId) {
  const prod = await db.prepare("SELECT * FROM products WHERE id = ? AND arsip = 0").bind(productId).first();
  if (!prod) throw invalid("product_id", "Produk tidak ditemukan atau sudah diarsipkan.");
  const isBundle = prod.tipe === "bundle";
  const [{ results: units }, { results: bundleItems }] = await Promise.all([
    db.prepare("SELECT * FROM product_units WHERE product_id = ?").bind(productId).all(),
    isBundle
      ? db
        .prepare(
          `SELECT bi.*, p.id AS id, p.nama, p.sku, p.satuan, p.monitor_stok, p.harga_beli, p.akun_persediaan, p.akun_beli, p.pelacakan
             FROM bundle_items bi JOIN products p ON p.id = bi.product_id WHERE bi.bundle_id = ?`,
        )
        .bind(productId)
        .all()
      : Promise.resolve({ results: [] }),
  ]);
  return { ...prod, is_bundle: isBundle, units, bundleItems };
}

function getUomFactorMilli(product, satuan) {
  if (!satuan || satuan === product.satuan) return 1000;
  const match = (product.units || []).find((u) => u.satuan === satuan);
  return match ? match.faktor_milli : 1000;
}

/**
 * Mencari aturan harga aktif terbaik untuk pelanggan & produk (Rilis 3 hook).
 */
async function matchActivePriceRule(db, { productId, contact, tanggal, qtyMilli }) {
  const { results: rules } = await db
    .prepare("SELECT * FROM price_rules WHERE mulai <= ? AND selesai >= ? ORDER BY mulai DESC")
    .bind(tanggal, tanggal)
    .all();
  for (const r of rules) {
    let cfg = {};
    try {
      cfg = JSON.parse(r.config_json || "{}");
    } catch {
      continue;
    }
    const prods = Array.isArray(cfg.product_ids) ? cfg.product_ids : [];
    const prodOk = prods.length === 0 || prods.includes(productId);
    const contactOk =
      !cfg.contact_group_id || (contact && contact.grup_id === cfg.contact_group_id);
    const minQty = Number(cfg.min_qty_milli || 0);
    if (prodOk && contactOk && qtyMilli >= minQty) {
      return { id: r.id, nama: r.nama, jenis: r.jenis, config: cfg };
    }
  }
  return null;
}

/**
 * Validasi kuantitas konversi dari dokumen sumber agar tidak melebihi sisa.
 */
async function validateSourceLineConversion(db, sourceDocId, lines) {
  if (!sourceDocId) return;
  const { results: srcLines } = await db
    .prepare("SELECT id, qty_milli FROM document_lines WHERE document_id = ?")
    .bind(sourceDocId)
    .all();
  const srcQtyMap = new Map(srcLines.map((l) => [l.id, l.qty_milli]));

  const { results: usedRows } = await db
    .prepare(
      `SELECT dl.source_line_id, SUM(dl.qty_milli) AS used_qty
       FROM document_lines dl
       JOIN documents d ON d.id = dl.document_id
       WHERE d.parent_id = ? AND d.deleted_at IS NULL AND dl.source_line_id IS NOT NULL
       GROUP BY dl.source_line_id`,
    )
    .bind(sourceDocId)
    .all();
  const usedMap = new Map(usedRows.map((u) => [u.source_line_id, u.used_qty || 0]));

  for (const [i, l] of lines.entries()) {
    if (!l.source_line_id) continue;
    const maxQty = srcQtyMap.get(l.source_line_id);
    if (maxQty === undefined) throw invalid("source_line_id", `Baris ${i + 1}: referensi baris sumber tidak ditemukan.`, i);
    const used = usedMap.get(l.source_line_id) || 0;
    if (used + l.qty_milli > maxQty) {
      throw invalid("qty_milli", `Baris ${i + 1}: kuantitas melebihi sisa pada dokumen sumber.`, i);
    }
  }
}

async function resolveWithholdings(rawWithholdings, dppBaseSen, accountsByKode) {
  const rows = [];
  let total = 0;
  for (const w of Array.isArray(rawWithholdings) ? rawWithholdings : []) {
    if (!w || (!w.nilai && !w.amount)) continue;
    const acc = accountsByKode.get(w.account_kode);
    if (!acc || acc.is_header || acc.arsip) {
      throw invalid("withholdings", `Akun pemotongan ${w.account_kode || ""} tidak valid.`);
    }
    const mode = w.mode === "persen" ? "persen" : "nominal";
    const nilai = Number(w.nilai ?? w.amount ?? 0);
    if (!isInt(nilai, { min: 0 })) throw invalid("withholdings", "Nilai pemotongan tidak valid.");
    const amt = mode === "persen" ? Math.round((dppBaseSen * nilai) / 10_000) : nilai;
    if (amt <= 0) continue;
    total += amt;
    rows.push({ account_kode: acc.kode, mode, nilai, amount: amt, account_nama: acc.nama });
  }
  return { rows, total };
}

function buildBatchSerialStatements(db, { stockMoves, docId, now }) {
  const stmts = [];
  for (const m of stockMoves) {
    if (m.batch_no) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO product_batches (id, product_id, warehouse_id, batch_no, exp_date, qty_milli, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(product_id, warehouse_id, batch_no) DO UPDATE SET qty_milli = product_batches.qty_milli + excluded.qty_milli, updated_at = excluded.updated_at`,
          )
          .bind(newId(), m.product_id, m.warehouse_id || "_UNASSIGNED_", m.batch_no, m.exp_date || null, m.qty_milli, now),
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
  return stmts;
}

// ─── List & Detail Dokumen Siklus Transaksi ───────────────────────────────────

export async function listTransactions(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const family = ctx.url.searchParams.get("family") || ""; // 'sales' | 'purchase' | 'expense' | 'all'
  const type = ctx.url.searchParams.get("type") || "";
  const status = ctx.url.searchParams.get("status") || "";
  const contactId = ctx.url.searchParams.get("contact_id") || "";
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const dari = ctx.url.searchParams.get("dari") || "";
  const sampai = ctx.url.searchParams.get("sampai") || "";
  const q = cleanText(ctx.url.searchParams.get("q") || "", 100);
  const limit = Math.min(200, Math.max(10, Number(ctx.url.searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(ctx.url.searchParams.get("offset") || 0));

  const conds = ["d.deleted_at IS NULL"];
  const params = [];

  if (type) {
    conds.push("d.type = ?");
    params.push(type);
  } else if (family === "sales") {
    conds.push("d.type IN ('sales_quote','sales_order','order_deposit','sales_delivery','sales_invoice','sales_payment','sales_return','credit_memo','credit_memo_refund','sales_join','proforma')");
  } else if (family === "purchase") {
    conds.push("d.type IN ('purchase_request','purchase_quote','purchase_order','purchase_deposit','purchase_delivery','purchase_invoice','purchase_payment','purchase_return','debit_memo','debit_memo_refund','purchase_join')");
  } else if (family === "expense") {
    conds.push("d.type = 'expense'");
  } else {
    conds.push("d.type IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify([...ALL_TX_DOC_TYPES]));
  }

  if (status) {
    if (status === "jatuh_tempo") {
      conds.push("d.sisa > 0 AND d.jatuh_tempo IS NOT NULL AND d.jatuh_tempo < ?");
      params.push(todayWib(ctx.deps.now()));
    } else {
      conds.push("d.status = ?");
      params.push(status);
    }
  }
  if (contactId) {
    conds.push("d.contact_id = ?");
    params.push(contactId);
  }
  if (unitKode) {
    conds.push("d.unit_kode = ?");
    params.push(unitKode);
  }
  if (dari) {
    conds.push("d.tanggal >= ?");
    params.push(requireIsoDate(dari, "dari"));
  }
  if (sampai) {
    conds.push("d.tanggal <= ?");
    params.push(requireIsoDate(sampai, "sampai"));
  }
  if (q) {
    conds.push("(d.no LIKE ? OR d.memo LIKE ? OR d.ref_no LIKE ? OR IFNULL(c.nama_tampilan, '') LIKE ?)");
    const pat = `%${q}%`;
    params.push(pat, pat, pat, pat);
  }

  const { results } = await db
    .prepare(
      `SELECT d.*, c.nama_tampilan AS contact_nama, u.nama AS unit_nama, w.nama AS warehouse_nama
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN units u ON u.kode = d.unit_kode
       LEFT JOIN warehouses w ON w.id = d.warehouse_id
       WHERE ${conds.join(" AND ")}
       ORDER BY d.tanggal DESC, d.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all();

  return { documents: results };
}

export async function getTransaction(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);
  const id = ctx.params[0];

  const doc = await db
    .prepare(
      `SELECT d.*, c.nama_tampilan AS contact_nama, c.email AS contact_email, c.hp AS contact_hp, c.alamat_tagih AS contact_alamat,
              u.nama AS unit_nama, w.nama AS warehouse_nama, pt.nama AS term_nama
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN units u ON u.kode = d.unit_kode
       LEFT JOIN warehouses w ON w.id = d.warehouse_id
       LEFT JOIN payment_terms pt ON pt.id = d.term_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
    )
    .bind(id)
    .first();
  if (!doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");

  const [{ results: lines }, { results: tags }, { results: withholdings }, { results: journal }, { results: linksOut }, { results: linksIn }, { results: stockMoves }, { results: attachments }, { results: approvals }, maxLocked] =
    await Promise.all([
      db
        .prepare(
          `SELECT dl.*, p.nama AS product_nama, p.sku AS product_sku, a.nama AS account_nama, t.nama AS tax_nama
           FROM document_lines dl
           LEFT JOIN products p ON p.id = dl.product_id
           LEFT JOIN accounts a ON a.kode = dl.account_kode
           LEFT JOIN taxes t ON t.id = dl.tax_id
           WHERE dl.document_id = ?
           ORDER BY dl.seq`,
        )
        .bind(id)
        .all(),
      db.prepare("SELECT tg.id, tg.nama FROM document_tags dt JOIN tags tg ON tg.id = dt.tag_id WHERE dt.document_id = ?").bind(id).all(),
      db.prepare("SELECT w.*, a.nama AS account_nama FROM withholdings w LEFT JOIN accounts a ON a.kode = w.account_kode WHERE w.document_id = ?").bind(id).all(),
      db
        .prepare(
          `SELECT jl.*, a.nama AS account_nama, u.nama AS unit_nama
           FROM journal_lines jl
           JOIN accounts a ON a.kode = jl.account_kode
           JOIN units u ON u.kode = jl.unit_kode
           WHERE jl.document_id = ?
           ORDER BY jl.debit DESC, a.kode`,
        )
        .bind(id)
        .all(),
      db.prepare("SELECT dl.*, d.type, d.no, d.tanggal, d.total, d.sisa FROM document_links dl JOIN documents d ON d.id = dl.to_id WHERE dl.from_id = ?").bind(id).all(),
      db.prepare("SELECT dl.*, d.type, d.no, d.tanggal, d.total, d.sisa FROM document_links dl JOIN documents d ON d.id = dl.from_id WHERE dl.to_id = ?").bind(id).all(),
      db.prepare("SELECT sm.*, p.nama AS product_nama, w.nama AS warehouse_nama FROM stock_moves sm LEFT JOIN products p ON p.id = sm.product_id LEFT JOIN warehouses w ON w.id = sm.warehouse_id WHERE sm.document_id = ? ORDER BY sm.seq").bind(id).all(),
      db.prepare("SELECT id, filename, mime, size, created_at FROM attachments WHERE document_id = ?").bind(id).all(),
      db.prepare("SELECT * FROM approvals WHERE document_id = ? ORDER BY tahap, at").bind(id).all(),
      getMaxLockedDate(db),
    ]);

  let dataJson = {};
  try {
    dataJson = JSON.parse(doc.data_json || "{}");
  } catch {
    dataJson = {};
  }

  return {
    document: { ...doc, data: dataJson, locked: Boolean(maxLocked && doc.tanggal <= maxLocked) },
    lines,
    tags,
    withholdings,
    journal,
    links: { to: linksOut, from: linksIn },
    stock_moves: stockMoves,
    attachments,
    approvals,
  };
}

// ─── Pembuatan / Pembaharuan Dokumen Penjualan & Pembelian & Biaya ────────────

export async function createTransaction(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  return upsertTransactionDoc(db, { body, existingDoc: null, actor, now });
}

export async function updateTransaction(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const id = ctx.params[0];
  const existingDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existingDoc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");
  if (!ALL_TX_DOC_TYPES.has(existingDoc.type)) {
    throw new KeuanganError("TIDAK_DIDUKUNG", 400, "Tipe dokumen ini tidak dapat diubah lewat endpoint ini.");
  }

  const recon = await db.prepare("SELECT 1 FROM reconciliation_matches WHERE document_id = ? LIMIT 1").bind(id).first();
  if (recon) throw new KeuanganError("SUDAH_DIREKONSILIASI", 400, "Transaksi yang sudah direkonsiliasi tidak dapat diubah.");

  const hasChildLink = await db.prepare("SELECT 1 FROM document_links WHERE to_id = ? LIMIT 1").bind(id).first();
  if (hasChildLink && !["sales_quote", "sales_order", "purchase_request", "purchase_quote", "purchase_order"].includes(existingDoc.type)) {
    throw new KeuanganError("PUNYA_TURUNAN", 400, "Dokumen yang sudah memiliki pembayaran/retur/turunan tidak dapat diubah.");
  }

  const body = await readJson(ctx.request);
  return upsertTransactionDoc(db, { body: { ...body, type: existingDoc.type }, existingDoc, actor, now });
}

export async function deleteTransactionEndpoint(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];

  const existing = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existing) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");
  return deleteTransactionDoc(db, existing, actor, now);
}

export async function deleteTransactionDoc(db, existing, actor, now) {
  const id = existing.id;
  await assertNotLocked(db, [existing.tanggal]);

  const recon = await db.prepare("SELECT 1 FROM reconciliation_matches WHERE document_id = ? LIMIT 1").bind(id).first();
  if (recon) throw new KeuanganError("SUDAH_DIREKONSILIASI", 400, "Transaksi yang sudah direkonsiliasi tidak dapat dihapus.");

  const linkTo = await db.prepare("SELECT 1 FROM document_links WHERE to_id = ? LIMIT 1").bind(id).first();
  if (linkTo) throw new KeuanganError("PUNYA_TURUNAN", 400, "Dokumen yang memiliki pembayaran, pengiriman, atau retur tidak bisa dihapus.");

  const childParent = await db.prepare("SELECT 1 FROM documents WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first();
  if (childParent) throw new KeuanganError("PUNYA_TURUNAN", 400, "Dokumen yang sudah dikonversi menjadi dokumen lain tidak bisa dihapus.");

  const [{ results: oldLines }, { results: oldJournal }, { results: oldLinksOut }, { results: oldStock }] = await Promise.all([
    db.prepare("SELECT * FROM document_lines WHERE document_id = ?").bind(id).all(),
    db.prepare("SELECT * FROM journal_lines WHERE document_id = ?").bind(id).all(),
    db.prepare("SELECT * FROM document_links WHERE from_id = ?").bind(id).all(),
    db.prepare("SELECT * FROM stock_moves WHERE document_id = ?").bind(id).all(),
  ]);

  if (oldStock.length > 0) {
    assertWithin24Months(existing.tanggal, now);
  }

  const stmts = [];
  // Kembalikan sisa pada dokumen target yang pernah dilunasi/dipotong dokumen ini
  for (const l of oldLinksOut) {
    if (l.kind === "payment_to_invoice" || l.kind === "memo_to_invoice") {
      const target = await db.prepare("SELECT id, total, sisa, uang_muka, type FROM documents WHERE id = ?").bind(l.to_id).first();
      if (target) {
        const newSisa = Math.min(target.total - (target.uang_muka || 0), (target.sisa || 0) + l.amount);
        const newStatus = newSisa >= target.total - (target.uang_muka || 0) ? "belum_dibayar" : "sebagian";
        stmts.push(db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(newSisa, newStatus, target.id));
      }
    } else if (l.kind === "deposit_to_order") {
      stmts.push(db.prepare("UPDATE documents SET uang_muka = MAX(0, uang_muka - ?) WHERE id = ?").bind(l.amount, l.to_id));
    } else if (l.kind === "order_to_delivery" || l.kind === "order_to_invoice") {
      stmts.push(db.prepare("UPDATE documents SET status = 'terbuka' WHERE id = ? AND status IN ('sebagian', 'selesai')").bind(l.to_id));
    }
  }

  // Hapus aset tertunda jika berasal dari tagihan ini
  stmts.push(db.prepare("DELETE FROM assets WHERE source_document_id = ? AND status = 'tertunda'").bind(id));
  if (oldStock.length > 0) {
    stmts.push(...(await buildStockAndMonthlyStatements(db, id, [], now)));
  }
  if (oldJournal.length > 0) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, id, [])));
    stmts.push(...(await buildReversalsForDocumentChange(db, { docId: id, oldLines: oldJournal, newLines: [], now, actor })));
  }

  stmts.push(
    db.prepare("DELETE FROM document_links WHERE from_id = ? OR to_id = ?").bind(id, id),
    db.prepare("DELETE FROM document_lines WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM document_tags WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM withholdings WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM approvals WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM documents WHERE id = ?").bind(id),
    buildAuditStatement(db, {
      entity: "document",
      entityId: id,
      action: "delete",
      before: { document: existing, lines: oldLines, journal: oldJournal },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return { ok: true };
}

/**
 * Mesin utama pembuatan & update semua dokumen Siklus Penjualan, Pembelian, dan Biaya.
 */
export async function upsertTransactionDoc(db, { body, existingDoc, actor, now, forceApproved = false }) {
  const type = String(body.type || "");
  if (!ALL_TX_DOC_TYPES.has(type)) {
    throw invalid("type", `Tipe dokumen '${type}' tidak dikenal.`);
  }

  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  if (existingDoc) {
    await assertNotLocked(db, [existingDoc.tanggal, tanggal]);
  } else {
    await assertNotLocked(db, [tanggal]);
  }

  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const unit = await db.prepare("SELECT * FROM units WHERE kode = ?").bind(unitKode).first();
  if (!unit) throw invalid("unit_kode", `Anak perusahaan '${unitKode}' tidak ditemukan.`);

  const { map, settings, accountsByKode, warehouses, taxesById } = await loadMappingAndSettings(db);
  const currency = cleanText(body.currency || settings.perusahaan?.mata_uang || "IDR", 10).toUpperCase();
  const kurs = isInt(Number(body.kurs), { min: 1 }) ? Number(body.kurs) : 1_000_000;

  let contact = null;
  if (body.contact_id) {
    contact = await db.prepare("SELECT * FROM contacts WHERE id = ? AND arsip = 0").bind(body.contact_id).first();
    if (!contact) throw invalid("contact_id", "Kontak tidak ditemukan atau diarsipkan.");
  }

  // Syarat & jatuh tempo
  let termId = body.term_id || null;
  let jatuhTempo = body.jatuh_tempo ? requireIsoDate(body.jatuh_tempo, "jatuh_tempo") : null;
  if (!jatuhTempo && termId) {
    const term = await db.prepare("SELECT * FROM payment_terms WHERE id = ?").bind(termId).first();
    if (term) jatuhTempo = addDays(tanggal, term.hari || 0);
  }
  if (!jatuhTempo && (type === "sales_invoice" || type === "purchase_invoice" || (type === "expense" && body.bayar_nanti))) {
    jatuhTempo = addDays(tanggal, 30);
  }

  const hargaTermasukPajak = body.harga_termasuk_pajak ? 1 : 0;
  const docId = existingDoc?.id || newId();
  let docNo = cleanText(body.no, 60);
  let numberingStmt = null;
  if (!docNo) {
    if (existingDoc) {
      docNo = existingDoc.no;
    } else {
      const alloc = await allocateDocNumber(db, type, unitKode, tanggal, now, actor);
      docNo = alloc.no;
      numberingStmt = alloc.updateStmt;
    }
  } else {
    const dup = await db
      .prepare("SELECT id FROM documents WHERE type = ? AND no = ? AND id != ? AND deleted_at IS NULL")
      .bind(type, docNo, docId)
      .first();
    if (dup) throw new KeuanganError("DUPLIKAT", 409, `Nomor dokumen "${docNo}" sudah digunakan.`);
  }

  const assertAcc = (kode, field) => {
    const acc = accountsByKode.get(kode);
    if (!acc || acc.is_header || acc.arsip) throw invalid(field, `Akun ${kode || ""} tidak valid atau adalah header/arsip.`);
    return acc;
  };

  let warehouseId = null;
  const docLines = [];
  const docLinksToInsert = [];
  const preRevertUpdates = [];
  const oldLinkAmountByTarget = new Map();
  if (existingDoc) {
    const { results: oldLinksOut } = await db.prepare("SELECT * FROM document_links WHERE from_id = ?").bind(docId).all();
    for (const l of oldLinksOut) {
      oldLinkAmountByTarget.set(l.to_id, (oldLinkAmountByTarget.get(l.to_id) || 0) + (l.amount || 0));
      if (l.kind === "payment_to_invoice" || l.kind === "memo_to_invoice") {
        const target = await db.prepare("SELECT id, total, sisa, uang_muka FROM documents WHERE id = ?").bind(l.to_id).first();
        if (target) {
          const restSisa = Math.min(target.total - (target.uang_muka || 0), (target.sisa || 0) + l.amount);
          const restStatus = restSisa >= target.total - (target.uang_muka || 0) ? "belum_dibayar" : "sebagian";
          preRevertUpdates.push(db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(restSisa, restStatus, target.id));
        }
      } else if (l.kind === "deposit_to_order") {
        preRevertUpdates.push(db.prepare("UPDATE documents SET uang_muka = MAX(0, uang_muka - ?) WHERE id = ?").bind(l.amount, l.to_id));
      } else if (l.kind === "order_to_delivery" || l.kind === "order_to_invoice") {
        preRevertUpdates.push(db.prepare("UPDATE documents SET status = 'terbuka' WHERE id = ? AND status IN ('sebagian', 'selesai')").bind(l.to_id));
      }
    }
  }
  const postBatchUpdates = [];
  let withholdingRows = [];
  let stockMoves = [];
  let journalRaw = [];

  let subtotal = 0; // dalam sen (atau mata uang transaksi, dikonversi kurs ke jurnal!)
  let diskonGlobal = 0;
  let pajak = 0;
  let ongkir = 0;
  let pemotongan = 0;
  let total = 0;
  let sisa = 0;
  let uangMukaApplied = 0;
  let status = "selesai";
  let parentId = body.parent_id ? String(body.parent_id) : null;
  const dataJson = { ...(body.custom_fields ? { custom_fields: body.custom_fields } : {}), ...(body.extra || {}) };

  const isSales = type.startsWith("sales_") || type === "order_deposit" || type === "credit_memo" || type === "credit_memo_refund" || type === "proforma";
  const isPurchase = type.startsWith("purchase_") || type === "debit_memo" || type === "debit_memo_refund";

  // ─── BRANCH 1: Pembayaran Piutang / Hutang ──────────────────────────────────
  if (type === "sales_payment" || type === "purchase_payment") {
    const isSalesPay = type === "sales_payment";
    if (!contact) throw invalid("contact_id", `Kontak ${isSalesPay ? "pelanggan" : "vendor"} wajib dipilih.`);
    const cashKode = isSalesPay ? body.setor_ke : body.bayar_dari;
    const cashAcc = assertAcc(cashKode, isSalesPay ? "setor_ke" : "bayar_dari");
    if (cashAcc.kategori !== 3 && cashAcc.kategori !== 9) {
      throw invalid(isSalesPay ? "setor_ke" : "bayar_dari", "Akun pembayaran harus kategori Kas & Bank / Kartu Kredit.");
    }
    if (cashAcc.unit_kode && cashAcc.unit_kode !== unitKode) {
      throw invalid("unit_kode", `Akun ${cashAcc.nama} hanya untuk unit ${cashAcc.unit_kode}.`);
    }

    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (allocations.length === 0) throw invalid("allocations", "Pilih minimal 1 faktur/tagihan yang dibayar.");

    const targetType = isSalesPay ? "sales_invoice" : "purchase_invoice";
    const memoType = isSalesPay ? "credit_memo" : "debit_memo";
    const arApKode = isSalesPay ? map.piutang_usaha || "1-10100" : map.hutang_usaha || "2-20100";
    const fxGainLossKode = map.selisih_kurs_terealisasi || "8-80200";

    let totalAllocatedIdr = 0;
    let totalFxDiffIdr = 0; // positif = untung penjualan / rugi pembelian, dsb.

    for (const [i, al] of allocations.entries()) {
      const targetId = String(al.document_id || "");
      const target = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(targetId).first();
      if (!target || (target.type !== targetType && target.type !== "expense")) {
        throw invalid("allocations", `Baris ${i + 1}: dokumen tagihan tidak ditemukan.`, i);
      }
      if (target.contact_id !== contact.id) {
        throw invalid("allocations", `Baris ${i + 1}: dokumen ${target.no} bukan milik kontak yang sama.`, i);
      }
      const amt = Number(al.amount);
      if (!isInt(amt, { min: 1 })) throw invalid("allocations", `Baris ${i + 1}: nominal bayar harus > 0.`, i);
      const effectiveTargetSisa = (target.sisa || 0) + (oldLinkAmountByTarget.get(target.id) || 0);
      if (amt > effectiveTargetSisa) {
        throw invalid("allocations", `Baris ${i + 1}: pembayaran (${amt}) melebihi sisa tagihan ${target.no} (${effectiveTargetSisa}).`, i);
      }

      // Hitung nilai buku AR/AP sesuai kurs faktur asal vs kurs pembayaran sekarang
      const amtIdrPay = convertFcToIdr(amt, kurs);
      const amtIdrInv = convertFcToIdr(amt, target.kurs || 1_000_000);
      totalAllocatedIdr += amtIdrPay;
      if (target.currency === currency && (target.kurs || 1_000_000) !== kurs) {
        totalFxDiffIdr += isSalesPay ? amtIdrPay - amtIdrInv : amtIdrInv - amtIdrPay;
      }

      const newSisa = effectiveTargetSisa - amt;
      const newStatus = newSisa === 0 ? "lunas" : "sebagian";
      postBatchUpdates.push(
        db.prepare("UPDATE documents SET sisa = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(newSisa, newStatus, now, actor.uid, target.id),
      );
      docLinksToInsert.push({ from_id: docId, to_id: target.id, amount: amt, kind: "payment_to_invoice" });
      docLines.push({
        account_kode: target.type === "expense" ? "2-20300" : arApKode,
        deskripsi: `Pembayaran ${target.no}`,
        qty_milli: 1000,
        harga: amt,
        jumlah: amt,
        tax_amount: 0,
        unit_kode: target.unit_kode || unitKode,
        source_line_id: target.id,
      });

      const invArAp = target.type === "expense" ? "2-20300" : arApKode;
      journalRaw.push({
        tanggal,
        unit_kode: target.unit_kode || unitKode,
        account_kode: invArAp,
        debit: isSalesPay ? 0 : amtIdrInv,
        kredit: isSalesPay ? amtIdrInv : 0,
        contact_id: contact.id,
        keterangan: `Pelunasan ${target.no}`,
        currency,
        amount_fc: amt,
      });

      subtotal += amt;
    }

    // Potongan kredit/debit memo opsional
    let memoAppliedTotal = 0;
    for (const cm of Array.isArray(body.apply_memos) ? body.apply_memos : []) {
      const mDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(cm.document_id).first();
      const allowedMemoTypes = isSalesPay ? ["credit_memo", "sales_return"] : ["debit_memo", "purchase_return"];
      if (!mDoc || !allowedMemoTypes.includes(mDoc.type) || mDoc.sisa < Number(cm.amount || 0)) {
        throw invalid("apply_memos", "Memo kredit/debit tidak valid atau saldo tidak cukup.");
      }
      const mAmt = Number(cm.amount);
      memoAppliedTotal += mAmt;
      const newMSisa = mDoc.sisa - mAmt;
      postBatchUpdates.push(
        db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(newMSisa, newMSisa === 0 ? "lunas" : "sebagian", mDoc.id),
      );
      docLinksToInsert.push({ from_id: docId, to_id: mDoc.id, amount: mAmt, kind: "memo_to_invoice" });
    }

    // Pemotongan pajak / PPh 23 dll.
    const whRes = await resolveWithholdings(body.withholdings, subtotal, accountsByKode);
    withholdingRows = whRes.rows;
    pemotongan = whRes.total;
    for (const w of withholdingRows) {
      const wIdr = convertFcToIdr(w.amount, kurs);
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: w.account_kode,
        debit: isSalesPay ? wIdr : 0,
        kredit: isSalesPay ? 0 : wIdr,
        contact_id: contact.id,
        keterangan: `Pemotongan ${w.account_nama}`,
        currency,
        amount_fc: w.amount,
      });
    }

    // Biaya bank / diskon pelunasan opsional
    const bankFee = isInt(Number(body.biaya_admin), { min: 1 }) ? Number(body.biaya_admin) : 0;
    if (bankFee > 0) {
      const feeAcc = body.biaya_admin_account || (isSalesPay ? "8-80001" : "7-70099");
      assertAcc(feeAcc, "biaya_admin_account");
      const feeIdr = convertFcToIdr(bankFee, kurs);
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: feeAcc,
        debit: isSalesPay ? feeIdr : 0,
        kredit: isSalesPay ? 0 : feeIdr,
        contact_id: contact.id,
        keterangan: "Biaya administrasi/diskon pembayaran",
        currency,
        amount_fc: bankFee,
      });
    }

    if (totalFxDiffIdr !== 0) {
      // Untung selisih kurs -> Kredit 8-80200; Rugi selisih kurs -> Debit 8-80200
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: fxGainLossKode,
        debit: totalFxDiffIdr < 0 ? Math.abs(totalFxDiffIdr) : 0,
        kredit: totalFxDiffIdr > 0 ? totalFxDiffIdr : 0,
        contact_id: contact.id,
        keterangan: "Selisih kurs terealisasi",
      });
    }

    total = subtotal;
    const cashNet = Math.max(0, subtotal - pemotongan - bankFee - memoAppliedTotal);
    const cashIdr = convertFcToIdr(cashNet, kurs);
    if (cashIdr > 0) {
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: cashAcc.kode,
        debit: isSalesPay ? cashIdr : 0,
        kredit: isSalesPay ? 0 : cashIdr,
        contact_id: contact.id,
        keterangan: cleanText(body.memo, 300) || (isSalesPay ? "Penerimaan Pembayaran" : "Pembayaran Tagihan"),
        currency,
        amount_fc: cashNet,
      });
    }
    dataJson[isSalesPay ? "setor_ke" : "bayar_dari"] = cashAcc.kode;
    dataJson.payment_method = cleanText(body.payment_method || "Transfer Bank", 60);
    status = "lunas";

    // ─── BRANCH 2: Uang Muka Pemesanan (Order/Purchase Deposit) ─────────────────
  } else if (type === "order_deposit" || type === "purchase_deposit") {
    const isOrder = type === "order_deposit";
    if (!parentId) throw invalid("parent_id", "Uang muka harus terhubung ke dokumen Pemesanan.");
    const orderDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(parentId).first();
    if (!orderDoc || orderDoc.type !== (isOrder ? "sales_order" : "purchase_order")) {
      throw invalid("parent_id", "Dokumen Pemesanan tidak ditemukan.");
    }
    contact = orderDoc.contact_id
      ? await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(orderDoc.contact_id).first()
      : contact;
    const cashKode = isOrder ? body.setor_ke : body.bayar_dari;
    const cashAcc = assertAcc(cashKode, isOrder ? "setor_ke" : "bayar_dari");
    const amt = Number(body.jumlah);
    if (!isInt(amt, { min: 1 })) throw invalid("jumlah", "Nominal uang muka harus > 0.");
    const effectiveOrderDp = Math.max(0, (orderDoc.uang_muka || 0) - (oldLinkAmountByTarget.get(orderDoc.id) || 0));
    if (effectiveOrderDp + amt > orderDoc.total) {
      throw invalid("jumlah", "Total uang muka tidak boleh melebihi nilai pesanan.");
    }

    const depAcc = isOrder ? map.pembayaran_di_muka || "2-20109" : map.uang_muka_pembelian || "1-10402";
    const amtIdr = convertFcToIdr(amt, kurs);
    subtotal = amt;
    total = amt;
    status = "lunas";
    docLines.push({
      account_kode: depAcc,
      deskripsi: `Uang muka untuk ${orderDoc.no}`,
      qty_milli: 1000,
      harga: amt,
      jumlah: amt,
      unit_kode: unitKode,
    });
    journalRaw.push(
      {
        tanggal,
        unit_kode: unitKode,
        account_kode: cashAcc.kode,
        debit: isOrder ? amtIdr : 0,
        kredit: isOrder ? 0 : amtIdr,
        contact_id: contact?.id || null,
        keterangan: `Uang muka ${orderDoc.no}`,
        currency,
        amount_fc: amt,
      },
      {
        tanggal,
        unit_kode: unitKode,
        account_kode: depAcc,
        debit: isOrder ? 0 : amtIdr,
        kredit: isOrder ? amtIdr : 0,
        contact_id: contact?.id || null,
        keterangan: `Uang muka ${orderDoc.no}`,
        currency,
        amount_fc: amt,
      },
    );
    docLinksToInsert.push({ from_id: docId, to_id: orderDoc.id, amount: amt, kind: "deposit_to_order" });
    postBatchUpdates.push(
      db.prepare("UPDATE documents SET uang_muka = uang_muka + ? WHERE id = ?").bind(amt, orderDoc.id),
    );
    dataJson[isOrder ? "setor_ke" : "bayar_dari"] = cashAcc.kode;

    // ─── BRANCH 3: Tukar Faktur (sales_join / purchase_join) ────────────────────
  } else if (type === "sales_join" || type === "purchase_join") {
    if (!contact) throw invalid("contact_id", "Kontak wajib dipilih untuk Tukar Faktur.");
    const invoiceIds = Array.isArray(body.invoice_ids) ? body.invoice_ids : [];
    if (invoiceIds.length === 0) throw invalid("invoice_ids", "Pilih minimal 1 faktur.");
    const expectedType = type === "sales_join" ? "sales_invoice" : "purchase_invoice";
    for (const invId of invoiceIds) {
      const inv = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(invId).first();
      if (!inv || inv.type !== expectedType || inv.contact_id !== contact.id) {
        throw invalid("invoice_ids", "Salah satu faktur tidak valid atau berbeda kontak.");
      }
      subtotal += inv.sisa;
      docLines.push({
        account_kode: expectedType === "sales_invoice" ? map.piutang_usaha || "1-10100" : map.hutang_usaha || "2-20100",
        deskripsi: `Tukar faktur ${inv.no}`,
        qty_milli: 1000,
        harga: inv.sisa,
        jumlah: inv.sisa,
        unit_kode: unitKode,
        source_line_id: inv.id,
      });
      docLinksToInsert.push({ from_id: docId, to_id: inv.id, amount: inv.sisa, kind: "tukar_faktur" });
    }
    total = subtotal;
    sisa = subtotal;
    status = "terbuka";
    dataJson.invoice_ids = invoiceIds;

    // ─── BRANCH 4: Pengembalian Kredit/Debit Memo ───────────────────────────────
  } else if (type === "credit_memo_refund" || type === "debit_memo_refund") {
    const isCreditRefund = type === "credit_memo_refund";
    if (!parentId) throw invalid("parent_id", "Pilih memo yang dikembalikan.");
    const memoDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(parentId).first();
    const allowedRefundTypes = isCreditRefund ? ["credit_memo", "sales_return"] : ["debit_memo", "purchase_return"];
    if (!memoDoc || !allowedRefundTypes.includes(memoDoc.type)) {
      throw invalid("parent_id", "Memo tidak ditemukan.");
    }
    const amt = Number(body.jumlah || memoDoc.sisa);
    const effectiveMemoSisa = (memoDoc.sisa || 0) + (oldLinkAmountByTarget.get(memoDoc.id) || 0);
    if (!isInt(amt, { min: 1 }) || amt > effectiveMemoSisa) {
      throw invalid("jumlah", "Nominal pengembalian melebihi sisa memo.");
    }
    const cashKode = isCreditRefund ? body.bayar_dari : body.setor_ke;
    const cashAcc = assertAcc(cashKode, isCreditRefund ? "bayar_dari" : "setor_ke");
    const memoAcc = isCreditRefund ? map.piutang_usaha || "1-10100" : map.hutang_usaha || "2-20100";
    const amtIdr = convertFcToIdr(amt, kurs);
    contact = memoDoc.contact_id ? await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(memoDoc.contact_id).first() : contact;
    subtotal = amt;
    total = amt;
    status = "lunas";
    journalRaw.push(
      {
        tanggal,
        unit_kode: unitKode,
        account_kode: cashAcc.kode,
        debit: isCreditRefund ? 0 : amtIdr,
        kredit: isCreditRefund ? amtIdr : 0,
        contact_id: contact?.id || null,
        keterangan: `Pengembalian ${memoDoc.no}`,
      },
      {
        tanggal,
        unit_kode: unitKode,
        account_kode: memoAcc,
        debit: isCreditRefund ? amtIdr : 0,
        kredit: isCreditRefund ? 0 : amtIdr,
        contact_id: contact?.id || null,
        keterangan: `Pengembalian ${memoDoc.no}`,
      },
    );
    const newMSisa = effectiveMemoSisa - amt;
    postBatchUpdates.push(db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(newMSisa, newMSisa === 0 ? "lunas" : "sebagian", memoDoc.id));
    docLinksToInsert.push({ from_id: docId, to_id: memoDoc.id, amount: amt, kind: "memo_to_invoice" });

    // ─── BRANCH 5: Biaya (Expense) ─────────────────────────────────────────────
  } else if (type === "expense") {
    const bayarNanti = Boolean(body.bayar_nanti);
    let creditKode = "2-20300";
    if (!bayarNanti) {
      const cashAcc = assertAcc(body.bayar_dari, "bayar_dari");
      if (cashAcc.kategori !== 3 && cashAcc.kategori !== 9) {
        throw invalid("bayar_dari", "Akun Bayar Dari harus kategori Kas & Bank / Kartu Kredit.");
      }
      if (cashAcc.unit_kode && cashAcc.unit_kode !== unitKode) {
        throw invalid("unit_kode", `Akun ${cashAcc.nama} hanya untuk unit ${cashAcc.unit_kode}.`);
      }
      creditKode = cashAcc.kode;
      dataJson.bayar_dari = cashAcc.kode;
    } else if (!contact) {
      throw invalid("contact_id", "Kontak penerima wajib dipilih untuk Biaya Bayar Nanti.");
    }
    dataJson.bayar_nanti = bayarNanti;

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) throw invalid("lines", "Minimal harus ada 1 baris biaya.");
    const taxAgg = new Map();

    for (const [i, row] of rawLines.entries()) {
      const acc = assertAcc(row.account_kode, "account_kode");
      if (acc.kategori === 3) throw invalid("account_kode", `Baris ${i + 1}: akun Kas & Bank tidak boleh menjadi baris biaya.`, i);
      const rawAmount = Number(row.jumlah);
      if (!isInt(rawAmount, { min: 1 })) throw invalid("jumlah", `Baris ${i + 1}: jumlah biaya harus > 0.`, i);
      const taxObj = row.tax_id ? taxesById.get(row.tax_id) : null;
      if (row.tax_id && !taxObj) throw invalid("tax_id", `Baris ${i + 1}: pajak tidak ditemukan.`, i);
      const calc = calculateLineTaxes({ rawAmount, taxes: taxObj ? [taxObj] : [], hargaTermasukPajak: Boolean(hargaTermasukPajak) });
      subtotal += calc.dpp;
      pajak += calc.taxTotal;
      docLines.push({
        account_kode: acc.kode,
        deskripsi: cleanText(row.deskripsi, 300),
        qty_milli: 1000,
        harga: calc.dpp,
        jumlah: calc.dpp,
        tax_id: row.tax_id || null,
        tax_amount: calc.taxTotal,
        unit_kode: unitKode,
      });
      const dppIdr = convertFcToIdr(calc.dpp, kurs);
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: acc.kode,
        debit: dppIdr,
        kredit: 0,
        contact_id: contact?.id || null,
        keterangan: cleanText(row.deskripsi, 300) || cleanText(body.memo, 300) || "Biaya",
        currency,
        amount_fc: calc.dpp,
      });
      for (const p of calc.parts) {
        if (p.amount === 0) continue;
        const taxAcc = p.akunBeli || map.pajak_pembelian || "1-10500";
        taxAgg.set(taxAcc, (taxAgg.get(taxAcc) || 0) + p.amount);
      }
    }

    for (const [taxAcc, netAmt] of taxAgg.entries()) {
      if (netAmt === 0) continue;
      const absIdr = convertFcToIdr(Math.abs(netAmt), kurs);
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: taxAcc,
        debit: netAmt > 0 ? absIdr : 0,
        kredit: netAmt < 0 ? absIdr : 0,
        contact_id: contact?.id || null,
        keterangan: "Pajak biaya",
      });
    }

    const whRes = await resolveWithholdings(body.withholdings, subtotal, accountsByKode);
    withholdingRows = whRes.rows;
    pemotongan = whRes.total;
    for (const w of withholdingRows) {
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: w.account_kode,
        debit: 0,
        kredit: convertFcToIdr(w.amount, kurs),
        contact_id: contact?.id || null,
        keterangan: `Pemotongan (${w.account_nama})`,
      });
    }

    total = subtotal + pajak;
    const netPay = total - pemotongan;
    if (netPay < 0) throw invalid("withholdings", "Pemotongan tidak boleh melebihi total biaya.");
    if (netPay > 0) {
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: creditKode,
        debit: 0,
        kredit: convertFcToIdr(netPay, kurs),
        contact_id: contact?.id || null,
        keterangan: bayarNanti ? "Hutang biaya" : "Pembayaran biaya",
        currency,
        amount_fc: netPay,
      });
    }
    sisa = bayarNanti ? netPay : 0;
    status = bayarNanti ? "belum_dibayar" : "lunas";

    // ─── BRANCH 6: Baris Produk untuk Penjualan & Pembelian ─────────────────────
  } else {
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) throw invalid("lines", "Minimal harus ada 1 baris item.");

    const needsContact = !["purchase_request", "sales_delivery", "purchase_delivery"].includes(type);
    if (needsContact && !contact) {
      throw invalid("contact_id", "Kontak pelanggan/vendor wajib dipilih.");
    }

    // Jika mengkonversi dari dokumen sumber / pengiriman sebelumnya
    const deliveryIds = Array.isArray(body.delivery_ids) ? body.delivery_ids : [];
    let fromDelivery = deliveryIds.length > 0;
    if (parentId) {
      const parentDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(parentId).first();
      if (!parentDoc) throw invalid("parent_id", "Dokumen induk tidak ditemukan.");
      if (parentDoc.type === "sales_delivery" || parentDoc.type === "purchase_delivery") {
        fromDelivery = true;
      }
      if (type !== "sales_return" && type !== "purchase_return" && type !== "credit_memo" && type !== "debit_memo") {
        await validateSourceLineConversion(db, parentId, rawLines);
      }
      if (parentDoc.uang_muka > 0 && (type === "sales_invoice" || type === "purchase_invoice")) {
        uangMukaApplied = Math.min(parentDoc.uang_muka, Number(body.uang_muka ?? parentDoc.uang_muka));
      }
    }

    const usesStock =
      type === "sales_delivery" ||
      type === "purchase_delivery" ||
      type === "sales_return" ||
      type === "purchase_return" ||
      ((type === "sales_invoice" || type === "purchase_invoice") && !fromDelivery);

    warehouseId = await resolveDefaultWarehouseId(db, unitKode, body.warehouse_id, warehouses);
    if (usesStock) assertWithin24Months(tanggal, now);

    const revAccDefault = map.pendapatan_penjualan || "4-40000";
    const discAccDefault = map.diskon_penjualan || "4-40100";
    const retSalesAcc = map.retur_penjualan || "4-40200";
    const shipSalesAcc = map.pengiriman_penjualan || "7-70099";
    const unbilledRevAcc = map.penjualan_belum_ditagih || "4-40201";
    const unbilledArAcc = map.piutang_belum_ditagih || "1-10101";
    const arAcc = map.piutang_usaha || "1-10100";

    const cogsDefault = map.pembelian_cogs || "5-50000";
    const shipBuyAcc = map.pengiriman_pembelian || "5-50300";
    const unbilledApAcc = map.hutang_belum_ditagih || "2-20101";
    const apAcc = map.hutang_usaha || "2-20100";
    const invDefault = map.persediaan || "1-10200";

    const allowNegativeStock = Boolean(settings.produk?.izinkan_stok_negatif);
    const pendingInByProd = new Map();
    let lineDiscountTotal = 0;
    const taxAgg = new Map();
    const pendingAssetLines = [];
    let unbilledSalesTotal = 0;

    for (const [i, row] of rawLines.entries()) {
      const prod = row.product_id ? await getProductWithDetails(db, row.product_id) : null;
      const qtyMilli = Number(row.qty_milli);
      if (!isInt(qtyMilli, { min: 1 })) throw invalid("qty_milli", `Baris ${i + 1}: kuantitas harus > 0.`, i);

      const satuan = cleanText(row.satuan || prod?.satuan || "pcs", 30);
      const uomFactorMilli = prod ? getUomFactorMilli(prod, satuan) : 1000;
      const baseQtyMilli = Math.round((qtyMilli * uomFactorMilli) / 1000);

      let harga = Number(row.harga ?? (isSales ? prod?.harga_jual || 0 : prod?.harga_beli || 0));
      if (!isInt(harga, { min: 0 })) throw invalid("harga", `Baris ${i + 1}: harga tidak valid.`, i);

      // Rilis 3 hook: Terapkan price_rules otomatis bila user tidak mengoverride diskon/harga pada penjualan
      let diskonSpec = row.diskon || "";
      let diskonBp = Number(row.diskon_bp || 0);
      if (isSales && prod && !diskonSpec && !diskonBp && !row.diskon_nominal && body.apply_price_rules !== false) {
        const rule = await matchActivePriceRule(db, { productId: prod.id, contact, tanggal, qtyMilli: baseQtyMilli });
        if (rule) {
          if (rule.jenis === "diskon_persen" && rule.config.persen) diskonSpec = String(rule.config.persen);
          else if (rule.jenis === "diskon_bertingkat" && rule.config.spesifikasi) diskonSpec = String(rule.config.spesifikasi);
          else if (rule.jenis === "harga_akhir" && isInt(Number(rule.config.harga))) harga = Number(rule.config.harga);
        }
      }

      const lineCalc = computeLineAmountWithDiscount(qtyMilli, harga, {
        diskonSpec,
        diskonBp,
        diskonNominal: row.diskon_nominal,
      });

      const taxObj = row.tax_id ? taxesById.get(row.tax_id) : null;
      if (row.tax_id && !taxObj) throw invalid("tax_id", `Baris ${i + 1}: pajak tidak ditemukan.`, i);

      // Pajak dihitung dari nilai setelah diskon baris
      const taxCalc = calculateLineTaxes({
        rawAmount: lineCalc.net,
        taxes: taxObj ? [taxObj] : [],
        hargaTermasukPajak: Boolean(hargaTermasukPajak),
      });

      // DPP kotor (sebelum diskon) jika harga belum termasuk pajak; jika termasuk pajak, ambil net DPP + prorata diskon
      const grossDpp = hargaTermasukPajak ? taxCalc.dpp + lineCalc.discount : lineCalc.gross;
      const lineDisc = lineCalc.discount;
      const netDpp = taxCalc.dpp;

      subtotal += netDpp;
      lineDiscountTotal += lineDisc;
      pajak += taxCalc.taxTotal;
      unbilledSalesTotal += netDpp;

      const lineId = newId();
      const deskripsi = cleanText(row.deskripsi || prod?.nama || "", 300);
      const lineAccKode = row.account_kode || (isSales ? prod?.akun_jual || revAccDefault : prod?.akun_beli || cogsDefault);
      assertAcc(lineAccKode, "account_kode");

      docLines.push({
        id: lineId,
        product_id: prod?.id || null,
        account_kode: lineAccKode,
        deskripsi,
        qty_milli: qtyMilli,
        satuan,
        harga,
        diskon_bp: lineCalc.effectiveBp,
        tax_id: row.tax_id || null,
        jumlah: netDpp,
        tax_amount: taxCalc.taxTotal,
        unit_kode: unitKode,
        source_line_id: row.source_line_id || null,
      });

      for (const p of taxCalc.parts) {
        if (p.amount === 0) continue;
        const taxAcc = isSales ? p.akunJual || map.pajak_penjualan || "2-20500" : p.akunBeli || map.pajak_pembelian || "1-10500";
        taxAgg.set(taxAcc, (taxAgg.get(taxAcc) || 0) + p.amount);
      }

      // ─── Posting Pendapatan / Persediaan / HPP sesuai tipe dokumen ───
      if (NO_JOURNAL_DOC_TYPES.has(type)) continue;

      if (type === "sales_invoice" || type === "credit_memo") {
        const revKode = type === "credit_memo" ? retSalesAcc : lineAccKode;
        const grossIdr = convertFcToIdr(grossDpp, kurs);
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: revKode,
          debit: type === "credit_memo" ? convertFcToIdr(netDpp, kurs) : 0,
          kredit: type === "credit_memo" ? 0 : grossIdr,
          contact_id: contact?.id || null,
          keterangan: deskripsi || docNo,
          currency,
          amount_fc: type === "credit_memo" ? netDpp : grossDpp,
        });
        if (type === "sales_invoice" && lineDisc > 0) {
          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: prod?.akun_diskon || discAccDefault,
            debit: convertFcToIdr(lineDisc, kurs),
            kredit: 0,
            contact_id: contact?.id || null,
            keterangan: `Diskon ${deskripsi}`,
          });
        }
      } else if (type === "sales_return") {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: retSalesAcc,
          debit: convertFcToIdr(netDpp, kurs),
          kredit: 0,
          contact_id: contact?.id || null,
          keterangan: `Retur ${deskripsi}`,
        });
      }

      // Stok & HPP / Pembelian persediaan
      const stockComponents = prod
        ? prod.is_bundle
          ? prod.bundleItems.map((bi) => ({
            prod: bi,
            qtyBaseMilli: Math.round((baseQtyMilli * bi.qty_milli) / 1000),
            batchNo: row.batch_no || null,
            serialNo: row.serial_no || null,
          }))
          : prod.monitor_stok
            ? [{ prod, qtyBaseMilli: baseQtyMilli, batchNo: row.batch_no || null, serialNo: row.serial_no || null }]
            : []
        : [];

      if (type === "sales_invoice" || type === "sales_delivery") {
        if (type === "sales_delivery") {
          journalRaw.push(
            {
              tanggal,
              unit_kode: unitKode,
              account_kode: unbilledArAcc,
              debit: convertFcToIdr(netDpp, kurs),
              kredit: 0,
              contact_id: contact?.id || null,
              keterangan: `Pengiriman belum ditagih ${docNo}`,
            },
            {
              tanggal,
              unit_kode: unitKode,
              account_kode: unbilledRevAcc,
              debit: 0,
              kredit: convertFcToIdr(netDpp, kurs),
              contact_id: contact?.id || null,
              keterangan: `Penjualan belum ditagih ${docNo}`,
            },
          );
        }
        if (usesStock && stockComponents.length > 0) {
          for (const comp of stockComponents) {
            if (!comp.prod.monitor_stok) continue;
            if (!warehouseId) throw invalid("warehouse_id", "Gudang wajib ada untuk produk yang dimonitor stoknya.");
            if (comp.prod.pelacakan === "batch" && !comp.batchNo) {
              throw invalid("batch_no", `Produk ${comp.prod.nama} memerlukan nomor batch.`, i);
            }
            if (comp.prod.pelacakan === "serial" && !comp.serialNo) {
              throw invalid("serial_no", `Produk ${comp.prod.nama} memerlukan nomor seri.`, i);
            }
            const cogsVal = await estimateOutCost(
              db,
              comp.prod.id,
              tanggal,
              comp.qtyBaseMilli,
              existingDoc?.id || null,
              pendingInByProd.get(comp.prod.id) || [],
              comp.prod.harga_beli || 0,
              allowNegativeStock,
              warehouseId,
            );
            stockMoves.push({
              line_id: lineId,
              tanggal,
              seq: stockMoves.length + 1,
              product_id: comp.prod.id,
              warehouse_id: warehouseId,
              qty_milli: -comp.qtyBaseMilli,
              nilai: -cogsVal,
              batch_no: comp.batchNo,
              serial_no: comp.serialNo,
            });
            if (cogsVal > 0) {
              const invAcc = comp.prod.akun_persediaan || invDefault;
              const cogsAcc = comp.prod.akun_beli || cogsDefault;
              journalRaw.push(
                { tanggal, unit_kode: unitKode, account_kode: cogsAcc, debit: cogsVal, kredit: 0, keterangan: `HPP ${comp.prod.nama}` },
                { tanggal, unit_kode: unitKode, account_kode: invAcc, debit: 0, kredit: cogsVal, keterangan: `Persediaan ${comp.prod.nama}` },
              );
            }
          }
        }
      } else if (type === "sales_return") {
        if (usesStock && stockComponents.length > 0) {
          for (const comp of stockComponents) {
            if (!comp.prod.monitor_stok) continue;
            if (!warehouseId) throw invalid("warehouse_id", "Gudang wajib ada untuk retur produk berstok.");
            let unitCostRet = 0;
            if (parentId) {
              const origMove = await db
                .prepare("SELECT qty_milli, nilai FROM stock_moves WHERE document_id = ? AND product_id = ? AND qty_milli < 0 LIMIT 1")
                .bind(parentId, comp.prod.id)
                .first();
              if (origMove && Math.abs(origMove.qty_milli) > 0) {
                unitCostRet = roundDivPositive(Math.abs(origMove.nilai) * 1000, Math.abs(origMove.qty_milli));
              }
            }
            if (!unitCostRet) {
              const avg = await computeAvgUnitCostAsOf(db, comp.prod.id, tanggal, existingDoc?.id || null, comp.prod.harga_beli || 0);
              unitCostRet = avg.avg_unit_cost || comp.prod.harga_beli || 0;
            }
            const retVal = roundDivPositive(comp.qtyBaseMilli * unitCostRet, 1000);
            stockMoves.push({
              line_id: lineId,
              tanggal,
              seq: stockMoves.length + 1,
              product_id: comp.prod.id,
              warehouse_id: warehouseId,
              qty_milli: comp.qtyBaseMilli,
              nilai: retVal,
              batch_no: comp.batchNo,
              serial_no: comp.serialNo,
            });
            if (retVal > 0) {
              const invAcc = comp.prod.akun_persediaan || invDefault;
              const cogsAcc = comp.prod.akun_beli || cogsDefault;
              journalRaw.push(
                { tanggal, unit_kode: unitKode, account_kode: invAcc, debit: retVal, kredit: 0, keterangan: `Retur masuk ${comp.prod.nama}` },
                { tanggal, unit_kode: unitKode, account_kode: cogsAcc, debit: 0, kredit: retVal, keterangan: `Pembalik HPP ${comp.prod.nama}` },
              );
            }
          }
        }
      } else if (type === "purchase_delivery" || type === "purchase_invoice" || type === "debit_memo") {
        const netIdr = convertFcToIdr(netDpp, kurs);
        const lineAccObj = accountsByKode.get(lineAccKode);
        const isAssetPurchase = type === "purchase_invoice" && (Boolean(row.is_asset) || lineAccObj?.kategori === 5);

        if (usesStock && prod && prod.monitor_stok && !isAssetPurchase) {
          if (!warehouseId) throw invalid("warehouse_id", "Gudang wajib ada untuk produk yang dimonitor stoknya.");
          if (prod.pelacakan === "batch" && !row.batch_no) throw invalid("batch_no", `Produk ${prod.nama} memerlukan nomor batch.`, i);
          if (prod.pelacakan === "serial" && !row.serial_no) throw invalid("serial_no", `Produk ${prod.nama} memerlukan nomor seri.`, i);
          const invAcc = prod.akun_persediaan || invDefault;
          stockMoves.push({
            line_id: lineId,
            tanggal,
            seq: stockMoves.length + 1,
            product_id: prod.id,
            warehouse_id: warehouseId,
            qty_milli: baseQtyMilli,
            nilai: netIdr,
            batch_no: row.batch_no || null,
            serial_no: row.serial_no || null,
            exp_date: row.exp_date || null,
          });
          const q = pendingInByProd.get(prod.id) || [];
          q.push({ qty_milli: baseQtyMilli, nilai: netIdr });
          pendingInByProd.set(prod.id, q);

          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: invAcc,
            debit: netIdr,
            kredit: 0,
            contact_id: contact?.id || null,
            keterangan: `Persediaan masuk ${prod.nama}`,
            currency,
            amount_fc: netDpp,
          });
        } else if (type === "purchase_invoice" && fromDelivery) {
          // Pengakuan tagihan atas penerimaan barang: tutup Hutang Belum Ditagih (selisih harga ke COGS/Persediaan bila ada)
          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: unbilledApAcc,
            debit: netIdr,
            kredit: 0,
            contact_id: contact?.id || null,
            keterangan: `Tagihan penerimaan ${deskripsi}`,
          });
        } else {
          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: type === "debit_memo" ? lineAccKode : lineAccKode,
            debit: type === "debit_memo" ? 0 : netIdr,
            kredit: type === "debit_memo" ? netIdr : 0,
            contact_id: contact?.id || null,
            keterangan: deskripsi || docNo,
            currency,
            amount_fc: netDpp,
          });
          if (isAssetPurchase) {
            pendingAssetLines.push({
              nama: deskripsi || "Aset Baru",
              kode: `AST-${docNo.slice(-4)}-${i + 1}`,
              unit_kode: unitKode,
              akun_aset: lineAccKode,
              nilai_perolehan: netIdr,
              tanggal_beli: tanggal,
            });
          }
        }
      } else if (type === "purchase_return") {
        const netIdr = convertFcToIdr(netDpp, kurs);
        if (usesStock && prod && prod.monitor_stok) {
          if (!warehouseId) throw invalid("warehouse_id", "Gudang wajib ada untuk retur pembelian berstok.");
          const outVal = await estimateOutCost(
            db,
            prod.id,
            tanggal,
            baseQtyMilli,
            existingDoc?.id || null,
            [],
            prod.harga_beli || 0,
            allowNegativeStock,
            warehouseId,
          );
          stockMoves.push({
            line_id: lineId,
            tanggal,
            seq: stockMoves.length + 1,
            product_id: prod.id,
            warehouse_id: warehouseId,
            qty_milli: -baseQtyMilli,
            nilai: -outVal,
            batch_no: row.batch_no || null,
            serial_no: row.serial_no || null,
          });
          const invAcc = prod.akun_persediaan || invDefault;
          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: invAcc,
            debit: 0,
            kredit: outVal,
            contact_id: contact?.id || null,
            keterangan: `Retur beli ${prod.nama}`,
          });
          if (netIdr !== outVal) {
            // Selisih nilai retur dengan moving avg COGS masuk ke Penyesuaian/COGS
            journalRaw.push({
              tanggal,
              unit_kode: unitKode,
              account_kode: prod.akun_beli || cogsDefault,
              debit: netIdr < outVal ? outVal - netIdr : 0,
              kredit: netIdr > outVal ? netIdr - outVal : 0,
              contact_id: contact?.id || null,
              keterangan: "Selisih nilai retur pembelian",
            });
          }
        } else {
          journalRaw.push({
            tanggal,
            unit_kode: unitKode,
            account_kode: lineAccKode,
            debit: 0,
            kredit: netIdr,
            contact_id: contact?.id || null,
            keterangan: `Retur beli ${deskripsi}`,
          });
        }
      }
    } // end loop lines

    // Jika faktur penjualan dari sales_delivery, balik akun Belum Ditagih
    if (type === "sales_invoice" && fromDelivery && unbilledSalesTotal > 0) {
      const unbIdr = convertFcToIdr(unbilledSalesTotal, kurs);
      journalRaw.push(
        { tanggal, unit_kode: unitKode, account_kode: unbilledRevAcc, debit: unbIdr, kredit: 0, contact_id: contact?.id || null, keterangan: "Pembalik penjualan belum ditagih" },
        { tanggal, unit_kode: unitKode, account_kode: unbilledArAcc, debit: 0, kredit: unbIdr, contact_id: contact?.id || null, keterangan: "Pembalik piutang belum ditagih" },
      );
    }

    // Diskon total (tambahan di footer faktur)
    if (body.diskon && isInt(Number(body.diskon), { min: 1 })) {
      diskonGlobal = Number(body.diskon);
      if (type === "sales_invoice") {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: discAccDefault,
          debit: convertFcToIdr(diskonGlobal, kurs),
          kredit: 0,
          contact_id: contact?.id || null,
          keterangan: "Diskon penjualan",
        });
      } else if (type === "purchase_invoice") {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: cogsDefault,
          debit: 0,
          kredit: convertFcToIdr(diskonGlobal, kurs),
          contact_id: contact?.id || null,
          keterangan: "Diskon pembelian",
        });
      }
    }

    // Ongkir
    if (body.ongkir && isInt(Number(body.ongkir), { min: 1 })) {
      ongkir = Number(body.ongkir);
      if (type === "sales_invoice") {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: shipSalesAcc,
          debit: 0,
          kredit: convertFcToIdr(ongkir, kurs),
          contact_id: contact?.id || null,
          keterangan: "Ongkos kirim penjualan",
        });
      } else if (type === "purchase_invoice") {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: shipBuyAcc,
          debit: convertFcToIdr(ongkir, kurs),
          kredit: 0,
          contact_id: contact?.id || null,
          keterangan: "Ongkos kirim pembelian",
        });
      }
    }

    // Pajak per baris yang teragregasi
    if (!NO_JOURNAL_DOC_TYPES.has(type) && type !== "sales_delivery" && type !== "purchase_delivery") {
      for (const [taxAcc, netAmt] of taxAgg.entries()) {
        if (netAmt === 0) continue;
        const absIdr = convertFcToIdr(Math.abs(netAmt), kurs);
        const isNormalSaleSide = type === "sales_invoice" || type === "purchase_return" || type === "debit_memo";
        const isDebit = isNormalSaleSide ? netAmt < 0 : netAmt > 0;
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: taxAcc,
          debit: isDebit ? absIdr : 0,
          kredit: isDebit ? 0 : absIdr,
          contact_id: contact?.id || null,
          keterangan: "Pajak transaksi",
        });
      }
    }

    // Pemotongan PPh pada Faktur Penjualan / Pembelian
    if ((type === "sales_invoice" || type === "purchase_invoice") && Array.isArray(body.withholdings) && body.withholdings.length > 0) {
      const whRes = await resolveWithholdings(body.withholdings, subtotal - diskonGlobal, accountsByKode);
      withholdingRows = whRes.rows;
      pemotongan = whRes.total;
      for (const w of withholdingRows) {
        const wIdr = convertFcToIdr(w.amount, kurs);
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: w.account_kode,
          debit: type === "sales_invoice" ? wIdr : 0,
          kredit: type === "sales_invoice" ? 0 : wIdr,
          contact_id: contact?.id || null,
          keterangan: `Pemotongan (${w.account_nama})`,
        });
      }
    }

    total = subtotal - diskonGlobal + pajak + ongkir;

    if (type === "sales_invoice") {
      const netReceivable = Math.max(0, total - pemotongan);
      const afterDeposit = Math.max(0, netReceivable - uangMukaApplied);
      if (uangMukaApplied > 0) {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: map.pembayaran_di_muka || "2-20109",
          debit: convertFcToIdr(uangMukaApplied, kurs),
          kredit: 0,
          contact_id: contact?.id || null,
          keterangan: "Pemakaian uang muka penjualan",
        });
        if (parentId) {
          postBatchUpdates.push(db.prepare("UPDATE documents SET uang_muka = MAX(0, uang_muka - ?) WHERE id = ?").bind(uangMukaApplied, parentId));
        }
      }
      if (afterDeposit > 0) {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: arAcc,
          debit: convertFcToIdr(afterDeposit, kurs),
          kredit: 0,
          contact_id: contact?.id || null,
          keterangan: `Piutang ${docNo}`,
          currency,
          amount_fc: afterDeposit,
        });
      }
      await checkContactLimits(db, { contact, docType: type, netDeltaReceivable: convertFcToIdr(afterDeposit, kurs), excludeDocId: existingDoc?.id });
      sisa = afterDeposit;
      status = sisa === 0 ? "lunas" : "belum_dibayar";
    } else if (type === "purchase_invoice") {
      const netPayable = Math.max(0, total - pemotongan);
      const afterDeposit = Math.max(0, netPayable - uangMukaApplied);
      if (uangMukaApplied > 0) {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: map.uang_muka_pembelian || "1-10402",
          debit: 0,
          kredit: convertFcToIdr(uangMukaApplied, kurs),
          contact_id: contact?.id || null,
          keterangan: "Pemakaian uang muka pembelian",
        });
        if (parentId) {
          postBatchUpdates.push(db.prepare("UPDATE documents SET uang_muka = MAX(0, uang_muka - ?) WHERE id = ?").bind(uangMukaApplied, parentId));
        }
      }
      if (afterDeposit > 0) {
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: apAcc,
          debit: 0,
          kredit: convertFcToIdr(afterDeposit, kurs),
          contact_id: contact?.id || null,
          keterangan: `Hutang ${docNo}`,
          currency,
          amount_fc: afterDeposit,
        });
      }
      await checkContactLimits(db, { contact, docType: type, netDeltaPayable: convertFcToIdr(afterDeposit, kurs), excludeDocId: existingDoc?.id });
      sisa = afterDeposit;
      status = sisa === 0 ? "lunas" : "belum_dibayar";

      for (const ast of pendingAssetLines) {
        postBatchUpdates.push(
          db
            .prepare(
              `INSERT INTO assets (id, unit_kode, no, nama, akun_aset, deskripsi, tgl_akuisisi, biaya, akun_kredit, non_depresiasi, status, source_document_id, created_at, created_by, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'tertunda', ?, ?, ?, ?, ?)`,
            )
            .bind(newId(), ast.unit_kode, `${ast.kode}-${newId().slice(-4)}`, ast.nama, ast.akun_aset, `Dari tagihan ${docNo}`, ast.tanggal_beli, ast.nilai_perolehan, apAcc, docId, now, actor.uid, now, actor.uid),
        );
      }
    } else if (type === "purchase_delivery") {
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: unbilledApAcc,
        debit: 0,
        kredit: convertFcToIdr(subtotal, kurs),
        contact_id: contact?.id || null,
        keterangan: `Hutang belum ditagih ${docNo}`,
      });
      status = "selesai";
    } else if (type === "sales_return" || type === "credit_memo") {
      // Kurangi Piutang Usaha atau tutup faktur induk bila masih ada sisa
      let appliedInv = 0;
      if (parentId) {
        const inv = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(parentId).first();
        if (inv && inv.sisa > 0) {
          appliedInv = Math.min(inv.sisa, total);
          const newInvSisa = inv.sisa - appliedInv;
          postBatchUpdates.push(
            db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(newInvSisa, newInvSisa === 0 ? "lunas" : "sebagian", inv.id),
          );
          docLinksToInsert.push({ from_id: docId, to_id: inv.id, amount: appliedInv, kind: "memo_to_invoice" });
        }
      }
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: arAcc,
        debit: 0,
        kredit: convertFcToIdr(total, kurs),
        contact_id: contact?.id || null,
        keterangan: `${type === "sales_return" ? "Retur penjualan" : "Kredit memo"} ${docNo}`,
      });
      sisa = Math.max(0, total - appliedInv);
      status = sisa === 0 ? "lunas" : "terbuka";
    } else if (type === "purchase_return" || type === "debit_memo") {
      let appliedInv = 0;
      if (parentId) {
        const inv = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(parentId).first();
        if (inv && inv.sisa > 0) {
          appliedInv = Math.min(inv.sisa, total);
          const newInvSisa = inv.sisa - appliedInv;
          postBatchUpdates.push(
            db.prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?").bind(newInvSisa, newInvSisa === 0 ? "lunas" : "sebagian", inv.id),
          );
          docLinksToInsert.push({ from_id: docId, to_id: inv.id, amount: appliedInv, kind: "memo_to_invoice" });
        }
      }
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: apAcc,
        debit: convertFcToIdr(total, kurs),
        kredit: 0,
        contact_id: contact?.id || null,
        keterangan: `${type === "purchase_return" ? "Retur pembelian" : "Debit memo"} ${docNo}`,
      });
      sisa = Math.max(0, total - appliedInv);
      status = sisa === 0 ? "lunas" : "terbuka";
    } else if (type === "sales_delivery") {
      status = "selesai";
    } else {
      // Quotes, Orders, Requests, Proforma
      sisa = total;
      status = "terbuka";
    }

    if (parentId && (type === "sales_delivery" || type === "sales_invoice" || type === "purchase_delivery" || type === "purchase_invoice")) {
      const linkKind = type.endsWith("_delivery") ? "order_to_delivery" : "order_to_invoice";
      docLinksToInsert.push({ from_id: docId, to_id: parentId, amount: total, kind: linkKind });
      postBatchUpdates.push(db.prepare("UPDATE documents SET status = 'selesai' WHERE id = ? AND status = 'terbuka'").bind(parentId));
    }
    for (const dId of deliveryIds) {
      docLinksToInsert.push({ from_id: docId, to_id: dId, amount: total, kind: "delivery_to_invoice" });
    }
    dataJson.delivery_ids = deliveryIds;
    dataJson.line_discount = lineDiscountTotal;
  }

  // ─── Approval Check (Rilis 3, default MATI) ─────────────────────────────────
  // Catatan keamanan: `forceApproved` HANYA boleh diset sebagai parameter internal dari `decideApproval`, tidak pernah dibaca dari `body`.
  const approvalCheck = await determineApprovalState(db, { type, unitKode, total, settings, actorUid: actor.uid, forceApproved });
  const approvalState = approvalCheck.state;
  const isPendingApproval = approvalState === "pending";
  if (isPendingApproval) {
    status = "menunggu_persetujuan";
    dataJson.approval_rule_id = approvalCheck.ruleId;
    dataJson.current_stage = 1;
    // Dokumen menunggu approval: belum memposting buku besar atau stok!
    journalRaw = [];
    stockMoves = [];
    postBatchUpdates.length = 0;
  } else if (forceApproved) {
    dataJson.approval_rule_id = existingDoc ? JSON.parse(existingDoc.data_json || "{}").approval_rule_id || null : null;
  }

  const balancedJournal = journalRaw.length > 0 ? normalizeAndCheckBalance(journalRaw) : [];
  const memo = cleanText(body.memo, 1000);
  const pesan = cleanText(body.pesan, 1000);
  const refNo = cleanText(body.ref_no, 80);
  const noFakturPajak = cleanText(body.no_faktur_pajak, 80);

  const stmts = [];
  if (numberingStmt) stmts.push(numberingStmt);

  if (existingDoc) {
    stmts.push(
      db
        .prepare(
          `UPDATE documents SET tanggal = ?, no = ?, unit_kode = ?, contact_id = ?, status = ?, jatuh_tempo = ?, term_id = ?, ref_no = ?,
            warehouse_id = ?, currency = ?, kurs = ?, harga_termasuk_pajak = ?, subtotal = ?, diskon = ?, pajak = ?, ongkir = ?, pemotongan = ?,
            total = ?, sisa = ?, uang_muka = ?, parent_id = ?, pesan = ?, memo = ?, data_json = ?, approval_state = ?, no_faktur_pajak = ?,
            updated_at = ?, updated_by = ?
           WHERE id = ?`,
        )
        .bind(
          tanggal, docNo, unitKode, contact?.id || null, status, jatuhTempo, termId, refNo,
          warehouseId, currency, kurs, hargaTermasukPajak, subtotal, diskonGlobal, pajak, ongkir, pemotongan,
          total, sisa, uangMukaApplied, parentId, pesan, memo, JSON.stringify(dataJson), approvalState, noFakturPajak,
          now, actor.uid, docId,
        ),
      db.prepare("DELETE FROM document_lines WHERE document_id = ?").bind(docId),
      db.prepare("DELETE FROM document_tags WHERE document_id = ?").bind(docId),
      db.prepare("DELETE FROM withholdings WHERE document_id = ?").bind(docId),
      db.prepare("DELETE FROM document_links WHERE from_id = ?").bind(docId),
    );
  } else {
    stmts.push(
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, contact_id, status, jatuh_tempo, term_id, ref_no, warehouse_id,
            currency, kurs, harga_termasuk_pajak, subtotal, diskon, pajak, ongkir, pemotongan, total, sisa, uang_muka, parent_id,
            pesan, memo, data_json, approval_state, no_faktur_pajak, created_at, created_by, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          docId, type, docNo, tanggal, unitKode, contact?.id || null, status, jatuhTempo, termId, refNo, warehouseId,
          currency, kurs, hargaTermasukPajak, subtotal, diskonGlobal, pajak, ongkir, pemotongan, total, sisa, uangMukaApplied, parentId,
          pesan, memo, JSON.stringify(dataJson), approvalState, noFakturPajak, now, actor.uid, now, actor.uid,
        ),
    );
  }

  for (const [idx, l] of docLines.entries()) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO document_lines (id, document_id, seq, product_id, account_kode, deskripsi, qty_milli, satuan, harga, diskon_bp, tax_id, jumlah, tax_amount, unit_kode, source_line_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          l.id || newId(), docId, idx + 1, l.product_id || null, l.account_kode || null, l.deskripsi || "",
          l.qty_milli ?? 1000, l.satuan || "", l.harga || 0, l.diskon_bp || 0, l.tax_id || null,
          l.jumlah || 0, l.tax_amount || 0, l.unit_kode || unitKode, l.source_line_id || null,
        ),
    );
  }

  for (const w of withholdingRows) {
    stmts.push(
      db
        .prepare("INSERT INTO withholdings (id, document_id, account_kode, mode, nilai, amount) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId(), docId, w.account_kode, w.mode, w.nilai, w.amount),
    );
  }

  for (const lk of docLinksToInsert) {
    stmts.push(
      db
        .prepare("INSERT OR REPLACE INTO document_links (from_id, to_id, amount, kind) VALUES (?, ?, ?, ?)")
        .bind(lk.from_id, lk.to_id, lk.amount, lk.kind),
    );
  }

  if (Array.isArray(body.tags)) {
    for (const tagId of [...new Set(body.tags.filter(Boolean).map(String))]) {
      stmts.push(db.prepare("INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)").bind(docId, tagId));
    }
  }

  if (Array.isArray(body.attachment_ids)) {
    for (const attId of [...new Set(body.attachment_ids.filter(Boolean).map(String))]) {
      stmts.push(db.prepare("UPDATE attachments SET document_id = ? WHERE id = ? AND (document_id IS NULL OR document_id = ?)").bind(docId, attId, docId));
    }
  }

  stmts.push(...preRevertUpdates, ...postBatchUpdates);

  if (stockMoves.length > 0 || existingDoc) {
    stmts.push(...(await buildStockAndMonthlyStatements(db, docId, stockMoves, now)));
    if (stockMoves.length > 0) {
      stmts.push(...buildBatchSerialStatements(db, { stockMoves, docId, now }));
    }
  }

  let oldJournal = [];
  let oldDocLines = [];
  if (existingDoc) {
    ({ results: oldJournal } = await db.prepare("SELECT * FROM journal_lines WHERE document_id = ?").bind(docId).all());
    ({ results: oldDocLines } = await db.prepare("SELECT * FROM document_lines WHERE document_id = ?").bind(docId).all());
  }

  if (balancedJournal.length > 0 || oldJournal.length > 0) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balancedJournal)));
    stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: oldJournal, newLines: balancedJournal, now, actor })));
  }

  stmts.push(
    buildAuditStatement(db, {
      entity: "document",
      entityId: docId,
      action: existingDoc ? "update" : "create",
      before: existingDoc ? { document: existingDoc, lines: oldDocLines, journal: oldJournal } : null,
      after: { type, no: docNo, tanggal, unit_kode: unitKode, total, status },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return getTransaction({ env: { DB: db }, deps: { verifyToken: async () => ({ uid: actor.uid }), getUserProfile: async () => actor, now: () => now }, request: { headers: new Headers({ authorization: "Bearer ok" }) }, params: [docId] });
}

export async function importTransactionsBatch(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) throw invalid("rows", "Minimal satu baris untuk diimpor.");

  const created = [];
  for (const r of rows) {
    const res = await upsertTransactionDoc(db, { body: r, existingDoc: null, actor, now });
    created.push(res.document);
  }
  return { count: created.length, documents: created };
}
