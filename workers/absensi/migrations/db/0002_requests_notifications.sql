CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cuti','pergantian_shift')),
  leave_type TEXT CHECK (leave_type IN ('cuti','sakit','izin') OR leave_type IS NULL),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  from_shift TEXT,
  to_shift TEXT,
  partner_uid TEXT,
  partner_name TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX requests_uid_created ON requests(uid, created_at DESC);
CREATE INDEX requests_status_created ON requests(status, created_at DESC);
CREATE INDEX requests_dates ON requests(start_date, end_date);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pengajuan_baru','pengajuan_disetujui','pengajuan_ditolak')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  request_id TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_recipient_created ON notifications(recipient_uid, created_at DESC);
CREATE INDEX notifications_recipient_unread ON notifications(recipient_uid, read_at);

