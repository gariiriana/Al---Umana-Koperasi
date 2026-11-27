// Handler Laporan Rilis 2 (Tab Penjualan, Pembelian, Produk) & Ringkasan Beranda.
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { cleanText, invalid, requireIsoDate, todayWib } from "../lib/validate.js";

function parseUnitFilter(param) {
  if (!param || param === "all" || param === "semua") return [];
  return param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function getDateRange(ctx) {
  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  if (dari > sampai) throw invalid("dari", "Tanggal mulai tidak boleh melebihi tanggal selesai.");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode") || "");
  return { dari, sampai, today, unitKodes };
}

function daysBetween(olderIso, newerIso) {
  const t1 = Date.parse(`${olderIso}T00:00:00Z`);
  const t2 = Date.parse(`${newerIso}T00:00:00Z`);
  return Math.max(0, Math.round((t2 - t1) / 86_400_000));
}

function addDaysIso(iso, d) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}

// ─── Tab Penjualan ────────────────────────────────────────────────────────────

export async function reportPenjualanDaftar(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type IN ('sales_invoice','sales_return','credit_memo')", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.type, d.no, d.tanggal, d.jatuh_tempo, d.unit_kode, d.status, d.subtotal, d.diskon, d.pajak, d.ongkir, d.pemotongan, d.total, d.sisa,
              c.nama_tampilan AS contact_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} ORDER BY d.tanggal DESC, d.no DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPenjualanPerPelanggan(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type IN ('sales_invoice','sales_return','credit_memo')", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.contact_id, IFNULL(c.nama_tampilan, 'Tanpa Kontak') AS contact_nama,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN 1 ELSE 0 END) AS jumlah_faktur,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN d.subtotal ELSE 0 END) AS penjualan_bruto,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN d.diskon ELSE 0 END) AS diskon,
              SUM(CASE WHEN d.type IN ('sales_return','credit_memo') THEN d.total ELSE 0 END) AS retur_kredit,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN d.pajak ELSE -d.pajak END) AS pajak,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN d.total ELSE -d.total END) AS total_neto,
              SUM(CASE WHEN d.type = 'sales_invoice' THEN d.sisa ELSE 0 END) AS sisa_piutang
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} GROUP BY d.contact_id, c.nama_tampilan ORDER BY total_neto DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPenjualanPerProduk(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type = 'sales_invoice'", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT dl.product_id, IFNULL(p.sku, '') AS sku, IFNULL(p.nama, dl.deskripsi) AS nama_produk, IFNULL(p.satuan, dl.satuan) AS prod_satuan,
              SUM(dl.qty_milli) AS qty_milli,
              SUM(dl.jumlah) AS penjualan_neto,
              SUM(dl.tax_amount) AS pajak,
              IFNULL(SUM(ABS(sm.nilai)), 0) AS hpp
       FROM document_lines dl
       JOIN documents d ON d.id = dl.document_id
       LEFT JOIN products p ON p.id = dl.product_id
       LEFT JOIN stock_moves sm ON sm.line_id = dl.id AND sm.qty_milli < 0
       WHERE ${conds.join(" AND ")}
       GROUP BY dl.product_id, p.sku, nama_produk, prod_satuan
       ORDER BY penjualan_neto DESC`,
    )
    .bind(...params)
    .all();
  const enriched = results.map((r) => ({ ...r, satuan: r.prod_satuan, laba_kotor: (r.penjualan_neto || 0) - (r.hpp || 0) }));
  return { dari, sampai, rows: enriched };
}

async function reportArApAging(ctx, mode) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const perTanggal = requireIsoDate(ctx.url.searchParams.get("sampai") || ctx.url.searchParams.get("per_tanggal") || todayWib(ctx.deps.now()), "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode") || "");
  const types = mode === "ar" ? ["sales_invoice"] : ["purchase_invoice", "expense"];
  const conds = ["d.deleted_at IS NULL", "d.sisa > 0", "d.tanggal <= ?", "d.type IN (SELECT value FROM json_each(?))"];
  const params = [perTanggal, JSON.stringify(types)];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.type, d.no, d.tanggal, d.jatuh_tempo, d.unit_kode, d.contact_id, d.total, d.sisa, c.nama_tampilan AS contact_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} ORDER BY d.jatuh_tempo ASC, d.no ASC`,
    )
    .bind(...params)
    .all();

  const bucketsByContact = new Map();
  const detailRows = [];
  for (const r of results) {
    const jt = r.jatuh_tempo || r.tanggal;
    const overdueDays = jt < perTanggal ? daysBetween(jt, perTanggal) : 0;
    let bucket = "belum_jatuh_tempo";
    if (overdueDays > 90) bucket = "lebih_90";
    else if (overdueDays > 60) bucket = "hari_61_90";
    else if (overdueDays > 30) bucket = "hari_31_60";
    else if (overdueDays > 0) bucket = "hari_1_30";

    const key = r.contact_id || "_no_contact";
    const cur = bucketsByContact.get(key) || {
      contact_id: r.contact_id,
      contact_nama: r.contact_nama || "Tanpa Kontak",
      belum_jatuh_tempo: 0,
      hari_1_30: 0,
      hari_31_60: 0,
      hari_61_90: 0,
      lebih_90: 0,
      total: 0,
    };
    cur[bucket] += r.sisa;
    cur.total += r.sisa;
    bucketsByContact.set(key, cur);
    detailRows.push({ ...r, overdue_days: overdueDays, bucket });
  }
  return { per_tanggal: perTanggal, summary: [...bucketsByContact.values()], details: detailRows };
}

export const reportPiutangPelanggan = (ctx) => reportArApAging(ctx, "ar");
export const reportUmurPiutang = (ctx) => reportArApAging(ctx, "ar");
export const reportHutangVendor = (ctx) => reportArApAging(ctx, "ap");
export const reportUmurHutang = (ctx) => reportArApAging(ctx, "ap");

export async function reportPengiriman(ctx, docType) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type = ?", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [docType, dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.no, d.tanggal, d.unit_kode, d.status, d.total, c.nama_tampilan AS contact_nama, w.nama AS warehouse_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id LEFT JOIN warehouses w ON w.id = d.warehouse_id
       WHERE ${conds.join(" AND ")} ORDER BY d.tanggal DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPenyelesaianPesanan(ctx, orderType) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type = ?", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [orderType, dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.no, d.tanggal, d.unit_kode, d.status, d.total, d.uang_muka, c.nama_tampilan AS contact_nama,
              (SELECT COUNT(*) FROM documents ch WHERE ch.parent_id = d.id AND ch.deleted_at IS NULL) AS dokumen_turunan
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} ORDER BY d.tanggal DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

// ─── Tab Pembelian & Biaya ────────────────────────────────────────────────────

export async function reportPembelianDaftar(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type IN ('purchase_invoice','purchase_return','debit_memo')", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.type, d.no, d.tanggal, d.jatuh_tempo, d.unit_kode, d.status, d.subtotal, d.diskon, d.pajak, d.ongkir, d.pemotongan, d.total, d.sisa,
              c.nama_tampilan AS contact_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} ORDER BY d.tanggal DESC, d.no DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPembelianPerVendor(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type IN ('purchase_invoice','purchase_return','debit_memo')", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.contact_id, IFNULL(c.nama_tampilan, 'Tanpa Kontak') AS contact_nama,
              SUM(CASE WHEN d.type = 'purchase_invoice' THEN 1 ELSE 0 END) AS jumlah_tagihan,
              SUM(CASE WHEN d.type = 'purchase_invoice' THEN d.subtotal ELSE 0 END) AS pembelian_bruto,
              SUM(CASE WHEN d.type IN ('purchase_return','debit_memo') THEN d.total ELSE 0 END) AS retur_debit,
              SUM(CASE WHEN d.type = 'purchase_invoice' THEN d.pajak ELSE -d.pajak END) AS pajak,
              SUM(CASE WHEN d.type = 'purchase_invoice' THEN d.total ELSE -d.total END) AS total_neto,
              SUM(CASE WHEN d.type = 'purchase_invoice' THEN d.sisa ELSE 0 END) AS sisa_hutang
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} GROUP BY d.contact_id, c.nama_tampilan ORDER BY total_neto DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPembelianPerProduk(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type = 'purchase_invoice'", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT dl.product_id, IFNULL(p.sku, '') AS sku, IFNULL(p.nama, dl.deskripsi) AS nama_produk, IFNULL(p.satuan, dl.satuan) AS prod_satuan,
              SUM(dl.qty_milli) AS qty_milli,
              SUM(dl.jumlah) AS total_pembelian,
              SUM(dl.tax_amount) AS pajak
       FROM document_lines dl
       JOIN documents d ON d.id = dl.document_id
       LEFT JOIN products p ON p.id = dl.product_id
       WHERE ${conds.join(" AND ")}
       GROUP BY dl.product_id, p.sku, nama_produk, prod_satuan
       ORDER BY total_pembelian DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results.map((r) => ({ ...r, satuan: r.prod_satuan })) };
}

export async function reportBiayaDaftar(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai, unitKodes } = getDateRange(ctx);
  const conds = ["d.deleted_at IS NULL", "d.type = 'expense'", "d.tanggal >= ?", "d.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("d.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.no, d.tanggal, d.jatuh_tempo, d.unit_kode, d.status, d.subtotal, d.pajak, d.pemotongan, d.total, d.sisa,
              c.nama_tampilan AS contact_nama, d.memo
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${conds.join(" AND ")} ORDER BY d.tanggal DESC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

// ─── Tab Produk & Persediaan ──────────────────────────────────────────────────

export async function reportRingkasanPersediaan(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai } = getDateRange(ctx);
  const whId = ctx.url.searchParams.get("warehouse_id") || "";
  const whCond = whId ? "AND sm.warehouse_id = ?" : "";
  const whParams = whId ? [whId] : [];

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT p.id, p.sku, p.nama, p.satuan, p.batas_min,
              IFNULL(SUM(CASE WHEN sm.tanggal < ? THEN sm.qty_milli ELSE 0 END), 0) AS qty_awal,
              IFNULL(SUM(CASE WHEN sm.tanggal < ? THEN sm.nilai ELSE 0 END), 0) AS nilai_awal,
              IFNULL(SUM(CASE WHEN sm.tanggal >= ? AND sm.tanggal <= ? AND sm.qty_milli > 0 THEN sm.qty_milli ELSE 0 END), 0) AS qty_masuk,
              IFNULL(SUM(CASE WHEN sm.tanggal >= ? AND sm.tanggal <= ? AND sm.qty_milli < 0 THEN ABS(sm.qty_milli) ELSE 0 END), 0) AS qty_keluar,
              IFNULL(SUM(CASE WHEN sm.tanggal <= ? THEN sm.qty_milli ELSE 0 END), 0) AS qty_akhir,
              IFNULL(SUM(CASE WHEN sm.tanggal <= ? THEN sm.nilai ELSE 0 END), 0) AS nilai_akhir
       FROM products p
       LEFT JOIN stock_moves sm ON sm.product_id = p.id ${whCond}
       WHERE p.arsip = 0 AND p.monitor_stok = 1
       GROUP BY p.id, p.sku, p.nama, p.satuan, p.batas_min
       ORDER BY p.nama`,
    )
    .bind(...whParams, dari, dari, dari, sampai, dari, sampai, sampai, sampai)
    .all();

  const rows = results.map((r) => ({
    ...r,
    harga_rata_rata: r.qty_akhir > 0 ? Math.round((r.nilai_akhir * 1000) / r.qty_akhir) : 0,
  }));
  return { dari, sampai, rows };
}

export async function reportPergerakanStok(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { dari, sampai } = getDateRange(ctx);
  const productId = ctx.url.searchParams.get("product_id") || "";
  const warehouseId = ctx.url.searchParams.get("warehouse_id") || "";

  const conds = ["sm.tanggal >= ?", "sm.tanggal <= ?"];
  const params = [dari, sampai];
  if (productId) {
    conds.push("sm.product_id = ?");
    params.push(productId);
  }
  if (warehouseId) {
    conds.push("sm.warehouse_id = ?");
    params.push(warehouseId);
  }

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT sm.*, p.sku, p.nama AS product_nama, p.satuan, w.nama AS warehouse_nama, d.type AS doc_type, d.no AS doc_no
       FROM stock_moves sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN warehouses w ON w.id = sm.warehouse_id
       JOIN documents d ON d.id = sm.document_id
       WHERE ${conds.join(" AND ")}
       ORDER BY sm.tanggal ASC, sm.seq ASC, sm.rowid ASC`,
    )
    .bind(...params)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportNilaiGudang(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || todayWib(ctx.deps.now()), "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode") || "");

  const conds = ["p.arsip = 0", "p.monitor_stok = 1"];
  const params = [sampai];
  if (unitKodes.length > 0) {
    conds.push("w.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT w.id AS warehouse_id, w.nama AS warehouse_nama, w.unit_kode, p.id AS product_id, p.sku, p.nama AS product_nama, p.satuan,
              IFNULL(SUM(CASE WHEN sm.tanggal <= ? THEN sm.qty_milli ELSE 0 END), 0) AS qty_milli,
              IFNULL(SUM(CASE WHEN sm.tanggal <= ? THEN sm.nilai ELSE 0 END), 0) AS nilai
       FROM stock_moves sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE ${conds.join(" AND ")}
       GROUP BY w.id, w.nama, w.unit_kode, p.id, p.sku, p.nama, p.satuan
       HAVING qty_milli != 0 OR nilai != 0
       ORDER BY w.nama, p.nama`,
    )
    .bind(sampai, ...params)
    .all();
  return { sampai, rows: results };
}

export async function reportStokMinimum(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT p.id, p.sku, p.nama, p.satuan, p.batas_min, IFNULL(pc.qty_milli, 0) AS qty_tersedia, IFNULL(pc.nilai, 0) AS nilai
       FROM products p
       LEFT JOIN product_cost pc ON pc.product_id = p.id
       WHERE p.arsip = 0 AND p.monitor_stok = 1 AND p.batas_min > 0 AND IFNULL(pc.qty_milli, 0) <= p.batas_min
       ORDER BY (IFNULL(pc.qty_milli, 0) - p.batas_min) ASC`,
    )
    .all();
  return { rows: results };
}

// ─── Beranda & Dasbor Lengkap (PRD 08) ────────────────────────────────────────

export async function getBerandaSummary(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const bulan = today.slice(0, 7);
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const unitCond = unitKode ? "AND unit_kode = ?" : "";
  const unitParams = unitKode ? [unitKode] : [];

  const [
    { results: arStats },
    { results: apStats },
    { results: monthlyFlow },
    { results: kasAccounts },
    { results: topProducts },
    { results: notifications },
    { results: recentDocs },
    { results: dashboards },
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, IFNULL(SUM(sisa), 0) AS total_sisa,
                IFNULL(SUM(CASE WHEN jatuh_tempo < ? THEN sisa ELSE 0 END), 0) AS jatuh_tempo
         FROM documents WHERE deleted_at IS NULL AND type = 'sales_invoice' AND sisa > 0 ${unitCond}`,
      )
      .bind(today, ...unitParams)
      .all(),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, IFNULL(SUM(sisa), 0) AS total_sisa,
                IFNULL(SUM(CASE WHEN jatuh_tempo < ? THEN sisa ELSE 0 END), 0) AS jatuh_tempo
         FROM documents WHERE deleted_at IS NULL AND type IN ('purchase_invoice', 'expense') AND sisa > 0 ${unitCond}`,
      )
      .bind(today, ...unitParams)
      .all(),
    db
      .prepare(
        `SELECT sb.bulan,
                SUM(CASE WHEN a.kategori IN (13, 14) THEN sb.kredit - sb.debit ELSE 0 END) AS pendapatan,
                SUM(CASE WHEN a.kategori IN (15, 16, 17) THEN sb.debit - sb.kredit ELSE 0 END) AS beban
         FROM saldo_bulanan sb
         JOIN accounts a ON a.kode = sb.account_kode
         WHERE sb.bulan >= ? AND sb.bulan <= ? ${unitKode ? "AND sb.unit_kode = ?" : ""}
         GROUP BY sb.bulan ORDER BY sb.bulan ASC`,
      )
      .bind(addDaysIso(today, -180).slice(0, 7), bulan, ...unitParams)
      .all(),
    db
      .prepare(
        `SELECT a.kode, a.nama, a.unit_kode,
                IFNULL(SUM(sb.debit - sb.kredit), 0) AS saldo
         FROM accounts a
         LEFT JOIN saldo_bulanan sb ON sb.account_kode = a.kode ${unitKode ? "AND sb.unit_kode = ?" : ""}
         WHERE a.kategori = 3 AND a.is_header = 0 AND a.arsip = 0
         GROUP BY a.kode, a.nama, a.unit_kode
         ORDER BY a.kode LIMIT 12`,
      )
      .bind(...unitParams)
      .all(),
    db
      .prepare(
        `SELECT p.id, p.nama, p.satuan, SUM(dl.qty_milli) AS qty_milli, SUM(dl.jumlah) AS omzet
         FROM document_lines dl
         JOIN documents d ON d.id = dl.document_id
         JOIN products p ON p.id = dl.product_id
         WHERE d.deleted_at IS NULL AND d.type = 'sales_invoice' AND d.tanggal >= ? ${unitCond}
         GROUP BY p.id, p.nama, p.satuan ORDER BY omzet DESC LIMIT 5`,
      )
      .bind(`${bulan}-01`, ...unitParams)
      .all(),
    db.prepare("SELECT * FROM notifications ORDER BY at DESC LIMIT 15").all(),
    db
      .prepare(
        `SELECT d.id, d.type, d.no, d.tanggal, d.unit_kode, d.total, d.status, c.nama_tampilan AS contact_nama
         FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
         WHERE d.deleted_at IS NULL ${unitCond}
         ORDER BY d.created_at DESC LIMIT 8`,
      )
      .bind(...unitParams)
      .all(),
    db.prepare("SELECT * FROM dashboards ORDER BY default_flag DESC, nama").all(),
  ]);

  const currentMonth = monthlyFlow.find((m) => m.bulan === bulan) || { pendapatan: 0, beban: 0 };
  const totalKas = kasAccounts.reduce((s, a) => s + (a.saldo || 0), 0);

  return {
    asOf: today,
    bulan,
    kpi: {
      penjualan_bulan_ini: currentMonth.pendapatan || 0,
      biaya_bulan_ini: currentMonth.beban || 0,
      laba_bulan_ini: (currentMonth.pendapatan || 0) - (currentMonth.beban || 0),
      piutang_terbuka: arStats[0]?.total_sisa || 0,
      piutang_jatuh_tempo: arStats[0]?.jatuh_tempo || 0,
      piutang_count: arStats[0]?.cnt || 0,
      hutang_terbuka: apStats[0]?.total_sisa || 0,
      hutang_jatuh_tempo: apStats[0]?.jatuh_tempo || 0,
      hutang_count: apStats[0]?.cnt || 0,
      saldo_kas_bank: totalKas,
    },
    monthly_flow: monthlyFlow,
    kas_accounts: kasAccounts,
    top_products: topProducts,
    notifications: notifications.map((n) => ({ ...n, payload: JSON.parse(n.payload_json || "{}") })),
    recent_documents: recentDocs,
    dashboards: dashboards.map((d) => ({ ...d, widgets: JSON.parse(d.widgets_json || "[]") })),
  };
}
