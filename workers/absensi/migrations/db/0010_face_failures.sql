-- Scan wajah yang tidak cocok saat clock in/out. Dipakai untuk membatasi percobaan
-- (3 gagal dalam 15 menit = dikunci sementara). Baris lebih dari 30 hari dibuang cron.
CREATE TABLE face_failures (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  distance REAL
);
CREATE INDEX face_failures_uid_at ON face_failures(uid, at DESC);
CREATE INDEX face_failures_at ON face_failures(at);
