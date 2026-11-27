/**
 * al-umana-keuangan: Worker Modul Keuangan Al-Umanaa di /api/keuangan/*.
 * Semua data di D1 (DB = "keuangan"); Firestore hanya dibaca untuk role users/{uid}.
 * Hanya role `keuangan` yang diizinkan (super_admin dan developer ditolak 403).
 */
import { verifyIdToken } from "./auth.js";
import { KeuanganError, corsHeaders, errorResponse, json } from "./http.js";
import { getUserProfile, listKeuanganUsers } from "./profile.js";
import { getMe } from "./handlers/me.js";
import {
  createAccount,
  createContact,
  createTag,
  createTagCategory,
  createTax,
  createUnit,
  deleteAccount,
  deleteContact,
  deleteContactGroup,
  deletePaymentMethod,
  deletePaymentTerm,
  deleteTag,
  deleteTagCategory,
  deleteTax,
  getAccountMapping,
  getContact,
  getNumbering,
  getSettings,
  importAccounts,
  listAccounts,
  listAudit,
  listContactGroups,
  listContacts,
  listExportsLog,
  listPaymentMethods,
  listPaymentTerms,
  listTags,
  listTaxes,
  listUnits,
  recordExportLog,
  resetAccounts,
  saveContactGroup,
  savePaymentMethod,
  savePaymentTerm,
  updateAccount,
  updateAccountMapping,
  updateContact,
  updateNumbering,
  updateSettings,
  updateTax,
  updateUnit,
} from "./handlers/master.js";
import { getOpeningBalance, putOpeningBalance } from "./handlers/openingBalance.js";
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentJournal,
  importJournalBatch,
  listDocuments,
  updateDocument,
} from "./handlers/documents.js";
import { getBku, listKasBank } from "./handlers/kasBank.js";
import {
  cancelPeriodClosing,
  createPeriodClosing,
  listPeriodClosings,
  previewClosing,
} from "./handlers/periodClosings.js";
import {
  deleteReportTemplate,
  listReportTemplates,
  reportArusKas,
  reportBukuBesar,
  reportJurnal,
  reportLabaRugi,
  reportNeraca,
  reportNeracaSaldo,
  reportPerubahanModal,
  reportRingkasanBisnis,
  saveReportTemplate,
} from "./handlers/reports.js";
import { deleteAttachment, downloadAttachment, uploadAttachment } from "./handlers/attachments.js";
import { createOrGetPublicLink, getPublicDocument, revokePublicLink } from "./handlers/publicLinks.js";
import {
  createProduct,
  createProductConversion,
  createStockAdjustment,
  createWarehouse,
  createWarehouseTransfer,
  deletePriceRule,
  deleteProduct,
  deleteProductCategory,
  deleteUnitOfMeasure,
  deleteWarehouse,
  getProduct,
  getRecalcStatus,
  importProducts,
  listPriceRules,
  listProductCategories,
  listProducts,
  listStockAdjustments,
  listUnitsOfMeasure,
  listWarehouseTransfers,
  listWarehouses,
  runRecalcNow,
  savePriceRule,
  saveProductCategory,
  saveUnitOfMeasure,
  updateProduct,
  updateWarehouse,
} from "./handlers/inventory.js";
import {
  createTransaction,
  deleteTransactionEndpoint,
  getTransaction,
  importTransactionsBatch,
  listTransactions,
  updateTransaction,
} from "./handlers/salesPurchase.js";
import { deleteRecurring, listRecurring, saveRecurring } from "./handlers/recurring.js";
import {
  getBerandaSummary,
  reportBiayaDaftar,
  reportHutangVendor,
  reportNilaiGudang,
  reportPembelianDaftar,
  reportPembelianPerProduk,
  reportPembelianPerVendor,
  reportPengiriman,
  reportPenjualanDaftar,
  reportPenjualanPerPelanggan,
  reportPenjualanPerProduk,
  reportPenyelesaianPesanan,
  reportPergerakanStok,
  reportPiutangPelanggan,
  reportRingkasanPersediaan,
  reportStokMinimum,
  reportUmurHutang,
  reportUmurPiutang,
} from "./handlers/reportsR2.js";
import { runScheduledTasks } from "./cron.js";
import {
  activatePendingAsset,
  applyDepreciation,
  createAsset,
  disposeAsset,
  getAsset,
  listAssets,
  reportAsetDaftar,
  reportAsetPenyusutan,
} from "./handlers/assets.js";
import {
  applyReconRules,
  createTxFromStatement,
  deleteBankStatement,
  deleteReconRule,
  importBankStatements,
  listBankStatements,
  listReconRules,
  reconcileMatch,
  reportBankRekonsiliasi,
  saveReconRule,
  unmatchReconciliation,
} from "./handlers/banking.js";
import {
  decideApproval,
  deleteApprovalRule,
  deleteBudget,
  getBudget,
  listApprovalRules,
  listApprovers,
  listBudgets,
  listNotifications,
  listPendingApprovals,
  markNotificationRead,
  reportAnggaranLabaRugi,
  reportPajakPemotongan,
  reportPajakPenjualan,
  saveApprovalRule,
  saveBudget,
  saveDashboard,
} from "./handlers/budgetsAndExtras.js";
import {
  createWorkOrder,
  deleteBom,
  listBoms,
  listStandardCosts,
  listWorkOrders,
  reportProduksiDaftar,
  saveBom,
  saveStandardCost,
} from "./handlers/production.js";
import {
  listCurrencies,
  listExchangeRates,
  reportKursBelumTerealisasi,
  reportKursRealisasi,
  saveCurrency,
  saveExchangeRate,
} from "./handlers/currencies.js";

const PREFIX = "/api/keuangan";

const ROUTES = [
  ["GET", /^\/me$/, getMe],

  // Master: Anak Perusahaan
  ["GET", /^\/units$/, listUnits],
  ["POST", /^\/units$/, createUnit],
  ["PUT", /^\/units\/([A-Za-z0-9]{1,10})$/, updateUnit],

  // Master: Daftar Akun & Pemetaan
  ["GET", /^\/accounts$/, listAccounts],
  ["POST", /^\/accounts$/, createAccount],
  ["POST", /^\/accounts\/import$/, importAccounts],
  ["POST", /^\/accounts\/reset$/, resetAccounts],
  ["PUT", /^\/accounts\/([^/]+)$/, updateAccount],
  ["DELETE", /^\/accounts\/([^/]+)$/, deleteAccount],
  ["GET", /^\/account-mapping$/, getAccountMapping],
  ["PUT", /^\/account-mapping$/, updateAccountMapping],

  // Saldo Awal
  ["GET", /^\/opening-balance$/, getOpeningBalance],
  ["PUT", /^\/opening-balance$/, putOpeningBalance],

  // Master: Kontak & Grup
  ["GET", /^\/contact-groups$/, listContactGroups],
  ["POST", /^\/contact-groups$/, saveContactGroup],
  ["DELETE", /^\/contact-groups\/([^/]+)$/, deleteContactGroup],
  ["GET", /^\/contacts$/, listContacts],
  ["POST", /^\/contacts$/, createContact],
  ["GET", /^\/contacts\/([^/]+)$/, getContact],
  ["PUT", /^\/contacts\/([^/]+)$/, updateContact],
  ["DELETE", /^\/contacts\/([^/]+)$/, deleteContact],

  // Master: Tag, Pajak, Syarat & Cara Bayar, Penomoran, Pengaturan, Audit
  ["GET", /^\/tags$/, listTags],
  ["POST", /^\/tags$/, createTag],
  ["DELETE", /^\/tags\/([^/]+)$/, deleteTag],
  ["POST", /^\/tag-categories$/, createTagCategory],
  ["DELETE", /^\/tag-categories\/([^/]+)$/, deleteTagCategory],
  ["GET", /^\/taxes$/, listTaxes],
  ["POST", /^\/taxes$/, createTax],
  ["PUT", /^\/taxes\/([^/]+)$/, updateTax],
  ["DELETE", /^\/taxes\/([^/]+)$/, deleteTax],
  ["GET", /^\/payment-terms$/, listPaymentTerms],
  ["POST", /^\/payment-terms$/, savePaymentTerm],
  ["DELETE", /^\/payment-terms\/([^/]+)$/, deletePaymentTerm],
  ["GET", /^\/payment-methods$/, listPaymentMethods],
  ["POST", /^\/payment-methods$/, savePaymentMethod],
  ["DELETE", /^\/payment-methods\/([^/]+)$/, deletePaymentMethod],
  ["GET", /^\/numbering$/, getNumbering],
  ["PUT", /^\/numbering$/, updateNumbering],
  ["GET", /^\/settings$/, getSettings],
  ["PUT", /^\/settings$/, updateSettings],
  ["GET", /^\/audit$/, listAudit],
  ["GET", /^\/exports-log$/, listExportsLog],
  ["POST", /^\/exports-log$/, recordExportLog],

  // Dokumen Transaksi (Jurnal Umum, Terima/Kirim/Transfer Uang)
  ["GET", /^\/documents$/, listDocuments],
  ["POST", /^\/documents$/, createDocument],
  ["POST", /^\/documents\/import-journal$/, importJournalBatch],
  ["GET", /^\/documents\/([^/]+)$/, getDocument],
  ["PUT", /^\/documents\/([^/]+)$/, updateDocument],
  ["DELETE", /^\/documents\/([^/]+)$/, deleteDocument],
  ["GET", /^\/documents\/([^/]+)\/journal$/, getDocumentJournal],

  // Kas & Bank + BKU
  ["GET", /^\/kas-bank$/, listKasBank],
  ["GET", /^\/kas-bank\/([^/]+)\/bku$/, getBku],

  // Kunci Periode & Tutup Buku
  ["GET", /^\/period-closings$/, listPeriodClosings],
  ["GET", /^\/period-closings\/preview$/, previewClosing],
  ["POST", /^\/period-closings$/, createPeriodClosing],
  ["POST", /^\/period-closings\/([^/]+)\/cancel$/, cancelPeriodClosing],

  // Laporan Sekilas Bisnis (Rilis 1) & Template
  ["GET", /^\/reports\/neraca$/, reportNeraca],
  ["GET", /^\/reports\/laba-rugi$/, reportLabaRugi],
  ["GET", /^\/reports\/arus-kas$/, reportArusKas],
  ["GET", /^\/reports\/perubahan-modal$/, reportPerubahanModal],
  ["GET", /^\/reports\/buku-besar$/, reportBukuBesar],
  ["GET", /^\/reports\/jurnal$/, reportJurnal],
  ["GET", /^\/reports\/neraca-saldo$/, reportNeracaSaldo],
  ["GET", /^\/reports\/ringkasan-bisnis$/, reportRingkasanBisnis],
  ["GET", /^\/report-templates$/, listReportTemplates],
  ["POST", /^\/report-templates$/, saveReportTemplate],
  ["PUT", /^\/report-templates\/([^/]+)$/, saveReportTemplate],
  ["DELETE", /^\/report-templates\/([^/]+)$/, deleteReportTemplate],

  // Lampiran & Tautan Publik
  ["POST", /^\/attachments$/, uploadAttachment],
  ["GET", /^\/attachments\/([^/]+)$/, downloadAttachment],
  ["DELETE", /^\/attachments\/([^/]+)$/, deleteAttachment],
  ["POST", /^\/public-links$/, createOrGetPublicLink],
  ["DELETE", /^\/public-links\/([^/]+)$/, revokePublicLink],
  ["GET", /^\/public\/([^/]+)$/, getPublicDocument],

  // Rilis 2: Produk, Satuan, Kategori, Gudang, Stok, Transfer, Konversi, Aturan Harga, Rekalkulasi
  ["GET", /^\/uoms$/, listUnitsOfMeasure],
  ["POST", /^\/uoms$/, saveUnitOfMeasure],
  ["DELETE", /^\/uoms\/([^/]+)$/, deleteUnitOfMeasure],
  ["GET", /^\/product-categories$/, listProductCategories],
  ["POST", /^\/product-categories$/, saveProductCategory],
  ["DELETE", /^\/product-categories\/([^/]+)$/, deleteProductCategory],
  ["GET", /^\/warehouses$/, listWarehouses],
  ["POST", /^\/warehouses$/, createWarehouse],
  ["PUT", /^\/warehouses\/([^/]+)$/, updateWarehouse],
  ["DELETE", /^\/warehouses\/([^/]+)$/, deleteWarehouse],
  ["GET", /^\/products$/, listProducts],
  ["POST", /^\/products$/, createProduct],
  ["POST", /^\/products\/import$/, importProducts],
  ["GET", /^\/products\/([^/]+)$/, getProduct],
  ["PUT", /^\/products\/([^/]+)$/, updateProduct],
  ["DELETE", /^\/products\/([^/]+)$/, deleteProduct],
  ["GET", /^\/stock-adjustments$/, listStockAdjustments],
  ["POST", /^\/stock-adjustments$/, createStockAdjustment],
  ["GET", /^\/warehouse-transfers$/, listWarehouseTransfers],
  ["POST", /^\/warehouse-transfers$/, createWarehouseTransfer],
  ["POST", /^\/product-conversions$/, createProductConversion],
  ["GET", /^\/price-rules$/, listPriceRules],
  ["POST", /^\/price-rules$/, savePriceRule],
  ["DELETE", /^\/price-rules\/([^/]+)$/, deletePriceRule],
  ["GET", /^\/recalc-hpp$/, getRecalcStatus],
  ["POST", /^\/recalc-hpp\/run$/, runRecalcNow],

  // Rilis 2: Siklus Transaksi Penjualan, Pembelian, Biaya & Berulang
  ["GET", /^\/transactions$/, listTransactions],
  ["POST", /^\/transactions$/, createTransaction],
  ["POST", /^\/transactions\/import$/, importTransactionsBatch],
  ["GET", /^\/transactions\/([^/]+)$/, getTransaction],
  ["PUT", /^\/transactions\/([^/]+)$/, updateTransaction],
  ["DELETE", /^\/transactions\/([^/]+)$/, deleteTransactionEndpoint],
  ["GET", /^\/recurring$/, listRecurring],
  ["POST", /^\/recurring$/, saveRecurring],
  ["DELETE", /^\/recurring\/([^/]+)$/, deleteRecurring],

  // Rilis 2: Beranda & Laporan Penjualan / Pembelian / Produk
  ["GET", /^\/beranda$/, getBerandaSummary],
  ["GET", /^\/reports\/penjualan\/daftar$/, reportPenjualanDaftar],
  ["GET", /^\/reports\/penjualan\/per-pelanggan$/, reportPenjualanPerPelanggan],
  ["GET", /^\/reports\/penjualan\/per-produk$/, reportPenjualanPerProduk],
  ["GET", /^\/reports\/penjualan\/piutang-pelanggan$/, reportPiutangPelanggan],
  ["GET", /^\/reports\/penjualan\/umur-piutang$/, reportUmurPiutang],
  ["GET", /^\/reports\/penjualan\/pengiriman$/, (ctx) => reportPengiriman(ctx, "sales_delivery")],
  ["GET", /^\/reports\/penjualan\/penyelesaian-pesanan$/, (ctx) => reportPenyelesaianPesanan(ctx, "sales_order")],
  ["GET", /^\/reports\/pembelian\/daftar$/, reportPembelianDaftar],
  ["GET", /^\/reports\/pembelian\/per-vendor$/, reportPembelianPerVendor],
  ["GET", /^\/reports\/pembelian\/per-produk$/, reportPembelianPerProduk],
  ["GET", /^\/reports\/pembelian\/hutang-vendor$/, reportHutangVendor],
  ["GET", /^\/reports\/pembelian\/umur-hutang$/, reportUmurHutang],
  ["GET", /^\/reports\/pembelian\/pengiriman$/, (ctx) => reportPengiriman(ctx, "purchase_delivery")],
  ["GET", /^\/reports\/pembelian\/penyelesaian-pesanan$/, (ctx) => reportPenyelesaianPesanan(ctx, "purchase_order")],
  ["GET", /^\/reports\/biaya\/daftar$/, reportBiayaDaftar],
  ["GET", /^\/reports\/produk\/ringkasan-persediaan$/, reportRingkasanPersediaan],
  ["GET", /^\/reports\/produk\/pergerakan-stok$/, reportPergerakanStok],
  ["GET", /^\/reports\/produk\/penilaian-persediaan$/, reportRingkasanPersediaan],
  ["GET", /^\/reports\/produk\/nilai-gudang$/, reportNilaiGudang],
  ["GET", /^\/reports\/produk\/stok-minimum$/, reportStokMinimum],

  // Rilis 3: Aset Tetap, Rekonsiliasi Bank, Anggaran, Approval, Pajak
  ["GET", /^\/assets$/, listAssets],
  ["POST", /^\/assets$/, createAsset],
  ["GET", /^\/assets\/([^/]+)$/, getAsset],
  ["POST", /^\/assets\/([^/]+)\/activate$/, activatePendingAsset],
  ["POST", /^\/assets\/depreciate$/, applyDepreciation],
  ["POST", /^\/assets\/([^/]+)\/dispose$/, disposeAsset],
  ["GET", /^\/reports\/aset\/daftar$/, reportAsetDaftar],
  ["GET", /^\/reports\/aset\/penyusutan$/, reportAsetPenyusutan],

  ["GET", /^\/bank-statements$/, listBankStatements],
  ["POST", /^\/bank-statements\/import$/, importBankStatements],
  ["DELETE", /^\/bank-statements\/([^/]+)$/, deleteBankStatement],
  ["POST", /^\/reconciliation\/match$/, reconcileMatch],
  ["POST", /^\/reconciliation\/unmatch$/, unmatchReconciliation],
  ["POST", /^\/reconciliation\/create-tx$/, createTxFromStatement],
  ["GET", /^\/recon-rules$/, listReconRules],
  ["POST", /^\/recon-rules$/, saveReconRule],
  ["DELETE", /^\/recon-rules\/([^/]+)$/, deleteReconRule],
  ["POST", /^\/recon-rules\/apply$/, applyReconRules],
  ["GET", /^\/reports\/bank\/rekonsiliasi$/, reportBankRekonsiliasi],

  ["GET", /^\/budgets$/, listBudgets],
  ["POST", /^\/budgets$/, saveBudget],
  ["GET", /^\/budgets\/([^/]+)$/, getBudget],
  ["DELETE", /^\/budgets\/([^/]+)$/, deleteBudget],
  ["GET", /^\/reports\/anggaran-laba-rugi$/, reportAnggaranLabaRugi],

  ["GET", /^\/approval-rules$/, listApprovalRules],
  ["GET", /^\/approvers$/, listApprovers],
  ["POST", /^\/approval-rules$/, saveApprovalRule],
  ["DELETE", /^\/approval-rules\/([^/]+)$/, deleteApprovalRule],
  ["GET", /^\/approvals\/pending$/, listPendingApprovals],
  ["POST", /^\/approvals\/([^/]+)\/decide$/, decideApproval],

  ["GET", /^\/reports\/pajak\/faktur$/, reportPajakPenjualan],
  ["GET", /^\/reports\/pajak\/pemotongan$/, reportPajakPemotongan],
  ["POST", /^\/dashboards$/, saveDashboard],
  ["GET", /^\/notifications$/, listNotifications],
  ["POST", /^\/notifications\/([^/]+)\/read$/, markNotificationRead],

  // Rilis 4: Produksi (BoM & Work Orders) & Multi Mata Uang / Kurs
  ["GET", /^\/boms$/, listBoms],
  ["POST", /^\/boms$/, saveBom],
  ["DELETE", /^\/boms\/([^/]+)$/, deleteBom],
  ["GET", /^\/standard-costs$/, listStandardCosts],
  ["POST", /^\/standard-costs$/, saveStandardCost],
  ["GET", /^\/work-orders$/, listWorkOrders],
  ["POST", /^\/work-orders$/, createWorkOrder],
  ["GET", /^\/reports\/produksi\/daftar$/, reportProduksiDaftar],

  ["GET", /^\/currencies$/, listCurrencies],
  ["POST", /^\/currencies$/, saveCurrency],
  ["GET", /^\/exchange-rates$/, listExchangeRates],
  ["POST", /^\/exchange-rates$/, saveExchangeRate],
  ["GET", /^\/reports\/kurs\/realisasi$/, reportKursRealisasi],
  ["GET", /^\/reports\/kurs\/belum-terealisasi$/, reportKursBelumTerealisasi],
];

export async function handleRequest(request, env, deps) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : null;
    const match =
      path === null
        ? null
        : ROUTES.map(([method, pattern, handler]) => ({ method, handler, params: pattern.exec(path) })).find(
            (route) => route.params && route.method === request.method,
          );
    if (!match) throw new KeuanganError("NOT_FOUND", 404, "Endpoint tidak ditemukan.");

    const result = await match.handler({ request, env, deps, url, params: match.params.slice(1) });
    if (result instanceof Response) {
      for (const [key, value] of Object.entries(cors)) result.headers.set(key, value);
      return result;
    }
    return json(result, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

export function realDeps(env) {
  return {
    verifyToken: (token) => verifyIdToken(token, env),
    getUserProfile: (uid) => getUserProfile(env, uid),
    listKeuanganUsers: () => listKeuanganUsers(env),
    now: () => Date.now(),
  };
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, realDeps(env));
  },
  async scheduled(_event, env, ctx) {
    const p = runScheduledTasks(env, { now: Date.now() });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
    else await p;
  },
};
