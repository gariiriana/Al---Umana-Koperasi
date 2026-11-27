/**
 * al-umana-keuangan: Worker Modul Keuangan Al-Umanaa di /api/keuangan/*.
 * Semua data di D1 (DB = "keuangan"); Firestore hanya dibaca untuk role users/{uid}.
 * Hanya role `keuangan` yang diizinkan (super_admin dan developer ditolak 403).
 */
import { verifyIdToken } from "./auth.js";
import { KeuanganError, corsHeaders, errorResponse, json } from "./http.js";
import { getUserProfile } from "./profile.js";
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
    now: () => Date.now(),
  };
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, realDeps(env));
  },
  async scheduled(_event, _env, _ctx) {
    // Disiapkan untuk cron Rilis 2-4 (recalc_queue, transaksi berulang, jatuh tempo).
  },
};
