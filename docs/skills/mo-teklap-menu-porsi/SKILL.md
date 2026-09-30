---
name: mo-teklap-menu-porsi
description: Menuntaskan perubahan form job desk Teklap oleh role MO agar Kegiatan opsional atau kosong dan Keterangan tetap memuat nama menu serta jumlah porsi. Gunakan saat mengerjakan, meninjau, atau memperbaiki alur job desk Teklap MO di aplikasi Al Umana.
---

# Fitur Teklap MO: Kegiatan Opsional, Menu dan Porsi Tetap Terlihat

## Tujuan

Di form job desk Teklap yang dibuat oleh role MO:

- Kolom **Kegiatan** boleh kosong dan baris otomatis tidak perlu mengisinya.
- Kolom **Keterangan** juga boleh dikosongkan atau diedit manual.
- Baris yang dibuat dari pesanan katering atau data MBG tetap membawa nama menu dan jumlah porsi pada Keterangan.
- Informasi penugasan lain yang sudah ada, seperti alamat atau lembaga, tetap dipertahankan.

## Lokasi kode

Mulai dari `frontend/src/pages/katering/MoJobDeskPage.tsx`. Pastikan alur ini benar-benar untuk MO; jangan menerapkan perubahan ke form role operasional atau halaman review CO_MO tanpa kebutuhan yang jelas. Gunakan `frontend/src/services/cateringJobDeskService.ts` hanya jika pelacakan menunjukkan nilai yang sudah benar di form hilang saat disimpan atau dibaca kembali.

## Alur kerja

1. Baca `AGENTS.md` yang berlaku dan periksa `git status --short` sebelum mengedit.
2. Tinjau perubahan yang sudah ada pada file target. Repository bisa berisi perubahan lokal dari pekerjaan lain; jangan reset, checkout, atau menimpa perubahan tersebut.
3. Periksa pembuat baris otomatis katering dan MBG, form input MO, validasi simpan, penyimpanan Firestore, dan tampilan daftar Teklap.
4. Ubah hanya perilaku yang diperlukan untuk memenuhi tujuan. Untuk baris otomatis, pertahankan Keterangan dengan format menu dan jumlah porsi yang sudah digunakan aplikasi. Jangan menaruh informasi menu/porsi hanya pada Kegiatan.
5. Pastikan nilai Kegiatan kosong tidak diganti diam-diam oleh fallback `title` saat disimpan, dibaca, atau ditampilkan. Tampilan boleh menunjukkan tanda kosong pada Kegiatan, sedangkan Keterangan tetap terlihat.
6. Pertahankan validasi yang mencegah pembuatan tugas tanpa konteks pesanan atau MBG. Jika Kegiatan dan Keterangan kosong, pastikan aturan yang ada untuk `orderLabel`, batch, atau lembaga tetap memungkinkan baris terkait pesanan disimpan.
7. Pertahankan urutan tanggal/jam, Key ID, PIC, pembagian katering/MBG, serta alamat dan informasi lembaga.
8. Tinjau ulang diff dan pastikan perubahan hanya menyentuh alur Teklap MO yang diminta. Jangan commit atau push kecuali diminta secara terpisah.

## Kriteria selesai

- Saat MO memuat template pesanan katering, Kegiatan kosong; Keterangan mencantumkan menu dan jumlah porsi.
- Saat MO memuat template MBG, Kegiatan kosong; Keterangan mencantumkan menu dan jumlah porsi untuk batch atau lembaga terkait.
- MO dapat menyimpan baris terkait pesanan dengan Kegiatan kosong tanpa kehilangan Keterangan menu/porsi.
- Keterangan tetap opsional dan bisa diedit; input manual tidak dipaksa berisi teks.
- Setelah data dibaca kembali, Kegiatan tetap kosong dan Keterangan tetap memuat detail yang disimpan.
- Validasi dan perilaku untuk role lain tidak berubah.

## Verifikasi dan laporan

Ikuti instruksi pengujian repository dan permintaan pengguna. Jangan menambah atau menjalankan test jika pengguna tidak meminta pengujian. Minimal tinjau kode simpan/baca dan diff. Laporkan file yang diubah, perilaku yang tercakup, verifikasi yang dilakukan, serta hal yang belum diverifikasi. Jangan menyatakan sudah diuji jika hanya ditinjau secara statis.
