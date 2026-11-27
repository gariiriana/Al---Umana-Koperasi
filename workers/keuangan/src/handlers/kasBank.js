// Handler Kas & Bank dan BKU (Buku Kas Umum) per rekening/kas.
import { KeuanganError } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { getMaxLockedDate } from "../lib/ledger.js";
import { cleanText, requireIsoDate, todayWib } from "../lib/validate.js";

const DOC_TYPE_LABELS = {
  opening_balance: "Saldo Awal",
  opening_balance_reversal: "Pembalik Saldo Awal",
  journal: "Jurnal Umum",
  receive_money: "Terima Uang",
  send_money: "Kirim Uang",
  transfer_money: "Transfer Uang",
  closing: "Tutup Buku",
};

export async function listKasBank(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const includeArsip = ctx.url.searchParams.get("arsip") === "1";

  const { results: accounts } = await db
    .prepare(
      `SELECT a.*, u.nama AS unit_nama
       FROM accounts a
       LEFT JOIN units u ON u.kode = a.unit_kode
       WHERE a.kategori IN (3, 9) AND a.is_header = 0 ${includeArsip ? "" : "AND a.arsip = 0"}
       ORDER BY CASE WHEN a.kode = '' THEN 0 ELSE 1 END, a.kode`,
    )
    .all();

  const balQuery = unitKode
    ? db
        .prepare("SELECT account_kode, SUM(debit) AS d, SUM(kredit) AS k FROM saldo_bulanan WHERE unit_kode = ? GROUP BY account_kode")
        .bind(unitKode)
    : db.prepare("SELECT account_kode, SUM(debit) AS d, SUM(kredit) AS k FROM saldo_bulanan GROUP BY account_kode");
  const { results: balRows } = await balQuery.all();
  const balMap = new Map(balRows.map((r) => [r.account_kode, (r.d || 0) - (r.k || 0)]));

  const { results: stmtRows } = await db
    .prepare(
      `SELECT account_kode, COUNT(*) AS total_cnt, SUM(CASE WHEN matched = 0 THEN 1 ELSE 0 END) AS unmatched_cnt,
              SUM(masuk - keluar) AS net_bank
       FROM bank_statements GROUP BY account_kode`,
    )
    .all();
  const bankMap = new Map(stmtRows.map((s) => [s.account_kode, s]));

  let totalKasBank = 0;
  let totalKartuKredit = 0;
  const enriched = accounts
    .filter((a) => !unitKode || !a.unit_kode || a.unit_kode === unitKode)
    .map((a) => {
      const rawSaldo = balMap.get(a.kode) || 0;
      const saldoJurnal = a.kategori === 9 ? -rawSaldo : rawSaldo;
      if (a.kategori === 3) totalKasBank += saldoJurnal;
      else totalKartuKredit += saldoJurnal;
      const bk = bankMap.get(a.kode);
      return {
        ...a,
        unit_label: a.unit_kode ? `${a.unit_kode}${a.unit_nama ? ` — ${a.unit_nama}` : ""}` : "Bersama",
        saldo_jurnal: saldoJurnal,
        saldo_bank: bk ? bk.net_bank : null,
        rekonsiliasi_status: bk ? (bk.unmatched_cnt > 0 ? `${bk.unmatched_cnt} belum cocok` : "Cocok") : null,
      };
    });

  const today = todayWib(ctx.deps.now());
  const next30 = (() => {
    const dt = new Date(`${today}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 30);
    return dt.toISOString().slice(0, 10);
  })();
  const unitFilterSql = unitKode ? "AND unit_kode = ?" : "";
  const unitFilterParam = unitKode ? [unitKode] : [];

  const [inRow, outRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, IFNULL(SUM(sisa), 0) AS total
         FROM documents WHERE deleted_at IS NULL AND type = 'sales_invoice' AND sisa > 0 AND (jatuh_tempo IS NULL OR jatuh_tempo <= ?) ${unitFilterSql}`,
      )
      .bind(next30, ...unitFilterParam)
      .first(),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, IFNULL(SUM(sisa), 0) AS total
         FROM documents WHERE deleted_at IS NULL AND type IN ('purchase_invoice', 'expense') AND sisa > 0 AND (jatuh_tempo IS NULL OR jatuh_tempo <= ?) ${unitFilterSql}`,
      )
      .bind(next30, ...unitFilterParam)
      .first(),
  ]);

  return {
    asOf: today,
    summary: {
      pemasukan30Hari: inRow?.total || 0,
      pemasukanCount: inRow?.cnt || 0,
      pengeluaran30Hari: outRow?.total || 0,
      pengeluaranCount: outRow?.cnt || 0,
      saldoKasBank: totalKasBank,
      saldoKartuKredit: totalKartuKredit,
    },
    accounts: enriched,
  };
}

export async function getBku(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const kode = decodeURIComponent(ctx.params[0]);
  const account = await db
    .prepare("SELECT a.*, u.nama AS unit_nama FROM accounts a LEFT JOIN units u ON u.kode = a.unit_kode WHERE a.kode = ?")
    .bind(kode)
    .first();
  if (!account) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Akun Kas & Bank tidak ditemukan.");

  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const typeFilter = ctx.url.searchParams.get("type") || "";
  const q = cleanText(ctx.url.searchParams.get("q") || "", 100).toLowerCase();

  // Saldo awal akun sebelum tanggal `dari`
  const openConds = ["account_kode = ?", "tanggal < ?"];
  const openParams = [kode, dari];
  if (unitKode) {
    openConds.push("unit_kode = ?");
    openParams.push(unitKode);
  }
  const openRow = await db
    .prepare(`SELECT COALESCE(SUM(debit - kredit), 0) AS bal FROM journal_lines WHERE ${openConds.join(" AND ")}`)
    .bind(...openParams)
    .first();
  const saldoAwalRaw = openRow?.bal ?? 0;
  const saldoAwal = account.kategori === 9 ? -saldoAwalRaw : saldoAwalRaw;

  // Baris jurnal akun kas/bank pada periode filter
  const txConds = ["jl.account_kode = ?", "jl.tanggal >= ?", "jl.tanggal <= ?"];
  const txParams = [kode, dari, sampai];
  if (unitKode) {
    txConds.push("jl.unit_kode = ?");
    txParams.push(unitKode);
  }
  if (typeFilter) {
    txConds.push("d.type = ?");
    txParams.push(typeFilter);
  }

  const { results: lines } = await db
    .prepare(
      `SELECT jl.*, d.no AS doc_no, d.type AS doc_type, d.memo AS doc_memo, d.created_at AS doc_created_at,
         c.nama_tampilan AS contact_nama,
         (SELECT COUNT(*) FROM attachments att WHERE att.document_id = d.id) AS attachment_count
       FROM journal_lines jl
       JOIN documents d ON d.id = jl.document_id
       LEFT JOIN contacts c ON c.id = jl.contact_id
       WHERE ${txConds.join(" AND ")}
       ORDER BY jl.tanggal ASC, d.created_at ASC, jl.id ASC`,
    )
    .bind(...txParams)
    .all();

  // Ambil akun lawan untuk semua document_id dalam hasil sekali query
  const docIds = [...new Set(lines.map((l) => l.document_id))];
  const counterpartiesByDoc = new Map();
  if (docIds.length > 0) {
    const { results: others } = await db
      .prepare(
        `SELECT jl.document_id, jl.account_kode, a.nama AS account_nama, jl.unit_kode, jl.debit, jl.kredit, jl.keterangan
         FROM journal_lines jl
         JOIN accounts a ON a.kode = jl.account_kode
         WHERE jl.document_id IN (SELECT value FROM json_each(?)) AND jl.account_kode != ?
         ORDER BY jl.debit DESC, jl.kredit DESC`,
      )
      .bind(JSON.stringify(docIds), kode)
      .all();
    for (const o of others) {
      const arr = counterpartiesByDoc.get(o.document_id) || [];
      arr.push(o);
      counterpartiesByDoc.set(o.document_id, arr);
    }
  }

  const maxLocked = await getMaxLockedDate(db);
  let running = saldoAwal;
  let totalPenerimaan = 0;
  let totalPengeluaran = 0;

  const rows = [];
  for (const l of lines) {
    const penerimaan = account.kategori === 9 ? l.kredit : l.debit;
    const pengeluaran = account.kategori === 9 ? l.debit : l.kredit;
    running += penerimaan - pengeluaran;
    totalPenerimaan += penerimaan;
    totalPengeluaran += pengeluaran;

    const cps = counterpartiesByDoc.get(l.document_id) || [];
    const primaryCp = cps.length === 1 ? cps[0] : null;
    const uraian = l.doc_memo || l.keterangan || (cps[0]?.keterangan ?? "");
    const rowObj = {
      id: l.id,
      document_id: l.document_id,
      tanggal: l.tanggal,
      no_bukti: l.doc_no,
      tipe: l.doc_type,
      tipe_label: DOC_TYPE_LABELS[l.doc_type] || l.doc_type,
      unit_kode: l.unit_kode,
      contact_id: l.contact_id,
      contact_nama: l.contact_nama || "",
      kode_akun: primaryCp ? primaryCp.account_kode : cps.length > 1 ? `${cps.length} akun` : kode,
      nama_akun: primaryCp ? primaryCp.account_nama : cps.length > 1 ? cps.map((c) => `${c.account_kode} ${c.account_nama}`).join(", ") : account.nama,
      counterparties: cps,
      uraian,
      penerimaan,
      pengeluaran,
      saldo: running,
      rekonsiliasi: false,
      attachment_count: l.attachment_count || 0,
      locked: Boolean(maxLocked && l.tanggal <= maxLocked),
    };

    if (q) {
      const hay = `${rowObj.no_bukti} ${rowObj.contact_nama} ${rowObj.uraian} ${rowObj.kode_akun} ${rowObj.nama_akun}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    rows.push(rowObj);
  }

  return {
    account: {
      ...account,
      unit_label: account.unit_kode ? `${account.unit_kode}${account.unit_nama ? ` — ${account.unit_nama}` : ""}` : "Bersama",
    },
    periode: { dari, sampai },
    ringkasan: {
      saldoAwal,
      totalPenerimaan,
      totalPengeluaran,
      saldoAkhir: saldoAwal + totalPenerimaan - totalPengeluaran,
    },
    rows,
  };
}
