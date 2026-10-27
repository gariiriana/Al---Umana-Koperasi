# Spec: Absensi Karyawan (passkey + selfie wajah + area lokasi)

Tanggal: 2026-10-27
Status: draft, menunggu review

## 1. Tujuan

Menambahkan aplikasi absensi di project ini, di domain dan PWA yang sama dengan KASMA JOB. Karyawan clock in dan clock out dari HP-nya sendiri, bisa melihat status dan riwayat absennya, dan `admin_absensi` bisa merekap lalu mengekspor ke Excel atau Word. Absen hanya sah kalau:

1. dilakukan di dalam area yang ditentukan (gedung SPPG, bukan radius besar),
2. wajah di selfie cocok dengan wajah acuan karyawan itu,
3. dikonfirmasi pakai passkey (sidik jari atau Face ID bawaan HP),
4. dicatat dengan jam server, bukan jam HP.

Semua keputusan diambil otomatis oleh sistem. Tidak ada langkah "admin mengecek lalu menyetujui" untuk tiap absen.

Syarat penting: **absensi tidak boleh ikut mati kalau kuota Firestore habis.** Pada 2026-10-26 kuota reads (50 ribu/hari, plan Spark) tembus sekitar 18:30 WIB dan semua baca data ditolak sampai reset 14:00 WIB besoknya. Karena itu absensi tidak membaca maupun menulis Firestore sama sekali.

## 2. Keputusan yang sudah disepakati

| Topik | Keputusan |
| --- | --- |
| Pintu masuk | Ada 2 pilihan: **Absensi** dan **KASMA JOB**. KASMA JOB = login yang sekarang (semua role lama). |
| Akun absensi | Akun baru, terpisah dari akun KASMA JOB. Role `absen_karyawan` untuk karyawan, `admin_absensi` untuk admin. |
| Verifikasi | Passkey (wajib) + selfie (wajib) + pencocokan wajah (wajib, kecuali karyawan yang dikecualikan) + area lokasi (wajib). |
| Pencatatan | Lewat Cloudflare Worker baru. Worker yang mengecek jam server, lokasi, dan tanda tangan passkey. |
| Penyimpanan | Cloudflare D1, bukan Firestore. |
| Keputusan absen | Otomatis. Lolos semua cek = absen tercatat. Gagal = ditolak dengan alasan yang jelas, karyawan bisa langsung mengulang. |
| Lokasi awal | SPPG Sukabumi Gunungguruh Kebonmanggu, pin `-6.9735229, 106.8651559`. Hanya kotak gedungnya, bukan radius besar. |
| Status & riwayat karyawan | Tombol Clock In / Clock Out menampilkan "✓ Sudah clock in" / "✓ Sudah clock out" beserta jamnya. Karyawan bisa melihat riwayat absennya sendiri. |
| Rekap admin | `admin_absensi` bisa merekap absen dan mengekspornya ke Excel (.xlsx) atau Word (.docx). |

## 3. Keputusan yang ditetapkan di spec ini (tolong dicek)

Poin-poin ini belum dibahas langsung. Spec memilih satu jawaban supaya bisa dikerjakan. Koreksi kalau tidak sesuai.

1. **Letak pilihan 2 pintu.** Halaman `/` di browser tetap toko online untuk pelanggan. Pilihan 2 pintu ada di halaman baru `/masuk`, dan tombol "Masuk" di toko mengarah ke sana. Di PWA yang di-install, membuka aplikasi tanpa sesi login langsung menampilkan `/masuk`. Di bawah 2 pilihan ada tautan kecil "Belanja di toko".
2. **Sesi login.** Kalau sudah login, aplikasi langsung membuka halaman masing-masing tanpa menampilkan pilihan lagi. Sesi Absensi dan sesi KASMA JOB terpisah, jadi satu HP bisa login di keduanya sekaligus.
3. **Aturan jam kerja.** Versi pertama hanya mencatat jam masuk, jam pulang, dan durasi. Belum ada aturan "terlambat" atau jadwal shift, karena jam kerja dapur SPPG bisa mulai dini hari dan berbeda-beda. Aturan terlambat bisa ditambah setelah jadwalnya jelas.
4. **Foto wajah acuan** diambil sendiri oleh karyawan saat aktivasi pertama, dan aktivasi hanya bisa dilakukan di dalam area. Admin bisa melihat foto acuan di daftar karyawan dan me-reset kalau salah orang.
5. **Selfie bukti disimpan 90 hari**, lalu dihapus otomatis. Catatan absennya (jam, lokasi, hasil cek) disimpan selamanya.
6. **Pengecualian cek wajah.** Admin bisa mematikan cek wajah untuk karyawan tertentu (misalnya karyawan bercadar). Karyawan itu tetap wajib passkey, area, dan selfie.
7. **Harus online.** Absen butuh internet karena jam dan pengecekan dilakukan di server. Tidak ada antrean absen offline.
8. **Akun karyawan dibuat oleh `admin_absensi`** dari halaman admin (nama, email, password awal). Karyawan tidak bisa mendaftar sendiri. Akun `admin_absensi` pertama dibuat lewat skrip.
9. **Satu clock in per hari.** Hari dihitung dari tanggal (WIB) saat clock in. Shift yang lewat tengah malam tetap masuk ke tanggal clock in-nya. Setelah clock in dan clock out hari itu selesai, tombolnya menampilkan status "Sudah" sampai besok.

## 4. Arsitektur

```text
HP karyawan (PWA / browser)                 Cloudflare                       Google
──────────────────────────                  ──────────                       ──────
Halaman /absensi/*                          Worker al-umana-absensi
 - Firebase Auth (app terpisah "absensi")   route koperasi-alumana.com/      Firebase Auth
 - GPS (watchPosition)                        api/absensi/*                   (login, token)
 - Kamera + pencocokan wajah di HP           - cek ID token (kunci publik)
 - Passkey (WebAuthn)          ── HTTPS ──▶  - cek passkey, area, aturan     Identity Toolkit
                                             - jam server                    (buat akun karyawan,
                                             D1 "absensi"      (data)          custom claim)
                                             D1 "absensi_foto" (foto)
```

Tidak ada panggilan ke Firestore di seluruh alur absensi.

### 4.1 Frontend

- Aplikasi Firebase kedua `initializeApp(config, "absensi")` dengan Auth sendiri (persistence IndexedDB). Sesinya tidak tercampur dengan `AuthContext` KASMA JOB, jadi listener Firestore KASMA JOB (`users/{uid}`, notifikasi, dan lainnya) tidak pernah jalan untuk akun absensi.
- Semua halaman absensi di-lazy-load sebagai chunk sendiri, termasuk library wajah dan WebAuthn, supaya bundle KASMA JOB tidak membesar.
- Model wajah (`@vladmandic/face-api`: tiny face detector, landmark 68 tiny, face recognition; total sekitar 6–7 MB) disajikan dari `/models/` dan di-cache service worker dengan `CacheFirst`. Download sekali per HP.
- Library passkey: `@simplewebauthn/browser`. Versi persis dikunci di rencana implementasi.
- Pengecekan GPS di HP memakai ulang `verifyGpsLocation` dari [gpsVerification.ts](../../../frontend/src/services/gpsVerification.ts). Ini hanya untuk pesan yang cepat; keputusan akhir tetap di Worker.

### 4.2 Worker `al-umana-absensi`

- Folder baru `workers/absensi/`, mengikuti pola `workers/invoice-api` (JS biasa, `wrangler.toml`, tes `*.test.mjs`).
- Cek ID token Firebase memakai `verifyIdToken` yang sama dengan checkout (kunci publik Google, tanpa baca Firestore).
- Verifikasi passkey memakai `@simplewebauthn/server`. RP ID `koperasi-alumana.com`, origin `https://koperasi-alumana.com`. Passkey hanya berlaku di domain ini, tidak di `al-umana-koperasi.web.app`.
- Membuat akun Firebase Auth dan custom claim lewat Identity Toolkit REST, memakai service account yang sama dengan Worker lain (secret `FIREBASE_CLIENT_EMAIL` dan `FIREBASE_PRIVATE_KEY`).
- Cron per jam: menutup shift yang lupa clock out, dan menghapus selfie yang lebih tua dari 90 hari.

### 4.3 Pemisahan dari KASMA JOB

- Akun absensi diberi custom claim `absensi_role` (`absen_karyawan` atau `admin_absensi`).
- Kalau akun absensi dipakai login lewat pintu KASMA JOB, `AuthContext` membaca claim dari token (tanpa Firestore), tidak membuat profil `pelanggan`, logout dari sesi itu, lalu menampilkan "Akun ini khusus Absensi. Silakan masuk lewat pintu Absensi."
- Kalau akun KASMA JOB dipakai login lewat pintu Absensi, Worker menolak (`/me` membalas 403) dan halaman menampilkan "Akun ini bukan akun Absensi."
- Sumber kebenaran role dan status aktif tetap tabel `employees` di D1. Claim hanya dipakai untuk mengarahkan halaman.
- Aturan Firestore tidak berubah. Akun absensi adalah pengguna terautentikasi, sama seperti pelanggan yang mendaftar sendiri. Jadi tidak ada akses baru yang terbuka dibanding kondisi sekarang.

## 5. Alur

### 5.1 Pintu masuk

| Kondisi saat membuka | Hasil |
| --- | --- |
| Browser, buka `/` | Toko online seperti sekarang. Tombol "Masuk" menuju `/masuk`. |
| PWA, belum login di mana pun | `/masuk` (pilihan Absensi / KASMA JOB) |
| PWA, hanya login Absensi | `/absensi` |
| PWA, hanya login KASMA JOB | halaman default role-nya (seperti sekarang) |
| PWA, login di keduanya | `/masuk`, dengan tiap kartu bertuliskan "Lanjut sebagai [nama]" |

`/login` tetap menjadi halaman login KASMA JOB, jadi tautan dan redirect lama tidak rusak. Login absensi ada di `/absensi/login` dan memakai Turnstile seperti login yang sekarang.

### 5.2 Aktivasi pertama (karyawan)

1. Login email + password.
2. Layar persetujuan: "Foto wajah saya dipakai untuk absensi dan hanya bisa dilihat admin absensi." Data wajah termasuk data pribadi spesifik menurut UU PDP, jadi persetujuan eksplisit wajib.
3. Cek lokasi: harus di dalam area.
4. Ambil foto wajah acuan: kamera depan langsung (tidak bisa dari galeri), satu wajah terdeteksi, kedip sekali. HP menghitung deskriptor wajah (128 angka).
5. Daftarkan passkey (sidik jari / Face ID).
6. Worker menyimpan passkey, deskriptor, dan foto acuan. Status karyawan menjadi aktif.

Untuk karyawan yang dikecualikan dari cek wajah, langkah 4 hanya mengambil foto tanpa deskriptor.

### 5.3 Beranda karyawan (`absen_karyawan`)

**Tombol status.** Ada 2 tombol besar berdampingan, **Clock In** dan **Clock Out**. Tombolnya sendiri menunjukkan apakah karyawan sudah absen:

| Kondisi | Tombol Clock In | Tombol Clock Out |
| --- | --- | --- |
| Belum clock in hari ini | aktif, bisa ditekan | abu-abu, "Clock in dulu" |
| Sudah clock in, belum clock out | hijau, "✓ Sudah clock in · 07:02", tidak bisa ditekan | aktif, bisa ditekan |
| Sudah clock in dan clock out | hijau, "✓ Sudah clock in · 07:02" | hijau, "✓ Sudah clock out · 16:05" |
| Ditutup otomatis karena lupa clock out | hijau, "✓ Sudah clock in · 07:02" | oranye, "Tidak clock out" |

- Di bawah tombol ada durasi kerja hari itu (misalnya "Durasi: 9 jam 3 menit") setelah clock out.
- Kalau masih ada shift terbuka dari kemarin (shift malam), yang tampil adalah shift itu, lengkap dengan tanggalnya, supaya karyawan bisa clock out.
- Setelah clock out dari shift kemarin, muncul baris "Shift terakhir: 26 Okt, 22:00–06:00 ✓" di atas tombol, dan Clock In untuk hari ini aktif lagi.
- Status tombol diambil dari `GET /api/absensi/me`. Setelah clock in atau clock out berhasil, tombol langsung berubah dari balasan Worker tanpa muat ulang halaman.

**Riwayat.** Di bawah tombol (atau tab "Riwayat") ada daftar absen milik karyawan itu sendiri:

- Satu baris per hari kerja: tanggal, jam clock in, jam clock out, durasi, dan label status (**Lengkap**, **Belum clock out**, **Tidak clock out**).
- Default bulan berjalan, dengan pilihan bulan sebelumnya.
- Karena belum ada jadwal kerja, hari tanpa clock in tidak ditampilkan sebagai "tidak hadir".
- Foto tidak ditampilkan di riwayat.

### 5.4 Alur clock in / clock out

1. Karyawan menekan **Clock In** atau **Clock Out** (hanya tombol yang aktif yang bisa ditekan).
2. **Lokasi.** HP mengambil posisi GPS selama paling lama 10 detik dan memakai hasil yang paling akurat. Berhenti lebih cepat kalau akurasinya sudah ≤ 15 m. Kalau di luar area, absen ditolak di tempat dengan pesan dan jarak ke area.
3. **Selfie.** Kamera depan terbuka. Harus ada satu wajah dan satu kedipan. Wajah dicocokkan dengan deskriptor acuan; kalau tidak cocok, muncul tips ("cari cahaya terang", "lepas masker") dan karyawan bisa langsung mengulang. Foto dikecilkan jadi sekitar 480 px, JPEG sekitar 30–40 KB.
4. **Passkey.** HP meminta sidik jari atau Face ID.
5. **Kirim.** Worker menjalankan semua cek di bagian 6. Kalau lolos, muncul layar sukses dengan jam server ("Clock in berhasil · 07:02"), lalu kembali ke beranda dengan tombol yang sudah berubah status. Kalau gagal, muncul alasan yang jelas dan tombol "Coba lagi".

Target: seluruh alur 10–15 detik.

### 5.5 Admin absensi

Login lewat pintu Absensi, lalu diarahkan ke `/absensi/admin`.

- **Hari ini:** siapa yang sudah clock in, siapa yang sudah clock out, siapa yang belum absen. Tombol muat ulang (tanpa listener realtime).
- **Rekap:** filter rentang tanggal dan karyawan. Tabel berisi tanggal, nama, jam clock in, jam clock out, durasi, dan status (Lengkap / Belum clock out / Tidak clock out). Selfie dimuat hanya saat baris diklik.
- **Export rekap**, mengikuti filter yang sedang dipakai. File dibuat di browser dari data rekap yang sudah diambil dari Worker, jadi tidak butuh server tambahan. Foto tidak ikut diekspor.
  - **Excel (.xlsx)**, pakai library `xlsx` yang sudah ada (pola [kpiExcelExporter.ts](../../../frontend/src/utils/kpiExcelExporter.ts)). Sheet "Ringkasan" berisi satu baris per karyawan: jumlah hari hadir, jumlah tidak clock out, dan total jam kerja. Sheet "Detail" berisi satu baris per shift: tanggal, nama, clock in, clock out, durasi, status, dan area.
  - **Word (.docx)**, pakai library `docx` yang sudah ada (pola [docxExporter.ts](../../../frontend/src/utils/docxExporter.ts)). Dokumen siap cetak A4 landscape: judul "Rekap Absensi", nama area, periode, dicetak oleh siapa dan kapan. Lalu tabel ringkasan per karyawan, dan tabel detail per karyawan.
  - Nama file: `Rekap-Absensi_<dari>_<sampai>.xlsx` atau `.docx`, dengan tanggal format `YYYY-MM-DD`.
- **Karyawan:** tambah (nama, email, password awal, opsi tanpa cek wajah, role), nonaktifkan, reset HP & wajah (menghapus passkey dan deskriptor, jadi karyawan harus aktivasi ulang), lihat foto acuan.
- **Area:** peta dengan lapisan satelit. Admin menggambar kotak/poligon area dan mengatur toleransi (default 15 m). Bisa ada lebih dari satu area; absen sah di area aktif mana pun.

## 6. Aturan di Worker

Satu request `POST /api/absensi/absen` lolos kalau semua ini benar, dicek berurutan:

1. **Token.** ID token Firebase valid; karyawan ada di `employees`, berstatus aktif, sudah aktivasi.
2. **Kode sekali pakai.** `challengeId` milik karyawan ini, belum dipakai, dan umurnya belum lewat 2 menit.
3. **Paket terikat ke passkey.** Challenge WebAuthn adalah `SHA-256(nonce ‖ jenis ‖ lat ‖ lng ‖ akurasi ‖ SHA-256(selfie))`. Worker menghitung ulang dari data yang dikirim dan harus sama dengan challenge yang ditandatangani. Jadi selfie atau lokasi tidak bisa ditukar setelah sidik jari.
4. **Passkey.** Tanda tangan valid untuk salah satu passkey karyawan ini, origin dan RP ID benar, flag *user verified* menyala, dan counter tidak mundur (kalau authenticator memakai counter).
5. **Lokasi.**
   - Akurasi harus > 0 dan ≤ 50 m. Kalau lebih buruk: "Sinyal GPS lemah. Coba dekat pintu atau jendela, lalu ulangi."
   - Sah kalau titik berada di dalam poligon area, atau jaraknya ke tepi poligon ≤ `min(akurasi, toleransi)`. Dengan toleransi 15 m, jangkauan paling jauh 15 m dari tepi gedung, dan hanya kalau akurasi GPS-nya memang selebar itu.
   - Kalau `request.cf.country` ada dan bukan `ID`, ditolak (jaring kasar untuk VPN atau lokasi palsu dari luar negeri).
6. **Selfie dan wajah.** Semua karyawan wajib mengirim selfie (tidak kosong, maksimal 200 KB). Kalau karyawan wajib cek wajah, jarak wajah yang dilaporkan HP harus di bawah ambang (ditetapkan di rencana implementasi dari nilai rekomendasi library).
7. **Urutan shift.**
   - Clock in hanya boleh kalau tidak ada shift terbuka dan belum ada clock in di tanggal WIB hari ini.
   - Clock out menutup shift terbuka terakhir, walaupun melewati tengah malam (shift dapur dini hari aman).
   - Shift yang terbuka lebih dari 20 jam ditutup cron dengan status `lupa_pulang` (tampil sebagai "Tidak clock out"). Clock in berikutnya tetap mengikuti aturan satu per tanggal.
8. **Jam.** Waktu absen = jam server Worker. Jam HP tidak dipakai.

Kalau lolos: simpan shift dan selfie dalam satu batch D1, tandai challenge terpakai, balas dengan jam server.

## 7. Data (D1)

Database `absensi`:

| Tabel | Kolom utama |
| --- | --- |
| `employees` | `uid` (PK), `name`, `email`, `role` (`absen_karyawan` / `admin_absensi`), `status` (`aktif` / `nonaktif`), `face_required`, `face_descriptor` (JSON 128 angka), `reference_photo_id`, `activated_at`, `created_at`, `created_by` |
| `passkeys` | `credential_id` (PK), `uid`, `public_key`, `counter`, `transports`, `created_at`, `last_used_at` |
| `areas` | `id`, `name`, `polygon` (JSON titik lat/lng), `tolerance_m`, `active`, `updated_at`, `updated_by` |
| `challenges` | `id`, `uid`, `nonce`, `purpose` (`activate` / `absen`), `expires_at`, `used_at` |
| `shifts` | `id`, `uid`, `work_date` (tanggal WIB saat clock in, `YYYY-MM-DD`, unik per `uid`), `masuk_at`, `masuk_lat`, `masuk_lng`, `masuk_accuracy`, `masuk_area_id`, `masuk_face_distance`, `masuk_photo_id`, kolom yang sama untuk `pulang_*`, `status` (`terbuka` / `selesai` / `lupa_pulang`) |

Indeks: `shifts(uid, work_date)` unik, `shifts(uid, masuk_at)`, `shifts(masuk_at)`, `shifts(status)`, `passkeys(uid)`, `challenges(expires_at)`.

Database `absensi_foto` (terpisah supaya batas 500 MB per database hanya dipakai foto):

| Tabel | Kolom utama |
| --- | --- |
| `photos` | `id`, `uid`, `kind` (`acuan` / `selfie`), `jpeg` (BLOB), `created_at` |

Area awal: "SPPG Sukabumi Gunungguruh Kebonmanggu". Gedung di bawah pin (`-6.9735229, 106.8651559`) belum ada di OpenStreetMap (yang ada hanya 2 gedung tetangga), jadi poligonnya digambar `admin_absensi` di peta satelit saat setup, bukan diisi otomatis.

## 8. API Worker

Semua endpoint memakai header `Authorization: Bearer <ID token>` dan CORS hanya untuk `https://koperasi-alumana.com`.

Karyawan:

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/absensi/me` | profil, status aktivasi, status tombol (shift hari ini, shift terbuka, shift terakhir), poligon area aktif, deskriptor acuan (kalau wajib cek wajah) |
| `POST /api/absensi/activate/options` | opsi pendaftaran passkey + challenge |
| `POST /api/absensi/activate` | simpan passkey, deskriptor, foto acuan (cek area juga) |
| `POST /api/absensi/absen/options` | `challengeId`, `nonce`, jenis yang boleh (masuk/pulang), daftar credential |
| `POST /api/absensi/absen` | catat clock in / clock out (aturan bagian 6); balasannya berisi status tombol terbaru |
| `GET /api/absensi/riwayat?bulan=YYYY-MM` | riwayat shift sendiri untuk satu bulan |

Admin (`admin_absensi` saja):

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/absensi/admin/hari-ini` | status semua karyawan hari ini |
| `GET /api/absensi/admin/rekap?from=&to=&uid=` | daftar shift + nama karyawan (bahan tabel rekap dan export Excel/Word) |
| `GET /api/absensi/admin/foto/:id` | satu foto (JPEG) |
| `GET/POST /api/absensi/admin/karyawan` | daftar / tambah karyawan (membuat akun Firebase Auth + claim) |
| `PATCH /api/absensi/admin/karyawan/:uid` | nonaktifkan, reset HP & wajah, ubah `face_required` |
| `GET/PUT /api/absensi/admin/area` | daftar / simpan area |

## 9. Kuota dan biaya

- **Firestore:** 0 reads dan 0 writes untuk absensi.
- **D1 (gratis):** 5 juta baris dibaca dan 100 ribu baris ditulis per hari, reset 07:00 WIB. Satu absen sekitar 10–20 baris dibaca dan 3–4 baris ditulis. 50 karyawan × 2 absen = jauh di bawah 1% batas.
- **Foto:** 50 karyawan × 2 × 26 hari ≈ 2.600 selfie × 35 KB ≈ 90 MB per bulan. Dengan retensi 90 hari, `absensi_foto` stabil di sekitar 270 MB dari batas 500 MB.
- **Worker (gratis):** 100 ribu request per hari, sekitar 10 ms CPU per request. Satu absen memakai 3–4 request.
- **Firebase Auth:** login email/password gratis.

Kalau jumlah karyawan jauh di atas 50, retensi foto dipendekkan atau foto dipindah ke R2 (R2 kemungkinan minta kartu kredit/PayPal saat aktivasi).

## 10. Penanganan error

| Kondisi | Yang dilihat karyawan |
| --- | --- |
| Di luar area | "Kamu di luar area absen (sekitar N m dari gedung)." + tombol Coba lagi |
| GPS lemah (akurasi > 50 m) | "Sinyal GPS lemah. Coba dekat pintu atau jendela." |
| Izin lokasi/kamera ditolak | Petunjuk cara mengizinkan di browser/PWA |
| Wajah tidak cocok | Tips cahaya/masker, ulang langsung |
| Passkey dibatalkan | "Konfirmasi sidik jari dibatalkan." + Coba lagi |
| HP baru / passkey tidak ada | "HP ini belum terdaftar. Minta admin absensi reset HP kamu." |
| Sudah clock in / belum clock in | Tombol sudah menampilkan statusnya ("✓ Sudah clock in · 07:02") dan tidak bisa ditekan; Worker juga menolak urutan yang salah |
| Sudah clock in dan clock out hari ini | Kedua tombol hijau berstatus "Sudah"; clock in berikutnya baru bisa besok |
| Tidak ada internet / Worker gagal | "Absen belum terkirim. Cek internet lalu coba lagi." Tidak ada yang disimpan di HP |
| Akun nonaktif | "Akun kamu dinonaktifkan. Hubungi admin absensi." |

## 11. Batasan yang diketahui

- **Fake GPS di HP yang di-root** masih bisa lolos cek lokasi. Lapisan lain tetap berlaku (wajah, passkey, selfie tersimpan), tapi lokasi palsu dari rumah adalah celah utama. Penguat untuk nanti: mewajibkan Wi-Fi SPPG dengan mencocokkan IP publik.
- **Pencocokan wajah terjadi di HP.** Orang yang bisa mengubah kode di browser-nya bisa melewati cek wajah, tapi tetap harus passkey dan berada di area, dan selfie aslinya tersimpan 90 hari.
- **Passkey membuktikan "orang yang bisa membuka kunci HP ini"**, bisa juga lewat PIN HP. HP + PIN yang dititipkan tetap bisa absen kalau wajah tidak dicek; untuk karyawan dengan cek wajah, titip absen butuh wajah orangnya.
- **iPhone menyinkronkan passkey lewat iCloud** ke perangkat Apple lain milik orang yang sama. Itu masih orang yang sama, jadi diterima.
- **Lapisan satelit di peta admin:** penyedia tile (misalnya Esri World Imagery) dipilih di rencana implementasi setelah syarat pemakaiannya dicek.

## 12. Di luar cakupan versi pertama

Izin/sakit/cuti, aturan terlambat dan jadwal shift, lebih dari satu shift per hari, hitung gaji/lembur, notifikasi push absensi, menampilkan absensi di KASMA JOB atau KPI, cek IP Wi-Fi, penyimpanan foto di R2, lebih dari satu peran admin.

## 13. Pengujian

- **Unit (node test, seperti `workers/invoice-api/*.test.mjs`):** titik di dalam/luar poligon, jarak ke tepi, aturan `min(akurasi, toleransi)`, urutan shift (termasuk lewat tengah malam dan lupa pulang), pengikatan challenge (selfie atau lokasi diganti harus gagal), challenge kedaluwarsa atau dipakai ulang.
- **Worker lokal:** `wrangler dev` dengan D1 lokal; alur aktivasi dan absen penuh dengan passkey dari virtual authenticator Chrome (Playwright). Tidak ada pengujian otomatis ke Firebase live.
- **Frontend:**
  - Status tombol Clock In / Clock Out untuk setiap baris tabel di bagian 5.3, termasuk shift malam yang masih terbuka dari kemarin.
  - Riwayat: label status per hari dan pergantian bulan.
  - Export: file Excel punya sheet Ringkasan dan Detail dengan jumlah baris yang sesuai filter; file Word terbuka dan berisi tabel ringkasan + detail.
  - Pesan error, dan pemisahan sesi (akun absensi di pintu KASMA JOB, dan sebaliknya).
- **Uji lapangan sebelum dipakai:** admin berdiri di beberapa titik di dalam gedung dan di luar (5, 15, 30 m), mencatat akurasi dan hasil cek, lalu menyetel poligon dan toleransi. Ini wajib, karena area gedungnya kecil dan GPS di dalam ruangan bisa meleset.

## 14. Urutan rilis

1. Buat 2 database D1 dan deploy Worker `al-umana-absensi` beserta secret-nya.
2. Deploy frontend. PWA menunggu tombol "Perbarui", jadi karyawan perlu menekannya sekali.
3. Buat akun `admin_absensi` pertama lewat skrip.
4. Admin menggambar area SPPG di peta, lalu uji lapangan (bagian 13).
5. Admin membuat akun karyawan; karyawan aktivasi di lokasi.

Push dan deploy dilakukan hanya setelah diminta.
