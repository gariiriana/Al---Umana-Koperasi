-- Silah = hari libur mingguan tetap per karyawan, diatur admin absensi.
-- Satu baris per perubahan jadwal (berlaku mulai effective_from) supaya rekap bulan lalu tetap memakai jadwal lama.
-- days berisi nomor hari dipisah koma (0 = Minggu sampai 6 = Sabtu), teks kosong berarti tanpa Silah.
CREATE TABLE silah (
  uid TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  days TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (uid, effective_from)
);
