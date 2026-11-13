-- Clock in di hari Silah: tetap tercatat dengan alasan, menunggu persetujuan kepala unit atau admin absensi.
-- Satu baris per shift (clock out shift itu tidak perlu persetujuan lagi). Ditolak = shift itu tidak dihitung hadir.
CREATE TABLE silah_exceptions (
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
CREATE UNIQUE INDEX silah_exceptions_shift ON silah_exceptions(shift_id);
CREATE INDEX silah_exceptions_status_created ON silah_exceptions(status, created_at DESC);
CREATE INDEX silah_exceptions_uid_created ON silah_exceptions(uid, created_at DESC);
