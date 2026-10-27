CREATE TABLE employees (uid TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('absen_karyawan','admin_absensi')),
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  face_required INTEGER NOT NULL DEFAULT 1, face_descriptor TEXT, reference_photo_id TEXT,
  consent_at INTEGER, activated_at INTEGER, created_at INTEGER NOT NULL, created_by TEXT);
CREATE TABLE passkeys (credential_id TEXT PRIMARY KEY, uid TEXT NOT NULL, public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0, transports TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER);
CREATE INDEX passkeys_uid ON passkeys(uid);
CREATE TABLE areas (id TEXT PRIMARY KEY, name TEXT NOT NULL, polygon TEXT NOT NULL,
  tolerance_m REAL NOT NULL DEFAULT 15, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, updated_by TEXT);
CREATE TABLE challenges (id TEXT PRIMARY KEY, uid TEXT NOT NULL, nonce TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('activate','absen')), kind TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE INDEX challenges_expires ON challenges(expires_at);
CREATE TABLE shifts (id TEXT PRIMARY KEY, uid TEXT NOT NULL, work_date TEXT NOT NULL,
  masuk_at INTEGER NOT NULL, masuk_lat REAL NOT NULL, masuk_lng REAL NOT NULL, masuk_accuracy REAL NOT NULL,
  masuk_area_id TEXT, masuk_face_distance REAL, masuk_photo_id TEXT,
  pulang_at INTEGER, pulang_lat REAL, pulang_lng REAL, pulang_accuracy REAL,
  pulang_area_id TEXT, pulang_face_distance REAL, pulang_photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','selesai','lupa_pulang')));
CREATE UNIQUE INDEX shifts_uid_date ON shifts(uid, work_date);
CREATE INDEX shifts_uid_masuk ON shifts(uid, masuk_at);
CREATE INDEX shifts_masuk ON shifts(masuk_at);
CREATE INDEX shifts_status ON shifts(status);
