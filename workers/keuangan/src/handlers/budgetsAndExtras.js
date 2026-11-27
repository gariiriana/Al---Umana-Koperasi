// Handler Rilis 3: Anggaran + Anggaran Laba Rugi, Persetujuan (Approval Rules & Workflow, default MATI),
// Laporan Pajak + Ekspor CSV DJP, Dasbor Kustom & Notifikasi.
import { KeuanganError, readJson } from "../http.js";
import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { assertNotLocked } from "../lib/ledger.js";
import { cleanText, invalid, isInt, newId, requireIsoDate, requireUnitKode, todayWib } from "../lib/validate.js";
import { upsertTransactionDoc } from "./salesPurchase.js";

function addMonthsYm(ym, offset) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + offset, 1));
  return dt.toISOString().slice(0, 7);
}

// ─── Manajemen Anggaran & Laporan Anggaran Laba Rugi ──────────────────────────

export async function listBudgets(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM budgets ORDER BY mulai DESC, nama").all();
  return { budgets: results };
}

export async function getBudget(ctx) {
  await requireKeuangan(ctx);
  const id = ctx.params[0];
  const budget = await ctx.env.DB.prepare("SELECT * FROM budgets WHERE id = ?").bind(id).first();
  if (!budget) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Anggaran tidak ditemukan.");
  const { results: lines } = await ctx.env.DB
    .prepare("SELECT bl.*, a.nama AS account_nama, a.kategori FROM budget_lines bl JOIN accounts a ON a.kode = bl.account_kode WHERE bl.budget_id = ? ORDER BY bl.account_kode, bl.bulan")
    .bind(id)
    .all();
  return { budget, lines };
}

export async function saveBudget(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  await ensureSeeded(db, now, actor.uid);

  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 120);
  if (!nama) throw invalid("nama", "Nama anggaran wajib diisi.");
  const unitKode = requireUnitKode(body.unit_kode, "unit_kode");
  const mulai = String(body.mulai || todayWib(now).slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(mulai)) throw invalid("mulai", "Bulan mulai anggaran harus YYYY-MM.");
  const jumlahPeriode = Math.min(24, Math.max(1, Number(body.jumlah_periode || 12)));
  const id = body.id ? String(body.id) : newId();

  const stmts = [
    db
      .prepare(
        `INSERT INTO budgets (id, nama, unit_kode, mulai, jumlah_periode, memo, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, unit_kode = excluded.unit_kode, mulai = excluded.mulai, jumlah_periode = excluded.jumlah_periode, memo = excluded.memo, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(id, nama, unitKode, mulai, jumlahPeriode, cleanText(body.memo, 400), now, actor.uid, now, actor.uid),
    db.prepare("DELETE FROM budget_lines WHERE budget_id = ?").bind(id),
  ];

  for (const row of Array.isArray(body.lines) ? body.lines : []) {
    const val = Math.trunc(Number(row.nilai || 0));
    if (!row.account_kode || !row.bulan) continue;
    stmts.push(
      db.prepare("INSERT OR REPLACE INTO budget_lines (budget_id, account_kode, bulan, nilai) VALUES (?, ?, ?, ?)").bind(id, row.account_kode, row.bulan, val),
    );
  }
  await db.batch(stmts);
  return getBudget({ ...ctx, params: [id] });
}

export async function deleteBudget(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM budgets WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function reportAnggaranLabaRugi(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const budgetId = ctx.url.searchParams.get("budget_id") || "";
  const budget = budgetId
    ? await db.prepare("SELECT * FROM budgets WHERE id = ?").bind(budgetId).first()
    : await db.prepare("SELECT * FROM budgets ORDER BY mulai DESC LIMIT 1").first();
  if (!budget) return { budget: null, months: [], rows: [] };

  const months = Array.from({ length: budget.jumlah_periode }, (_, i) => addMonthsYm(budget.mulai, i));
  const [{ results: bLines }, { results: actuals }, { results: accs }] = await Promise.all([
    db.prepare("SELECT * FROM budget_lines WHERE budget_id = ?").bind(budget.id).all(),
    db
      .prepare(
        `SELECT sb.account_kode, sb.bulan, SUM(sb.kredit - sb.debit) AS net_kredit
         FROM saldo_bulanan sb
         WHERE sb.unit_kode = ? AND sb.bulan >= ? AND sb.bulan <= ?
         GROUP BY sb.account_kode, sb.bulan`,
      )
      .bind(budget.unit_kode, months[0], months[months.length - 1])
      .all(),
    db.prepare("SELECT kode, nama, kategori FROM accounts WHERE kategori IN (13, 14, 15, 16, 17) AND is_header = 0 ORDER BY kode").all(),
  ]);

  const bMap = new Map(bLines.map((l) => [`${l.account_kode}|${l.bulan}`, l.nilai]));
  const aMap = new Map(actuals.map((a) => [`${a.account_kode}|${a.bulan}`, a.net_kredit]));

  const rows = [];
  for (const a of accs) {
    const isIncome = a.kategori === 13 || a.kategori === 14;
    let totalAnggaran = 0;
    let totalAktual = 0;
    for (const m of months) {
      totalAnggaran += bMap.get(`${a.kode}|${m}`) || 0;
      const raw = aMap.get(`${a.kode}|${m}`) || 0;
      totalAktual += isIncome ? raw : -raw;
    }
    if (totalAnggaran === 0 && totalAktual === 0) continue;
    rows.push({
      kode: a.kode,
      nama: a.nama,
      kategori: a.kategori,
      anggaran: totalAnggaran,
      aktual: totalAktual,
      selisih: totalAktual - totalAnggaran,
      persen: totalAnggaran > 0 ? Math.round((totalAktual * 10000) / totalAnggaran) / 100 : null,
    });
  }
  return { budget, months, rows };
}

// ─── Persetujuan (Approval Rules & Decision Flow) ────────────────────────────

export async function listApprovalRules(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM approval_rules ORDER BY tipe").all();
  return {
    rules: results.map((r) => ({ ...r, kriteria: JSON.parse(r.kriteria_json || "{}"), tahap: JSON.parse(r.tahap_json || "[]") })),
  };
}

function normalizeApprovalStages(rawTahap) {
  const arr = Array.isArray(rawTahap) ? rawTahap : [];
  if (arr.length === 0 || arr.length > 4) {
    throw invalid("tahap", "Aturan persetujuan harus memiliki 1 sampai maksimal 4 tahap.");
  }
  return arr.map((st, idx) => {
    const rawTipe = String(st?.tipe || "satu").toLowerCase();
    const tipe = rawTipe === "semua" || rawTipe === "semua_harus_setuju" ? "semua" : "satu";
    const uids = [...new Set((Array.isArray(st?.approver_uids) ? st.approver_uids : []).map((u) => String(u || "").trim()).filter(Boolean))];
    if (uids.length === 0) {
      throw invalid("tahap", `Tahap ${idx + 1}: minimal 1 penyetuju (UID akun keuangan) wajib dipilih.`);
    }
    return {
      nama: cleanText(st?.nama || `Tahap ${idx + 1}`, 80),
      tipe,
      approver_uids: uids,
    };
  });
}

function resolveStageProgress(stages, approvalRows) {
  const byStage = new Map();
  for (const r of approvalRows) {
    const map = byStage.get(r.tahap) || new Map();
    map.set(r.user_uid, r.keputusan);
    byStage.set(r.tahap, map);
  }
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const votes = byStage.get(i + 1) || new Map();
    const approvedCount = st.approver_uids.filter((u) => votes.get(u) === "approve").length;
    const done = st.tipe === "semua" ? approvedCount >= st.approver_uids.length : approvedCount >= 1;
    if (!done) {
      return { allDone: false, currentStageNumber: i + 1, currentStage: st };
    }
  }
  return { allDone: true, currentStageNumber: stages.length, currentStage: null };
}

export async function saveApprovalRule(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const tipe = cleanText(body.tipe, 50);
  if (!tipe) throw invalid("tipe", "Tipe dokumen wajib dipilih.");
  const stages = normalizeApprovalStages(body.tahap);
  const id = body.id ? String(body.id) : newId();

  await db
    .prepare(
      `INSERT INTO approval_rules (id, tipe, kriteria_json, tahap_json, penerapan, aktif, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET tipe = excluded.tipe, kriteria_json = excluded.kriteria_json, tahap_json = excluded.tahap_json, penerapan = excluded.penerapan, aktif = excluded.aktif, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(
      id, tipe, JSON.stringify(body.kriteria || {}), JSON.stringify(stages),
      body.penerapan === 0 ? 0 : 1, body.aktif === 0 ? 0 : 1, now, actor.uid, now, actor.uid,
    )
    .run();
  const row = await db.prepare("SELECT * FROM approval_rules WHERE id = ?").bind(id).first();
  return { rule: row ? { ...row, kriteria: JSON.parse(row.kriteria_json || "{}"), tahap: JSON.parse(row.tahap_json || "[]") } : null };
}

export async function deleteApprovalRule(ctx) {
  await requireKeuangan(ctx);
  await ctx.env.DB.prepare("DELETE FROM approval_rules WHERE id = ?").bind(ctx.params[0]).run();
  return { ok: true };
}

export async function listPendingApprovals(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.type, d.no, d.tanggal, d.unit_kode, d.total, d.status, d.approval_state, d.created_by, d.data_json, c.nama_tampilan AS contact_nama
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.deleted_at IS NULL AND d.approval_state = 'pending'
       ORDER BY d.tanggal DESC, d.created_at DESC`,
    )
    .all();
  return {
    pending: results.map((r) => {
      const dj = JSON.parse(r.data_json || "{}");
      return { ...r, current_stage: dj.current_stage || 1, approval_rule_id: dj.approval_rule_id || null };
    }),
  };
}

export async function decideApproval(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const docId = ctx.params[0];

  const doc = await db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").bind(docId).first();
  if (!doc) throw new KeuanganError("TIDAK_DITEMUKAN", 404, "Dokumen tidak ditemukan.");
  if (doc.approval_state !== "pending") throw invalid("approval_state", "Dokumen ini tidak berstatus menunggu persetujuan.");
  if (doc.created_by === actor.uid) {
    throw new KeuanganError("FORBIDDEN", 403, "Pembuat dokumen tidak boleh menyetujui atau menolak dokumennya sendiri.");
  }

  await assertNotLocked(db, [doc.tanggal]);

  const dataJson = JSON.parse(doc.data_json || "{}");
  let rule = dataJson.approval_rule_id
    ? await db.prepare("SELECT * FROM approval_rules WHERE id = ?").bind(dataJson.approval_rule_id).first()
    : null;
  if (!rule) {
    rule = await db.prepare("SELECT * FROM approval_rules WHERE tipe = ? AND aktif = 1 ORDER BY created_at DESC LIMIT 1").bind(doc.type).first();
  }
  if (!rule) throw new KeuanganError("ATURAN_TIDAK_DITEMUKAN", 400, "Aturan persetujuan untuk dokumen ini tidak ditemukan.");

  const stages = normalizeApprovalStages(JSON.parse(rule.tahap_json || "[]"));
  const { results: existingVotes } = await db
    .prepare("SELECT tahap, user_uid, keputusan FROM approvals WHERE document_id = ?")
    .bind(docId)
    .all();

  const progress = resolveStageProgress(stages, existingVotes);
  if (progress.allDone || !progress.currentStage) {
    throw invalid("approval_state", "Seluruh tahap persetujuan sudah selesai.");
  }
  if (!progress.currentStage.approver_uids.includes(actor.uid)) {
    throw new KeuanganError(
      "FORBIDDEN",
      403,
      `Akun ${actor.uid} tidak terdaftar sebagai penyetuju pada tahap ${progress.currentStageNumber} (${progress.currentStage.nama}).`,
    );
  }

  const body = await readJson(ctx.request);
  const keputusan = body.keputusan === "reject" ? "reject" : "approve";
  const alasan = cleanText(body.alasan, 400);

  await db
    .prepare("INSERT OR REPLACE INTO approvals (document_id, tahap, user_uid, keputusan, alasan, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(docId, progress.currentStageNumber, actor.uid, keputusan, alasan, now)
    .run();

  if (keputusan === "reject") {
    await db
      .prepare("UPDATE documents SET approval_state = 'rejected', status = 'ditolak', updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(now, actor.uid, docId)
      .run();
    return { ok: true, approval_state: "rejected", tahap: progress.currentStageNumber };
  }

  // Evaluasi ulang progres setelah suara persetujuan dicatat
  const { results: updatedVotes } = await db
    .prepare("SELECT tahap, user_uid, keputusan FROM approvals WHERE document_id = ?")
    .bind(docId)
    .all();
  const after = resolveStageProgress(stages, updatedVotes);

  if (!after.allDone) {
    dataJson.current_stage = after.currentStageNumber;
    await db
      .prepare("UPDATE documents SET data_json = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(JSON.stringify(dataJson), now, actor.uid, docId)
      .run();
    return {
      ok: true,
      approval_state: "pending",
      current_stage: after.currentStageNumber,
      stage_completed: after.currentStageNumber > progress.currentStageNumber,
    };
  }

  // Tahap terakhir disetujui: terbitkan dokumen (jurnal + stok) menggunakan argumen internal forceApproved = true
  const { results: lines } = await db.prepare("SELECT * FROM document_lines WHERE document_id = ? ORDER BY seq").bind(docId).all();
  const { results: whs } = await db.prepare("SELECT * FROM withholdings WHERE document_id = ?").bind(docId).all();
  const { results: tags } = await db.prepare("SELECT tag_id FROM document_tags WHERE document_id = ?").bind(docId).all();

  return upsertTransactionDoc(db, {
    body: {
      type: doc.type,
      no: doc.no,
      tanggal: doc.tanggal,
      unit_kode: doc.unit_kode,
      contact_id: doc.contact_id,
      term_id: doc.term_id,
      jatuh_tempo: doc.jatuh_tempo,
      warehouse_id: doc.warehouse_id,
      currency: doc.currency,
      kurs: doc.kurs,
      harga_termasuk_pajak: doc.harga_termasuk_pajak,
      diskon: doc.diskon,
      ongkir: doc.ongkir,
      parent_id: doc.parent_id,
      no_faktur_pajak: doc.no_faktur_pajak,
      pesan: doc.pesan,
      memo: doc.memo,
      bayar_dari: dataJson.bayar_dari,
      setor_ke: dataJson.setor_ke,
      bayar_nanti: dataJson.bayar_nanti,
      tags: tags.map((t) => t.tag_id),
      withholdings: whs.map((w) => ({ account_kode: w.account_kode, mode: w.mode, nilai: w.nilai })),
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_kode: l.account_kode,
        deskripsi: l.deskripsi,
        qty_milli: l.qty_milli,
        satuan: l.satuan,
        harga: l.harga,
        diskon_bp: l.diskon_bp,
        tax_id: l.tax_id,
        jumlah: l.jumlah,
        source_line_id: l.source_line_id,
      })),
    },
    existingDoc: doc,
    actor,
    now,
    forceApproved: true,
  });
}

// ─── Tab Laporan Pajak & Ekspor CSV DJP ───────────────────────────────────────

export async function reportPajakPenjualan(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");
  const jenis = ctx.url.searchParams.get("jenis") === "pembelian" ? "purchase_invoice" : "sales_invoice";

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.id, d.no, d.no_faktur_pajak, d.tanggal, d.unit_kode, d.subtotal - d.diskon AS dpp, d.pajak, d.total,
              c.nama_tampilan AS contact_nama, c.npwp, c.nitku
       FROM documents d LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.deleted_at IS NULL AND d.type = ? AND d.tanggal >= ? AND d.tanggal <= ? AND d.pajak != 0
       ORDER BY d.tanggal ASC, d.no ASC`,
    )
    .bind(jenis, dari, sampai)
    .all();
  return { dari, sampai, rows: results };
}

export async function reportPajakPemotongan(ctx) {
  const actor = await requireKeuangan(ctx);
  await ensureSeeded(ctx.env.DB, ctx.deps.now(), actor.uid);
  const today = todayWib(ctx.deps.now());
  const dari = requireIsoDate(ctx.url.searchParams.get("dari") || `${today.slice(0, 8)}01`, "dari");
  const sampai = requireIsoDate(ctx.url.searchParams.get("sampai") || today, "sampai");

  const { results } = await ctx.env.DB
    .prepare(
      `SELECT d.no, d.tanggal, d.type, d.unit_kode, c.nama_tampilan AS contact_nama, c.npwp, w.account_kode, a.nama AS account_nama, w.amount
       FROM withholdings w
       JOIN documents d ON d.id = w.document_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN accounts a ON a.kode = w.account_kode
       WHERE d.deleted_at IS NULL AND d.tanggal >= ? AND d.tanggal <= ?
       ORDER BY d.tanggal ASC`,
    )
    .bind(dari, sampai)
    .all();
  return { dari, sampai, rows: results };
}

// ─── Dasbor Kustom & Notifikasi ───────────────────────────────────────────────

export async function saveDashboard(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  const now = ctx.deps.now();
  const body = await readJson(ctx.request);
  const nama = cleanText(body.nama, 100) || "Dasbor Utama";
  const id = body.id ? String(body.id) : newId();
  await db
    .prepare(
      `INSERT INTO dashboards (id, owner_uid, nama, default_flag, widgets_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, widgets_json = excluded.widgets_json, updated_at = excluded.updated_at`,
    )
    .bind(id, actor.uid, nama, body.default_flag ? 1 : 0, JSON.stringify(body.widgets || []), now, now)
    .run();
  return { dashboard: await db.prepare("SELECT * FROM dashboards WHERE id = ?").bind(id).first() };
}

export async function listNotifications(ctx) {
  await requireKeuangan(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM notifications ORDER BY at DESC LIMIT 30").all();
  return { notifications: results.map((n) => ({ ...n, payload: JSON.parse(n.payload_json || "{}") })) };
}

export async function markNotificationRead(ctx) {
  const actor = await requireKeuangan(ctx);
  const id = ctx.params[0];
  const n = await ctx.env.DB.prepare("SELECT read_by_json FROM notifications WHERE id = ?").bind(id).first();
  if (n) {
    const arr = new Set(JSON.parse(n.read_by_json || "[]"));
    arr.add(actor.uid);
    await ctx.env.DB.prepare("UPDATE notifications SET read_by_json = ? WHERE id = ?").bind(JSON.stringify([...arr]), id).run();
  }
  return { ok: true };
}
