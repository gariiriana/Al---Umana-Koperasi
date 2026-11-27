// Klien API Worker Modul Keuangan (/api/keuangan/*). Seluruh data akuntansi ada di D1 via Worker.
import { auth } from "@/lib/firebase";
import type {
  Account,
  AccountCategory,
  AccountMappingItem,
  ArusKasResponse,
  AuditLogRow,
  BkuResponse,
  BukuBesarResponse,
  Contact,
  ContactGroup,
  DocumentDetailResponse,
  DocumentLine,
  DocumentSummary,
  JurnalReportResponse,
  KasBankListResponse,
  KeuanganMe,
  LabaRugiResponse,
  NeracaResponse,
  NeracaSaldoResponse,
  NumberingRule,
  PaymentMethod,
  PaymentTerm,
  PeriodClosing,
  PerubahanModalResponse,
  ReportFilter,
  ReportTemplate,
  RingkasanBisnisResponse,
  Tag,
  TagCategory,
  Tax,
  Unit,
} from "@/keuangan/types";

const BASE = `${import.meta.env.VITE_KEUANGAN_API_BASE_URL ?? ""}/api/keuangan`;

export interface KeuanganErrorDetails {
  field?: string;
  row?: number;
}

export class KeuanganApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: KeuanganErrorDetails;

  constructor(code: string, status: number, message?: string, details?: KeuanganErrorDetails) {
    super(message || code);
    this.name = "KeuanganApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function keuanganFetch<T>(path: string, init: RequestInit = {}, withAuth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (withAuth) {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  if (init.body !== undefined) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new KeuanganApiError("JARINGAN", 0);
  }
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new KeuanganApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  }
  const body = await response.json().catch(() => {
    throw new KeuanganApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  });
  if (!response.ok) {
    throw new KeuanganApiError(
      body?.error?.code ?? "INTERNAL",
      response.status,
      body?.error?.message,
      body?.error?.details,
    );
  }
  return body as T;
}

const send = <T>(method: string, path: string, body?: unknown) =>
  keuanganFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") sp.set(k, v ? "1" : "0");
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ─── Onboarding & Me ──────────────────────────────────────────────────────────
export const getMe = () => keuanganFetch<KeuanganMe>("/me");

// ─── Units (Anak Perusahaan) ──────────────────────────────────────────────────
export const listUnits = async (all = false) =>
  (await keuanganFetch<{ units: Unit[] }>(`/units${qs({ all: all ? 1 : 0 })}`)).units;
export const createUnit = async (input: Partial<Unit>) =>
  (await send<{ unit: Unit }>("POST", "/units", input)).unit;
export const updateUnit = async (kode: string, patch: Partial<Unit>) =>
  (await send<{ unit: Unit }>("PUT", `/units/${encodeURIComponent(kode)}`, patch)).unit;

// ─── Accounts & Mapping ───────────────────────────────────────────────────────
export const listAccounts = (opts?: { unit_kode?: string; arsip?: boolean }) =>
  keuanganFetch<{ accounts: Account[]; categories: AccountCategory[] }>(
    `/accounts${qs({ unit_kode: opts?.unit_kode, arsip: opts?.arsip ? 1 : 0 })}`,
  );
export const createAccount = async (input: Record<string, unknown>) =>
  (await send<{ account: Account }>("POST", "/accounts", input)).account;
export const updateAccount = async (kode: string, patch: Record<string, unknown>) =>
  (await send<{ account: Account }>("PUT", `/accounts/${encodeURIComponent(kode)}`, patch)).account;
export const deleteAccount = (kode: string) =>
  send<{ ok: boolean }>("DELETE", `/accounts/${encodeURIComponent(kode)}`);
export const importAccounts = (rows: Record<string, unknown>[]) =>
  send<{ imported: number }>("POST", "/accounts/import", { rows });
export const resetAccounts = () => send<{ ok: boolean }>("POST", "/accounts/reset");

export const getAccountMapping = async () =>
  (await keuanganFetch<{ mapping: AccountMappingItem[] }>("/account-mapping")).mapping;
export const updateAccountMapping = async (mapping: Record<string, string>) =>
  (await send<{ mapping: AccountMappingItem[] }>("PUT", "/account-mapping", { mapping })).mapping;

// ─── Opening Balance ──────────────────────────────────────────────────────────
export const getOpeningBalance = (unit_kode?: string) =>
  keuanganFetch<{
    openingBalance: DocumentSummary | null;
    lines: { account_kode: string; deskripsi: string; harga: number; jumlah: number }[];
  }>(`/opening-balance${qs({ unit_kode })}`);

export const saveOpeningBalance = (payload: {
  unit_kode: string;
  tanggal: string;
  status: "draf" | "selesai";
  memo?: string;
  lines: { account_kode: string; debit: number; kredit: number; deskripsi?: string }[];
}) => send<{ openingBalance: DocumentSummary; lines: unknown[] }>("PUT", "/opening-balance", payload);

// ─── Contacts & Groups ────────────────────────────────────────────────────────
export const listContactGroups = async () =>
  (await keuanganFetch<{ groups: ContactGroup[] }>("/contact-groups")).groups;
export const saveContactGroup = async (nama: string, id?: string) =>
  (await send<{ group: ContactGroup }>("POST", "/contact-groups", { nama, id })).group;
export const deleteContactGroup = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/contact-groups/${encodeURIComponent(id)}`);

export const listContacts = async (opts?: { tipe?: string; arsip?: boolean }) =>
  (await keuanganFetch<{ contacts: Contact[] }>(`/contacts${qs({ tipe: opts?.tipe, arsip: opts?.arsip ? 1 : 0 })}`)).contacts;
export const getContact = (id: string) =>
  keuanganFetch<{ contact: Contact; transactions: DocumentSummary[] }>(`/contacts/${encodeURIComponent(id)}`);
export const createContact = (input: Record<string, unknown>) =>
  send<{ contact: Contact; transactions: DocumentSummary[] }>("POST", "/contacts", input);
export const updateContact = (id: string, patch: Record<string, unknown>) =>
  send<{ contact: Contact }>("PUT", `/contacts/${encodeURIComponent(id)}`, patch);
export const deleteContact = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/contacts/${encodeURIComponent(id)}`);

// ─── Tags, Taxes, Terms, Methods, Numbering, Settings, Audit ──────────────────
export const listTags = () => keuanganFetch<{ tags: Tag[]; categories: TagCategory[] }>("/tags");
export const createTag = async (nama: string, kategori_id?: string | null) =>
  (await send<{ tag: Tag }>("POST", "/tags", { nama, kategori_id })).tag;
export const deleteTag = (id: string) => send<{ ok: boolean }>("DELETE", `/tags/${encodeURIComponent(id)}`);
export const createTagCategory = async (nama: string) =>
  (await send<{ category: TagCategory }>("POST", "/tag-categories", { nama })).category;
export const deleteTagCategory = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/tag-categories/${encodeURIComponent(id)}`);

export const listTaxes = async () => (await keuanganFetch<{ taxes: Tax[] }>("/taxes")).taxes;
export const createTax = async (input: Record<string, unknown>) =>
  (await send<{ tax: Tax }>("POST", "/taxes", input)).tax;
export const updateTax = async (id: string, nama: string) =>
  (await send<{ tax: Tax }>("PUT", `/taxes/${encodeURIComponent(id)}`, { nama })).tax;
export const deleteTax = (id: string) => send<{ ok: boolean }>("DELETE", `/taxes/${encodeURIComponent(id)}`);

export const listPaymentTerms = async () =>
  (await keuanganFetch<{ terms: PaymentTerm[] }>("/payment-terms")).terms;
export const savePaymentTerm = async (input: { id?: string; nama: string; hari: number }) =>
  (await send<{ term: PaymentTerm }>("POST", "/payment-terms", input)).term;
export const deletePaymentTerm = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/payment-terms/${encodeURIComponent(id)}`);

export const listPaymentMethods = async () =>
  (await keuanganFetch<{ methods: PaymentMethod[] }>("/payment-methods")).methods;
export const savePaymentMethod = async (input: { id?: string; nama: string }) =>
  (await send<{ method: PaymentMethod }>("POST", "/payment-methods", input)).method;
export const deletePaymentMethod = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/payment-methods/${encodeURIComponent(id)}`);

export const getNumbering = async () =>
  (await keuanganFetch<{ numbering: NumberingRule[] }>("/numbering")).numbering;
export const updateNumbering = async (numbering: NumberingRule[]) =>
  (await send<{ numbering: NumberingRule[] }>("PUT", "/numbering", { numbering })).numbering;

export const getSettings = () =>
  keuanganFetch<{
    settings: { perusahaan?: Record<string, unknown>; penjualan?: Record<string, unknown>; pembelian?: Record<string, unknown> };
    lampiranDbs: { db_index: number; bytes: number; aktif: number }[];
  }>("/settings");
export const updateSettings = (patch: Record<string, unknown>) => send("PUT", "/settings", patch);

export const listAudit = async (opts?: { entity?: string; entity_id?: string; limit?: number }) =>
  (await keuanganFetch<{ logs: AuditLogRow[] }>(`/audit${qs(opts || {})}`)).logs;
export const recordExportLog = (laporan: string, format: string, filter: Record<string, unknown>) =>
  send<{ id: string }>("POST", "/exports-log", { laporan, format, filter });

// ─── Documents (Jurnal Umum, Terima/Kirim/Transfer Uang) ───────────────────────
export const listDocuments = async (opts?: {
  type?: string;
  unit_kode?: string;
  dari?: string;
  sampai?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) => (await keuanganFetch<{ documents: DocumentSummary[] }>(`/documents${qs(opts || {})}`)).documents;
export const getDocument = (id: string) => keuanganFetch<DocumentDetailResponse>(`/documents/${encodeURIComponent(id)}`);
export const createDocument = (payload: Record<string, unknown>) =>
  send<DocumentDetailResponse>("POST", "/documents", payload);
export const updateDocument = (id: string, payload: Record<string, unknown>) =>
  send<DocumentDetailResponse>("PUT", `/documents/${encodeURIComponent(id)}`, payload);
export const deleteDocument = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/documents/${encodeURIComponent(id)}`);
export const importJournalBatch = (rows: Record<string, unknown>[]) =>
  send<{ imported: number; documents: DocumentSummary[] }>("POST", "/documents/import-journal", { rows });

// ─── Kas & Bank + BKU ─────────────────────────────────────────────────────────
export const listKasBank = (unit_kode?: string) =>
  keuanganFetch<KasBankListResponse>(`/kas-bank${qs({ unit_kode })}`);
export const getBku = (kode: string, opts?: { dari?: string; sampai?: string; unit_kode?: string; type?: string; q?: string }) =>
  keuanganFetch<BkuResponse>(`/kas-bank/${encodeURIComponent(kode)}/bku${qs(opts || {})}`);

// ─── Kunci Periode & Tutup Buku ───────────────────────────────────────────────
export const listPeriodClosings = () =>
  keuanganFetch<{ closings: PeriodClosing[]; latestCompletedId: string | null }>("/period-closings");
export const previewClosing = (sampai: string) =>
  keuanganFetch<{
    dari: string;
    sampai: string;
    checklist: { recalcRunning: boolean; hasNegativeStock: boolean; pendingDepreciation: number; canProceed: boolean };
    netProfit: number;
    worksheet: { kode: string; nama: string; kategori: number; ns_debit: number; ns_kredit: number; lr_debit: number; lr_kredit: number; neraca_debit: number; neraca_kredit: number }[];
  }>(`/period-closings/preview${qs({ sampai })}`);
export const createPeriodClosing = (payload: {
  tipe: "kunci" | "tutup";
  sampai: string;
  status?: "draf" | "selesai";
  memo?: string;
  akun_laba_ditahan?: string;
  beban_pajak?: number;
  akun_beban_pajak?: string;
  akun_hutang_pajak?: string;
}) => send<{ closing: PeriodClosing }>("POST", "/period-closings", payload);
export const cancelPeriodClosing = (id: string, alasan: string) =>
  send<{ closing: PeriodClosing }>("POST", `/period-closings/${encodeURIComponent(id)}/cancel`, { alasan });

// ─── 8 Laporan Sekilas Bisnis (Rilis 1) & Template ────────────────────────────
function reportQs(f: ReportFilter = {}): string {
  return qs({
    dari: f.dari,
    sampai: f.sampai,
    unit_kode: f.unit_kode,
    metode: f.metode,
    kedalaman: f.kedalaman,
    banding_dengan: f.banding_dengan,
    banding_periode: f.banding_periode,
    banding_jumlah: f.banding_jumlah,
    tampilkan_akun: f.tampilkan_akun === undefined ? undefined : f.tampilkan_akun ? 1 : 0,
    saldo_akhir_saja: f.saldo_akhir_saja === undefined ? undefined : f.saldo_akhir_saja ? 1 : 0,
    account_kodes: f.account_kodes,
    tag_ids: f.tag_ids,
    tag_mode: f.tag_mode,
    type: f.type,
    template_id: f.template_id,
  });
}

export const getReportNeraca = (f?: ReportFilter) => keuanganFetch<NeracaResponse>(`/reports/neraca${reportQs(f)}`);
export const getReportLabaRugi = (f?: ReportFilter) => keuanganFetch<LabaRugiResponse>(`/reports/laba-rugi${reportQs(f)}`);
export const getReportArusKas = (f?: ReportFilter) => keuanganFetch<ArusKasResponse>(`/reports/arus-kas${reportQs(f)}`);
export const getReportPerubahanModal = (f?: ReportFilter) =>
  keuanganFetch<PerubahanModalResponse>(`/reports/perubahan-modal${reportQs(f)}`);
export const getReportBukuBesar = (f?: ReportFilter) => keuanganFetch<BukuBesarResponse>(`/reports/buku-besar${reportQs(f)}`);
export const getReportJurnal = (f?: ReportFilter) => keuanganFetch<JurnalReportResponse>(`/reports/jurnal${reportQs(f)}`);
export const getReportNeracaSaldo = (f?: ReportFilter) =>
  keuanganFetch<NeracaSaldoResponse>(`/reports/neraca-saldo${reportQs(f)}`);
export const getReportRingkasanBisnis = (f?: ReportFilter) =>
  keuanganFetch<RingkasanBisnisResponse>(`/reports/ringkasan-bisnis${reportQs(f)}`);

export const listReportTemplates = async (laporan?: "laba_rugi" | "arus_kas") =>
  (await keuanganFetch<{ templates: ReportTemplate[] }>(`/report-templates${qs({ laporan })}`)).templates;
export const saveReportTemplate = async (payload: {
  id?: string;
  laporan: "laba_rugi" | "arus_kas";
  nama: string;
  metode?: string;
  config: Record<string, unknown>;
  utama?: boolean;
}) => (await send<{ template: ReportTemplate }>("POST", "/report-templates", payload)).template;
export const deleteReportTemplate = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/report-templates/${encodeURIComponent(id)}`);

// ─── Lampiran & Tautan Publik ─────────────────────────────────────────────────
export async function uploadAttachmentFile(file: File, document_id?: string | null): Promise<{ id: string; filename: string; mime: string; size: number }> {
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) {
    throw new KeuanganApiError("VALIDATION_ERROR", 400, "Hanya mendukung file gambar (JPEG/PNG/WebP) atau PDF.");
  }

  let dataBase64: string;
  let mime = file.type;
  if (isPdf) {
    if (file.size > 300 * 1024) {
      throw new KeuanganApiError("VALIDATION_ERROR", 400, "Ukuran PDF melebihi 300 KB. Foto saja halaman notanya agar lebih kecil.");
    }
    dataBase64 = await fileToBase64(file);
  } else {
    const compressed = await compressImageToMax80Kb(file);
    dataBase64 = compressed.base64;
    mime = compressed.mime;
  }

  const res = await send<{ attachment: { id: string; filename: string; mime: string; size: number } }>("POST", "/attachments", {
    document_id: document_id || null,
    filename: file.name,
    mime,
    data_base64: dataBase64,
  });
  return res.attachment;
}

export function attachmentUrl(id: string): string {
  return `${BASE}/attachments/${encodeURIComponent(id)}`;
}

export const deleteAttachment = (id: string) =>
  send<{ ok: boolean }>("DELETE", `/attachments/${encodeURIComponent(id)}`);

export const createOrGetPublicLink = async (document_id: string) =>
  (await send<{ link: { token: string; document_id: string } }>("POST", "/public-links", { document_id })).link;
export const getPublicDocument = (token: string) =>
  keuanganFetch<{
    document: Omit<DocumentSummary, "memo"> & {
      pesan?: string;
      unit_nama?: string;
      unit_alamat?: string;
      unit_telepon?: string;
      unit_npwp?: string;
      pj_nama?: string;
      pj_jabatan?: string;
      contact_nama?: string;
      contact_alamat?: string;
    };
    lines: DocumentLine[];
    company: Record<string, unknown>;
  }>(`/public/${encodeURIComponent(token)}`, {}, false);

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

async function compressImageToMax80Kb(file: File): Promise<{ base64: string; mime: string }> {
  if (file.size <= 80 * 1024 && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
    return { base64: await fileToBase64(file), mime: file.type };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Gagal memuat gambar untuk kompresi."));
      i.src = url;
    });
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const q of [0.78, 0.65, 0.52, 0.4]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", q));
      if (blob && blob.size <= 80 * 1024) {
        return { base64: await fileToBase64(blob), mime: "image/webp" };
      }
    }
    const fallbackBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.35));
    if (!fallbackBlob || fallbackBlob.size > 80 * 1024) {
      throw new KeuanganApiError("VALIDATION_ERROR", 400, "Gambar masih di atas 80 KB setelah dikompres. Gunakan foto beresolusi lebih kecil.");
    }
    return { base64: await fileToBase64(fallbackBlob), mime: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
