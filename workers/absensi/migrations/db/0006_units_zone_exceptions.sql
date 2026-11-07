-- Unit kerja: kepala unit (head_uid) ikut menyetujui pengajuan & absen luar zona anggota unitnya.
CREATE TABLE units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  head_uid TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX units_head ON units(head_uid);

-- Unit tempat karyawan bernaung untuk persetujuan, admin absensi bisa memindahkannya.
ALTER TABLE employees ADD unit_id TEXT;
CREATE INDEX employees_unit ON employees(unit_id);

-- Clock in / clock out di luar zona: tetap tercatat, menunggu persetujuan kepala unit atau admin absensi.
CREATE TABLE zone_exceptions (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('masuk','pulang')),
  at INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL NOT NULL,
  distance_m REAL,
  reason TEXT NOT NULL,
  photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX zone_exceptions_shift_kind ON zone_exceptions(shift_id, kind);
CREATE INDEX zone_exceptions_status_created ON zone_exceptions(status, created_at DESC);
CREATE INDEX zone_exceptions_uid_created ON zone_exceptions(uid, created_at DESC);
