CREATE TABLE photos (id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('acuan','selfie')),
  jpeg BLOB NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX photos_kind_created ON photos(kind, created_at);
