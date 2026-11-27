-- Modul Keuangan Al-Umanaa: skema D1 utama (Rilis 1 - Rilis 4).
-- Uang = INTEGER dalam sen (rupiah x 100). Kuantitas = INTEGER dalam per seribu (qty x 1000).
-- Tanggal = YYYY-MM-DD (WIB). Waktu sistem = epoch ms.

-- ─── Master ───────────────────────────────────────────────────────────────────

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE units (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  alamat TEXT NOT NULL DEFAULT '',
  npwp TEXT NOT NULL DEFAULT '',
  telepon TEXT NOT NULL DEFAULT '',
  pj_nama TEXT NOT NULL DEFAULT '',
  pj_jabatan TEXT NOT NULL DEFAULT '',
  logo_attachment_id TEXT,
  bank_nama TEXT NOT NULL DEFAULT '',
  bank_cabang TEXT NOT NULL DEFAULT '',
  bank_alamat TEXT NOT NULL DEFAULT '',
  bank_no_rekening TEXT NOT NULL DEFAULT '',
  bank_pemilik TEXT NOT NULL DEFAULT '',
  bank_swift TEXT NOT NULL DEFAULT '',
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE accounts (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  kategori INTEGER NOT NULL CHECK (kategori BETWEEN 1 AND 17),
  header_kode TEXT REFERENCES accounts(kode),
  is_header INTEGER NOT NULL DEFAULT 0 CHECK (is_header IN (0, 1)),
  deskripsi TEXT NOT NULL DEFAULT '',
  tax_id TEXT,
  bank_nama TEXT,
  no_rekening TEXT,
  unit_kode TEXT REFERENCES units(kode), -- NULL = Bersama (untuk kategori Kas & Bank / Kartu Kredit)
  sistem INTEGER NOT NULL DEFAULT 0 CHECK (sistem IN (0, 1)), -- 1 = gembok plus (1-10150, 2-20150)
  arsip INTEGER NOT NULL DEFAULT 0 CHECK (arsip IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE account_mapping (
  key TEXT PRIMARY KEY,
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE contact_groups (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  nama_tampilan TEXT NOT NULL,
  tipe_flags TEXT NOT NULL, -- JSON array: ['pelanggan', 'supplier', 'karyawan', 'lainnya']
  grup_id TEXT REFERENCES contact_groups(id),
  nama_lengkap TEXT NOT NULL DEFAULT '',
  identitas_jenis TEXT NOT NULL DEFAULT '',
  identitas_no TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  perusahaan TEXT NOT NULL DEFAULT '',
  hp TEXT NOT NULL DEFAULT '',
  telepon TEXT NOT NULL DEFAULT '',
  fax TEXT NOT NULL DEFAULT '',
  npwp TEXT NOT NULL DEFAULT '',
  nitku TEXT NOT NULL DEFAULT '',
  kewarganegaraan TEXT NOT NULL DEFAULT 'WNI',
  alamat_tagih TEXT NOT NULL DEFAULT '',
  alamat_kirim TEXT NOT NULL DEFAULT '',
  info TEXT NOT NULL DEFAULT '',
  akun_piutang TEXT REFERENCES accounts(kode),
  akun_hutang TEXT REFERENCES accounts(kode),
  batas_piutang INTEGER, -- sen; NULL = tidak dibatasi
  batas_hutang INTEGER,  -- sen; NULL = tidak dibatasi
  term_id TEXT,
  arsip INTEGER NOT NULL DEFAULT 0 CHECK (arsip IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE contact_banks (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  cabang TEXT NOT NULL DEFAULT '',
  pemegang TEXT NOT NULL DEFAULT '',
  no_rekening TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE tag_categories (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  kategori_id TEXT REFERENCES tag_categories(id),
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE taxes (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  tipe TEXT NOT NULL CHECK (tipe IN ('satu', 'grup')),
  persen_bp INTEGER NOT NULL DEFAULT 0, -- basis poin (11% = 1100)
  pengali_11_12 INTEGER NOT NULL DEFAULT 0 CHECK (pengali_11_12 IN (0, 1)),
  pemotongan INTEGER NOT NULL DEFAULT 0 CHECK (pemotongan IN (0, 1)),
  akun_jual TEXT REFERENCES accounts(kode),
  akun_beli TEXT REFERENCES accounts(kode),
  majemuk INTEGER NOT NULL DEFAULT 0 CHECK (majemuk IN (0, 1)),
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE tax_group_items (
  group_id TEXT NOT NULL REFERENCES taxes(id) ON DELETE CASCADE,
  tax_id TEXT NOT NULL REFERENCES taxes(id),
  urutan INTEGER NOT NULL,
  PRIMARY KEY (group_id, tax_id)
);

CREATE TABLE payment_terms (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  hari INTEGER NOT NULL DEFAULT 0 CHECK (hari >= 0),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE warehouses (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL,
  alamat TEXT NOT NULL DEFAULT '',
  deskripsi TEXT NOT NULL DEFAULT '',
  unit_kode TEXT REFERENCES units(kode),
  induk_id TEXT REFERENCES warehouses(id),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  satuan TEXT NOT NULL DEFAULT 'pcs',
  deskripsi TEXT NOT NULL DEFAULT '',
  tipe TEXT NOT NULL DEFAULT 'single' CHECK (tipe IN ('single', 'bundle')),
  monitor_stok INTEGER NOT NULL DEFAULT 0 CHECK (monitor_stok IN (0, 1)),
  batas_min INTEGER NOT NULL DEFAULT 0,
  akun_persediaan TEXT REFERENCES accounts(kode),
  pelacakan TEXT NOT NULL DEFAULT 'qty' CHECK (pelacakan IN ('qty', 'batch', 'serial')),
  dibeli INTEGER NOT NULL DEFAULT 0 CHECK (dibeli IN (0, 1)),
  harga_beli INTEGER NOT NULL DEFAULT 0,
  akun_beli TEXT REFERENCES accounts(kode),
  pajak_beli TEXT,
  dijual INTEGER NOT NULL DEFAULT 0 CHECK (dijual IN (0, 1)),
  harga_jual INTEGER NOT NULL DEFAULT 0,
  akun_jual TEXT REFERENCES accounts(kode),
  pajak_jual TEXT,
  akun_diskon TEXT REFERENCES accounts(kode),
  gambar_attachment_id TEXT,
  arsip INTEGER NOT NULL DEFAULT 0 CHECK (arsip IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE product_categories (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE product_category_links (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE product_units (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  satuan TEXT NOT NULL,
  faktor_milli INTEGER NOT NULL,
  harga_jual INTEGER NOT NULL DEFAULT 0,
  harga_beli INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, satuan)
);

CREATE TABLE bundle_items (
  bundle_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty_milli INTEGER NOT NULL,
  PRIMARY KEY (bundle_id, product_id)
);

CREATE TABLE price_rules (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  mulai TEXT NOT NULL,
  selesai TEXT NOT NULL,
  jenis TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE numbering (
  doc_type TEXT PRIMARY KEY,
  format TEXT NOT NULL DEFAULT '{NO}',
  digits INTEGER NOT NULL DEFAULT 5,
  start_no INTEGER NOT NULL DEFAULT 10001,
  reset TEXT NOT NULL DEFAULT 'tidak' CHECK (reset IN ('tidak', 'tahun', 'bulan')),
  last_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- ─── Dokumen & Transaksi ──────────────────────────────────────────────────────

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  no TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  unit_kode TEXT NOT NULL REFERENCES units(kode),
  contact_id TEXT REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'selesai',
  jatuh_tempo TEXT,
  term_id TEXT REFERENCES payment_terms(id),
  ref_no TEXT NOT NULL DEFAULT '',
  warehouse_id TEXT REFERENCES warehouses(id),
  currency TEXT NOT NULL DEFAULT 'IDR',
  kurs INTEGER NOT NULL DEFAULT 1000000,
  harga_termasuk_pajak INTEGER NOT NULL DEFAULT 0 CHECK (harga_termasuk_pajak IN (0, 1)),
  subtotal INTEGER NOT NULL DEFAULT 0,
  diskon INTEGER NOT NULL DEFAULT 0,
  pajak INTEGER NOT NULL DEFAULT 0,
  ongkir INTEGER NOT NULL DEFAULT 0,
  pemotongan INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  sisa INTEGER NOT NULL DEFAULT 0,
  uang_muka INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES documents(id),
  pesan TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  approval_state TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (type, no)
);

CREATE INDEX idx_documents_type_tanggal ON documents(type, tanggal);
CREATE INDEX idx_documents_contact_status ON documents(contact_id, status);
CREATE INDEX idx_documents_type_status_jt ON documents(type, status, jatuh_tempo);

CREATE TABLE document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  product_id TEXT REFERENCES products(id),
  account_kode TEXT REFERENCES accounts(kode),
  deskripsi TEXT NOT NULL DEFAULT '',
  qty_milli INTEGER NOT NULL DEFAULT 1000,
  satuan TEXT NOT NULL DEFAULT '',
  harga INTEGER NOT NULL DEFAULT 0,
  diskon_bp INTEGER NOT NULL DEFAULT 0,
  tax_id TEXT REFERENCES taxes(id),
  jumlah INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  unit_kode TEXT REFERENCES units(kode), -- khusus jurnal umum & antar unit
  source_line_id TEXT
);

CREATE INDEX idx_document_lines_doc ON document_lines(document_id, seq);

CREATE TABLE document_links (
  from_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, kind)
);

CREATE TABLE document_tags (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE withholdings (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  mode TEXT NOT NULL CHECK (mode IN ('persen', 'nominal')),
  nilai INTEGER NOT NULL, -- bp jika persen, sen jika nominal
  amount INTEGER NOT NULL -- sen
);

-- ─── Buku Besar ───────────────────────────────────────────────────────────────

CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  unit_kode TEXT NOT NULL REFERENCES units(kode),
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  kredit INTEGER NOT NULL DEFAULT 0 CHECK (kredit >= 0),
  contact_id TEXT REFERENCES contacts(id),
  keterangan TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'IDR',
  amount_fc INTEGER NOT NULL DEFAULT 0,
  CHECK (debit = 0 OR kredit = 0)
);

CREATE INDEX idx_journal_account_unit_tgl ON journal_lines(account_kode, unit_kode, tanggal);
CREATE INDEX idx_journal_doc ON journal_lines(document_id);
CREATE INDEX idx_journal_tgl_unit ON journal_lines(tanggal, unit_kode);

CREATE TABLE saldo_bulanan (
  unit_kode TEXT NOT NULL REFERENCES units(kode),
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  bulan TEXT NOT NULL, -- 'YYYY-MM'
  debit INTEGER NOT NULL DEFAULT 0,
  kredit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (unit_kode, account_kode, bulan)
);

-- ─── Stok (disiapkan skema Rilis 2-4) ──────────────────────────────────────────

CREATE TABLE stock_moves (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_id TEXT,
  tanggal TEXT NOT NULL,
  seq INTEGER NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT REFERENCES warehouses(id),
  qty_milli INTEGER NOT NULL,
  nilai INTEGER NOT NULL,
  batch_no TEXT,
  serial_no TEXT
);

CREATE INDEX idx_stock_moves_prod_tgl ON stock_moves(product_id, tanggal, seq);

CREATE TABLE product_cost (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  qty_milli INTEGER NOT NULL DEFAULT 0,
  nilai INTEGER NOT NULL DEFAULT 0,
  dihitung_sampai TEXT
);

CREATE TABLE stock_bulanan (
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL,
  bulan TEXT NOT NULL,
  qty_masuk INTEGER NOT NULL DEFAULT 0,
  qty_keluar INTEGER NOT NULL DEFAULT 0,
  nilai_masuk INTEGER NOT NULL DEFAULT 0,
  nilai_keluar INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, warehouse_id, bulan)
);

CREATE TABLE recalc_queue (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  dari_tanggal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at INTEGER NOT NULL
);

-- ─── Lainnya ──────────────────────────────────────────────────────────────────

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  unit_kode TEXT NOT NULL REFERENCES units(kode),
  no TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  akun_aset TEXT NOT NULL REFERENCES accounts(kode),
  deskripsi TEXT NOT NULL DEFAULT '',
  tgl_akuisisi TEXT NOT NULL,
  biaya INTEGER NOT NULL,
  akun_kredit TEXT NOT NULL REFERENCES accounts(kode),
  non_depresiasi INTEGER NOT NULL DEFAULT 0 CHECK (non_depresiasi IN (0, 1)),
  metode TEXT,
  masa_bulan INTEGER,
  tarif_bp INTEGER,
  akun_beban TEXT REFERENCES accounts(kode),
  akun_akumulasi TEXT REFERENCES accounts(kode),
  akum_awal INTEGER NOT NULL DEFAULT 0,
  akum_awal_tgl TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('tertunda', 'aktif', 'dilepas')),
  source_document_id TEXT REFERENCES documents(id),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE depreciation_schedule (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  bulan TEXT NOT NULL,
  nilai INTEGER NOT NULL,
  document_id TEXT REFERENCES documents(id),
  PRIMARY KEY (asset_id, bulan)
);

CREATE TABLE bank_statements (
  id TEXT PRIMARY KEY,
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  tanggal TEXT NOT NULL,
  deskripsi TEXT NOT NULL DEFAULT '',
  masuk INTEGER NOT NULL DEFAULT 0,
  keluar INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL UNIQUE,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX idx_bank_statements_acc_tgl ON bank_statements(account_kode, tanggal);

CREATE TABLE reconciliation_matches (
  statement_id TEXT NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (statement_id, document_id)
);

CREATE TABLE recon_rules (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  account_kode TEXT REFERENCES accounts(kode),
  arah TEXT NOT NULL,
  kondisi_json TEXT NOT NULL,
  aksi_json TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  unit_kode TEXT NOT NULL REFERENCES units(kode),
  mulai TEXT NOT NULL,
  jumlah_periode INTEGER NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE budget_lines (
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_kode TEXT NOT NULL REFERENCES accounts(kode),
  bulan TEXT NOT NULL,
  nilai INTEGER NOT NULL,
  PRIMARY KEY (budget_id, account_kode, bulan)
);

CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  laporan TEXT NOT NULL CHECK (laporan IN ('laba_rugi', 'arus_kas')),
  nama TEXT NOT NULL,
  metode TEXT,
  config_json TEXT NOT NULL,
  utama INTEGER NOT NULL DEFAULT 0 CHECK (utama IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE period_closings (
  id TEXT PRIMARY KEY,
  tipe TEXT NOT NULL CHECK (tipe IN ('kunci', 'tutup')),
  dari TEXT NOT NULL,
  sampai TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draf', 'selesai', 'batal')),
  memo TEXT NOT NULL DEFAULT '',
  document_id TEXT REFERENCES documents(id),
  pajak_json TEXT,
  alasan_batal TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE recurring (
  id TEXT PRIMARY KEY,
  template_document_id TEXT NOT NULL REFERENCES documents(id),
  interval_n INTEGER NOT NULL,
  interval_unit TEXT NOT NULL,
  akhir_tipe TEXT NOT NULL,
  akhir_nilai TEXT,
  berikut TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE approval_rules (
  id TEXT PRIMARY KEY,
  tipe TEXT NOT NULL,
  kriteria_json TEXT NOT NULL,
  tahap_json TEXT NOT NULL,
  penerapan INTEGER NOT NULL DEFAULT 1 CHECK (penerapan IN (0, 1)),
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE approvals (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tahap INTEGER NOT NULL,
  user_uid TEXT NOT NULL,
  keputusan TEXT NOT NULL,
  alasan TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (document_id, tahap, user_uid)
);

CREATE TABLE bom (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL UNIQUE,
  kategori TEXT NOT NULL,
  metode_biaya TEXT NOT NULL,
  config_json TEXT NOT NULL,
  arsip INTEGER NOT NULL DEFAULT 0 CHECK (arsip IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  owner_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  db_index INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE lampiran_db (
  db_index INTEGER PRIMARY KEY,
  bytes INTEGER NOT NULL DEFAULT 0,
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1))
);

CREATE TABLE public_links (
  token TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  dicabut INTEGER NOT NULL DEFAULT 0 CHECK (dicabut IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  nama TEXT NOT NULL,
  default_flag INTEGER NOT NULL DEFAULT 0 CHECK (default_flag IN (0, 1)),
  widgets_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  read_by_json TEXT NOT NULL DEFAULT '[]',
  at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  by TEXT NOT NULL,
  by_name TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id, at);
CREATE INDEX idx_audit_at ON audit_log(at DESC);

CREATE TABLE exports_log (
  id TEXT PRIMARY KEY,
  laporan TEXT NOT NULL,
  format TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  by TEXT NOT NULL,
  by_name TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
