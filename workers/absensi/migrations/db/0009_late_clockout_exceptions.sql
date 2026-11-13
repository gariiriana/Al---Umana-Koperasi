-- Clock out sesudah "ganti hari" (lupa clock out, baru ditutup keesokan harinya): jam aslinya tetap tercatat di shifts,
-- dengan alasan, menunggu persetujuan kepala unit atau admin absensi. Satu baris per shift.
-- Ditolak = shift itu dihitung tidak clock out (durasi tidak dihitung), data shifts tidak diubah.
CREATE TABLE late_clockout_exceptions (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  work_date TEXT NOT NULL,
  at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX late_clockout_exceptions_shift ON late_clockout_exceptions(shift_id);
CREATE INDEX late_clockout_exceptions_status_created ON late_clockout_exceptions(status, created_at DESC);
CREATE INDEX late_clockout_exceptions_uid_created ON late_clockout_exceptions(uid, created_at DESC);
