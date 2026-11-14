# PRD: Laporan 2 Minggu (Distribusi MBG)

Status: **ditunda** (14 November 2026). Belum dipasang di menu, belum di-deploy.
Kode setengah jadi disimpan di branch lokal `archive/laporan-2-minggu` (commit `e19dfdb`).

## Masalah

Tiap dua minggu, staf Distribusi MBG harus menyusun laporan
"Pelaksanaan Program Makan Bergizi Gratis SPPG Sukabumi Gunungguruh Kebonmanggu"
secara manual. Contohnya file `34. LAPORAN 12 OKTOBER - 23 OKTOBER 2026.pdf`.
Datanya sebenarnya sudah ada di aplikasi: batch harian admin_mbg, menu dari tim produksi,
dan daftar sekolah/posyandu.

## Tujuan

Staf yang tidak teknis bisa membuat laporan itu dari aplikasi dalam tiga langkah:

1. pilih tanggal;
2. tarik foto kegiatan;
3. tekan Download.

Hasilnya PDF dan Word.

## Pengguna

- Role `distribusi_mbg` (pembuat laporan).
- Manager MBG ikut bisa akses.

## Yang sudah diputuskan

- **Teks tetap:** judul, BAB I (Latar Belakang, Tujuan), BAB II a (Persiapan), BAB III dan BAB IV disalin persis dari contoh.
- **Teks dengan tanggal:** BAB I c (Sasaran) dan BAB II b (Pelaksanaan) memakai tanggal periode. Periode bisa diedit di halaman.
- **Tabel "1. Penerima MBG":** diambil dari batch admin_mbg hari Senin pertama.
- **Tabel "Pemberian Ke-1 … Ke-10":** diambil dari batch Senin–Jumat minggu 1 dan minggu 2. Kolom "Jenis Menu MBG" diambil dari menu yang diisi tim produksi untuk batch itu.
- **Foto kegiatan:** di-upload per tanggal (pilih tanggal, lalu drag-and-drop banyak foto). Di laporan disusun grid 3 kolom dengan ukuran seragam.
- **Alamat:** daftar alamat tetap disimpan di aplikasi, diambil dari PDF contoh.
- **SD:** satu baris per sekolah, tanpa pecahan Kelas 1-3 / 4-6.
- **Export:** PDF dan Word.

## Halaman

- Route `/mbg/laporan-2-minggu`, label sidebar "Laporan 2 Minggu".
- **Langkah 1 — Pilih Senin minggu pertama.**
  - Halaman membuat 10 tanggal kerja.
  - Tiap tanggal punya chip status: ✅ data siap, ⚠️ belum ada menu, ❌ belum ada batch.
  - Kolom "Periode" sudah terisi dan bisa diedit.
  - Kalau tanggal yang dipilih bukan Senin, otomatis digeser ke Senin minggu itu.
- **Langkah 2 — Foto kegiatan.**
  - Pilih tanggal (hanya 10 tanggal tadi), lalu tarik foto ke area upload.
  - Thumbnail punya tombol ✕ untuk hapus.
  - Ada ringkasan jumlah foto per tanggal.
- **Langkah 3 — Download PDF / Word.**
  - Data yang kurang tidak memblokir download, cukup muncul sebagai peringatan.

## Aturan data

**Sumber (hanya dibaca):**
- `mbg_pm_batches` per tanggal. Batch `isBackup` diabaikan. Kalau ada lebih dari satu, ambil yang `totalJumlah`-nya paling besar.
- `mbg_pm_entries` per batch.
- `mbg_daily_reports` per batch, untuk daftar menu.
- Semuanya dibaca lewat REST `select` supaya foto base64 di entries tidak ikut terunduh. Ini penting untuk kuota baca Firestore.

**Foto:**
- Disimpan di koleksi baru `mbg_laporan_photos`, satu dokumen per foto: `{ tanggal, url (JPEG data URL), order, createdBy, createdAt }`.
- Di-resize di browser ke maksimal 1280 px dengan kualitas sekitar 0.7, batas 900.000 karakter.
- Rules: MBG staff boleh baca; manager MBG dan `distribusi_mbg` boleh tulis.

**Isi tabel:**
- Entry dengan `isSekolahLibur` dilewati.
- "Organoleptik Dapur" dikenali dari namanya dan ditulis sebagai "SPPG Sukabumi Gunungguruh Kebonmanggu".
- Sejak 13 Oktober 2026, `jumlah` sama dengan siswa + guru + 2 per sekolah, dan + 1 per posyandu (porsi cadangan). Laporan contoh memasukkan porsi cadangan itu ke baris "Tenaga Pendidik dan Kependidikan" supaya jumlah barisnya sama dengan Total.
- Nama posyandu ditulis "Cempaka 1-13" kalau semuanya "Cempaka N".

**Menu:**
- Bagian dalam kurung dibuang.
- Kalau menu Balita dan Bumil/Busui sama dengan menu sekolah, tulis satu blok "Menu Ompreng". Kalau beda, tulis dua blok.

## Tampilan export

- A4 portrait, font serif, tabel bergaris tipis seperti contoh.
- Dokumentasi per tanggal:
  - judul tanggal di tengah;
  - foto 3 per baris, di-crop 4:3 dengan ukuran sama;
  - judul tanggal tidak boleh sendirian di bawah halaman.

## Progres sampai ditunda

**Sudah jadi** (tes hijau waktu itu):
- `constants/mbgLaporanMaster.ts` berisi daftar master dan teks template.
- `lib/laporan2Minggu.ts` berisi fungsi murni (16 tes, diuji dengan bentuk batch asli 12 Oktober: total 2.782, Tendik 192).
- `services/laporan2MingguService.ts` (3 tes).
- Exporter PDF dan Word. Hasilnya sudah dicek visual dengan data 12–23 Oktober.
- Rule Firestore untuk `mbg_laporan_photos`.

**Belum:**
- Tes halaman `MbgLaporan2MingguPage` (halamannya sudah ditulis, tapi tesnya belum pernah lolos).
- Tes itu juga punya error TypeScript di baris 86.
- Pemasangan ke `roles.ts`, `navItems.ts`, label `Sidebar.tsx`, dan `AppRouter.tsx`.
- Full test, build, lint, deploy hosting, deploy rules.

## Kalau mau dilanjut

1. `git checkout archive/laporan-2-minggu -- .` di branch kerja baru, atau buat branch baru dari arsip.
2. Lanjut dari Task 4 di `docs/superpowers/plans/2026-11-07-laporan-2-minggu.md` (ada di arsip).
3. Deploy hosting **dan** `firestore:rules`.

## Di luar cakupan

- Poster Today's Menu dan foto ompreng dari contoh.
- Edit teks BAB III/IV dari aplikasi.
- Pecahan Kelas 1-3/4-6.
