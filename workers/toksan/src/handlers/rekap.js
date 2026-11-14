// Rekap: semua angka untuk rekap harian/mingguan/bulanan dan halaman Trafik, dihitung di SQL.
import { ToksanError } from "../http.js";
import { requireStaff } from "../session.js";
import { isIsoDate } from "../validate.js";
import { obralView } from "./obral.js";

const MAX_SPAN_DAYS = 366;
const DAPUR_ORDER = "CASE dapur WHEN 'bakery' THEN 0 WHEN 'hangat_saji' THEN 1 ELSE 2 END";
const SESI_ORDER = "CASE sesi WHEN 'pagi' THEN 0 WHEN 'siang' THEN 1 ELSE 2 END";
const PIHAK_ORDER = "CASE pihak WHEN 'rijal' THEN 0 ELSE 1 END";
const SUMS = "SUM(jumlah) AS produksi, SUM(jumlah - retur) AS terjual, SUM(retur) AS retur, SUM((jumlah - retur) * harga) AS omzet";
const LATEST_NAME = "(SELECT s2.product_name FROM sales s2 WHERE s2.product_id = sales.product_id AND s2.tanggal BETWEEN ?1 AND ?2 ORDER BY s2.tanggal DESC, s2.updated_at DESC LIMIT 1) AS product_name";

function checkRange(dari, sampai) {
  if (!isIsoDate(dari) || !isIsoDate(sampai) || dari > sampai) throw new ToksanError("TANGGAL_TIDAK_VALID", 400);
  const days = (Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_SPAN_DAYS) throw new ToksanError("TANGGAL_TIDAK_VALID", 400);
}

const sums = (r) => ({ produksi: r.produksi ?? 0, terjual: r.terjual ?? 0, retur: r.retur ?? 0, omzet: r.omzet ?? 0 });
const productLine = (r) => ({ productId: r.product_id, productName: r.product_name, dapur: r.dapur });

export async function getRekap(ctx) {
  await requireStaff(ctx);
  const dari = ctx.url.searchParams.get("dari");
  const sampai = ctx.url.searchParams.get("sampai");
  checkRange(dari, sampai);
  const db = ctx.env.DB;
  const all = async (sql) => (await db.prepare(sql).bind(dari, sampai).all()).results;
  const WHERE = "FROM sales WHERE tanggal BETWEEN ?1 AND ?2";

  const [totalsRow] = await all(`SELECT ${SUMS}, COUNT(DISTINCT CASE WHEN jumlah > retur THEN product_id END) AS produk_terjual ${WHERE}`);
  const [obralTotals] = await all("SELECT SUM(jumlah) AS jumlah, SUM(jumlah * harga_obral) AS omzet FROM obral WHERE tanggal BETWEEN ?1 AND ?2");
  const produk = await all(`SELECT product_id, ${LATEST_NAME}, dapur, harga, ${SUMS} ${WHERE} GROUP BY product_id, dapur, harga ORDER BY ${DAPUR_ORDER}, product_name COLLATE NOCASE, harga`);
  const produkPerSesi = await all(`SELECT product_id, ${LATEST_NAME}, dapur, harga, sesi, ${SUMS} ${WHERE} GROUP BY product_id, dapur, harga, sesi ORDER BY ${DAPUR_ORDER}, product_name COLLATE NOCASE, harga, ${SESI_ORDER}`);
  const produkPerPihak = await all(`SELECT product_id, ${LATEST_NAME}, dapur, pihak, ${SUMS} ${WHERE} GROUP BY product_id, dapur, pihak ORDER BY ${DAPUR_ORDER}, product_name COLLATE NOCASE, ${PIHAK_ORDER}`);
  const produkDetail = await all(`SELECT product_id, ${LATEST_NAME}, dapur, harga, sesi, pihak, ${SUMS} ${WHERE} GROUP BY product_id, dapur, harga, sesi, pihak ORDER BY ${DAPUR_ORDER}, product_name COLLATE NOCASE, harga, ${SESI_ORDER}, ${PIHAK_ORDER}`);
  const perHari = await all(`SELECT tanggal, ${SUMS} ${WHERE} GROUP BY tanggal ORDER BY tanggal`);
  const perSesi = await all(`SELECT sesi, ${SUMS} ${WHERE} GROUP BY sesi ORDER BY ${SESI_ORDER}`);
  const perPihak = await all(`SELECT pihak, ${SUMS} ${WHERE} GROUP BY pihak ORDER BY ${PIHAK_ORDER}`);
  const perDapur = await all(`SELECT dapur, ${SUMS} ${WHERE} GROUP BY dapur ORDER BY ${DAPUR_ORDER}`);
  const obral = await all("SELECT * FROM obral WHERE tanggal BETWEEN ?1 AND ?2 ORDER BY tanggal, created_at, id");

  return {
    dari,
    sampai,
    totals: {
      ...sums(totalsRow),
      obralJumlah: obralTotals.jumlah ?? 0,
      obralOmzet: obralTotals.omzet ?? 0,
      produkTerjual: totalsRow.produk_terjual ?? 0,
    },
    produk: produk.map((r) => ({ ...productLine(r), harga: r.harga, ...sums(r) })),
    produkPerSesi: produkPerSesi.map((r) => ({ ...productLine(r), harga: r.harga, sesi: r.sesi, ...sums(r) })),
    produkPerPihak: produkPerPihak.map((r) => ({ ...productLine(r), pihak: r.pihak, ...sums(r) })),
    produkDetail: produkDetail.map((r) => ({ ...productLine(r), harga: r.harga, sesi: r.sesi, pihak: r.pihak, ...sums(r) })),
    perHari: perHari.map((r) => ({ tanggal: r.tanggal, ...sums(r) })),
    perSesi: perSesi.map((r) => ({ sesi: r.sesi, terjual: r.terjual, omzet: r.omzet })),
    perPihak: perPihak.map((r) => ({ pihak: r.pihak, terjual: r.terjual, omzet: r.omzet })),
    perDapur: perDapur.map((r) => ({ dapur: r.dapur, ...sums(r) })),
    obral: obral.map(obralView),
  };
}
