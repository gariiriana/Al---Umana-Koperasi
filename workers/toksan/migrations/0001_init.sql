-- Toksan (Toko Santri): master produk, penjualan harian, obral.
-- Tanggal = YYYY-MM-DD WIB. Uang = rupiah bulat. Waktu = epoch ms.

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  dapur TEXT NOT NULL CHECK (dapur IN ('bakery', 'hangat_saji', 'depan')),
  kategori TEXT NOT NULL CHECK (kategori IN ('makanan', 'minuman', 'lainnya')),
  harga INTEGER NOT NULL CHECK (harga >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- Nama, dapur dan harga disalin saat baris dibuat, jadi perubahan harga tidak mengubah omzet lama.
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  dapur TEXT NOT NULL,
  harga INTEGER NOT NULL CHECK (harga >= 0),
  sesi TEXT NOT NULL CHECK (sesi IN ('pagi', 'siang', 'sore')),
  pihak TEXT NOT NULL CHECK (pihak IN ('rijal', 'nisaa')),
  jumlah INTEGER NOT NULL CHECK (jumlah >= 0),
  retur INTEGER NOT NULL CHECK (retur >= 0 AND retur <= jumlah),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE (tanggal, product_id, sesi, pihak)
);

CREATE INDEX sales_tanggal ON sales(tanggal);

CREATE TABLE obral (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  dapur TEXT NOT NULL,
  harga_normal INTEGER NOT NULL CHECK (harga_normal >= 0),
  harga_obral INTEGER NOT NULL CHECK (harga_obral >= 0),
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  catatan TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX obral_tanggal ON obral(tanggal);
