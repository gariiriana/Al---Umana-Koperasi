-- Lampiran biner Modul Keuangan (keuangan_lampiran_1, _2, dst).
CREATE TABLE attachment_blobs (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
