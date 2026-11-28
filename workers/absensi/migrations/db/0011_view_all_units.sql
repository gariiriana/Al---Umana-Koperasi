-- Karyawan yang boleh melihat absensi (Hari Ini, Rekap, foto, Silah) SEMUA unit dari halaman Tim,
-- bukan hanya anggota unit yang dikepalainya. Diatur admin absensi di tab Karyawan.
-- Persetujuan pengajuan tetap mengikuti kepala unit masing-masing.
ALTER TABLE employees ADD view_all_units INTEGER NOT NULL DEFAULT 0;
