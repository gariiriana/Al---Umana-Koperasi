// Tipe data Modul Keuangan Al-Umanaa (Rilis 1). Uang selalu dalam INTEGER sen (rupiah x 100).

export interface OnboardingStatus {
  hasUnits: boolean;
  hasOpeningBalance: boolean;
  maxLockedDate: string | null;
  attachmentBytes: number;
  attachmentLimitBytes: number;
}

export interface KeuanganMe {
  uid: string;
  role: "keuangan";
  name: string;
  today: string;
  onboarding: OnboardingStatus;
}

export interface Unit {
  kode: string;
  nama: string;
  alamat: string;
  npwp: string;
  telepon: string;
  pj_nama: string;
  pj_jabatan: string;
  logo_attachment_id: string | null;
  bank_nama: string;
  bank_cabang: string;
  bank_alamat: string;
  bank_no_rekening: string;
  bank_pemilik: string;
  bank_swift: string;
  aktif: number;
}

export interface AccountCategory {
  id: number;
  nama: string;
  normal: "debit" | "kredit";
  kodeAwal: string;
}

export interface Account {
  kode: string;
  nama: string;
  kategori: number;
  kategori_nama?: string;
  saldo_normal?: "debit" | "kredit";
  header_kode: string | null;
  is_header: number;
  deskripsi: string;
  tax_id: string | null;
  bank_nama: string | null;
  no_rekening: string | null;
  unit_kode: string | null;
  sistem: number;
  arsip: number;
  locked?: boolean;
  locked_mapping?: boolean;
  saldo?: number;
}

export interface AccountMappingItem {
  key: string;
  label: string;
  defaultKode: string;
  allowedCategories: number[];
  locked?: boolean;
  account_kode: string;
  account_nama: string;
}

export interface ContactGroup {
  id: string;
  nama: string;
}

export interface ContactBank {
  id?: string;
  bank: string;
  cabang: string;
  pemegang: string;
  no_rekening: string;
}

export interface Contact {
  id: string;
  nama_tampilan: string;
  tipe: string[];
  grup_id: string | null;
  grup_nama?: string | null;
  nama_lengkap: string;
  identitas_jenis: string;
  identitas_no: string;
  email: string;
  perusahaan: string;
  hp: string;
  telepon: string;
  fax: string;
  npwp: string;
  nitku: string;
  kewarganegaraan: string;
  alamat_tagih: string;
  alamat_kirim: string;
  info: string;
  akun_piutang: string;
  akun_hutang: string;
  batas_piutang: number | null;
  batas_hutang: number | null;
  term_id: string | null;
  arsip: number;
  tx_count?: number;
  banks?: ContactBank[];
}

export interface TagCategory {
  id: string;
  nama: string;
}

export interface Tag {
  id: string;
  kategori_id: string | null;
  kategori_nama?: string | null;
  nama: string;
}

export interface Tax {
  id: string;
  nama: string;
  tipe: "satu" | "grup";
  persen_bp: number;
  pengali_11_12: number;
  pemotongan: number;
  akun_jual: string | null;
  akun_beli: string | null;
  majemuk: number;
  aktif: number;
  items?: Tax[];
}

export interface PaymentTerm {
  id: string;
  nama: string;
  hari: number;
}

export interface PaymentMethod {
  id: string;
  nama: string;
}

export interface NumberingRule {
  doc_type: string;
  format: string;
  digits: number;
  start_no: number;
  reset: "tidak" | "tahun" | "bulan";
}

export type DocTypeR1 = "journal" | "receive_money" | "send_money" | "transfer_money" | "opening_balance" | "closing";

export interface DocumentSummary {
  id: string;
  type: DocTypeR1;
  no: string;
  tanggal: string;
  unit_kode: string;
  unit_nama?: string | null;
  contact_id: string | null;
  contact_nama?: string | null;
  status: string;
  harga_termasuk_pajak: number;
  subtotal: number;
  pajak: number;
  pemotongan: number;
  total: number;
  memo: string;
  data?: Record<string, unknown>;
  locked?: boolean;
  created_at: number;
  updated_at: number;
}

export interface DocumentLine {
  id?: string;
  seq?: number;
  account_kode: string;
  account_nama?: string;
  deskripsi: string;
  qty_milli?: number;
  harga?: number;
  jumlah: number;
  tax_id?: string | null;
  tax_nama?: string | null;
  tax_amount?: number;
  unit_kode?: string | null;
}

export interface JournalEntryLine {
  id: string;
  document_id: string;
  tanggal: string;
  unit_kode: string;
  unit_nama?: string;
  account_kode: string;
  account_nama?: string;
  debit: number;
  kredit: number;
  keterangan: string;
}

export interface DocumentDetailResponse {
  document: DocumentSummary;
  lines: DocumentLine[];
  tags: { id: string; nama: string }[];
  withholdings: { id?: string; account_kode: string; account_nama?: string; mode: string; nilai: number; amount: number }[];
  journal: JournalEntryLine[];
  attachments: { id: string; filename: string; mime: string; size: number; created_at: number }[];
}

export interface KasBankAccount extends Account {
  unit_label: string;
  saldo_jurnal: number;
  saldo_bank: number | null;
  rekonsiliasi_status: string | null;
}

export interface KasBankListResponse {
  asOf: string;
  summary: {
    pemasukan30Hari: number;
    pemasukanCount: number;
    pengeluaran30Hari: number;
    pengeluaranCount: number;
    saldoKasBank: number;
    saldoKartuKredit: number;
  };
  accounts: KasBankAccount[];
}

export interface BkuRow {
  id: string;
  document_id: string;
  tanggal: string;
  doc_type: string;
  transaksi_label: string;
  doc_no: string;
  unit_kode: string;
  contact_nama: string;
  account_lawan_kode: string;
  account_lawan_nama: string;
  counterparties: { account_kode: string; account_nama: string; unit_kode: string; debit: number; kredit: number }[];
  deskripsi: string;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
  attachment_count: number;
  locked: boolean;
}

export interface BkuResponse {
  account: Account & { unit_nama?: string | null };
  dari: string;
  sampai: string;
  unit_kode: string | null;
  saldoAwal: number;
  totalPenerimaan: number;
  totalPengeluaran: number;
  saldoAkhir: number;
  rows: BkuRow[];
}

export interface PeriodClosing {
  id: string;
  tipe: "kunci" | "tutup";
  dari: string;
  sampai: string;
  status: "draf" | "selesai" | "batal";
  memo: string;
  document_id: string | null;
  alasan_batal: string | null;
  created_at: number;
}

export interface ReportFilter {
  dari?: string;
  sampai?: string;
  unit_kode?: string;
  metode?: "langsung" | "tidak_langsung";
  kedalaman?: number;
  banding_dengan?: "none" | "periode" | "unit";
  banding_periode?: "none" | "mingguan" | "bulanan" | "triwulan" | "semi_tahunan" | "tahunan";
  banding_jumlah?: number;
  tampilkan_akun?: boolean;
  saldo_akhir_saja?: boolean;
  account_kodes?: string;
  tag_ids?: string;
  tag_mode?: "any" | "all";
  type?: string;
  template_id?: string;
}

export interface NeracaSectionGroup {
  title: string;
  rows: { kode: string; nama: string; values: number[] }[];
  totals: number[];
}

export interface NeracaResponse {
  laporan: "neraca";
  sampai: string;
  unit_kodes: string[];
  konsolidasi: boolean;
  lastUpdatedAt: number;
  columns: string[];
  seimbang: boolean;
  selisih: number;
  totals: { totalAset: number; totalLiabilitas: number; totalModal: number; totalLiabilitasModal: number }[];
  sections: {
    aset: NeracaSectionGroup[];
    totalAset: number[];
    liabilitas: NeracaSectionGroup[];
    totalLiabilitas: number[];
    modal: NeracaSectionGroup;
    totalLiabilitasModal: number[];
  };
}

export interface LabaRugiSection {
  title: string;
  rows: { kode: string; nama: string; values: number[] }[];
  totals: number[];
}

export interface LabaRugiResponse {
  laporan: "laba-rugi";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  columns: string[];
  sections: {
    pendapatan: LabaRugiSection;
    hpp: LabaRugiSection;
    labaKotor: number[];
    biayaOperasional: LabaRugiSection;
    pendapatanBersihOperasional: number[];
    pendapatanLainnya: LabaRugiSection;
    biayaLainnya: LabaRugiSection;
    pendapatanBersih: number[];
  };
  summary: {
    pendapatan: number;
    hpp: number;
    labaKotor: number;
    biayaOperasional: number;
    pendapatanBersihOperasional: number;
    pendapatanLainnya: number;
    biayaLainnya: number;
    pendapatanBersih: number;
  };
}

export interface ArusKasBlock {
  operasional: { items: { key: string; label: string; nilai: number; accounts?: { kode: string; nama: string; nilai: number }[] }[]; total: number };
  investasi: { items: { key: string; label: string; nilai: number; accounts?: { kode: string; nama: string; nilai: number }[] }[]; total: number };
  pendanaan: { items: { key: string; label: string; nilai: number; accounts?: { kode: string; nama: string; nilai: number }[] }[]; total: number };
  kenaikanKas: number;
  saldoAwal: number;
  saldoAkhir: number;
  saldoAkhirAkun: number;
  cocok: boolean;
}

export interface ArusKasResponse {
  laporan: "arus-kas";
  metode: "langsung" | "tidak_langsung";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  konsolidasi: boolean;
  lastUpdatedAt: number;
  columns: string[];
  data: ArusKasBlock[];
  cocok: boolean;
}

export interface PerubahanModalBlock {
  label: string;
  dari: string;
  sampai: string;
  rows: {
    kode_akun: string;
    nama_akun: string;
    permulaan: number;
    debit: number;
    kredit: number;
    saldo_akhir: number;
  }[];
  total: { permulaan: number; debit: number; kredit: number; saldo_akhir: number };
  pergerakan: number;
  hasEquityBalance: boolean;
  labaBelumDitutup: number;
  catatan: string | null;
}

export interface PerubahanModalResponse {
  laporan: "perubahan-modal";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  blocks: PerubahanModalBlock[];
}

export interface BukuBesarGroup {
  kode: string;
  nama: string;
  kategori_nama: string;
  saldo_awal: number;
  total_debit: number;
  total_kredit: number;
  saldo_akhir: number;
  rows: {
    id: string;
    document_id: string;
    tanggal: string;
    transaksi: string;
    nomor: string;
    unit_kode: string;
    keterangan: string;
    debit: number;
    kredit: number;
    saldo: number;
  }[];
}

export interface BukuBesarResponse {
  laporan: "buku-besar";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  groups: BukuBesarGroup[];
}

export interface JurnalReportResponse {
  laporan: "jurnal";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  entries: {
    document_id: string;
    tanggal: string;
    type: string;
    no: string;
    memo: string;
    total_debit: number;
    total_kredit: number;
    lines: {
      account_kode: string;
      account_nama: string;
      unit_kode: string;
      keterangan: string;
      debit: number;
      kredit: number;
    }[];
  }[];
  grandDebit: number;
  grandKredit: number;
}

export interface NeracaSaldoResponse {
  laporan: "neraca-saldo";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  rows: {
    kode: string;
    nama: string;
    awal_debit: number;
    awal_kredit: number;
    gerak_debit: number;
    gerak_kredit: number;
    akhir_debit: number;
    akhir_kredit: number;
  }[];
  totals: {
    awal_debit: number;
    awal_kredit: number;
    gerak_debit: number;
    gerak_kredit: number;
    akhir_debit: number;
    akhir_kredit: number;
  };
}

export interface RingkasanBisnisResponse {
  laporan: "ringkasan-bisnis";
  dari: string;
  sampai: string;
  unit_kodes: string[];
  lastUpdatedAt: number;
  labaRugi: LabaRugiResponse["summary"];
  neraca: {
    totalAset: number;
    asetLancar: number;
    totalLiabilitas: number;
    liabilitasJangkaPendek: number;
    totalModal: number;
  };
  arusKas: {
    operasional: number;
    investasi: number;
    pendanaan: number;
    saldoAkhir: number;
  };
  wawasan: {
    key: string;
    label: string;
    nilai: number | null;
    unit: "%" | "x";
    penjelasan: string;
  }[];
}

export interface AuditLogRow {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  by: string;
  by_name: string;
  at: number;
}

export interface ReportTemplate {
  id: string;
  laporan: "laba_rugi" | "arus_kas";
  nama: string;
  metode: string | null;
  config: Record<string, unknown>;
  utama: number;
}
