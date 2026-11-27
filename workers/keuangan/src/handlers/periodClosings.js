// Kunci Periode dan Tutup Buku (01-dasar.md & 09-teknis.md Skenario 6).
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { CATEGORY_BY_ID } from "../lib/seedData.js";
import {
  allocateDocNumber,
  buildAuditStatement,
  buildJournalAndMonthlyStatements,
  normalizeAndCheckBalance,
} from "../lib/ledger.js";
import { addDays, cleanText, invalid, isInt, newId, requireIsoDate, todayWib } from "../lib/validate.js";

async function resolvePeriodStart(db) {
  const lastLock = await db
    .prepare("SELECT MAX(sampai) AS last_sampai FROM period_closings WHERE status = 'selesai'")
    .first();
  if (lastLock?.last_sampai) return addDays(lastLock.last_sampai, 1);

  const firstTx = await db
    .prepare("SELECT MIN(tanggal) AS min_tgl FROM journal_lines")
    .first();
  return firstTx?.min_tgl || todayWib();
}

async function computeClosingData(db, sampai) {
  const { results: accounts } = await db.prepare("SELECT * FROM accounts ORDER BY kode").all();
  const accMap = new Map(accounts.map((a) => [a.kode, a]));

  // Neraca Saldo kumulatif sampai `sampai`, TERMASUK jurnal penutup sebelumnya.
  // Saldo akun laba rugi (13–17) kumulatif = laba yang belum pernah ditutup buku, termasuk bulan yang hanya
  // dikunci (Kunci Periode tidak membuat jurnal penutup). Jadi yang ditutup = saldo kumulatif, bukan hanya sejak `dari`.
  const { results: allRows } = await db
    .prepare(
      `SELECT jl.unit_kode, jl.account_kode, SUM(jl.debit) AS tot_d, SUM(jl.kredit) AS tot_k
       FROM journal_lines jl
       WHERE jl.tanggal <= ?
       GROUP BY jl.unit_kode, jl.account_kode`,
    )
    .bind(sampai)
    .all();

  const perAccount = new Map();
  const pnlPerUnit = new Map(); // unit -> Map<account_kode, { debit, kredit }>
  for (const r of allRows) {
    const acc = accMap.get(r.account_kode);
    if (!acc) continue;
    const isPnl = acc.kategori >= 13 && acc.kategori <= 17;

    const prev = perAccount.get(acc.kode) || {
      kode: acc.kode,
      nama: acc.nama,
      kategori: acc.kategori,
      ns_debit: 0,
      ns_kredit: 0,
      lr_debit: 0,
      lr_kredit: 0,
      neraca_debit: 0,
      neraca_kredit: 0,
    };

    const netTotal = (r.tot_d || 0) - (r.tot_k || 0);
    if (netTotal > 0) prev.ns_debit += netTotal;
    else prev.ns_kredit += Math.abs(netTotal);

    if (isPnl) {
      const netPer = netTotal;
      if (netPer > 0) prev.lr_debit += netPer;
      else prev.lr_kredit += Math.abs(netPer);

      if (netPer !== 0) {
        const uMap = pnlPerUnit.get(r.unit_kode) || new Map();
        const cur = uMap.get(acc.kode) || { debit: 0, kredit: 0 };
        cur.debit += r.tot_d || 0;
        cur.kredit += r.tot_k || 0;
        uMap.set(acc.kode, cur);
        pnlPerUnit.set(r.unit_kode, uMap);
      }
    } else {
      if (netTotal > 0) prev.neraca_debit += netTotal;
      else prev.neraca_kredit += Math.abs(netTotal);
    }

    perAccount.set(acc.kode, prev);
  }

  const worksheet = [...perAccount.values()].sort((a, b) => a.kode.localeCompare(b.kode));
  const netProfitTotal = worksheet.reduce((s, w) => s + (w.lr_kredit - w.lr_debit), 0);

  return { worksheet, pnlPerUnit, netProfitTotal };
}

export async function listPeriodClosings(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const { results } = await db.prepare("SELECT * FROM period_closings ORDER BY created_at DESC").all();
  const latestSelesai = results.find((r) => r.status === "selesai") || null;
  return { closings: results, latestCompletedId: latestSelesai?.id || null };
}

export async function previewClosing(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || todayWib(ctx.deps.now()), "sampai");
  const dari = await resolvePeriodStart(db);
  if (sampai < dari) {
    throw invalid("sampai", `Tanggal akhir (${sampai}) tidak boleh sebelum awal periode terbuka (${dari}).`);
  }

  const [recalcRow, negStockRow, depRow, { worksheet, netProfitTotal }] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS cnt FROM recalc_queue").first(),
    db
      .prepare(
        "SELECT product_id, warehouse_id, SUM(qty_masuk - qty_keluar) AS stok FROM stock_bulanan GROUP BY product_id, warehouse_id HAVING stok < 0 LIMIT 1",
      )
      .first(),
    db
      .prepare("SELECT COUNT(*) AS cnt FROM depreciation_schedule WHERE document_id IS NULL AND bulan <= ?")
      .bind(sampai.slice(0, 7))
      .first(),
    computeClosingData(db, sampai),
  ]);

  return {
    dari,
    sampai,
    checklist: {
      recalcRunning: (recalcRow?.cnt ?? 0) > 0,
      hasNegativeStock: Boolean(negStockRow),
      pendingDepreciation: depRow?.cnt ?? 0,
      canProceed: (recalcRow?.cnt ?? 0) === 0 && !negStockRow && (depRow?.cnt ?? 0) === 0,
    },
    netProfit: netProfitTotal,
    worksheet,
  };
}

export async function createPeriodClosing(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const tipe = body.tipe === "tutup" ? "tutup" : "kunci";
  const sampai = requireIsoDate(body.sampai, "sampai");
  if (sampai > todayWib(now)) throw invalid("sampai", "Tanggal tutup/kunci periode tidak boleh melewati hari ini.");

  const dari = await resolvePeriodStart(db);
  if (sampai < dari) {
    throw invalid("sampai", `Periode sampai ${sampai} sudah pernah dikunci atau tidak valid.`);
  }

  const status = body.status === "draf" ? "draf" : "selesai";
  const memo = cleanText(body.memo, 500);
  const closingId = body.id ? String(body.id) : newId();

  // Validasi prasyarat keras
  const recalcRow = await db.prepare("SELECT COUNT(*) AS cnt FROM recalc_queue").first();
  if ((recalcRow?.cnt ?? 0) > 0) {
    throw new KeuanganError("REKALKULASI_BERJALAN", 400, "Tutup buku/kunci periode ditolak saat hitung ulang HPP masih berjalan.");
  }
  const negStock = await db
    .prepare("SELECT 1 FROM stock_bulanan GROUP BY product_id, warehouse_id HAVING SUM(qty_masuk - qty_keluar) < 0 LIMIT 1")
    .first();
  if (negStock) {
    throw new KeuanganError("STOK_NEGATIF", 400, "Terdapat stok negatif di gudang. Lakukan penyesuaian stok terlebih dahulu.");
  }

  let closingDocId = null;
  let pajakJson = null;
  const stmts = [];

  if (tipe === "tutup" && status === "selesai") {
    const { pnlPerUnit, netProfitTotal } = await computeClosingData(db, sampai);
    const akunLabaDitahan = body.akun_laba_ditahan || "3-30100";
    const ldAcc = await db.prepare("SELECT kode, kategori, is_header FROM accounts WHERE kode = ?").bind(akunLabaDitahan).first();
    if (!ldAcc || ldAcc.is_header || ldAcc.kategori !== 12) {
      throw invalid("akun_laba_ditahan", "Akun Laba Ditahan harus akun kategori Ekuitas.");
    }

    const jumlahPajak = Number(body.jumlah_pajak ?? 0);
    if (!isInt(jumlahPajak, { min: 0 })) throw invalid("jumlah_pajak", "Jumlah pajak harus berupa bilangan bulat sen ≥ 0.");
    if (jumlahPajak > 0 && netProfitTotal <= 0) {
      throw invalid("jumlah_pajak", "Pajak penutupan tidak dapat diisi apabila laba bersih tidak positif.");
    }

    let akunBebanPajak = body.akun_beban_pajak || "9-90000";
    let akunHutangPajak = body.akun_hutang_pajak || "2-20503";
    let taxDocId = null;
    const taxJournalRaw = [];
    if (jumlahPajak > 0) {
      const bp = await db.prepare("SELECT kode, is_header, kategori FROM accounts WHERE kode = ?").bind(akunBebanPajak).first();
      const hp = await db.prepare("SELECT kode, is_header FROM accounts WHERE kode = ?").bind(akunHutangPajak).first();
      if (!bp || bp.is_header || bp.kategori < 15 || bp.kategori > 17) {
        throw invalid("akun_beban_pajak", "Akun beban pajak tidak valid (harus akun beban/HPP).");
      }
      if (!hp || hp.is_header) throw invalid("akun_hutang_pajak", "Akun hutang pajak tidak valid.");
      taxDocId = newId();
      pajakJson = JSON.stringify({
        jumlah_pajak: jumlahPajak,
        akun_beban_pajak: akunBebanPajak,
        akun_hutang_pajak: akunHutangPajak,
        akun_laba_ditahan: akunLabaDitahan,
        tax_document_id: taxDocId,
      });
    } else {
      pajakJson = JSON.stringify({ jumlah_pajak: 0, akun_laba_ditahan: akunLabaDitahan });
    }

    // Bangun baris jurnal penutup per anak perusahaan
    const journalRaw = [];
    let primaryUnit = null;
    const unitProfits = [...pnlPerUnit.entries()].map(([uKode, accMap]) => {
      let profit = 0;
      for (const v of accMap.values()) profit += v.kredit - v.debit;
      return { uKode, accMap, profit };
    });
    const positiveProfitSum = unitProfits.reduce((s, u) => s + (u.profit > 0 ? u.profit : 0), 0);

    let taxAllocated = 0;
    for (const [idx, u] of unitProfits.entries()) {
      if (!primaryUnit) primaryUnit = u.uKode;
      let netUnit = u.profit;

      // Nol-kan setiap akun P&L pada unit ini
      for (const [accKode, v] of u.accMap.entries()) {
        const net = v.kredit - v.debit;
        if (net === 0) continue;
        journalRaw.push({
          tanggal: sampai,
          unit_kode: u.uKode,
          account_kode: accKode,
          debit: net > 0 ? net : 0, // Pendapatan bersaldo kredit -> di-debit agar 0
          kredit: net < 0 ? Math.abs(net) : 0, // Beban bersaldo debit -> di-kredit agar 0
          keterangan: `Tutup Buku ${dari} s.d. ${sampai}`,
        });
      }

      // Pajak penutupan (jika ada):
      // 1) Jurnal Beban Pajak: Debit akun_beban_pajak, Kredit akun_hutang_pajak (dokumen closing_tax -> tampil di Laba Rugi)
      // 2) Di jurnal penutup: Kredit akun_beban_pajak agar saldo akun beban pajak ikut dinolkan, mengurangi Laba Ditahan
      if (jumlahPajak > 0 && u.profit > 0 && positiveProfitSum > 0) {
        const isLastPositive = unitProfits.slice(idx + 1).every((x) => x.profit <= 0);
        const unitTax = isLastPositive ? jumlahPajak - taxAllocated : Math.round((jumlahPajak * u.profit) / positiveProfitSum);
        taxAllocated += unitTax;
        if (unitTax > 0) {
          taxJournalRaw.push(
            {
              tanggal: sampai,
              unit_kode: u.uKode,
              account_kode: akunBebanPajak,
              debit: unitTax,
              kredit: 0,
              keterangan: "Beban pajak penghasilan tutup buku",
            },
            {
              tanggal: sampai,
              unit_kode: u.uKode,
              account_kode: akunHutangPajak,
              debit: 0,
              kredit: unitTax,
              keterangan: "Hutang pajak penghasilan tutup buku",
            },
          );
          journalRaw.push({
            tanggal: sampai,
            unit_kode: u.uKode,
            account_kode: akunBebanPajak,
            debit: 0,
            kredit: unitTax,
            keterangan: `Penutupan beban pajak ${dari} s.d. ${sampai}`,
          });
          netUnit -= unitTax;
        }
      }

      if (netUnit !== 0) {
        journalRaw.push({
          tanggal: sampai,
          unit_kode: u.uKode,
          account_kode: akunLabaDitahan,
          debit: netUnit < 0 ? Math.abs(netUnit) : 0,
          kredit: netUnit > 0 ? netUnit : 0,
          keterangan: `Pemindahan Laba/Rugi ke ${akunLabaDitahan}`,
        });
      }
    }

    if (taxDocId && taxJournalRaw.length > 0) {
      const balancedTax = normalizeAndCheckBalance(taxJournalRaw);
      const allocTax = await allocateDocNumber(db, "closing_tax", primaryUnit || "", sampai, now, actor);
      stmts.push(allocTax.updateStmt);
      stmts.push(
        db
          .prepare(
            `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, total, memo, created_at, created_by, updated_at, updated_by)
             VALUES (?, 'closing_tax', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(taxDocId, allocTax.no, sampai, primaryUnit, jumlahPajak, memo || `Pajak Tutup Buku ${dari} - ${sampai}`, now, actor.uid, now, actor.uid),
      );
      stmts.push(...(await buildJournalAndMonthlyStatements(db, taxDocId, balancedTax)));
    }

    if (journalRaw.length > 0) {
      const balanced = normalizeAndCheckBalance(journalRaw);
      closingDocId = newId();
      const alloc = await allocateDocNumber(db, "closing", primaryUnit || "", sampai, now, actor);
      stmts.push(alloc.updateStmt);
      stmts.push(
        db
          .prepare(
            `INSERT INTO documents (id, type, no, tanggal, unit_kode, status, total, memo, created_at, created_by, updated_at, updated_by)
             VALUES (?, 'closing', ?, ?, ?, 'selesai', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(closingDocId, alloc.no, sampai, primaryUnit, Math.abs(netProfitTotal - jumlahPajak), memo || `Tutup Buku ${dari} - ${sampai}`, now, actor.uid, now, actor.uid),
      );
      stmts.push(...(await buildJournalAndMonthlyStatements(db, closingDocId, balanced)));
    }
  }

  stmts.push(
    db
      .prepare(
        `INSERT INTO period_closings (id, tipe, dari, sampai, status, memo, document_id, pajak_json, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET tipe = excluded.tipe, sampai = excluded.sampai, status = excluded.status,
           memo = excluded.memo, document_id = excluded.document_id, pajak_json = excluded.pajak_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(closingId, tipe, dari, sampai, status, memo, closingDocId, pajakJson, now, actor.uid, now, actor.uid),
    buildAuditStatement(db, {
      entity: "period_closing",
      entityId: closingId,
      action: status === "draf" ? "draft" : tipe,
      after: { tipe, dari, sampai, status, closingDocId },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return { closing: await db.prepare("SELECT * FROM period_closings WHERE id = ?").bind(closingId).first() };
}

export async function cancelPeriodClosing(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];

  const target = await db.prepare("SELECT * FROM period_closings WHERE id = ?").bind(id).first();
  if (!target) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Riwayat kunci/tutup buku tidak ditemukan.");
  if (target.status !== "selesai") throw new KeuanganError("TIDAK_VALID", 400, "Hanya kunci/tutup buku berstatus Selesai yang dapat dibatalkan.");

  const latest = await db
    .prepare("SELECT id FROM period_closings WHERE status = 'selesai' ORDER BY sampai DESC, created_at DESC LIMIT 1")
    .first();
  if (latest?.id !== id) {
    throw new KeuanganError("HARUS_URUT_MUNDUR", 400, "Hanya kunci periode / tutup buku terakhir yang boleh dibatalkan terlebih dahulu.");
  }

  const body = await readJson(ctx.request);
  const alasan = cleanText(body.alasan, 500);
  if (!alasan) throw invalid("alasan", "Alasan pembatalan wajib diisi.");

  const stmts = [
    db
      .prepare("UPDATE period_closings SET status = 'batal', alasan_batal = ?, document_id = NULL, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(alasan, now, actor.uid, id),
  ];
  let taxDocId = null;
  if (target.pajak_json) {
    try {
      taxDocId = JSON.parse(target.pajak_json)?.tax_document_id || null;
    } catch {
      taxDocId = null;
    }
  }
  if (target.document_id) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, target.document_id, [])));
    stmts.push(db.prepare("DELETE FROM documents WHERE id = ?").bind(target.document_id));
  }
  if (taxDocId) {
    stmts.push(...(await buildJournalAndMonthlyStatements(db, taxDocId, [])));
    stmts.push(db.prepare("DELETE FROM documents WHERE id = ?").bind(taxDocId));
  }

  stmts.push(
    buildAuditStatement(db, {
      entity: "period_closing",
      entityId: id,
      action: "cancel",
      before: target,
      after: { status: "batal", alasan },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return { closing: await db.prepare("SELECT * FROM period_closings WHERE id = ?").bind(id).first() };
}
