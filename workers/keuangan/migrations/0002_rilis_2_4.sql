-- Modul Keuangan Al-Umanaa: Migrasi Rilis 2, 3, 4 (aditif penuh, kompatibel dengan data live Rilis 1).
-- JANGAN pernah mengubah 0001_init.sql.

ALTER TABLE documents ADD COLUMN no_faktur_pajak TEXT NOT NULL DEFAULT '';
ALTER TABLE depreciation_schedule ADD COLUMN applied_at INTEGER;

-- Master Satuan Produk (Daftar Lainnya -> Satuan Produk)
CREATE TABLE IF NOT EXISTS units_of_measure (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- Pelacakan Batch & Kedaluwarsa (Rilis 4)
CREATE TABLE IF NOT EXISTS product_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  exp_date TEXT,
  qty_milli INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (product_id, warehouse_id, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_prod ON product_batches(product_id, warehouse_id);

-- Pelacakan Nomor Seri per Unit Barang (Rilis 4)
CREATE TABLE IF NOT EXISTS product_serials (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id TEXT,
  serial_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'tersedia' CHECK (status IN ('tersedia', 'terjual', 'keluar')),
  source_document_id TEXT REFERENCES documents(id),
  out_document_id TEXT REFERENCES documents(id),
  updated_at INTEGER NOT NULL,
  UNIQUE (product_id, serial_no)
);

CREATE INDEX IF NOT EXISTS idx_product_serials_prod ON product_serials(product_id, status);

-- Biaya Standar Produk untuk Produksi BoM (Rilis 4)
CREATE TABLE IF NOT EXISTS standard_costs (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  items_json TEXT NOT NULL DEFAULT '[]',
  total_biaya INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- Multi Mata Uang & Kurs Manual (Rilis 4)
CREATE TABLE IF NOT EXISTS currencies (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  simbol TEXT NOT NULL DEFAULT '',
  aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
  is_base INTEGER NOT NULL DEFAULT 0 CHECK (is_base IN (0, 1)),
  akun_piutang TEXT REFERENCES accounts(kode),
  akun_hutang TEXT REFERENCES accounts(kode),
  akun_realisasi TEXT REFERENCES accounts(kode),
  akun_belum_terealisasi TEXT REFERENCES accounts(kode),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency_kode TEXT NOT NULL REFERENCES currencies(kode) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  rate_micro INTEGER NOT NULL CHECK (rate_micro > 0), -- 1 unit valas = (rate_micro / 1_000_000) IDR
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (currency_kode, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_unit ON warehouses(unit_kode);
CREATE INDEX IF NOT EXISTS idx_warehouses_induk ON warehouses(induk_id);
CREATE INDEX IF NOT EXISTS idx_assets_unit_status ON assets(unit_kode, status);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring(aktif, berikut);
CREATE INDEX IF NOT EXISTS idx_notifications_at ON notifications(at DESC);
CREATE INDEX IF NOT EXISTS idx_document_links_to ON document_links(to_id);
