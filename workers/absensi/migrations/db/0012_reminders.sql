-- Pengingat clock in (07:30 WIB) / clock out (16:30 WIB) ke HP lewat Web Push (FCM). Jamnya sama untuk semua.

-- Token FCM per HP. Satu HP satu baris, milik akun absensi terakhir yang mendaftarkannya.
CREATE TABLE push_devices (
  token_hash TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  uid TEXT NOT NULL,
  platform TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX push_devices_uid ON push_devices(uid);

-- Pengingat yang sudah dikirim: paling banyak satu per orang per hari per jenis.
CREATE TABLE reminder_log (
  uid TEXT NOT NULL,
  work_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('masuk','pulang')),
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (uid, work_date, kind)
);
