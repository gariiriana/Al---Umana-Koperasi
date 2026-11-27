// Engine 8 Laporan Rilis 1 (Sekilas Bisnis) & Template Laporan:
// Neraca, Laba Rugi, Arus Kas (langsung & tidak langsung), Perubahan Modal (format Jurnal),
// Buku Besar, Jurnal, Neraca Saldo, Ringkasan Bisnis.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { CATEGORY_BY_ID, INTER_UNIT_ACCOUNTS } from "../lib/seedData.js";
import { buildAuditStatement } from "../lib/ledger.js";
import { addDays, cleanText, formatRupiahSen, invalid, newId, requireIsoDate, todayWib } from "../lib/validate.js";

function parseUnitFilter(param) {
  if (!param || param === "all" || param === "semua") return [];
  const kodes = param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const k of kodes) {
    if (!/^[A-Z0-9]{1,10}$/.test(k)) throw invalid("unit_kode", "Kode anak perusahaan harus huruf besar/angka, maksimal 10 karakter.");
  }
  return kodes;
}

function isInterUnitAccount(kode) {
  return kode === INTER_UNIT_ACCOUNTS.PIUTANG || kode === INTER_UNIT_ACCOUNTS.HUTANG;
}

/**
 * Mengambil agregat (debit, kredit) per akun pada rentang [dari, sampai] atau cumulative <= sampai.
 * Menggunakan `saldo_bulanan` untuk bulan penuh bila tanpa filter tag, agar pembacaan tetap hemat kuota D1.
 */
async function queryAccountPeriodSums(db, { dari = null, sampai, unitKodes = [], tagIds = [], tagMode = "any", excludeClosing = false }) {
  // Kode unit selalu di-bind sebagai parameter (jangan disisipkan ke string SQL).
  const unitClause = unitKodes.length > 0 ? "AND jl.unit_kode IN (SELECT value FROM json_each(?))" : "";
  const unitClauseSb = unitKodes.length > 0 ? "AND unit_kode IN (SELECT value FROM json_each(?))" : "";
  const unitParams = unitKodes.length > 0 ? [JSON.stringify(unitKodes)] : [];

  if (tagIds.length > 0) {
    const conds = ["jl.tanggal <= ?"];
    const params = [sampai];
    if (dari) {
      conds.push("jl.tanggal >= ?");
      params.push(dari);
    }
    if (excludeClosing) conds.push("d.type != 'closing'");
    if (unitKodes.length > 0) {
      conds.push("jl.unit_kode IN (SELECT value FROM json_each(?))");
      params.push(JSON.stringify(unitKodes));
    }
    if (tagMode === "all") {
      conds.push(
        `(SELECT COUNT(DISTINCT dt.tag_id) FROM document_tags dt WHERE dt.document_id = jl.document_id AND dt.tag_id IN (SELECT value FROM json_each(?))) = ?`,
      );
      params.push(JSON.stringify(tagIds), tagIds.length);
    } else {
      conds.push(
        `EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = jl.document_id AND dt.tag_id IN (SELECT value FROM json_each(?)))`,
      );
      params.push(JSON.stringify(tagIds));
    }
    const { results } = await db
      .prepare(
        `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
         FROM journal_lines jl
         JOIN documents d ON d.id = jl.document_id
         WHERE ${conds.join(" AND ")}
         GROUP BY jl.account_kode`,
      )
      .bind(...params)
      .all();
    return new Map(results.map((r) => [r.account_kode, { debit: r.debit || 0, kredit: r.kredit || 0 }]));
  }

  // Jalur cepat berbasis saldo_bulanan:
  const totMap = new Map();
  const add = (kode, d, k) => {
    if (!d && !k) return;
    const cur = totMap.get(kode) || { debit: 0, kredit: 0 };
    cur.debit += d;
    cur.kredit += k;
    totMap.set(kode, cur);
  };

  if (!dari) {
    // Kumulatif <= sampai: semua bulan penuh < bulan(sampai) dari saldo_bulanan + sisa hari di bulan(sampai) dari journal_lines
    const curMonth = sampai.slice(0, 7);
    const monthStart = `${curMonth}-01`;
    const [{ results: sbRows }, { results: edgeRows }] = await Promise.all([
      db
        .prepare(`SELECT account_kode, SUM(debit) AS debit, SUM(kredit) AS kredit FROM saldo_bulanan WHERE bulan < ? ${unitClauseSb} GROUP BY account_kode`)
        .bind(curMonth, ...unitParams)
        .all(),
      db
        .prepare(
          `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
           FROM journal_lines jl
           WHERE jl.tanggal >= ? AND jl.tanggal <= ? ${unitClause}
           GROUP BY jl.account_kode`,
        )
        .bind(monthStart, sampai, ...unitParams)
        .all(),
    ]);
    for (const r of sbRows) add(r.account_kode, r.debit || 0, r.kredit || 0);
    for (const r of edgeRows) add(r.account_kode, r.debit || 0, r.kredit || 0);
  } else if (dari <= sampai) {
    const startMonth = dari.slice(0, 7);
    const endMonth = sampai.slice(0, 7);
    const isFullStart = dari.endsWith("-01");
    const nextDay = addDays(sampai, 1);
    const isFullEnd = nextDay.slice(0, 7) !== endMonth;

    if (startMonth === endMonth && !(isFullStart && isFullEnd)) {
      const { results } = await db
        .prepare(
          `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
           FROM journal_lines jl
           WHERE jl.tanggal >= ? AND jl.tanggal <= ? ${unitClause}
           GROUP BY jl.account_kode`,
        )
        .bind(dari, sampai, ...unitParams)
        .all();
      for (const r of results) add(r.account_kode, r.debit || 0, r.kredit || 0);
    } else {
      const sbStart = isFullStart ? startMonth : addDays(`${startMonth}-01`, 32).slice(0, 7);
      const sbEnd = isFullEnd ? endMonth : prevMonthStr(endMonth);
      const queries = [];
      if (sbStart <= sbEnd) {
        queries.push(
          db
            .prepare(
              `SELECT account_kode, SUM(debit) AS debit, SUM(kredit) AS kredit
               FROM saldo_bulanan WHERE bulan >= ? AND bulan <= ? ${unitClauseSb}
               GROUP BY account_kode`,
            )
            .bind(sbStart, sbEnd, ...unitParams)
            .all(),
        );
      } else {
        queries.push(Promise.resolve({ results: [] }));
      }
      if (!isFullStart) {
        const endOfStartMonth = lastDayOfMonth(startMonth);
        queries.push(
          db
            .prepare(
              `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
               FROM journal_lines jl WHERE jl.tanggal >= ? AND jl.tanggal <= ? ${unitClause} GROUP BY jl.account_kode`,
            )
            .bind(dari, endOfStartMonth, ...unitParams)
            .all(),
        );
      } else {
        queries.push(Promise.resolve({ results: [] }));
      }
      if (!isFullEnd && !(startMonth === endMonth && !isFullStart)) {
        queries.push(
          db
            .prepare(
              `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
               FROM journal_lines jl WHERE jl.tanggal >= ? AND jl.tanggal <= ? ${unitClause} GROUP BY jl.account_kode`,
            )
            .bind(`${endMonth}-01`, sampai, ...unitParams)
            .all(),
        );
      } else {
        queries.push(Promise.resolve({ results: [] }));
      }
      const [r1, r2, r3] = await Promise.all(queries);
      for (const res of [r1, r2, r3]) {
        for (const r of res.results) add(r.account_kode, r.debit || 0, r.kredit || 0);
      }
    }
  }

  if (excludeClosing) {
    const conds = ["d.type = 'closing'", "jl.tanggal <= ?"];
    const params = [sampai];
    if (dari) {
      conds.push("jl.tanggal >= ?");
      params.push(dari);
    }
    if (unitKodes.length > 0) {
      conds.push("jl.unit_kode IN (SELECT value FROM json_each(?))");
      params.push(JSON.stringify(unitKodes));
    }
    const { results: closeRows } = await db
      .prepare(
        `SELECT jl.account_kode, SUM(jl.debit) AS debit, SUM(jl.kredit) AS kredit
         FROM journal_lines jl JOIN documents d ON d.id = jl.document_id
         WHERE ${conds.join(" AND ")} GROUP BY jl.account_kode`,
      )
      .bind(...params)
      .all();
    for (const r of closeRows) add(r.account_kode, -(r.debit || 0), -(r.kredit || 0));
  }

  return totMap;
}

function prevMonthStr(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function lastDayOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function buildComparePeriods(dari, sampai, bandingPeriode, bandingJumlah) {
  const count = Math.min(bandingPeriode === "tahunan" ? 3 : 11, Math.max(0, Number(bandingJumlah || 0)));
  const periods = [{ label: `${dari} s.d. ${sampai}`, dari, sampai }];
  if (!bandingPeriode || bandingPeriode === "none" || count === 0) return periods;

  let curDari = dari;
  let curSampai = sampai;
  for (let i = 0; i < count; i++) {
    if (bandingPeriode === "mingguan") {
      curDari = addDays(curDari, -7);
      curSampai = addDays(curSampai, -7);
    } else if (bandingPeriode === "bulanan") {
      curDari = shiftMonths(curDari, -1);
      curSampai = shiftMonths(curSampai, -1, true);
    } else if (bandingPeriode === "triwulan") {
      curDari = shiftMonths(curDari, -3);
      curSampai = shiftMonths(curSampai, -3, true);
    } else if (bandingPeriode === "semi_tahunan") {
      curDari = shiftMonths(curDari, -6);
      curSampai = shiftMonths(curSampai, -6, true);
    } else if (bandingPeriode === "tahunan") {
      curDari = shiftMonths(curDari, -12);
      curSampai = shiftMonths(curSampai, -12, true);
    }
    periods.push({ label: `${curDari} s.d. ${curSampai}`, dari: curDari, sampai: curSampai });
  }
  return periods;
}

function shiftMonths(isoDate, deltaMonths, snapEndOfMonth = false) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const wasEnd = d === new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = snapEndOfMonth && wasEnd ? lastDay : Math.min(d, lastDay);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function loadMeta(db) {
  const [{ results: accounts }, { results: units }, lastUpdate] = await Promise.all([
    db.prepare("SELECT * FROM accounts ORDER BY kode").all(),
    db.prepare("SELECT * FROM units ORDER BY kode").all(),
    db.prepare("SELECT MAX(updated_at) AS ts FROM documents WHERE deleted_at IS NULL").first(),
  ]);
  return {
    accounts,
    accByKode: new Map(accounts.map((a) => [a.kode, a])),
    units,
    lastUpdatedAt: lastUpdate?.ts || Date.now(),
  };
}

// ─── 1. NERACA ────────────────────────────────────────────────────────────────

export async function reportNeraca(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const eliminateInterUnit = unitKodes.length === 0 || unitKodes.length > 1;
  const kedalaman = Math.min(3, Math.max(1, Number(ctx.url.searchParams.get("kedalaman") || 3)));
  const bandingPeriode = ctx.url.searchParams.get("banding_periode") || "none";
  const bandingJumlah = Number(ctx.url.searchParams.get("banding_jumlah") || 0);

  const periods = buildComparePeriods(sampai, sampai, bandingPeriode, bandingJumlah).map((p) => ({
    label: p.sampai,
    sampai: p.sampai,
  }));

  const { accounts, accByKode, lastUpdatedAt } = await loadMeta(db);

  const columnResults = await Promise.all(
    periods.map(async (p) => {
      const sums = await queryAccountPeriodSums(db, { sampai: p.sampai, unitKodes });
      const lastClosedRow = await db
        .prepare("SELECT MAX(sampai) AS last_sampai FROM period_closings WHERE tipe = 'tutup' AND status = 'selesai' AND sampai <= ?")
        .bind(p.sampai)
        .first();
      const openStart = lastClosedRow?.last_sampai ? addDays(lastClosedRow.last_sampai, 1) : null;
      const year = p.sampai.slice(0, 4);
      const yearStart = `${year}-01-01`;
      const priorEnd = `${Number(year) - 1}-12-31`;

      let pendSampaiTahunLalu = 0;
      if (!openStart || openStart <= priorEnd) {
        const pSums = await queryAccountPeriodSums(db, {
          dari: openStart || undefined,
          sampai: priorEnd,
          unitKodes,
          excludeClosing: true,
        });
        for (const [k, v] of pSums.entries()) {
          const acc = accByKode.get(k);
          if (acc && acc.kategori >= 13 && acc.kategori <= 17) pendSampaiTahunLalu += v.kredit - v.debit;
        }
      }

      const currStart = openStart && openStart > yearStart ? openStart : yearStart;
      let pendPeriodeIni = 0;
      if (currStart <= p.sampai) {
        const cSums = await queryAccountPeriodSums(db, {
          dari: currStart,
          sampai: p.sampai,
          unitKodes,
          excludeClosing: true,
        });
        for (const [k, v] of cSums.entries()) {
          const acc = accByKode.get(k);
          if (acc && acc.kategori >= 13 && acc.kategori <= 17) pendPeriodeIni += v.kredit - v.debit;
        }
      }

      const balFor = (acc) => {
        if (eliminateInterUnit && isInterUnitAccount(acc.kode)) return 0;
        const v = sums.get(acc.kode) || { debit: 0, kredit: 0 };
        const cat = CATEGORY_BY_ID[acc.kategori];
        if (acc.kategori === 7) return -(v.kredit - v.debit); // Depresiasi tampil negatif di Aset
        return cat.normal === "debit" ? v.debit - v.kredit : v.kredit - v.debit;
      };

      const groupVal = (cats) => {
        const list = [];
        let total = 0;
        for (const acc of accounts) {
          if (!cats.includes(acc.kategori) || acc.is_header) continue;
          if (eliminateInterUnit && isInterUnitAccount(acc.kode)) continue;
          const val = balFor(acc);
          if (val !== 0 || (!acc.arsip && acc.sistem === 0)) {
            if (val !== 0) list.push({ kode: acc.kode, nama: acc.nama, nilai: val });
          }
          total += val;
        }
        return { rows: kedalaman >= 2 ? list : [], total };
      };

      const asetLancar = groupVal([3, 1, 4, 2]);
      const asetTetap = groupVal([5]);
      const depresiasi = groupVal([7]);
      const asetLainnya = groupVal([6]);
      const totalAset = asetLancar.total + asetTetap.total + depresiasi.total + asetLainnya.total;

      const liabPendek = groupVal([8, 9, 10]);
      const liabPanjang = groupVal([11]);
      const totalLiabilitas = liabPendek.total + liabPanjang.total;

      const ekuitasBase = groupVal([12]);
      const modalRows = [
        ...ekuitasBase.rows,
        { kode: "", nama: "Akumulasi pendapatan komprehensif lain", nilai: 0 },
        ...(pendSampaiTahunLalu !== 0 ? [{ kode: "", nama: "Pendapatan sampai tahun lalu", nilai: pendSampaiTahunLalu }] : []),
        { kode: "", nama: "Pendapatan periode ini", nilai: pendPeriodeIni },
      ];
      const totalModal = ekuitasBase.total + pendSampaiTahunLalu + pendPeriodeIni;
      const totalLiabilitasModal = totalLiabilitas + totalModal;

      return {
        label: p.label,
        asetLancar,
        asetTetap,
        depresiasi,
        asetLainnya,
        totalAset,
        liabPendek,
        liabPanjang,
        totalLiabilitas,
        modal: { rows: modalRows, total: totalModal },
        totalLiabilitasModal,
        seimbang: totalAset === totalLiabilitasModal,
        selisih: totalAset - totalLiabilitasModal,
      };
    }),
  );

  // Gabungkan menjadi struktur tabel terpadu lintas kolom periode
  const sections = buildNeracaSections(columnResults);

  return {
    laporan: "neraca",
    sampai,
    unit_kodes: unitKodes,
    konsolidasi: eliminateInterUnit,
    lastUpdatedAt,
    columns: periods.map((p) => p.label),
    seimbang: columnResults[0].seimbang,
    selisih: columnResults[0].selisih,
    totals: columnResults.map((c) => ({ totalAset: c.totalAset, totalLiabilitas: c.totalLiabilitas, totalModal: c.modal.total, totalLiabilitasModal: c.totalLiabilitasModal })),
    sections,
  };
}

function buildNeracaSections(cols) {
  const mergeGroup = (title, getter) => {
    const namesMap = new Map();
    cols.forEach((col, ci) => {
      const grp = getter(col);
      for (const r of grp.rows) {
        const key = `${r.kode}|${r.nama}`;
        if (!namesMap.has(key)) namesMap.set(key, { kode: r.kode, nama: r.nama, values: Array(cols.length).fill(0) });
        namesMap.get(key).values[ci] = r.nilai;
      }
    });
    return {
      title,
      rows: [...namesMap.values()],
      totals: cols.map((col) => getter(col).total),
    };
  };

  return {
    aset: [
      mergeGroup("Aset Lancar", (c) => c.asetLancar),
      mergeGroup("Aset Tetap", (c) => c.asetTetap),
      mergeGroup("Depresiasi & Amortisasi", (c) => c.depresiasi),
      mergeGroup("Aset Lainnya", (c) => c.asetLainnya),
    ],
    totalAset: cols.map((c) => c.totalAset),
    liabilitas: [
      mergeGroup("Liabilitas Jangka Pendek", (c) => c.liabPendek),
      mergeGroup("Liabilitas Jangka Panjang", (c) => c.liabPanjang),
    ],
    totalLiabilitas: cols.map((c) => c.totalLiabilitas),
    modal: mergeGroup("Modal Pemilik", (c) => c.modal),
    totalLiabilitasModal: cols.map((c) => c.totalLiabilitasModal),
  };
}

// ─── 2. LABA RUGI ─────────────────────────────────────────────────────────────

export async function reportLabaRugi(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const tagIds = (ctx.url.searchParams.get("tag_ids") || "").split(",").filter(Boolean);
  const tagMode = ctx.url.searchParams.get("tag_mode") === "all" ? "all" : "any";
  const tampilkanAkun = ctx.url.searchParams.get("tampilkan_akun") !== "0";
  const bandingDengan = ctx.url.searchParams.get("banding_dengan") || "none";
  const bandingPeriode = ctx.url.searchParams.get("banding_periode") || "none";
  const bandingJumlah = Number(ctx.url.searchParams.get("banding_jumlah") || 0);
  const templateId = ctx.url.searchParams.get("template_id") || "";

  const { accounts, units, lastUpdatedAt } = await loadMeta(db);

  let slices = [];
  if (bandingDengan === "unit") {
    const activeUnits = unitKodes.length > 0 ? units.filter((u) => unitKodes.includes(u.kode)) : units.filter((u) => u.aktif);
    slices = activeUnits.map((u) => ({ label: `${u.kode} — ${u.nama}`, dari, sampai, unitKodes: [u.kode], tagIds, tagMode }));
    if (slices.length > 1) {
      slices.push({ label: "Gabungan", dari, sampai, unitKodes: activeUnits.map((u) => u.kode), tagIds, tagMode });
    }
  } else {
    const ps = buildComparePeriods(dari, sampai, bandingDengan === "periode" || bandingPeriode !== "none" ? (bandingPeriode === "none" ? "bulanan" : bandingPeriode) : "none", bandingJumlah);
    slices = ps.map((p) => ({ label: p.label, dari: p.dari, sampai: p.sampai, unitKodes, tagIds, tagMode }));
  }
  if (slices.length === 0) slices = [{ label: `${dari} s.d. ${sampai}`, dari, sampai, unitKodes, tagIds, tagMode }];

  const sliceSums = await Promise.all(
    slices.map((s) =>
      queryAccountPeriodSums(db, {
        dari: s.dari,
        sampai: s.sampai,
        unitKodes: s.unitKodes,
        tagIds: s.tagIds,
        tagMode: s.tagMode,
        excludeClosing: true,
      }),
    ),
  );

  // Template kustom jika dipilih
  let customTemplate = null;
  if (templateId) {
    const row = await db.prepare("SELECT * FROM report_templates WHERE id = ? AND laporan = 'laba_rugi'").bind(templateId).first();
    if (row) customTemplate = JSON.parse(row.config_json);
  }

  const pnlAccs = accounts.filter((a) => !a.is_header && a.kategori >= 13 && a.kategori <= 17);
  const valueOf = (sums, acc) => {
    const v = sums.get(acc.kode) || { debit: 0, kredit: 0 };
    // Pendapatan (13, 14) = kredit - debit (akun kontra seperti Diskon/Retur otomatis negatif).
    // HPP (15), Beban (16), Beban Lainnya (17) = debit - kredit.
    return acc.kategori === 13 || acc.kategori === 14 ? v.kredit - v.debit : v.debit - v.kredit;
  };

  const buildCat = (title, katId) => {
    const accs = pnlAccs.filter((a) => a.kategori === katId);
    const rows = [];
    const totals = Array(slices.length).fill(0);
    for (const acc of accs) {
      const values = sliceSums.map((sums) => valueOf(sums, acc));
      if (values.some((x) => x !== 0)) {
        values.forEach((x, idx) => { totals[idx] += x; });
        if (tampilkanAkun) rows.push({ kode: acc.kode, nama: acc.nama, values });
      }
    }
    return { title, rows, totals };
  };

  const pendapatan = buildCat("Pendapatan dari Penjualan", 13);
  const hpp = buildCat("Beban Pokok Pendapatan", 15);
  const labaKotor = pendapatan.totals.map((p, i) => p - hpp.totals[i]);
  const biayaOperasional = buildCat("Biaya Operasional", 16);
  const pendapatanBersihOperasional = labaKotor.map((lk, i) => lk - biayaOperasional.totals[i]);
  const pendapatanLainnya = buildCat("Pendapatan Lainnya", 14);
  const biayaLainnya = buildCat("Biaya Lainnya", 17);
  const pendapatanBersih = pendapatanBersihOperasional.map((op, i) => op + pendapatanLainnya.totals[i] - biayaLainnya.totals[i]);

  return {
    laporan: "laba-rugi",
    dari,
    sampai,
    unit_kodes: unitKodes,
    lastUpdatedAt,
    columns: slices.map((s) => s.label),
    customTemplate,
    sections: {
      pendapatan,
      hpp,
      labaKotor,
      biayaOperasional,
      pendapatanBersihOperasional,
      pendapatanLainnya,
      biayaLainnya,
      pendapatanBersih,
    },
    summary: {
      pendapatan: pendapatan.totals[0] ?? 0,
      hpp: hpp.totals[0] ?? 0,
      labaKotor: labaKotor[0] ?? 0,
      biayaOperasional: biayaOperasional.totals[0] ?? 0,
      pendapatanBersihOperasional: pendapatanBersihOperasional[0] ?? 0,
      pendapatanLainnya: pendapatanLainnya.totals[0] ?? 0,
      biayaLainnya: biayaLainnya.totals[0] ?? 0,
      pendapatanBersih: pendapatanBersih[0] ?? 0,
    },
  };
}

// ─── 3. ARUS KAS (LANGSUNG & TIDAK LANGSUNG) ───────────────────────────────────

const DIRECT_BUCKETS = [
  { activity: "operasional", key: "op_pelanggan", label: "Penerimaan dari pelanggan", categories: [1, 13] },
  { activity: "operasional", key: "op_aset_lancar_lain", label: "Aset lancar lainnya", categories: [2] },
  { activity: "operasional", key: "op_pemasok", label: "Pembayaran ke pemasok", categories: [8, 4, 15] },
  { activity: "operasional", key: "op_liab_pendek", label: "Kartu kredit dan liabilitas jangka pendek lainnya", categories: [9, 10] },
  { activity: "operasional", key: "op_pendapatan_lain", label: "Pendapatan lainnya", categories: [14] },
  { activity: "operasional", key: "op_beban", label: "Pengeluaran operasional", categories: [16, 17] },
  { activity: "investasi", key: "inv_aset_tetap", label: "Perolehan/Penjualan aset", categories: [5, 7] },
  { activity: "investasi", key: "inv_lainnya", label: "Aktivitas investasi lainnya", categories: [6] },
  { activity: "pendanaan", key: "fin_pinjaman", label: "Pembayaran/Penerimaan pinjaman", categories: [11] },
  { activity: "pendanaan", key: "fin_ekuitas", label: "Ekuitas/Modal", categories: [12] },
];

export async function reportArusKas(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const eliminateInterUnit = unitKodes.length === 0 || unitKodes.length > 1;
  const metode = ctx.url.searchParams.get("metode") === "tidak_langsung" ? "tidak_langsung" : "langsung";
  const bandingPeriode = ctx.url.searchParams.get("banding_periode") || "none";
  const bandingJumlah = Number(ctx.url.searchParams.get("banding_jumlah") || 0);
  const tampilkanAkun = ctx.url.searchParams.get("tampilkan_akun") === "1";

  const periods = buildComparePeriods(dari, sampai, bandingPeriode, bandingJumlah);
  const { accByKode, lastUpdatedAt } = await loadMeta(db);

  const colData = await Promise.all(
    periods.map((p) =>
      metode === "langsung"
        ? computeDirectCashFlow(db, { dari: p.dari, sampai: p.sampai, unitKodes, eliminateInterUnit, accByKode, tampilkanAkun })
        : computeIndirectCashFlow(db, { dari: p.dari, sampai: p.sampai, unitKodes, eliminateInterUnit, accByKode }),
    ),
  );

  return {
    laporan: "arus-kas",
    metode,
    dari,
    sampai,
    unit_kodes: unitKodes,
    konsolidasi: eliminateInterUnit,
    lastUpdatedAt,
    columns: periods.map((p) => p.label),
    data: colData,
    cocok: colData.every((d) => d.cocok),
  };
}

async function sumCashBalance(db, asOfDate, unitKodes, inclusive = true) {
  const op = inclusive ? "<=" : "<";
  const unitCond = unitKodes.length > 0 ? "AND jl.unit_kode IN (SELECT value FROM json_each(?))" : "";
  const params = unitKodes.length > 0 ? [asOfDate, JSON.stringify(unitKodes)] : [asOfDate];
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit - jl.kredit), 0) AS bal
       FROM journal_lines jl
       JOIN accounts a ON a.kode = jl.account_kode
       WHERE a.kategori = 3 AND jl.tanggal ${op} ? ${unitCond}`,
    )
    .bind(...params)
    .first();
  return row?.bal ?? 0;
}

async function computeDirectCashFlow(db, { dari, sampai, unitKodes, eliminateInterUnit, accByKode, tampilkanAkun }) {
  const [saldoAwal, saldoAkhir] = await Promise.all([
    sumCashBalance(db, dari, unitKodes, false),
    sumCashBalance(db, sampai, unitKodes, true),
  ]);

  const unitCond = unitKodes.length > 0 ? "AND jl.unit_kode IN (SELECT value FROM json_each(?))" : "";
  const params = unitKodes.length > 0 ? [dari, sampai, JSON.stringify(unitKodes)] : [dari, sampai];

  // Ambil semua dokumen yang menyentuh kas (kategori = 3) pada periode & unit
  const { results: lines } = await db
    .prepare(
      `SELECT jl.*, d.type AS doc_type
       FROM journal_lines jl
       JOIN documents d ON d.id = jl.document_id
       WHERE jl.tanggal >= ? AND jl.tanggal <= ? ${unitCond}
         AND jl.document_id IN (
           SELECT DISTINCT jl2.document_id FROM journal_lines jl2
           JOIN accounts a2 ON a2.kode = jl2.account_kode
           WHERE a2.kategori = 3 AND jl2.tanggal >= ? AND jl2.tanggal <= ?
             ${unitKodes.length > 0 ? "AND jl2.unit_kode IN (SELECT value FROM json_each(?))" : ""}
         )`,
    )
    .bind(...params, ...params)
    .all();

  const byDoc = new Map();
  for (const l of lines) {
    const arr = byDoc.get(l.document_id) || [];
    arr.push(l);
    byDoc.set(l.document_id, arr);
  }

  const bucketTotals = new Map();
  const bucketAccounts = new Map();
  const addBucket = (key, accKode, accNama, amount) => {
    if (amount === 0) return;
    bucketTotals.set(key, (bucketTotals.get(key) || 0) + amount);
    if (tampilkanAkun) {
      const m = bucketAccounts.get(key) || new Map();
      const prev = m.get(accKode) || { kode: accKode, nama: accNama, nilai: 0 };
      prev.nilai += amount;
      m.set(accKode, prev);
      bucketAccounts.set(key, m);
    }
  };

  for (const docLines of byDoc.values()) {
    let netCash = 0;
    const nonCash = [];
    for (const l of docLines) {
      const acc = accByKode.get(l.account_kode);
      if (!acc) continue;
      if (acc.kategori === 3) {
        netCash += (l.debit || 0) - (l.kredit || 0);
      } else {
        if (eliminateInterUnit && isInterUnitAccount(acc.kode)) continue;
        nonCash.push({ acc, amount: (l.kredit || 0) - (l.debit || 0) });
      }
    }
    if (netCash === 0 && nonCash.length === 0) continue; // Transfer antar akun Kas & Bank dalam cakupan
    for (const nc of nonCash) {
      if (!eliminateInterUnit && isInterUnitAccount(nc.acc.kode)) {
        addBucket("fin_antar_unit", nc.acc.kode, "Transfer antar unit", nc.amount);
        continue;
      }
      const bucket = DIRECT_BUCKETS.find((b) => b.categories.includes(nc.acc.kategori));
      if (bucket) addBucket(bucket.key, nc.acc.kode, nc.acc.nama, nc.amount);
    }
  }

  const buildActivity = (act, extraItems = []) => {
    const defs = [...DIRECT_BUCKETS.filter((b) => b.activity === act), ...extraItems];
    const items = [];
    let total = 0;
    for (const d of defs) {
      const val = bucketTotals.get(d.key) || 0;
      if (val !== 0 || d.alwaysShow) {
        items.push({
          key: d.key,
          label: d.label,
          nilai: val,
          accounts: tampilkanAkun ? [...(bucketAccounts.get(d.key)?.values() || [])] : [],
        });
      }
      total += val;
    }
    return { items, total };
  };

  const operasional = buildActivity("operasional");
  const investasi = buildActivity("investasi");
  const pendanaan = buildActivity("pendanaan", eliminateInterUnit ? [] : [{ key: "fin_antar_unit", label: "Transfer antar unit" }]);
  const kenaikanKas = operasional.total + investasi.total + pendanaan.total;

  return {
    operasional,
    investasi,
    pendanaan,
    kenaikanKas,
    saldoAwal,
    saldoAkhir: saldoAwal + kenaikanKas,
    saldoAkhirAkun: saldoAkhir,
    cocok: saldoAwal + kenaikanKas === saldoAkhir,
  };
}

async function computeIndirectCashFlow(db, { dari, sampai, unitKodes, eliminateInterUnit, accByKode }) {
  const [saldoAwal, saldoAkhir, perSums] = await Promise.all([
    sumCashBalance(db, dari, unitKodes, false),
    sumCashBalance(db, sampai, unitKodes, true),
    queryAccountPeriodSums(db, { dari, sampai, unitKodes, excludeClosing: true }),
  ]);

  let labaBersih = 0;
  let depresiasi = 0;
  let dPiutang = 0;
  let dAsetLancarLain = 0;
  let dPersediaan = 0;
  let dHutang = 0;
  let dKartuKredit = 0;
  let dLiabPendekLain = 0;
  let dAsetTetap = 0;
  let dAsetLainnya = 0;
  let dPinjaman = 0;
  let dEkuitas = 0;
  let dAntarUnit = 0;

  for (const [kode, v] of perSums.entries()) {
    const acc = accByKode.get(kode);
    if (!acc || acc.kategori === 3) continue;
    const netDebit = (v.debit || 0) - (v.kredit || 0);
    const netKredit = (v.kredit || 0) - (v.debit || 0);

    if (acc.kategori >= 13 && acc.kategori <= 17) {
      labaBersih += netKredit;
    } else if (isInterUnitAccount(kode)) {
      if (!eliminateInterUnit) dAntarUnit += netKredit;
    } else if (acc.kategori === 7) {
      depresiasi += netKredit;
    } else if (acc.kategori === 1) {
      dPiutang += -netDebit;
    } else if (acc.kategori === 2) {
      dAsetLancarLain += -netDebit;
    } else if (acc.kategori === 4) {
      dPersediaan += -netDebit;
    } else if (acc.kategori === 8) {
      dHutang += netKredit;
    } else if (acc.kategori === 9) {
      dKartuKredit += netKredit;
    } else if (acc.kategori === 10) {
      dLiabPendekLain += netKredit;
    } else if (acc.kategori === 5) {
      dAsetTetap += -netDebit;
    } else if (acc.kategori === 6) {
      dAsetLainnya += -netDebit;
    } else if (acc.kategori === 11) {
      dPinjaman += netKredit;
    } else if (acc.kategori === 12) {
      dEkuitas += netKredit;
    }
  }

  const opItems = [
    { key: "laba_bersih", label: "Laba (rugi) bersih", nilai: labaBersih },
    ...(depresiasi !== 0 ? [{ key: "depresiasi", label: "Penyusutan & amortisasi", nilai: depresiasi }] : []),
    ...(dPiutang !== 0 ? [{ key: "piutang", label: "Penurunan (kenaikan) piutang usaha", nilai: dPiutang }] : []),
    ...(dAsetLancarLain !== 0 ? [{ key: "aset_lancar_lain", label: "Penurunan (kenaikan) aktiva lancar lainnya", nilai: dAsetLancarLain }] : []),
    ...(dPersediaan !== 0 ? [{ key: "persediaan", label: "Penurunan (kenaikan) persediaan barang", nilai: dPersediaan }] : []),
    ...(dHutang !== 0 ? [{ key: "hutang", label: "Kenaikan (penurunan) hutang usaha", nilai: dHutang }] : []),
    ...(dKartuKredit !== 0 ? [{ key: "kartu_kredit", label: "Kenaikan (penurunan) kartu kredit", nilai: dKartuKredit }] : []),
    ...(dLiabPendekLain !== 0 ? [{ key: "liab_pendek", label: "Kenaikan (penurunan) kewajiban lancar lainnya", nilai: dLiabPendekLain }] : []),
  ];
  const operasional = { items: opItems, total: opItems.reduce((s, x) => s + x.nilai, 0) };

  const invItems = [
    ...(dAsetTetap !== 0 ? [{ key: "inv_aset_tetap", label: "Perolehan/Penjualan aset tetap", nilai: dAsetTetap }] : []),
    ...(dAsetLainnya !== 0 ? [{ key: "inv_lainnya", label: "Aktivitas investasi lainnya", nilai: dAsetLainnya }] : []),
  ];
  const investasi = { items: invItems, total: invItems.reduce((s, x) => s + x.nilai, 0) };

  const finItems = [
    ...(dPinjaman !== 0 ? [{ key: "fin_pinjaman", label: "Pembayaran/Penerimaan pinjaman", nilai: dPinjaman }] : []),
    ...(dEkuitas !== 0 ? [{ key: "fin_ekuitas", label: "Ekuitas/Modal", nilai: dEkuitas }] : []),
    ...(!eliminateInterUnit && dAntarUnit !== 0 ? [{ key: "fin_antar_unit", label: "Transfer antar unit", nilai: dAntarUnit }] : []),
  ];
  const pendanaan = { items: finItems, total: finItems.reduce((s, x) => s + x.nilai, 0) };
  const kenaikanKas = operasional.total + investasi.total + pendanaan.total;

  return {
    operasional,
    investasi,
    pendanaan,
    kenaikanKas,
    saldoAwal,
    saldoAkhir: saldoAwal + kenaikanKas,
    saldoAkhirAkun: saldoAkhir,
    cocok: saldoAwal + kenaikanKas === saldoAkhir,
  };
}

// ─── 4. PERUBAHAN MODAL (FORMAT ASLI JURNAL) ───────────────────────────────────

export async function reportPerubahanModal(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const bandingPeriode = ctx.url.searchParams.get("banding_periode") || "none";
  const bandingJumlah = Number(ctx.url.searchParams.get("banding_jumlah") || 0);

  const periods = buildComparePeriods(dari, sampai, bandingPeriode, bandingJumlah);
  const { accounts, accByKode, lastUpdatedAt } = await loadMeta(db);
  const equityAccs = accounts.filter((a) => a.kategori === 12 && !a.is_header);

  const blocks = await Promise.all(
    periods.map(async (p) => {
      const dayBefore = addDays(p.dari, -1);
      const [openSums, moveSums, lastClosed] = await Promise.all([
        queryAccountPeriodSums(db, { sampai: dayBefore, unitKodes }),
        queryAccountPeriodSums(db, { dari: p.dari, sampai: p.sampai, unitKodes }),
        db
          .prepare("SELECT MAX(sampai) AS last_sampai FROM period_closings WHERE tipe = 'tutup' AND status = 'selesai' AND sampai <= ?")
          .bind(p.sampai)
          .first(),
      ]);

      const rows = [];
      let totPermulaan = 0;
      let totDebit = 0;
      let totKredit = 0;
      let totAkhir = 0;

      for (const acc of equityAccs) {
        const o = openSums.get(acc.kode) || { debit: 0, kredit: 0 };
        const m = moveSums.get(acc.kode) || { debit: 0, kredit: 0 };
        const permulaan = o.kredit - o.debit;
        const debit = m.debit;
        const kredit = m.kredit;
        const saldoAkhir = permulaan - debit + kredit;

        totPermulaan += permulaan;
        totDebit += debit;
        totKredit += kredit;
        totAkhir += saldoAkhir;

        rows.push({
          kode_akun: acc.kode,
          nama_akun: acc.nama,
          permulaan,
          debit,
          kredit,
          saldo_akhir: saldoAkhir,
        });
      }

      // Hitung laba periode berjalan yang belum ditutup buku (dari max(p.dari, dayAfter(lastClosed)) s.d. p.sampai)
      const unclosedFrom = lastClosed?.last_sampai ? addDays(lastClosed.last_sampai, 1) : p.dari;
      const calcFrom = unclosedFrom > p.dari ? unclosedFrom : p.dari;
      let labaBelumDitutup = 0;
      if (calcFrom <= p.sampai) {
        const pnlSums = await queryAccountPeriodSums(db, { dari: calcFrom, sampai: p.sampai, unitKodes, excludeClosing: true });
        for (const [kode, v] of pnlSums.entries()) {
          const acc = accByKode.get(kode);
          if (acc && acc.kategori >= 13 && acc.kategori <= 17) labaBelumDitutup += v.kredit - v.debit;
        }
      }

      const pergerakan = totKredit - totDebit;
      const hasEquityBalance = rows.some((r) => r.permulaan !== 0 || r.debit !== 0 || r.kredit !== 0 || r.saldo_akhir !== 0);

      return {
        label: p.label,
        dari: p.dari,
        sampai: p.sampai,
        rows,
        total: {
          permulaan: totPermulaan,
          debit: totDebit,
          kredit: totKredit,
          saldo_akhir: totAkhir,
        },
        pergerakan,
        hasEquityBalance,
        labaBelumDitutup,
        catatan:
          labaBelumDitutup !== 0
            ? `Laba periode berjalan ${formatRupiahSen(labaBelumDitutup)} belum ditutup buku. Lihat Laba Rugi.`
            : null,
      };
    }),
  );

  return {
    laporan: "perubahan-modal",
    dari,
    sampai,
    unit_kodes: unitKodes,
    lastUpdatedAt,
    blocks,
  };
}

// ─── 5. BUKU BESAR ────────────────────────────────────────────────────────────

export async function reportBukuBesar(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const eliminateInterUnit = unitKodes.length === 0 || unitKodes.length > 1;
  const accountKodes = (ctx.url.searchParams.get("account_kodes") || "").split(",").filter(Boolean);
  const saldoAkhirSaja = ctx.url.searchParams.get("saldo_akhir_saja") === "1";

  const { accounts, lastUpdatedAt } = await loadMeta(db);
  const dayBefore = addDays(dari, -1);
  const openSums = await queryAccountPeriodSums(db, { sampai: dayBefore, unitKodes });

  const conds = ["jl.tanggal >= ?", "jl.tanggal <= ?"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("jl.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  if (accountKodes.length > 0) {
    conds.push("jl.account_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(accountKodes));
  }

  const { results: txLines } = saldoAkhirSaja
    ? { results: [] }
    : await db
        .prepare(
          `SELECT jl.*, d.type AS doc_type, d.no AS doc_no, d.memo AS doc_memo, d.created_at AS doc_created_at
           FROM journal_lines jl
           JOIN documents d ON d.id = jl.document_id
           WHERE ${conds.join(" AND ")}
           ORDER BY jl.account_kode, jl.tanggal ASC, d.created_at ASC, jl.id ASC`,
        )
        .bind(...params)
        .all();

  const moveSums = saldoAkhirSaja ? await queryAccountPeriodSums(db, { dari, sampai, unitKodes }) : null;

  const linesByAcc = new Map();
  for (const l of txLines) {
    const arr = linesByAcc.get(l.account_kode) || [];
    arr.push(l);
    linesByAcc.set(l.account_kode, arr);
  }

  const targetAccs = accounts.filter((a) => {
    if (a.is_header) return false;
    if (eliminateInterUnit && isInterUnitAccount(a.kode)) return false;
    if (accountKodes.length > 0) return accountKodes.includes(a.kode);
    return true;
  });

  const groups = [];
  for (const acc of targetAccs) {
    const cat = CATEGORY_BY_ID[acc.kategori];
    const sign = cat?.normal === "debit" ? 1 : -1;
    const o = openSums.get(acc.kode) || { debit: 0, kredit: 0 };
    const saldoAwal = sign * ((o.debit || 0) - (o.kredit || 0));

    let running = saldoAwal;
    let totalDebit = 0;
    let totalKredit = 0;
    const rows = [];

    if (saldoAkhirSaja) {
      const m = moveSums.get(acc.kode) || { debit: 0, kredit: 0 };
      totalDebit = m.debit || 0;
      totalKredit = m.kredit || 0;
      running = saldoAwal + sign * (totalDebit - totalKredit);
    } else {
      for (const l of linesByAcc.get(acc.kode) || []) {
        totalDebit += l.debit || 0;
        totalKredit += l.kredit || 0;
        running += sign * ((l.debit || 0) - (l.kredit || 0));
        rows.push({
          id: l.id,
          document_id: l.document_id,
          tanggal: l.tanggal,
          transaksi: l.doc_type,
          nomor: l.doc_no,
          unit_kode: l.unit_kode,
          keterangan: l.doc_memo || l.keterangan,
          debit: l.debit,
          kredit: l.kredit,
          saldo: running,
        });
      }
    }

    if (saldoAwal !== 0 || rows.length > 0 || totalDebit !== 0 || totalKredit !== 0) {
      groups.push({
        kode: acc.kode,
        nama: acc.nama,
        kategori_nama: cat?.nama || "",
        saldo_awal: saldoAwal,
        total_debit: totalDebit,
        total_kredit: totalKredit,
        saldo_akhir: running,
        rows,
      });
    }
  }

  return { laporan: "buku-besar", dari, sampai, unit_kodes: unitKodes, lastUpdatedAt, groups };
}

// ─── 6. JURNAL ────────────────────────────────────────────────────────────────

export async function reportJurnal(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const typeFilter = ctx.url.searchParams.get("type") || "";

  const conds = ["jl.tanggal >= ?", "jl.tanggal <= ?", "d.deleted_at IS NULL"];
  const params = [dari, sampai];
  if (unitKodes.length > 0) {
    conds.push("jl.unit_kode IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(unitKodes));
  }
  if (typeFilter) {
    conds.push("d.type = ?");
    params.push(typeFilter);
  }

  const { results } = await db
    .prepare(
      `SELECT jl.*, a.nama AS account_nama, d.type AS doc_type, d.no AS doc_no, d.memo AS doc_memo, d.created_at AS doc_created_at
       FROM journal_lines jl
       JOIN documents d ON d.id = jl.document_id
       JOIN accounts a ON a.kode = jl.account_kode
       WHERE ${conds.join(" AND ")}
       ORDER BY jl.tanggal ASC, d.created_at ASC, jl.debit DESC, a.kode ASC`,
    )
    .bind(...params)
    .all();

  const docs = [];
  const docMap = new Map();
  let grandDebit = 0;
  let grandKredit = 0;

  for (const r of results) {
    let entry = docMap.get(r.document_id);
    if (!entry) {
      entry = {
        document_id: r.document_id,
        tanggal: r.tanggal,
        type: r.doc_type,
        no: r.doc_no,
        memo: r.doc_memo,
        total_debit: 0,
        total_kredit: 0,
        lines: [],
      };
      docMap.set(r.document_id, entry);
      docs.push(entry);
    }
    entry.lines.push({
      account_kode: r.account_kode,
      account_nama: r.account_nama,
      unit_kode: r.unit_kode,
      keterangan: r.keterangan,
      debit: r.debit,
      kredit: r.kredit,
    });
    entry.total_debit += r.debit;
    entry.total_kredit += r.kredit;
    grandDebit += r.debit;
    grandKredit += r.kredit;
  }

  const { lastUpdatedAt } = await loadMeta(db);
  return { laporan: "jurnal", dari, sampai, unit_kodes: unitKodes, lastUpdatedAt, entries: docs, grandDebit, grandKredit };
}

// ─── 7. NERACA SALDO ──────────────────────────────────────────────────────────

export async function reportNeracaSaldo(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKodes = parseUnitFilter(ctx.url.searchParams.get("unit_kode"));
  const eliminateInterUnit = unitKodes.length === 0 || unitKodes.length > 1;

  const { accounts, lastUpdatedAt } = await loadMeta(db);
  const dayBefore = addDays(dari, -1);
  const [openSums, moveSums] = await Promise.all([
    queryAccountPeriodSums(db, { sampai: dayBefore, unitKodes }),
    queryAccountPeriodSums(db, { dari, sampai, unitKodes }),
  ]);

  const rows = [];
  const totals = {
    awal_debit: 0, awal_kredit: 0,
    gerak_debit: 0, gerak_kredit: 0,
    akhir_debit: 0, akhir_kredit: 0,
  };

  for (const acc of accounts) {
    if (acc.is_header) continue;
    if (eliminateInterUnit && isInterUnitAccount(acc.kode)) continue;
    const o = openSums.get(acc.kode) || { debit: 0, kredit: 0 };
    const m = moveSums.get(acc.kode) || { debit: 0, kredit: 0 };

    const openNet = o.debit - o.kredit;
    const awalDebit = openNet > 0 ? openNet : 0;
    const awalKredit = openNet < 0 ? Math.abs(openNet) : 0;
    const gerakDebit = m.debit;
    const gerakKredit = m.kredit;
    const endNet = openNet + gerakDebit - gerakKredit;
    const akhirDebit = endNet > 0 ? endNet : 0;
    const akhirKredit = endNet < 0 ? Math.abs(endNet) : 0;

    if (awalDebit || awalKredit || gerakDebit || gerakKredit || akhirDebit || akhirKredit) {
      rows.push({
        kode: acc.kode,
        nama: acc.nama,
        awal_debit: awalDebit,
        awal_kredit: awalKredit,
        gerak_debit: gerakDebit,
        gerak_kredit: gerakKredit,
        akhir_debit: akhirDebit,
        akhir_kredit: akhirKredit,
      });
      totals.awal_debit += awalDebit;
      totals.awal_kredit += awalKredit;
      totals.gerak_debit += gerakDebit;
      totals.gerak_kredit += gerakKredit;
      totals.akhir_debit += akhirDebit;
      totals.akhir_kredit += akhirKredit;
    }
  }

  return { laporan: "neraca-saldo", dari, sampai, unit_kodes: unitKodes, lastUpdatedAt, rows, totals };
}

// ─── 8. RINGKASAN BISNIS ──────────────────────────────────────────────────────

export async function reportRingkasanBisnis(ctx) {
  const [lr, nr, ak] = await Promise.all([
    reportLabaRugi(ctx),
    reportNeraca(ctx),
    reportArusKas(ctx),
  ]);

  const sLr = lr.summary;
  const sNr = nr.totals[0] || { totalAset: 0, totalLiabilitas: 0, totalModal: 0 };
  const sAk = ak.data[0] || { operasional: { total: 0 }, investasi: { total: 0 }, pendanaan: { total: 0 } };
  const asetLancar = nr.sections.aset[0]?.totals[0] || 0;
  const liabPendek = nr.sections.liabilitas[0]?.totals[0] || 0;

  const pct = (num, den) => (den ? Number(((num / den) * 100).toFixed(2)) : null);
  const ratio = (num, den) => (den ? Number((num / den).toFixed(2)) : null);

  return {
    laporan: "ringkasan-bisnis",
    dari: lr.dari,
    sampai: lr.sampai,
    unit_kodes: lr.unit_kodes,
    lastUpdatedAt: lr.lastUpdatedAt,
    labaRugi: sLr,
    neraca: {
      totalAset: sNr.totalAset,
      asetLancar,
      totalLiabilitas: sNr.totalLiabilitas,
      liabilitasJangkaPendek: liabPendek,
      totalModal: sNr.totalModal,
    },
    arusKas: {
      operasional: sAk.operasional.total,
      investasi: sAk.investasi.total,
      pendanaan: sAk.pendanaan.total,
      saldoAkhir: sAk.saldoAkhir ?? 0,
    },
    wawasan: [
      { key: "margin_kotor", label: "Margin Laba Kotor", nilai: pct(sLr.labaKotor, sLr.pendapatan), unit: "%", penjelasan: "Laba kotor ÷ Pendapatan" },
      { key: "margin_op", label: "Margin Laba Operasional", nilai: pct(sLr.pendapatanBersihOperasional, sLr.pendapatan), unit: "%", penjelasan: "Laba operasional ÷ Pendapatan" },
      { key: "margin_bersih", label: "Margin Keuntungan Bersih", nilai: pct(sLr.pendapatanBersih, sLr.pendapatan), unit: "%", penjelasan: "Laba bersih ÷ Pendapatan" },
      { key: "rasio_lancar", label: "Rasio Lancar", nilai: ratio(asetLancar, liabPendek), unit: "x", penjelasan: "Aset lancar ÷ Liabilitas jangka pendek" },
      { key: "rasio_hutang_ekuitas", label: "Rasio Hutang terhadap Ekuitas", nilai: ratio(sNr.totalLiabilitas, sNr.totalModal), unit: "x", penjelasan: "Total liabilitas ÷ Total modal" },
      { key: "roa", label: "Tingkat Pengembalian Aset (ROA)", nilai: pct(sLr.pendapatanBersih, sNr.totalAset), unit: "%", penjelasan: "Laba bersih ÷ Total aset" },
      { key: "roe", label: "Tingkat Pengembalian Ekuitas (ROE)", nilai: pct(sLr.pendapatanBersih, sNr.totalModal), unit: "%", penjelasan: "Laba bersih ÷ Total modal" },
    ],
  };
}

// ─── Template Laporan (Laba Rugi & Arus Kas) ──────────────────────────────────

export async function listReportTemplates(ctx) {
  await requireKeuangan(ctx);
  const laporan = ctx.url.searchParams.get("laporan") || "";
  const sql = laporan ? "SELECT * FROM report_templates WHERE laporan = ? ORDER BY utama DESC, nama" : "SELECT * FROM report_templates ORDER BY laporan, utama DESC, nama";
  const { results } = await (laporan ? ctx.env.DB.prepare(sql).bind(laporan) : ctx.env.DB.prepare(sql)).all();
  return { templates: results.map((r) => ({ ...r, config: JSON.parse(r.config_json) })) };
}

export async function saveReportTemplate(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const laporan = body.laporan === "arus_kas" ? "arus_kas" : "laba_rugi";
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama template laporan wajib diisi.");
  const id = body.id ? String(body.id) : newId();
  const utama = body.utama ? 1 : 0;

  const stmts = [];
  if (utama) {
    stmts.push(db.prepare("UPDATE report_templates SET utama = 0 WHERE laporan = ?").bind(laporan));
  }
  stmts.push(
    db
      .prepare(
        `INSERT INTO report_templates (id, laporan, nama, metode, config_json, utama, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, metode = excluded.metode, config_json = excluded.config_json, utama = excluded.utama, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(id, laporan, nama, body.metode || null, JSON.stringify(body.config || {}), utama, now, actor.uid, now, actor.uid),
    buildAuditStatement(db, { entity: "report_template", entityId: id, action: body.id ? "update" : "create", after: { laporan, nama }, actor, now }),
  );
  await db.batch(stmts);
  return { template: await db.prepare("SELECT * FROM report_templates WHERE id = ?").bind(id).first() };
}

export async function deleteReportTemplate(ctx) {
  const actor = await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM report_templates WHERE id = ?").bind(ctx.params[0]).run();
  await ctx.env.DB.prepare(
    "INSERT INTO audit_log (id, entity, entity_id, action, by, by_name, at) VALUES (?, 'report_template', ?, 'delete', ?, ?, ?)",
  ).bind(newId(), ctx.params[0], actor.uid, actor.name, ctx.deps.now()).run();
  return { ok: true };
}
