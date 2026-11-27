// Handler dokumen transaksi Rilis 1: Jurnal Umum, Terima Uang, Kirim Uang, Transfer Uang.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { INTER_UNIT_ACCOUNTS } from "../lib/seedData.js";
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
import { cleanText, invalid, isInt, newId, requireIsoDate, requireUnitKode } from "../lib/validate.js";
import { buildReversalsForDocumentChange } from "../lib/openingReversal.js";
import { deleteTransactionDoc } from "./salesPurchase.js";

const DOC_TYPES_R1 = new Set(["journal", "receive_money", "send_money", "transfer_money"]);

export async function listDocuments(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const type = ctx.url.searchParams.get("type") || "";
  const unitKode = ctx.url.searchParams.get("unit_kode") || "";
  const dari = ctx.url.searchParams.get("dari") || "";
  const sampai = ctx.url.searchParams.get("sampai") || "";
  const q = cleanText(ctx.url.searchParams.get("q") || "", 100);
  const limit = Math.min(200, Math.max(10, Number(ctx.url.searchParams.get("limit") || 50)));
  const offset = Math.max(0, Number(ctx.url.searchParams.get("offset") || 0));

  const conds = ["d.deleted_at IS NULL", "d.type NOT IN ('opening_balance_reversal')"];
  const params = [];
  if (type) {
    conds.push("d.type = ?");
    params.push(type);
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
    conds.push("(d.no LIKE ? OR d.memo LIKE ? OR IFNULL(c.nama_tampilan, '') LIKE ?)");
    const pat = `%${q}%`;
    params.push(pat, pat, pat);
  }

  const sql = `
    SELECT d.*, c.nama_tampilan AS contact_nama, u.nama AS unit_nama
    FROM documents d
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN units u ON u.kode = d.unit_kode
    WHERE ${conds.join(" AND ")}
    ORDER BY d.tanggal DESC, d.created_at DESC
    LIMIT ? OFFSET ?`;
  const { results } = await db.prepare(sql).bind(...params, limit, offset).all();
  return { documents: results };
}

export async function getDocument(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);
  const id = ctx.params[0];

  const doc = await db
    .prepare(
      `SELECT d.*, c.nama_tampilan AS contact_nama, u.nama AS unit_nama
       FROM documents d
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN units u ON u.kode = d.unit_kode
       WHERE d.id = ? AND d.deleted_at IS NULL`,
    )
    .bind(id)
    .first();
  if (!doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");

  const [{ results: lines }, { results: tags }, { results: withholdings }, { results: journal }, { results: attachments }, maxLocked] =
    await Promise.all([
      db
        .prepare(
          `SELECT dl.*, a.nama AS account_nama, t.nama AS tax_nama
           FROM document_lines dl
           LEFT JOIN accounts a ON a.kode = dl.account_kode
           LEFT JOIN taxes t ON t.id = dl.tax_id
           WHERE dl.document_id = ?
           ORDER BY dl.seq`,
        )
        .bind(id)
        .all(),
      db
        .prepare("SELECT tg.id, tg.nama FROM document_tags dt JOIN tags tg ON tg.id = dt.tag_id WHERE dt.document_id = ?")
        .bind(id)
        .all(),
      db
        .prepare("SELECT w.*, a.nama AS account_nama FROM withholdings w LEFT JOIN accounts a ON a.kode = w.account_kode WHERE w.document_id = ?")
        .bind(id)
        .all(),
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
      db.prepare("SELECT id, filename, mime, size, created_at FROM attachments WHERE document_id = ?").bind(id).all(),
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
    attachments,
  };
}

export async function getDocumentJournal(ctx) {
  const res = await getDocument(ctx);
  return { document: res.document, journal: res.journal };
}

export async function createDocument(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  return upsertDocument(db, { body, existingDoc: null, actor, now });
}

export async function updateDocument(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const id = ctx.params[0];
  const existingDoc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existingDoc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");
  if (!DOC_TYPES_R1.has(existingDoc.type)) {
    throw new KeuanganError("TIDAK_DIDUKUNG", 400, "Tipe dokumen ini tidak dapat diubah lewat endpoint ini.");
  }

  const recon = await db.prepare("SELECT 1 FROM reconciliation_matches WHERE document_id = ? LIMIT 1").bind(id).first();
  if (recon) throw new KeuanganError("SUDAH_DIREKONSILIASI", 400, "Transaksi yang sudah direkonsiliasi tidak dapat diubah.");

  const body = await readJson(ctx.request);
  return upsertDocument(db, { body: { ...body, type: existingDoc.type }, existingDoc, actor, now });
}

export async function deleteDocument(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const id = ctx.params[0];

  const existing = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existing) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");
  if (existing.type === "closing" || existing.type === "closing_tax" || existing.type === "opening_balance" || existing.type === "opening_balance_reversal") {
    throw new KeuanganError("TIDAK_BISA_HAPUS", 400, "Gunakan menu Tutup Buku atau Saldo Awal untuk menghapus atau membatalkan dokumen ini.");
  }
  if (!DOC_TYPES_R1.has(existing.type)) {
    return deleteTransactionDoc(db, existing, actor, now);
  }

  await assertNotLocked(db, [existing.tanggal]);

  const recon = await db.prepare("SELECT 1 FROM reconciliation_matches WHERE document_id = ? LIMIT 1").bind(id).first();
  if (recon) throw new KeuanganError("SUDAH_DIREKONSILIASI", 400, "Transaksi yang sudah direkonsiliasi tidak dapat dihapus.");

  const child = await db
    .prepare("SELECT 1 FROM document_links WHERE to_id = ? OR from_id = ? LIMIT 1")
    .bind(id, id)
    .first();
  if (child) throw new KeuanganError("PUNYA_TURUNAN", 400, "Dokumen yang memiliki pembayaran/turunan tidak bisa dihapus.");

  const { results: oldLines } = await db.prepare("SELECT * FROM document_lines WHERE document_id = ?").bind(id).all();
  const { results: oldJournal } = await db.prepare("SELECT * FROM journal_lines WHERE document_id = ?").bind(id).all();

  const stmts = [
    ...(await buildJournalAndMonthlyStatements(db, id, [])),
    db.prepare("DELETE FROM document_lines WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM document_tags WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM withholdings WHERE document_id = ?").bind(id),
    db.prepare("DELETE FROM documents WHERE id = ?").bind(id),
    buildAuditStatement(db, {
      entity: "document",
      entityId: id,
      action: "delete",
      before: { document: existing, lines: oldLines, journal: oldJournal },
      actor,
      now,
    }),
    ...(await buildReversalsForDocumentChange(db, { docId: id, oldLines: oldJournal, newLines: [], now, actor })),
  ];

  await db.batch(stmts);
  return { ok: true };
}

export async function importJournalBatch(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) throw invalid("rows", "Minimal satu baris jurnal untuk diimpor.");

  // Kelompokkan per nomor transaksi
  const groups = new Map();
  for (const r of rows) {
    const no = cleanText(r.no, 60);
    if (!no) throw invalid("no", "Setiap baris impor wajib memiliki nomor transaksi.");
    const list = groups.get(no) || [];
    list.push(r);
    groups.set(no, list);
  }

  const created = [];
  for (const [no, groupRows] of groups.entries()) {
    const first = groupRows[0];
    const docBody = {
      type: "journal",
      no,
      tanggal: first.tanggal,
      unit_kode: first.unit_kode,
      memo: first.memo || "",
      tags: first.tags || [],
      lines: groupRows.map((g) => ({
        account_kode: g.account_kode,
        deskripsi: g.deskripsi || "",
        unit_kode: g.unit_kode,
        debit: Number(g.debit || 0),
        kredit: Number(g.kredit || 0),
      })),
    };
    const res = await upsertDocument(db, { body: docBody, existingDoc: null, actor, now });
    created.push(res.document);
  }
  return { imported: created.length, documents: created };
}

// ─── Builder Inti per Jenis Dokumen ───────────────────────────────────────────

export async function upsertDocument(db, { body, existingDoc, actor, now }) {
  const type = body.type;
  if (!DOC_TYPES_R1.has(type)) throw invalid("type", `Tipe dokumen "${type}" tidak didukung.`);

  const tanggal = requireIsoDate(body.tanggal, "tanggal");
  await assertNotLocked(db, [tanggal, existingDoc?.tanggal]);

  const { results: accList } = await db.prepare("SELECT * FROM accounts").all();
  const accountsByKode = new Map(accList.map((a) => [a.kode, a]));
  const { results: unitList } = await db.prepare("SELECT * FROM units").all();
  const unitsByKode = new Map(unitList.map((u) => [u.kode, u]));
  const taxes = await loadTaxesWithItems(db);
  const taxesById = new Map(taxes.map((t) => [t.id, t]));

  const assertUnitValid = (uKode, field = "unit_kode") => {
    const clean = requireUnitKode(uKode, field);
    const u = unitsByKode.get(clean);
    if (!u || !u.aktif) throw invalid(field, `Anak perusahaan ${clean} tidak ditemukan atau tidak aktif.`);
    return clean;
  };

  const assertAccountUsable = (kode, field, { allowSystem = false } = {}) => {
    const acc = accountsByKode.get(kode);
    if (!acc) throw invalid(field, `Akun ${kode} tidak ditemukan.`);
    if (acc.is_header) throw invalid(field, `Akun header ${kode} tidak boleh dipakai transaksi.`);
    if (acc.arsip) throw invalid(field, `Akun ${kode} sudah diarsipkan.`);
    if (!allowSystem && (acc.sistem === 1 || kode === INTER_UNIT_ACCOUNTS.PIUTANG || kode === INTER_UNIT_ACCOUNTS.HUTANG)) {
      throw invalid(field, `Akun sistem ${kode} hanya diisi otomatis oleh Transfer Antar Unit.`);
    }
    return acc;
  };

  let unitKode;
  let contactId = body.contact_id ? String(body.contact_id) : null;
  if (contactId) {
    const c = await db.prepare("SELECT id FROM contacts WHERE id = ?").bind(contactId).first();
    if (!c) throw invalid("contact_id", "Kontak tidak ditemukan.");
  }

  let docLines = [];
  let journalRaw = [];
  let withholdingRows = [];
  let subtotal = 0;
  let pajak = 0;
  let pemotongan = 0;
  let total = 0;
  let dataJson = {};
  const hargaTermasukPajak = body.harga_termasuk_pajak ? 1 : 0;

  if (type === "journal") {
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length < 2) throw invalid("lines", "Jurnal umum minimal memiliki 2 baris.");
    let prevUnit = body.unit_kode ? assertUnitValid(body.unit_kode) : null;

    for (const [i, row] of rawLines.entries()) {
      const acc = assertAccountUsable(row.account_kode, "account_kode");
      const lineUnit = row.unit_kode ? assertUnitValid(row.unit_kode, "unit_kode") : prevUnit;
      if (!lineUnit) throw invalid("unit_kode", `Baris ${i + 1}: anak perusahaan wajib diisi.`, i);
      prevUnit = lineUnit;

      // Jika akun Kas & Bank milik unit tertentu, baris harus memakai unit pemiliknya
      if ((acc.kategori === 3 || acc.kategori === 9) && acc.unit_kode && acc.unit_kode !== lineUnit) {
        throw invalid("unit_kode", `Akun ${acc.kode} milik unit ${acc.unit_kode}, tidak dapat dipakai di unit ${lineUnit}.`, i);
      }

      const debit = Number(row.debit ?? 0);
      const kredit = Number(row.kredit ?? 0);
      if (!isInt(debit, { min: 0 }) || !isInt(kredit, { min: 0 }) || (debit > 0 && kredit > 0) || (debit === 0 && kredit === 0)) {
        throw invalid("lines", `Baris ${i + 1}: isi Debit atau Kredit bernilai positif.`, i);
      }

      const deskripsi = cleanText(row.deskripsi, 300);
      docLines.push({
        account_kode: acc.kode,
        deskripsi,
        qty_milli: 1000,
        harga: debit > 0 ? debit : -kredit,
        jumlah: debit > 0 ? debit : -kredit,
        tax_id: null,
        tax_amount: 0,
        unit_kode: lineUnit,
      });
      journalRaw.push({
        tanggal,
        unit_kode: lineUnit,
        account_kode: acc.kode,
        debit,
        kredit,
        contact_id: contactId,
        keterangan: deskripsi || cleanText(body.memo, 300) || "Jurnal Umum",
      });
      total += debit;
    }
    unitKode = prevUnit || docLines[0].unit_kode;
    subtotal = total;
  } else if (type === "receive_money" || type === "send_money") {
    const isReceive = type === "receive_money";
    const cashField = isReceive ? "setor_ke" : "bayar_dari";
    const cashKode = body[cashField];
    if (!cashKode) throw invalid(cashField, `Akun ${isReceive ? "Setor Ke" : "Bayar Dari"} wajib dipilih.`);
    const cashAcc = assertAccountUsable(cashKode, cashField);
    if (cashAcc.kategori !== 3 && cashAcc.kategori !== 9) {
      throw invalid(cashField, `Akun ${cashAcc.kode} bukan kategori Kas & Bank / Kartu Kredit.`);
    }

    unitKode = cashAcc.unit_kode ? assertUnitValid(cashAcc.unit_kode) : assertUnitValid(body.unit_kode);
    if (cashAcc.unit_kode && body.unit_kode && requireUnitKode(body.unit_kode) !== cashAcc.unit_kode) {
      throw invalid("unit_kode", `Akun ${cashAcc.nama} hanya untuk anak perusahaan ${cashAcc.unit_kode}.`);
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const expAllocs = !isReceive && Array.isArray(body.expense_allocations) ? body.expense_allocations : [];
    if (rawLines.length === 0 && expAllocs.length === 0) throw invalid("lines", "Minimal harus ada 1 baris transaksi.");

    let dppNilaiLainTotal = 0;
    const taxAgg = new Map();

    // Mode Pengeluaran (Kirim Uang untuk melunasi Biaya Bayar Nanti)
    for (const [i, ex] of expAllocs.entries()) {
      const target = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(ex.document_id).first();
      if (!target || target.type !== "expense") throw invalid("expense_allocations", `Baris ${i + 1}: dokumen biaya tidak ditemukan.`, i);
      const amt = Number(ex.amount);
      if (!isInt(amt, { min: 1 }) || amt > target.sisa) {
        throw invalid("expense_allocations", `Baris ${i + 1}: nominal pembayaran melebihi sisa biaya.`, i);
      }
      subtotal += amt;
      docLines.push({
        account_kode: "2-20300",
        deskripsi: `Pembayaran biaya ${target.no}`,
        qty_milli: 1000,
        harga: amt,
        jumlah: amt,
        tax_id: null,
        tax_amount: 0,
        unit_kode: target.unit_kode || unitKode,
        source_line_id: target.id,
        _expenseTarget: target,
      });
      journalRaw.push({
        tanggal,
        unit_kode: target.unit_kode || unitKode,
        account_kode: "2-20300",
        debit: amt,
        kredit: 0,
        contact_id: target.contact_id || contactId,
        keterangan: `Pelunasan biaya ${target.no}`,
      });
    }

    for (const [i, row] of rawLines.entries()) {
      const acc = assertAccountUsable(row.account_kode, "account_kode");
      if (acc.kategori === 3) {
        throw invalid("account_kode", `Baris ${i + 1}: akun kategori Kas & Bank tidak boleh menjadi akun lawan. Gunakan Transfer Uang.`, i);
      }
      const rawAmount = Number(row.jumlah);
      if (!isInt(rawAmount, { min: 1 })) {
        throw invalid("jumlah", `Baris ${i + 1}: jumlah harus lebih dari 0.`, i);
      }
      const taxObj = row.tax_id ? taxesById.get(row.tax_id) : null;
      if (row.tax_id && !taxObj) throw invalid("tax_id", `Baris ${i + 1}: pajak tidak ditemukan.`, i);

      const calc = calculateLineTaxes({
        rawAmount,
        taxes: taxObj ? [taxObj] : [],
        hargaTermasukPajak: Boolean(hargaTermasukPajak),
      });

      subtotal += calc.dpp;
      pajak += calc.taxTotal;
      dppNilaiLainTotal += calc.dppNilaiLain;

      const deskripsi = cleanText(row.deskripsi, 300);
      docLines.push({
        account_kode: acc.kode,
        deskripsi,
        qty_milli: 1000,
        harga: calc.dpp,
        jumlah: calc.dpp,
        tax_id: row.tax_id || null,
        tax_amount: calc.taxTotal,
        unit_kode: unitKode,
      });

      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: acc.kode,
        debit: isReceive ? 0 : calc.dpp,
        kredit: isReceive ? calc.dpp : 0,
        contact_id: contactId,
        keterangan: deskripsi || cleanText(body.memo, 300) || (isReceive ? "Terima Uang" : "Kirim Uang"),
      });

      for (const p of calc.parts) {
        if (p.amount === 0) continue;
        const taxAccount = isReceive ? p.akunJual : p.akunBeli;
        if (!taxAccount) throw invalid("tax_id", `Akun pajak untuk ${p.nama} belum diatur.`);
        const cur = taxAgg.get(taxAccount) || 0;
        taxAgg.set(taxAccount, cur + p.amount);
      }
    }

    for (const [taxAcc, netAmt] of taxAgg.entries()) {
      if (netAmt === 0) continue;
      // Terima Uang: pajak positif = Kredit (negatif/pemotongan = Debit).
      // Kirim Uang: pajak positif = Debit (negatif/pemotongan = Kredit).
      const isDebit = isReceive ? netAmt < 0 : netAmt > 0;
      const absAmt = Math.abs(netAmt);
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: taxAcc,
        debit: isDebit ? absAmt : 0,
        kredit: isDebit ? 0 : absAmt,
        contact_id: contactId,
        keterangan: "Pajak transaksi",
      });
    }

    // Pemotongan (khusus Kirim Uang)
    if (!isReceive && Array.isArray(body.withholdings)) {
      for (const w of body.withholdings) {
        if (!w || (!w.nilai && !w.amount)) continue;
        const wAcc = assertAccountUsable(w.account_kode, "withholding_account");
        const mode = w.mode === "persen" ? "persen" : "nominal";
        const nilai = Number(w.nilai ?? w.amount ?? 0);
        if (!isInt(nilai, { min: 0 })) throw invalid("withholdings", "Nilai pemotongan tidak valid.");
        const amt = mode === "persen" ? Math.round((subtotal * nilai) / 10_000) : nilai;
        if (amt <= 0) continue;
        pemotongan += amt;
        withholdingRows.push({ account_kode: wAcc.kode, mode, nilai, amount: amt });
        journalRaw.push({
          tanggal,
          unit_kode: unitKode,
          account_kode: wAcc.kode,
          debit: 0,
          kredit: amt,
          contact_id: contactId,
          keterangan: `Pemotongan (${wAcc.nama})`,
        });
      }
    }

    total = subtotal + pajak;
    const cashNet = total - pemotongan;
    if (cashNet < 0) throw invalid("withholdings", "Pemotongan tidak boleh melebihi total tagihan.");

    if (cashNet > 0) {
      journalRaw.push({
        tanggal,
        unit_kode: unitKode,
        account_kode: cashAcc.kode,
        debit: isReceive ? cashNet : 0,
        kredit: isReceive ? 0 : cashNet,
        contact_id: contactId,
        keterangan: cleanText(body.memo, 300) || (isReceive ? "Terima Uang" : "Kirim Uang"),
      });
    }

    dataJson = {
      [cashField]: cashAcc.kode,
      dpp_nilai_lain: dppNilaiLainTotal,
    };
  } else if (type === "transfer_money") {
    const fromKode = body.transfer_dari;
    const toKode = body.setor_ke;
    if (!fromKode || !toKode) throw invalid("transfer_dari", "Akun Transfer Dari dan Setor Ke wajib dipilih.");
    if (fromKode === toKode) throw invalid("setor_ke", "Akun asal dan akun tujuan transfer harus berbeda.");

    const fromAcc = assertAccountUsable(fromKode, "transfer_dari");
    const toAcc = assertAccountUsable(toKode, "setor_ke");
    if ((fromAcc.kategori !== 3 && fromAcc.kategori !== 9) || (toAcc.kategori !== 3 && toAcc.kategori !== 9)) {
      throw invalid("transfer_dari", "Transfer uang hanya berlaku antara akun kategori Kas & Bank / Kartu Kredit.");
    }

    const jumlah = Number(body.jumlah);
    if (!isInt(jumlah, { min: 1 })) throw invalid("jumlah", "Jumlah transfer harus lebih dari 0.");

    const unitAsal = fromAcc.unit_kode ? assertUnitValid(fromAcc.unit_kode) : assertUnitValid(body.unit_asal || body.unit_kode, "unit_asal");
    const unitTujuan = toAcc.unit_kode ? assertUnitValid(toAcc.unit_kode) : assertUnitValid(body.unit_tujuan || body.unit_kode, "unit_tujuan");

    unitKode = unitAsal;
    subtotal = jumlah;
    total = jumlah;
    const antarUnit = unitAsal !== unitTujuan;

    docLines = [
      { account_kode: fromAcc.kode, deskripsi: `Transfer dari ${fromAcc.nama}`, qty_milli: 1000, harga: jumlah, jumlah, tax_id: null, tax_amount: 0, unit_kode: unitAsal },
      { account_kode: toAcc.kode, deskripsi: `Setor ke ${toAcc.nama}`, qty_milli: 1000, harga: jumlah, jumlah, tax_id: null, tax_amount: 0, unit_kode: unitTujuan },
    ];

    const memoText = cleanText(body.memo, 300) || (antarUnit ? `Transfer antar unit: ${unitAsal} → ${unitTujuan}` : `Transfer ${fromAcc.nama} → ${toAcc.nama}`);

    if (!antarUnit) {
      journalRaw = [
        { tanggal, unit_kode: unitAsal, account_kode: toAcc.kode, debit: jumlah, kredit: 0, keterangan: memoText },
        { tanggal, unit_kode: unitAsal, account_kode: fromAcc.kode, debit: 0, kredit: jumlah, keterangan: memoText },
      ];
    } else {
      // 4 baris jurnal sesuai PRD 02-kas-bank.md & 09-teknis.md
      journalRaw = [
        { tanggal, unit_kode: unitAsal, account_kode: INTER_UNIT_ACCOUNTS.PIUTANG, debit: jumlah, kredit: 0, keterangan: memoText },
        { tanggal, unit_kode: unitAsal, account_kode: fromAcc.kode, debit: 0, kredit: jumlah, keterangan: memoText },
        { tanggal, unit_kode: unitTujuan, account_kode: toAcc.kode, debit: jumlah, kredit: 0, keterangan: memoText },
        { tanggal, unit_kode: unitTujuan, account_kode: INTER_UNIT_ACCOUNTS.HUTANG, debit: 0, kredit: jumlah, keterangan: memoText },
      ];
    }

    dataJson = {
      transfer_dari: fromAcc.kode,
      setor_ke: toAcc.kode,
      unit_asal: unitAsal,
      unit_tujuan: unitTujuan,
      antar_unit: antarUnit,
    };
  }

  const balancedJournal = normalizeAndCheckBalance(journalRaw);
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
    const dupNo = await db
      .prepare("SELECT id FROM documents WHERE type = ? AND no = ? AND id != ? AND deleted_at IS NULL")
      .bind(type, docNo, docId)
      .first();
    if (dupNo) throw new KeuanganError("DUPLIKAT", 409, `Nomor transaksi "${docNo}" sudah digunakan.`);
  }

  const memo = cleanText(body.memo, 1000);
  const stmts = [];
  if (numberingStmt) stmts.push(numberingStmt);

  if (existingDoc) {
    stmts.push(
      db
        .prepare(
          `UPDATE documents SET tanggal = ?, no = ?, unit_kode = ?, contact_id = ?, harga_termasuk_pajak = ?,
            subtotal = ?, diskon = 0, pajak = ?, ongkir = 0, pemotongan = ?, total = ?, sisa = 0,
            memo = ?, data_json = ?, updated_at = ?, updated_by = ?
           WHERE id = ?`,
        )
        .bind(
          tanggal, docNo, unitKode, contactId, hargaTermasukPajak,
          subtotal, pajak, pemotongan, total,
          memo, JSON.stringify(dataJson), now, actor.uid, docId,
        ),
      db.prepare("DELETE FROM document_lines WHERE document_id = ?").bind(docId),
      db.prepare("DELETE FROM document_tags WHERE document_id = ?").bind(docId),
      db.prepare("DELETE FROM withholdings WHERE document_id = ?").bind(docId),
    );
  } else {
    stmts.push(
      db
        .prepare(
          `INSERT INTO documents (id, type, no, tanggal, unit_kode, contact_id, status, harga_termasuk_pajak,
            subtotal, diskon, pajak, ongkir, pemotongan, total, sisa, memo, data_json,
            created_at, created_by, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 'selesai', ?, ?, 0, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          docId, type, docNo, tanggal, unitKode, contactId, hargaTermasukPajak,
          subtotal, pajak, pemotongan, total, memo, JSON.stringify(dataJson),
          now, actor.uid, now, actor.uid,
        ),
    );
  }

  for (const [idx, l] of docLines.entries()) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO document_lines (id, document_id, seq, account_kode, deskripsi, qty_milli, harga, tax_id, jumlah, tax_amount, unit_kode, source_line_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(newId(), docId, idx + 1, l.account_kode, l.deskripsi, l.qty_milli, l.harga, l.tax_id, l.jumlah, l.tax_amount, l.unit_kode, l.source_line_id || null),
    );
    if (l._expenseTarget) {
      const newSisa = l._expenseTarget.sisa - l.jumlah;
      stmts.push(
        db
          .prepare("UPDATE documents SET sisa = ?, status = ? WHERE id = ?")
          .bind(newSisa, newSisa === 0 ? "lunas" : "sebagian", l._expenseTarget.id),
        db
          .prepare("INSERT OR REPLACE INTO document_links (from_id, to_id, amount, kind) VALUES (?, ?, ?, 'payment_to_invoice')")
          .bind(docId, l._expenseTarget.id, l.jumlah),
      );
    }
  }

  for (const w of withholdingRows) {
    stmts.push(
      db
        .prepare("INSERT INTO withholdings (id, document_id, account_kode, mode, nilai, amount) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId(), docId, w.account_kode, w.mode, w.nilai, w.amount),
    );
  }

  if (Array.isArray(body.tags)) {
    const tagIds = [...new Set(body.tags.filter(Boolean).map(String))];
    for (const tagId of tagIds) {
      stmts.push(db.prepare("INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)").bind(docId, tagId));
    }
  }

  // Lampiran yang sudah diupload sebelumnya dapat ditautkan ke dokumen ini
  if (Array.isArray(body.attachment_ids)) {
    const attIds = [...new Set(body.attachment_ids.filter(Boolean).map(String))];
    for (const attId of attIds) {
      const att = await db.prepare("SELECT id, document_id FROM attachments WHERE id = ?").bind(attId).first();
      if (!att) throw invalid("attachment_ids", `Lampiran ${attId} tidak ditemukan.`);
      if (att.document_id && att.document_id !== docId) {
        throw invalid("attachment_ids", "Lampiran ini sudah dipakai di dokumen lain.");
      }
      stmts.push(
        db
          .prepare("UPDATE attachments SET document_id = ? WHERE id = ? AND (document_id IS NULL OR document_id = ?)")
          .bind(docId, attId, docId),
      );
    }
  }

  let oldJournal = [];
  let oldDocLines = [];
  if (existingDoc) {
    ({ results: oldJournal } = await db.prepare("SELECT * FROM journal_lines WHERE document_id = ?").bind(docId).all());
    ({ results: oldDocLines } = await db.prepare("SELECT * FROM document_lines WHERE document_id = ?").bind(docId).all());
  }

  stmts.push(...(await buildJournalAndMonthlyStatements(db, docId, balancedJournal)));
  stmts.push(...(await buildReversalsForDocumentChange(db, { docId, oldLines: oldJournal, newLines: balancedJournal, now, actor })));
  stmts.push(
    buildAuditStatement(db, {
      entity: "document",
      entityId: docId,
      action: existingDoc ? "update" : "create",
      before: existingDoc ? { document: existingDoc, lines: oldDocLines, journal: oldJournal } : null,
      after: { type, no: docNo, tanggal, unit_kode: unitKode, total },
      actor,
      now,
    }),
  );

  await db.batch(stmts);
  return getDocument({ env: { DB: db }, deps: { verifyToken: async () => ({ uid: actor.uid }), getUserProfile: async () => actor, now: () => now }, request: { headers: new Headers({ authorization: "Bearer ok" }) }, params: [docId] });
}
