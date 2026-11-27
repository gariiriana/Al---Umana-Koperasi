// Handler Rilis 4: Multi Mata Uang, Kurs Manual, Revaluasi Kurs & Tab Laporan Pertukaran Kurs.
import { readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { cleanText, invalid, isInt, requireIsoDate, todayWib } from "../lib/validate.js";

export async function listCurrencies(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM currencies ORDER BY kode").all();
  return { currencies: results };
}

export async function saveCurrency(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);
  const body = await readJson(ctx.request);
  const kode = cleanText(body.kode, 10).toUpperCase();
  const nama = cleanText(body.nama, 80);
  if (!kode || !nama) throw invalid("kode", "Kode dan nama mata uang wajib diisi.");
  await db
    .prepare(
      `INSERT INTO currencies (kode, nama, simbol, aktif, is_base, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
       ON CONFLICT(kode) DO UPDATE SET nama = excluded.nama, simbol = excluded.simbol, aktif = excluded.aktif, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(kode, nama, cleanText(body.simbol || kode, 10), body.aktif === 0 ? 0 : 1, now, actor.uid, now, actor.uid)
    .run();
  return { currency: await db.prepare("SELECT * FROM currencies WHERE kode = ?").bind(kode).first() };
}

export async function listExchangeRates(ctx) {
  await requireKeuangan(ctx);
  const currencyKode = ctx.url.searchParams.get("currency_kode") || "";
  const sql = currencyKode
    ? "SELECT * FROM exchange_rates WHERE currency_kode = ? ORDER BY tanggal DESC LIMIT 50"
    : "SELECT * FROM exchange_rates ORDER BY tanggal DESC, currency_kode LIMIT 100";
  const { results } = await (currencyKode ? ctx.env.DB.prepare(sql).bind(currencyKode) : ctx.env.DB.prepare(sql)).all();
  return { rates: results.map((r) => ({ ...r, kurs: r.rate_micro })) };
}

export async function saveExchangeRate(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);
  const body = await readJson(ctx.request);
  const currencyKode = cleanText(body.currency_kode, 10).toUpperCase();
  const tanggal = requireIsoDate(body.tanggal || todayWib(now), "tanggal");
  const rateMicro = Number(body.kurs ?? body.rate_micro);
  if (!currencyKode || !isInt(rateMicro, { min: 1 })) throw invalid("kurs", "Mata uang dan nilai kurs wajib diisi.");
  await db
    .prepare(
      `INSERT INTO exchange_rates (currency_kode, tanggal, rate_micro, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(currency_kode, tanggal) DO UPDATE SET rate_micro = excluded.rate_micro, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(currencyKode, tanggal, rateMicro, now, actor.uid)
    .run();
  const row = await db.prepare("SELECT * FROM exchange_rates WHERE currency_kode = ? AND tanggal = ?").bind(currencyKode, tanggal).first();
  return { rate: row ? { ...row, kurs: row.rate_micro } : null };
}

export async function reportKursRealisasi(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.no, d.tanggal, d.type, d.unit_kode, jl.account_kode, a.nama AS account_nama, jl.debit, jl.kredit, jl.keterangan
       FROM journal_lines jl
       JOIN documents d ON d.id = jl.document_id
       JOIN accounts a ON a.kode = jl.account_kode
       WHERE d.deleted_at IS NULL AND jl.account_kode IN ('8-80200', '8-80201')
       ORDER BY d.tanggal DESC, d.no`,
    )
    .all();
  return { rows: results };
}

export async function reportKursBelumTerealisasi(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const { results: docs } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.no, d.type, d.tanggal, d.unit_kode, d.currency, d.kurs, d.sisa, c.nama_tampilan AS contact_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.deleted_at IS NULL AND d.currency != 'IDR' AND d.sisa > 0
       ORDER BY d.currency, d.tanggal`,
    )
    .all();
  const { results: latestRates } = await ctx.env.DB
    .prepare("SELECT currency_kode, rate_micro FROM exchange_rates ORDER BY tanggal DESC")
    .all();
  const rateMap = new Map();
  for (const r of latestRates) {
    if (!rateMap.has(r.currency_kode)) rateMap.set(r.currency_kode, r.rate_micro);
  }
  const rows = docs.map((d) => {
    const curKurs = rateMap.get(d.currency) || d.kurs;
    const bookIdr = Math.round((d.sisa * d.kurs) / 1_000_000);
    const marketIdr = Math.round((d.sisa * curKurs) / 1_000_000);
    const unrealized = d.type === "sales_invoice" ? marketIdr - bookIdr : bookIdr - marketIdr;
    return { ...d, kurs_terkini: curKurs, nilai_buku_idr: bookIdr, nilai_pasar_idr: marketIdr, selisih_kurs: unrealized };
  });
  return { rows };
}
