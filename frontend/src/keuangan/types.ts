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
  no_bukti: string;
  tipe: string;
  tipe_label: string;
  unit_kode: string;
  contact_id?: string | null;
  contact_nama: string;
  kode_akun: string;
  nama_akun: string;
  counterparties: { account_kode: string; account_nama: string; unit_kode: string; debit: number; kredit: number }[];
  uraian: string;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
  rekonsiliasi: boolean;
  attachment_count: number;
  locked: boolean;
}

export interface BkuResponse {
  account: Account & { unit_nama?: string | null; unit_label?: string };
  periode: { dari: string; sampai: string };
  ringkasan: {
    saldoAwal: number;
    totalPenerimaan: number;
    totalPengeluaran: number;
    saldoAkhir: number;
  };
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
  banding_dengan?: "none" | "periode" | "unit" | "tag";
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
  customTemplate?: { sections?: unknown[] } | null;
  customSections?: { id: string; nama: string; tipe: "kategori" | "rumus"; rows: { kode: string; nama: string; values: number[] }[]; totals: number[] }[] | null;
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

// ─── Rilis 2: Produk, Gudang, Transaksi Penjualan/Pembelian/Biaya, Berulang, Beranda ───

export interface Warehouse {
  id: string;
  nama: string;
  kode: string;
  alamat: string;
  deskripsi: string;
  unit_kode: string | null;
  induk_id: string | null;
}

export interface Product {
  id: string;
  nama: string;
  sku: string | null;
  barcode: string | null;
  satuan: string;
  deskripsi: string;
  tipe: "single" | "bundle";
  monitor_stok: number;
  batas_min: number;
  akun_persediaan: string | null;
  pelacakan: "qty" | "batch" | "serial";
  dibeli: number;
  harga_beli: number;
  akun_beli: string | null;
  pajak_beli: string | null;
  dijual: number;
  harga_jual: number;
  akun_jual: string | null;
  pajak_jual: string | null;
  akun_diskon: string | null;
  arsip: number;
  stok_milli?: number;
  harga_rata_rata?: number;
  nilai?: number;
}

export interface ProductDetailResponse {
  product: Product & {
    stok_milli: number;
    harga_rata_rata: number;
    recalc_running: boolean;
    units: { product_id: string; satuan: string; faktor_milli: number; harga_jual: number; harga_beli: number }[];
    bundle_items: { product_id: string; item_nama: string; item_satuan: string; qty_milli: number }[];
  };
  perWarehouse: { warehouse_id: string | null; warehouse_nama: string; unit_kode: string | null; qty_milli: number }[];
  history: {
    id: string;
    tanggal: string;
    doc_type: string;
    doc_no: string;
    warehouse_nama: string;
    qty_milli: number;
    nilai: number;
    running_qty_milli: number;
    avg_unit_cost: number;
  }[];
  batches: { id: string; warehouse_id: string; warehouse_nama?: string; batch_no: string; exp_date?: string; qty_milli: number }[];
  serials: { id: string; warehouse_id: string; warehouse_nama?: string; serial_no: string; status: string }[];
}

export interface TransactionDocument {
  id: string;
  type: string;
  no: string;
  tanggal: string;
  jatuh_tempo: string | null;
  unit_kode: string;
  unit_nama?: string;
  contact_id: string | null;
  contact_nama?: string;
  contact_hp?: string;
  contact_alamat?: string;
  warehouse_id: string | null;
  warehouse_nama?: string;
  currency: string;
  kurs: number;
  status: string;
  subtotal: number;
  diskon: number;
  pajak: number;
  ongkir: number;
  pemotongan: number;
  total: number;
  sisa: number;
  uang_muka: number;
  parent_id: string | null;
  ref_no: string;
  pesan: string;
  memo: string;
  no_faktur_pajak?: string;
  approval_state?: string | null;
  locked?: boolean;
  data?: Record<string, unknown>;
}

export interface TransactionDetailResponse {
  document: TransactionDocument;
  lines: (DocumentLine & { product_id?: string | null; product_nama?: string; product_sku?: string; satuan?: string; diskon_bp?: number; source_line_id?: string | null })[];
  tags: { id: string; nama: string }[];
  withholdings: { id: string; account_kode: string; account_nama?: string; mode: string; nilai: number; amount: number }[];
  journal: { id: string; tanggal: string; unit_kode: string; account_kode: string; account_nama: string; debit: number; kredit: number; keterangan: string }[];
  links: { to: { to_id: string; type: string; no: string; tanggal: string; amount: number; kind: string }[]; from: { from_id: string; type: string; no: string; tanggal: string; amount: number; kind: string }[] };
  stock_moves: { id: string; product_id: string; product_nama?: string; warehouse_nama?: string; qty_milli: number; nilai: number; batch_no?: string; serial_no?: string }[];
  attachments: { id: string; filename: string; mime: string; size: number; created_at: number }[];
  approvals?: { document_id: string; tahap: number; user_uid: string; keputusan: string; alasan: string; at: number }[];
}

export interface BerandaSummaryResponse {
  asOf: string;
  bulan: string;
  kpi: {
    penjualan_bulan_ini: number;
    biaya_bulan_ini: number;
    laba_bulan_ini: number;
    piutang_terbuka: number;
    piutang_jatuh_tempo: number;
    piutang_count: number;
    hutang_terbuka: number;
    hutang_jatuh_tempo: number;
    hutang_count: number;
    saldo_kas_bank: number;
  };
  monthly_flow: { bulan: string; pendapatan: number; beban: number }[];
  kas_accounts: { kode: string; nama: string; unit_kode: string | null; saldo: number }[];
  top_products: { id: string; nama: string; satuan: string; qty_milli: number; omzet: number }[];
  notifications: { id: string; kind: string; payload: { title?: string; message?: string }; at: number }[];
  recent_documents: { id: string; type: string; no: string; tanggal: string; unit_kode: string; total: number; status: string; contact_nama?: string }[];
  dashboards: { id: string; nama: string; default_flag: number; widgets: unknown[] }[];
}

// ─── Rilis 3 & 4: Aset, Rekonsiliasi Bank, Anggaran, Approval, Produksi, Kurs ───

export interface FixedAsset {
  id: string;
  unit_kode: string;
  no: string;
  nama: string;
  akun_aset: string;
  akun_aset_nama?: string;
  deskripsi: string;
  tgl_akuisisi: string;
  biaya: number;
  akun_kredit: string;
  non_depresiasi: number;
  metode: string | null;
  masa_bulan: number | null;
  tarif_bp: number | null;
  akun_beban: string | null;
  akun_akumulasi: string | null;
  akum_awal: number;
  status: "tertunda" | "aktif" | "dilepas";
  total_akumulasi: number;
  nilai_buku: number;
}

export interface BankStatement {
  id: string;
  account_kode: string;
  tanggal: string;
  deskripsi: string;
  masuk: number;
  keluar: number;
  matched: number;
  matched_doc_id?: string | null;
  matched_doc_no?: string | null;
}

export interface Budget {
  id: string;
  nama: string;
  unit_kode: string;
  mulai: string;
  jumlah_periode: number;
  memo: string;
}

export interface ApprovalRule {
  id: string;
  tipe: string;
  kriteria: { unit_kode?: string; min_total?: number; creator_uids?: string[] };
  tahap: { nama: string; tipe: "semua" | "satu"; approver_uids: string[] }[];
  aktif: number;
}

export interface BomItem {
  id: string;
  nama: string;
  kode: string;
  kategori: "penyusunan" | "pemisahan";
  metode_biaya: "biaya_standar" | "rata_rata";
  config: {
    output_product_id?: string | null;
    output_qty_milli?: number;
    components?: { product_id: string; qty_milli: number }[];
    overhead_costs?: { account_kode?: string; nama: string; jumlah: number }[];
  };
}

export interface CurrencyItem {
  kode: string;
  nama: string;
  simbol: string;
  aktif: number;
}

export interface ExchangeRateItem {
  id: string;
  currency_kode: string;
  tanggal: string;
  kurs: number;
}
